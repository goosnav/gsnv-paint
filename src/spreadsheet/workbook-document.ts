/**
 * PURPOSE    Validate sparse editable workbook data.
 * KIND       CORE
 * CONTRACT   IN: new or untrusted read value. OUT: owned immutable Workbook. RAISES: WorkbookError for malformed fields, addresses, styles and limits.
 * GUARANTEES No mutation, evaluation, DOM, I/O or side effects. Native schema1 preserves source formulas.
 * TUNING     1–32 sheets; 10000 rows, 256 columns/sheet; 50000 stored cells; input8192 characters.
 * DECISIONS  D1: Sparse source cells make formula-preserving native files and independent history predictable. Alternative: dense cell matrices. Revisit if: dense calculation or million-row workbooks become required.
 * LIMITS     Declared spreadsheet subset only; no macros, external data, charts or merged cells.
 * TESTBENCH  src/spreadsheet/workbook-document.test.ts -- node --import tsx --test src/spreadsheet/workbook-document.test.ts
 */
import{sheetReferences}from'./sheet-references.ts';
type Format=Readonly<{bold?:boolean;italic?:boolean;align?:'left'|'center'|'right';number?:'general'|'number'|'currency'|'percent'|'date';decimals?:number;color?:string;fill?:string}>;
type Range=Readonly<{r0:number;c0:number;r1:number;c1:number}>;
type Cell=Readonly<{input:string;format?:Format}>;
type Sheet=Readonly<{id:string;name:string;rows:number;columns:number;cells:Readonly<Record<string,Cell>>;rowHeights:Readonly<Record<string,number>>;columnWidths:Readonly<Record<string,number>>;filter?:Readonly<{range:Range;column:number;query:string}>}>;
export type Workbook=Readonly<{schema:1;sheets:readonly Sheet[]}>;
export class WorkbookError extends Error{constructor(message:string){super(message);this.name='WorkbookError';}}
function bad(message:string):never{throw new WorkbookError(message);}
function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))bad('Expected workbook object.');const o=value as Record<string,unknown>;if(Object.keys(o).some(k=>!keys.includes(k)))bad('Unknown workbook field.');return o;}
function integer(value:unknown,min:number,max:number):number{if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)bad(`Expected a whole number from ${min} to ${max}.`);return value;}
function dimensions(value:unknown,limit:number,min:number,max:number):Readonly<Record<string,number>>{if(!value||typeof value!=='object'||Array.isArray(value))bad('Invalid row/column sizes.');const out:Record<string,number>={};for(const[k,v]of Object.entries(value)){if(!/^(0|[1-9]\d*)$/.test(k))bad('Invalid size index.');integer(Number(k),0,limit-1);out[k]=integer(v,min,max);}return Object.freeze(out);}
function range(value:unknown,rows:number,columns:number):Range{const r=object(value,['r0','c0','r1','c1']);return Object.freeze({r0:integer(r.r0,0,rows-1),c0:integer(r.c0,0,columns-1),r1:integer(r.r1,Number(r.r0),rows-1),c1:integer(r.c1,Number(r.c0),columns-1)});}
function style(value:unknown):Format{
 const s=object(value,['bold','italic','align','number','decimals','color','fill']);
 for(const k of['bold','italic'])if(s[k]!==undefined&&typeof s[k]!=='boolean')bad('Invalid cell font style.');
 if(s.align!==undefined&&!['left','center','right'].includes(s.align as string))bad('Invalid alignment.');
 if(s.number!==undefined&&!['general','number','currency','percent','date'].includes(s.number as string))bad('Invalid number format.');
 if(s.decimals!==undefined)integer(s.decimals,0,8);for(const k of['color','fill'])if(s[k]!==undefined&&(typeof s[k]!=='string'||!/^#[\da-f]{6}$/i.test(s[k] as string)))bad('Colors must be six-digit hex values.');
 return Object.freeze({...s}) as Format;
}
export function workbookDocument(request:{operation:'new'}|{operation:'read';value:unknown}):Workbook{
 if(request.operation==='new')return workbookDocument({operation:'read',value:{schema:1,sheets:[{id:'sheet-1',name:'Sheet1',rows:1000,columns:52,cells:{},rowHeights:{},columnWidths:{}}]}});
 const root=object(request.value,['schema','sheets']);if(root.schema!==1||!Array.isArray(root.sheets)||root.sheets.length<1||root.sheets.length>32)bad('Expected workbook schema1 with 1–32 sheets.');
 for(let i=0;i<root.sheets.length;i++)if(!Object.hasOwn(root.sheets,i))bad('Every sheet slot must contain a sheet.');
 const ids=new Set<string>(),names=new Set<string>();let count=0;
 const sheets=root.sheets.map(value=>{
  const s=object(value,['id','name','rows','columns','cells','rowHeights','columnWidths','filter']);
  if(typeof s.id!=='string'||!/^[A-Za-z][\w-]{0,63}$/.test(s.id)||ids.has(s.id))bad('Sheet IDs must be unique.');ids.add(s.id);
  if(typeof s.name!=='string'||!s.name.trim()||s.name!==s.name.trim()||s.name.length>31||/[\[\]*?:/\\\x00-\x1f]/.test(s.name)||names.has(s.name.toLowerCase()))bad('Use a unique sheet name of 1–31 characters without []:*?/\\.');names.add(s.name.toLowerCase());
  const rows=integer(s.rows,1,10000),columns=integer(s.columns,1,256),cells:Record<string,Cell>={};
  if(!s.cells||typeof s.cells!=='object'||Array.isArray(s.cells))bad('Invalid cells.');
  for(const[address,value]of Object.entries(s.cells)){
   let ref;try{ref=sheetReferences.read(address);}catch{bad('Invalid cell address.');}if(ref.sheet||ref.absoluteColumn||ref.absoluteRow||ref.row>=rows||ref.column>=columns||sheetReferences.write(ref)!==address)bad('Cell address is outside this sheet.');
   const c=object(value,['input','format']);if(typeof c.input!=='string'||c.input.length>8192||c.input.includes('\0'))bad('Cell input must be text of at most8192 characters.');if(++count>50000)bad('Workbook supports up to50000 stored cells.');
   cells[address]=Object.freeze({input:c.input,...(c.format===undefined?{}:{format:style(c.format)})});
  }
  let filter:Sheet['filter'];if(s.filter!==undefined){const f=object(s.filter,['range','column','query']),r=range(f.range,rows,columns);if(typeof f.query!=='string'||f.query.length>256)bad('Filter text is too long.');filter=Object.freeze({range:r,column:integer(f.column,r.c0,r.c1),query:f.query});}
  return Object.freeze({id:s.id,name:s.name,rows,columns,cells:Object.freeze(cells),rowHeights:dimensions(s.rowHeights,rows,18,240),columnWidths:dimensions(s.columnWidths,columns,32,480),...(filter?{filter}:{})});
 });return Object.freeze({schema:1,sheets:Object.freeze(sheets)});
}
