/**
 * PURPOSE    Apply atomic workbook edits.
 * KIND       CORE
 * CONTRACT   IN: validated Workbook and WorkbookEdit. OUT: new validated Workbook. RAISES: WorkbookError for invalid ranges, edits or unavailable targets.
 * GUARANTEES Structural changes update cross-sheet and absolute references; removed references become #REF!. Sort moves whole selected records.
 * TUNING     At most50000 cells/edit; inherited E01 schema bounds.
 * DECISIONS  D1: Keep selection outside document history; shift copied formulas relative to their source. Alternative: directly mutating cells. Revisit if: profiling shows immutable copies exceed the interaction budget.
 * LIMITS     Supported formulas and formats only; no merging or remote data.
 * TESTBENCH  src/spreadsheet/workbook-document.test.ts -- node --import tsx --test src/spreadsheet/workbook-document.test.ts
 */
import{workbookDocument,WorkbookError,type Workbook}from'./workbook-document.ts';
import{sheetReferences,type CellReference}from'./sheet-references.ts';
import{createSheetEvaluator,formatSheetValue}from'./sheet-formulas.ts';
type Sheet=Workbook['sheets'][number];type Cell=Sheet['cells'][string];type Range={r0:number;c0:number;r1:number;c1:number};
export type WorkbookEdit=
 |{type:'cells';sheet:string;cells:readonly {address:string;input:string;format?:Cell['format']}[]}
 |{type:'format';sheet:string;range:Range;format:NonNullable<Cell['format']>}
 |{type:'clear';sheet:string;range:Range;formats?:boolean}
 |{type:'fill';sheet:string;source:Range;target:Range}
 |{type:'add-sheet';id:string;name:string}|{type:'delete-sheet';sheet:string}|{type:'rename-sheet';sheet:string;name:string}|{type:'move-sheet';sheet:string;index:number}
 |{type:'resize';sheet:string;axis:'row'|'column';index:number;size:number}
 |{type:'insert'|'delete';sheet:string;axis:'row'|'column';index:number;count:number}
 |{type:'sort';sheet:string;range:Range;column:number;direction:'ascending'|'descending';header:boolean}
 |{type:'filter';sheet:string;range:Range;column:number;query:string}|{type:'clear-filter';sheet:string};
function fail(message:string):never{throw new WorkbookError(message);}
const address=(row:number,column:number)=>sheetReferences.write({row,column,absoluteRow:false,absoluteColumn:false});
function checkRange(range:Range,sheet:Sheet){const{r0,c0,r1,c1}=range;if(![r0,c0,r1,c1].every(Number.isInteger)||r0<0||c0<0||r1<r0||c1<c0||r1>=sheet.rows||c1>=sheet.columns||(r1-r0+1)*(c1-c0+1)>50000)fail('Select a valid range of up to50000 cells.');}
function each(range:Range,work:(row:number,column:number)=>void){for(let r=range.r0;r<=range.r1;r++)for(let c=range.c0;c<=range.c1;c++)work(r,c);}
function formulas(sheets:readonly Sheet[],change:(source:string,current:Sheet)=>string):Sheet[]{return sheets.map(s=>({...s,cells:Object.fromEntries(Object.entries(s.cells).map(([key,c])=>[key,c.input.startsWith('=')?{...c,input:change(c.input,s)}:c]))}));}
export function editWorkbook(book:Workbook,action:WorkbookEdit):Workbook{
 let sheets=[...book.sheets];const index='sheet'in action?sheets.findIndex(s=>s.id===action.sheet):-1;
 if(action.type==='add-sheet'){const fresh=workbookDocument({operation:'new'}).sheets[0]!;return workbookDocument({operation:'read',value:{...book,sheets:[...sheets,{...fresh,id:action.id,name:action.name}]}});}
 if(index<0)fail('Select an existing sheet.');const original=sheets[index]!;let sheet={...original,cells:{...original.cells}};
 const commit=()=>{sheets[index]=sheet;return workbookDocument({operation:'read',value:{...book,sheets}});};
 switch(action.type){
  case'cells':for(const item of action.cells){let ref;try{ref=sheetReferences.read(item.address);}catch{fail('Invalid cell address.');}if(ref.sheet||ref.absoluteColumn||ref.absoluteRow||ref.row>=sheet.rows||ref.column>=sheet.columns)fail('Cell is outside the sheet.');const key=address(ref.row,ref.column),format=item.format??sheet.cells[key]?.format;sheet.cells[key]={input:item.input,...(format?{format}:{})};if(!item.input&&!format)delete sheet.cells[key];}return commit();
  case'format':checkRange(action.range,sheet);each(action.range,(r,c)=>{const key=address(r,c),cell=sheet.cells[key];sheet.cells[key]={input:cell?.input??'',format:{...cell?.format,...action.format}};});return commit();
  case'clear':checkRange(action.range,sheet);each(action.range,(r,c)=>{const key=address(r,c),format=sheet.cells[key]?.format;if(format&&!action.formats)sheet.cells[key]={input:'',format};else delete sheet.cells[key];});return commit();
  case'fill':checkRange(action.source,sheet);checkRange(action.target,sheet);each(action.target,(r,c)=>{const sr=action.source.r0+(r-action.target.r0)%(action.source.r1-action.source.r0+1),sc=action.source.c0+(c-action.target.c0)%(action.source.c1-action.source.c0+1),cell=original.cells[address(sr,sc)],key=address(r,c);if(cell)sheet.cells[key]={...cell,input:sheetReferences.shift(cell.input,r-sr,c-sc)};else delete sheet.cells[key];});return commit();
  case'resize':if(!Number.isInteger(action.index)||action.index<0||action.index>=(action.axis==='row'?sheet.rows:sheet.columns))fail('Invalid row or column.');if(action.axis==='row')sheet={...sheet,rowHeights:{...sheet.rowHeights,[action.index]:action.size}};else sheet={...sheet,columnWidths:{...sheet.columnWidths,[action.index]:action.size}};return commit();
  case'filter':checkRange(action.range,sheet);sheet={...sheet,filter:{range:action.range,column:action.column,query:action.query}};return commit();
  case'clear-filter':delete sheet.filter;return commit();
  case'move-sheet':if(!Number.isInteger(action.index)||action.index<0||action.index>=sheets.length)fail('Invalid sheet position.');sheets.splice(index,1);sheets.splice(action.index,0,sheet);return workbookDocument({operation:'read',value:{...book,sheets}});
  case'rename-sheet':case'delete-sheet':{
   if(action.type==='delete-sheet'&&sheets.length===1)fail('Keep at least one sheet.');
   sheets=action.type==='delete-sheet'?sheets.filter(s=>s.id!==sheet.id):sheets.map(s=>s.id===sheet.id?{...s,name:action.name}:s);
   sheets=formulas(sheets,source=>sheetReferences.transform(source,(from,to)=>{const rename=(ref:CellReference)=>ref.sheet?.toLowerCase()===sheet.name.toLowerCase()?action.type==='delete-sheet'?'#REF!':sheetReferences.write({...ref,sheet:action.name}):sheetReferences.write(ref);const a=rename(from),b=to?rename(to):undefined;return a==='#REF!'||b==='#REF!'?'#REF!':a+(b?`:${b}`:'');}));
   return workbookDocument({operation:'read',value:{...book,sheets}});
  }
  case'insert':case'delete':{
   const axis=action.axis==='row'?'row':'column',limit=axis==='row'?sheet.rows:sheet.columns,max=axis==='row'?10000:256,delta=action.type==='insert'?action.count:-action.count;
   if(!Number.isInteger(action.count)||action.count<1||!Number.isInteger(action.index)||action.index<0||action.index>limit||(delta<0&&action.index+action.count>limit)||limit+delta<1||limit+delta>max)fail('The row/column change exceeds the sheet limits.');
   const shift=(n:number):number|null=>delta>0?n>=action.index?n+delta:n:n<action.index?n:n>=action.index+action.count?n+delta:null;
   const cells:Record<string,Cell>={};for(const[key,cell]of Object.entries(sheet.cells)){const ref=sheetReferences.read(key),moved=shift(ref[axis]);if(moved!==null)cells[sheetReferences.write({...ref,[axis]:moved})]=cell;}
   const sizes=axis==='row'?sheet.rowHeights:sheet.columnWidths,movedSizes:Record<string,number>={};for(const[k,v]of Object.entries(sizes)){const n=shift(Number(k));if(n!==null)movedSizes[n]=v;}
   sheet={...sheet,cells,...(axis==='row'?{rows:limit+delta,rowHeights:movedSizes}:{columns:limit+delta,columnWidths:movedSizes})};delete sheet.filter;sheets[index]=sheet;
   sheets=formulas(sheets,(source,current)=>sheetReferences.transform(source,(from,to)=>{
    if((from.sheet??current.name).toLowerCase()!==sheet.name.toLowerCase())return sheetReferences.write(from)+(to?`:${sheetReferences.write(to)}`:'');
    let a=shift(from[axis]),b=to?shift(to[axis]):null;
    if(to&&delta<0){const lo=Math.min(from[axis],to[axis]),hi=Math.max(from[axis],to[axis]);if(lo>=action.index&&hi<action.index+action.count)return'#REF!';const low=shift(lo)??action.index,high=shift(hi)??action.index-1;if(from[axis]<=to[axis]){a=low;b=high;}else{a=high;b=low;}}
    if(a===null||(to&&b===null))return'#REF!';return sheetReferences.write({...from,[axis]:a})+(to?`:${sheetReferences.write({...to,[axis]:b!})}`:'');
   }));return workbookDocument({operation:'read',value:{...book,sheets}});
  }
  case'sort':{
   checkRange(action.range,sheet);if(!Number.isInteger(action.column)||action.column<action.range.c0||action.column>action.range.c1)fail('Sort column must be a whole column in the selection.');
   const evaluator=createSheetEvaluator({maxTotalSteps:2000000,sheets:sheets.map(s=>s.name),read:(name,r,c)=>sheets.find(s=>s.name===name)!.cells[address(r,c)]?.input});
   const start=action.range.r0+(action.header?1:0),rows=Array.from({length:action.range.r1-start+1},(_,n)=>start+n);rows.sort((a,b)=>{const x=evaluator.cell(sheet.name,a,action.column),y=evaluator.cell(sheet.name,b,action.column);if(evaluator.budgetExceeded())fail('Sort calculation exceeded the work budget. Reduce large formula ranges before sorting.');const order=typeof x==='number'&&typeof y==='number'?x-y:formatSheetValue(x).localeCompare(formatSheetValue(y),'en',{numeric:true,sensitivity:'base'});return(action.direction==='descending'?-order:order)||a-b;});
   rows.forEach((from,i)=>{const to=start+i;for(let c=action.range.c0;c<=action.range.c1;c++){const value=original.cells[address(from,c)],key=address(to,c);if(value)sheet.cells[key]={...value,input:sheetReferences.shift(value.input,to-from,0)};else delete sheet.cells[key];}});return commit();
  }
 }
}
