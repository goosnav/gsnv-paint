/**
 * PURPOSE    Calculate immutable worksheet values with readable formula errors.
 * KIND       CORE
 * CONTRACT   IN: sheet names, raw-text lookup and optional maxTotalSteps. OUT: cell/formula evaluator and budgetExceeded state. RAISES: TypeError/RangeError only for invalid ports; user formula errors return typed values.
 * GUARANTEES Pure with deterministic read port; lazy IF; detects cycles; #LIMIT! is not cached. Total-budget exhaustion stays sticky.
 * TUNING     100000 cells/range;250000 steps/call;128 depth;32767 derived characters; optional cumulative work budget.
 * DECISIONS  D1: Explicit values and error propagation keep unsupported formulas editable instead of trusting stale cached results. Alternative: trusting imported cached values. Revisit if: a broader compatible calculation engine becomes required.
 * LIMITS     Declared functions in authoring map only; no external workbook resolution.
 * TESTBENCH  src/spreadsheet/sheet-formulas.test.ts -- node --import tsx --test src/spreadsheet/sheet-formulas.test.ts
 */
import {parseFormula,FormulaSyntaxError,type FormulaNode} from './sheet-parser.ts';
export type SheetValue=number|string|boolean|Readonly<{error:string}>;
const EMPTY=Symbol('empty cell'),MAX_TEXT=32767;
type Scalar=SheetValue|typeof EMPTY;
type Value=Scalar|Scalar[];
class CellError extends Error{constructor(readonly code:string){super(code);}}
const fail=(code:string):never=>{throw new CellError(code);};
const scalar=(value:Value):Scalar=>Array.isArray(value)?fail('#VALUE!'):value;
const flatten=(value:Value):Scalar[]=>Array.isArray(value)?value:[value];
const fault=(error:unknown):SheetValue=>Object.freeze({error:error instanceof CellError?error.code:error instanceof FormulaSyntaxError?error.code:'#ERROR!'});
const guarded=(work:()=>Value):Value=>{try{return work();}catch(error){return fault(error);}};
const number=(value:Value):number=>{const v=scalar(value);if(typeof v==='object')return fail(v.error);if(v===EMPTY||v==='')return 0;if(typeof v==='boolean')return v?1:0;const n=typeof v==='number'?v:Number(v);return Number.isFinite(n)?n:fail('#VALUE!');};
const truth=(v:Value):boolean=>{const s=scalar(v);if(typeof s==='object')return fail(s.error);if(s===EMPTY)return false;return typeof s==='string'?s.toUpperCase()==='TRUE'?true:s.toUpperCase()==='FALSE'||s===''?false:fail('#VALUE!'):!!s;};
const text=(value:Scalar):string=>value===EMPTY?'':typeof value==='boolean'?value?'TRUE':'FALSE':String(value);
const finite=(n:number):number=>Number.isFinite(n)?n:fail('#NUM!');
const supported=new Set(['IF','SUM','AVERAGE','MIN','MAX','COUNT','COUNTA','ABS','ROUND','NOT','AND','OR','SUMIF','COUNTIF']);
function wildcard(value:string,pattern:string,tick:()=>void):boolean{
 let i=0,j=0,star=-1,back=0;
 while(i<value.length){
  tick();const escaped=pattern[j]==='~'&&['*','?','~'].includes(pattern[j+1]??''),token=pattern[j+(escaped?1:0)];
  if(!escaped&&token==='*'){star=j++;back=i;}
  else if((!escaped&&token==='?')||token===value[i]){i++;j+=escaped?2:1;}
  else if(star>=0){j=star+1;i=++back;}else return false;
 }
 while(pattern[j]==='*'){tick();j++;}return j===pattern.length;
}
function criteria(wanted:Scalar,tick:()=>void):(value:Scalar)=>boolean{
 if(typeof wanted==='object')return fail(wanted.error);
 const match=/^(<=|>=|<>|=|<|>)(.*)$/.exec(text(wanted)),op=match?.[1]??'=',raw=match?.[2]??(wanted===EMPTY?0:wanted);
 const numeric=typeof raw==='number'||(typeof raw==='string'&&raw.trim()!==''&&Number.isFinite(Number(raw))),b=numeric?Number(raw):String(raw).toLowerCase();
 let wild=false;if(typeof b==='string')for(let i=0;i<b.length;i++){tick();if(b[i]==='~'&&['*','?','~'].includes(b[i+1]??''))i++;else if(b[i]==='*'||b[i]==='?')wild=true;}
 return value=>{
  tick();if(typeof value==='object')return false;
  const a=numeric?(value===EMPTY?0:typeof value==='number'?value:NaN):text(value).toLowerCase();
  if(typeof a==='number'&&Number.isNaN(a))return op==='<>';
  const equal=typeof a==='string'&&typeof b==='string'?(!wild||typeof value==='string')&&wildcard(a,b,tick):a===b;
  switch(op){case'=':return equal;case'<>':return!equal;case'<':return a<b;case'>':return a>b;case'<=':return a<=b;default:return a>=b;}
 };
}
export function createSheetEvaluator(ports:{sheets:readonly string[];read(sheet:string,row:number,column:number):string|undefined;maxTotalSteps?:number}):{cell(sheet:string,row:number,column:number):SheetValue;formula(source:string,sheet:string):SheetValue;budgetExceeded():boolean}{
 if(!Array.isArray(ports.sheets)||ports.sheets.some(s=>typeof s!=='string')||typeof ports.read!=='function')throw new TypeError('Workbook lookup is required.');
 const maxTotalSteps=ports.maxTotalSteps;if(maxTotalSteps!==undefined&&(!Number.isSafeInteger(maxTotalSteps)||maxTotalSteps<1))throw new RangeError('Total calculation budget must be a positive safe integer.');
 const cache=new Map<string,Scalar>(),active=new Set<string>(),names=new Map(ports.sheets.map(s=>[s.toLowerCase(),s]));let steps=0,depth=0,totalSteps=0,budgetExceeded=false;
 const tick=()=>{if(maxTotalSteps!==undefined&&(budgetExceeded||++totalSteps>maxTotalSteps)){budgetExceeded=true;fail('#LIMIT!');}if(++steps>250000)fail('#LIMIT!');};
 const canonical=(name:string)=>names.get(name.toLowerCase())??fail('#REF!');
 const hardErrors=(values:Scalar[])=>{for(const v of values)if(typeof v==='object'&&(v.error==='#LIMIT!'||v.error==='#CYCLE!'))fail(v.error);};
 function cell(sheet:string,row:number,column:number):Scalar{
  tick();sheet=canonical(sheet);if(row<0||column<0||row>=1048576||column>=16384||!Number.isInteger(row)||!Number.isInteger(column))return fail('#REF!');
  const key=`${sheet}\0${row}\0${column}`;if(active.has(key))return fail('#CYCLE!');if(cache.has(key))return cache.get(key)!;if(active.size>=128)return fail('#LIMIT!');
  active.add(key);const value=scalar(guarded(()=>{
   const raw=ports.read(sheet,row,column);if(raw===undefined||raw==='')return EMPTY;if(raw.length>MAX_TEXT)return fail('#LIMIT!');
   if(raw.startsWith("'"))return raw.slice(1);if(raw.startsWith('='))return scalar(evaluate(parseFormula(raw),sheet));
   if(raw.trim()!==''&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim()))return finite(Number(raw));if(/^(TRUE|FALSE)$/i.test(raw))return raw.toUpperCase()==='TRUE';return raw;
  }));active.delete(key);if(cache.size<100000&&!(typeof value==='object'&&value.error==='#LIMIT!'))cache.set(key,value);return value;
 }
 function evaluate(node:FormulaNode,sheet:string):Value{
  tick();if(++depth>128){depth--;return fail('#LIMIT!');}try{return evaluateNode(node,sheet);}finally{depth--;}
 }
 function evaluateNode(node:FormulaNode,sheet:string):Value{
  if(node.kind==='value')return typeof node.value==='number'?finite(node.value):node.value;if(node.kind==='error')return Object.freeze({error:node.error});
  if(node.kind==='ref')return cell(node.ref.sheet??sheet,node.ref.row,node.ref.column);
  if(node.kind==='range'){
   const target=canonical(node.from.sheet??sheet);if(node.to.sheet&&canonical(node.to.sheet)!==target)return fail('#REF!');
   const r0=Math.min(node.from.row,node.to.row),r1=Math.max(node.from.row,node.to.row),c0=Math.min(node.from.column,node.to.column),c1=Math.max(node.from.column,node.to.column);
   if((r1-r0+1)*(c1-c0+1)>100000)return fail('#LIMIT!');const values:Scalar[]=[];for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)values.push(cell(target,r,c));return values;
  }
  if(node.kind==='unary'){const n=number(evaluate(node.value,sheet));return finite(node.op==='-'?-n:node.op==='%'?n/100:n);}
  if(node.kind==='binary'){
   const a=scalar(evaluate(node.left,sheet)),b=scalar(evaluate(node.right,sheet));if(typeof a==='object')return fail(a.error);if(typeof b==='object')return fail(b.error);
   if(node.op==='&'){const x=text(a),y=text(b);if(x.length+y.length>MAX_TEXT)return fail('#LIMIT!');return x+y;}
   if(['=','<>','<','>','<=','>='].includes(node.op)){
    const blank=(other:Scalar)=>typeof other==='number'?0:typeof other==='boolean'?false:'';
    const x=a===EMPTY?blank(b):typeof a==='string'?a.toLowerCase():a,y=b===EMPTY?blank(a):typeof b==='string'?b.toLowerCase():b;
    switch(node.op){case'=':return x===y;case'<>':return x!==y;case'<':return x<y;case'>':return x>y;case'<=':return x<=y;default:return x>=y;}
   }
   const x=number(a),y=number(b);switch(node.op){case'+':return finite(x+y);case'-':return finite(x-y);case'*':return finite(x*y);case'/':return y===0?fail('#DIV/0!'):finite(x/y);case'^':return finite(x**y);default:return fail('#ERROR!');}
  }
  if(!supported.has(node.name))return fail('#NAME?');
  const args=node.args;if(node.name==='IF'){if(args.length<2||args.length>3)return fail('#VALUE!');return truth(evaluate(args[0]!,sheet))?evaluate(args[1]!,sheet):args.length===3?evaluate(args[2]!,sheet):false;}
  const parts:{arg:FormulaNode;value:Value}[]=args.map(arg=>({arg,value:guarded(()=>evaluate(arg,sheet))})),values=parts.flatMap<Scalar>(p=>p.value);hardErrors(values);
  const call=(i:number):Value=>parts[i]?.value??fail('#VALUE!');
  if(node.name==='COUNTA')return values.filter(v=>v!==EMPTY).length;
  if(node.name==='COUNT')return parts.reduce((sum,{arg,value})=>sum+flatten(value).filter(v=>typeof v==='number'||(arg.kind!=='ref'&&!Array.isArray(value)&&(typeof v==='boolean'||typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))))).length,0);
  if(node.name==='SUMIF'||node.name==='COUNTIF'){
   if(args.length<2||args.length>(node.name==='SUMIF'?3:2))return fail('#VALUE!');const items=flatten(call(0)),matches=criteria(scalar(call(1)),tick),sums=args.length===3?flatten(call(2)):items;
   if(items.length!==sums.length)return fail('#VALUE!');let total=0;
   for(let i=0;i<items.length;i++)if(matches(items[i]!)){if(node.name==='COUNTIF')total++;else{const v=sums[i]!;if(typeof v==='object')return fail(v.error);if(typeof v==='number')total+=v;}}return finite(total);
  }
  for(const v of values)if(typeof v==='object')return fail(v.error);
  switch(node.name){
   case'SUM':case'AVERAGE':case'MIN':case'MAX':{
    const numeric=parts.flatMap(({arg,value})=>Array.isArray(value)||arg.kind==='ref'?flatten(value).filter((v):v is number=>typeof v==='number'):[number(value)]);
    if(node.name==='SUM')return finite(numeric.reduce((a,b)=>a+b,0));if(node.name==='AVERAGE')return numeric.length?finite(numeric.reduce((a,b)=>a+b,0)/numeric.length):fail('#DIV/0!');
    return numeric.length?numeric.reduce((a,b)=>node.name==='MIN'?Math.min(a,b):Math.max(a,b)):0;
   }
   case'ABS':return args.length===1?Math.abs(number(call(0))):fail('#VALUE!');
   case'ROUND':{if(args.length<1||args.length>2)return fail('#VALUE!');const n=number(call(0)),digits=args.length===2?Math.trunc(number(call(1))):0;if(Math.abs(digits)>308)return fail('#NUM!');const scale=10**digits;return finite(Math.sign(n)*Math.round((Math.abs(n)+Number.EPSILON)*scale)/scale);}
   case'NOT':return args.length===1?!truth(call(0)):fail('#VALUE!');
   case'AND':case'OR':{const bools=parts.flatMap(({arg,value})=>Array.isArray(value)||arg.kind==='ref'?flatten(value).filter(v=>typeof v==='boolean'||typeof v==='number').map(truth):[truth(value)]);return bools.length?node.name==='AND'?bools.every(Boolean):bools.some(Boolean):fail('#VALUE!');}
   default:return fail('#NAME?');
  }
 }
 const output=(work:()=>Scalar):SheetValue=>{steps=0;depth=0;const value=scalar(guarded(work));return value===EMPTY?'':value;};
 return{cell:(sheet,row,column)=>output(()=>cell(sheet,row,column)),formula:(source,sheet)=>output(()=>scalar(evaluate(parseFormula(source),canonical(sheet)))),budgetExceeded:()=>budgetExceeded};
}
export function formatSheetValue(value:SheetValue):string{return typeof value==='object'?value.error:typeof value==='boolean'?value?'TRUE':'FALSE':String(value);}
