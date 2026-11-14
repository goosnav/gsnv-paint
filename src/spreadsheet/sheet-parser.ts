/**
 * PURPOSE    Parse the declared formula subset to a bounded AST.
 * KIND       CORE
 * CONTRACT   IN: formula string beginning =. OUT: FormulaNode. RAISES: FormulaSyntaxError with #ERROR! or #LIMIT!.
 * GUARANTEES No JavaScript eval, I/O or DOM; invalid reference literals remain explicit errors.
 * TUNING     8192 characters,4096 tokens,128 nested groups.
 * DECISIONS  D1: A small expression parser supports the promised formula subset without host-code execution. Alternative: host JavaScript evaluation. Revisit if: the supported formula language expands beyond this grammar.
 * LIMITS     No array formulas, named ranges or arbitrary functions.
 * TESTBENCH  src/spreadsheet/sheet-formulas.test.ts -- node --import tsx --test src/spreadsheet/sheet-formulas.test.ts
 */
import {sheetReferences,type CellReference} from './sheet-references.ts';
export type FormulaNode =
 |{kind:'value';value:number|string|boolean}|{kind:'error';error:string}|{kind:'ref';ref:CellReference}
 |{kind:'range';from:CellReference;to:CellReference}|{kind:'unary';op:string;value:FormulaNode}
 |{kind:'binary';op:string;left:FormulaNode;right:FormulaNode}|{kind:'call';name:string;args:FormulaNode[]};
export class FormulaSyntaxError extends Error{constructor(readonly code:'#ERROR!'|'#LIMIT!',message:string){super(message);}}
type Token={type:'number'|'text'|'ref'|'word'|'error'|'op'|'end';text:string};
const REF=/^(?:(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?\$?[A-Za-z]{1,3}\$?\d+(?![\w.(])/;
const PRECEDENCE:Record<string,number>={'=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5};
export function parseFormula(source:string):FormulaNode{
 if(typeof source!=='string'||!source.startsWith('='))throw new FormulaSyntaxError('#ERROR!','Formula must begin with =.');
 if(source.length>8192)throw new FormulaSyntaxError('#LIMIT!','Formula is too long.');
 const tokens:Token[]=[];let i=1;
 while(i<source.length){
  if(/\s/.test(source[i]!)){i++;continue;}if(tokens.length>=4096)throw new FormulaSyntaxError('#LIMIT!','Too many formula tokens.');
  const rest=source.slice(i);let match:RegExpExecArray|null;
  if(source[i]==='"'){let text='',closed=false;i++;while(i<source.length){const c=source[i++]!;if(c==='"'){if(source[i]==='"'){text+='"';i++;}else{closed=true;break;}}else text+=c;}if(!closed)throw new FormulaSyntaxError('#ERROR!','Unclosed string.');tokens.push({type:'text',text});}
  else if((match=/^#(?:NULL!|REF!|DIV\/0!|VALUE!|NAME\?|NUM!|N\/A|GETTING_DATA|ERROR!|CYCLE!|LIMIT!)/.exec(rest))){tokens.push({type:'error',text:match[0]});i+=match[0].length;}
  else if((match=REF.exec(rest))){tokens.push({type:'ref',text:match[0]});i+=match[0].length;}
  else if((match=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest))){tokens.push({type:'number',text:match[0]});i+=match[0].length;}
  else if((match=/^[A-Za-z_][A-Za-z_0-9]*/.exec(rest))){tokens.push({type:'word',text:match[0]});i+=match[0].length;}
  else if((match=/^(?:<>|<=|>=|[+\-*/^%&=<>(),:])/.exec(rest))){tokens.push({type:'op',text:match[0]});i+=match[0].length;}
  else throw new FormulaSyntaxError('#ERROR!',`Unexpected character at ${i+1}.`);
 }
 tokens.push({type:'end',text:''});let at=0,depth=0;const peek=()=>tokens[at]!,take=()=>tokens[at++]!;
 const require=(text:string)=>{if(take().text!==text)throw new FormulaSyntaxError('#ERROR!',`Expected ${text}.`);};
 function expression(min=0):FormulaNode{
  if(++depth>128)throw new FormulaSyntaxError('#LIMIT!','Formula nesting is too deep.');
  const token=take();let left:FormulaNode;
  if(token.type==='number')left={kind:'value',value:Number(token.text)};
  else if(token.type==='text')left={kind:'value',value:token.text};
  else if(token.type==='error')left={kind:'error',error:token.text};
  else if(token.text==='+'||token.text==='-')left={kind:'unary',op:token.text,value:expression(5)};
  else if(token.text==='('){left=expression();require(')');}
  else if(token.type==='ref'){
   try{const ref=sheetReferences.read(token.text);if(peek().text===':'){take();const next=take();if(next.type!=='ref')throw new FormulaSyntaxError('#ERROR!','Expected range endpoint.');left={kind:'range',from:ref,to:sheetReferences.read(next.text)};}else left={kind:'ref',ref};}
   catch(error){if(error instanceof FormulaSyntaxError)throw error;left={kind:'error',error:'#REF!'};}
  }else if(token.type==='word'){
   const name=token.text.toUpperCase();if(peek().text==='('){take();const args:FormulaNode[]=[];if(peek().text!==')')do{if(args.length)require(',');args.push(expression());}while(peek().text===',');require(')');left={kind:'call',name,args};}
   else left=name==='TRUE'||name==='FALSE'?{kind:'value',value:name==='TRUE'}:{kind:'error',error:'#NAME?'};
  }else throw new FormulaSyntaxError('#ERROR!','Expected a value.');
  while(true){const op=peek().text;if(op==='%'){take();left={kind:'unary',op,value:left};continue;}const p=PRECEDENCE[op];if(p===undefined||p<min)break;take();left={kind:'binary',op,left,right:expression(p+(op==='^'?0:1))};}
  depth--;return left;
 }
 const result=expression();if(peek().type!=='end')throw new FormulaSyntaxError('#ERROR!','Unexpected trailing formula content.');return result;
}
