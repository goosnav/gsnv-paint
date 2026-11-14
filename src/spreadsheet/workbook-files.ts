/**
 * PURPOSE    Provide bounded workbook interchange.
 * KIND       SHELL
 * CONTRACT   IN: local bytes or validated E01 Workbook; detached XML parser port. OUT: Workbook or bytes with unsupported-content warnings. RAISES: readable file, parser, calculation or resource-limit errors.
 * GUARANTEES Atomic decode; no macro execution or link fetching; CSV formula-looking source stays inert text; XLSX keeps editable formulas.
 * TUNING     20MiB file/payload;64MiB expanded ZIP;2million calculation steps;CSV1million and XLSX5million used positions.
 * DECISIONS  D1: Pinned SheetJS CE handles file syntax; bounded transport and explicit style mapping preserve supported data. Alternative: using the vendor with no preflight. Revisit if: file compatibility or resource targets change.
 * LIMITS     CSV contains one sheet of computed values; 1904 dates, macros, charts and unsupported styles are diagnosed.
 * TESTBENCH  src/spreadsheet/workbook-files.test.ts -- node --import tsx --test src/spreadsheet/workbook-files.test.ts
 */
import * as XLSX from 'xlsx';
import {workbookDocument,type Workbook} from './workbook-document.ts';
import {createSheetEvaluator,formatSheetValue} from './sheet-formulas.ts';
import {sheetReferences} from './sheet-references.ts';
import {openWorkbookZip,writeWorkbookZip} from './workbook-zip.ts';
import {xlsxStyles} from './workbook-xlsx-style.ts';
type Format=NonNullable<Workbook['sheets'][number]['cells'][string]['format']>;
type Parse=(text:string)=>Document;
type Import={operation:'import';bytes:Uint8Array;format:'csv'|'xlsx'};
type Export={operation:'export';book:Workbook;format:'csv'|'xlsx';sheet?:string};
const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const asText=(text:string)=>/^['=]/.test(text)||numeric.test(text.trim())||/^(true|false)$/i.test(text)?`'${text}`:text;
function csvText(bytes:Uint8Array):string{
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);let quoted=false,row=1,column=1,length=0,positions=1;
 for(let i=0;i<text.length;i++){const ch=text[i]!;
  if(ch==='"'&&(quoted||length===0)){if(quoted&&text[i+1]==='"'){i++;length++;}else quoted=!quoted;}
  else if(!quoted&&(ch===','||ch==='\n'||ch==='\r')){if(ch===',')column++;else{if(ch==='\r'&&text[i+1]==='\n')i++;if(i<text.length-1)row++;column=1;}length=0;if(++positions>1000000)throw new Error('CSV supports up to one million cell positions.');}
  else if(++length>16384)throw new Error('A CSV cell exceeds the supported text length.');
  if(column>256)throw new Error('Each sheet supports up to 256 columns.');if(row>10000)throw new Error('Each sheet supports up to 10,000 rows.');
 }if(quoted)throw new Error('CSV contains an unfinished quoted field.');return text;
}
function numberFormat(format:Format):string{
 const fraction=format.decimals??2,decimal=fraction?`.${'0'.repeat(fraction)}`:'';
 switch(format.number){case'number':return`#,##0${decimal}`;case'currency':return`"$"#,##0${decimal}`;case'percent':return`0${decimal}%`;case'date':return'yyyy-mm-dd';default:return'General';}
}
function readNumberFormat(source:string|undefined,warnings:Set<string>):Format{
 if(!source||source==='General'||source==='@')return{};const simple=source.split(';')[0]!,decimals=/\.([0#]+)/.exec(simple)?.[1]?.length??0;
 if(XLSX.SSF.is_date(source))return{number:'date'};
 if(/%/.test(simple))return{number:'percent',decimals:Math.min(8,decimals)};
 if(/\$/.test(simple))return{number:'currency',decimals:Math.min(8,decimals)};
 if(/^[#,0.]+$/.test(simple))return{number:'number',decimals:Math.min(8,decimals)};
 warnings.add('Custom number formats were replaced with General.');return{};
}
function evaluator(book:Workbook){
 const calc=createSheetEvaluator({maxTotalSteps:2000000,sheets:book.sheets.map(s=>s.name),read:(name,row,column)=>book.sheets.find(s=>s.name===name)?.cells[sheetReferences.write({row,column,absoluteRow:false,absoluteColumn:false})]?.input});
 return{cell(name:string,row:number,column:number){const value=calc.cell(name,row,column);if(calc.budgetExceeded())throw new Error('Workbook calculation exceeded the file-operation budget. Reduce large formula ranges before importing or exporting.');return value;}};
}
function payloadBudget(){let size=0;const encoder=new TextEncoder();return(text:string,overhead=0)=>{size+=encoder.encode(text).byteLength+overhead;if(size>20*1024*1024)throw new Error('Workbook export payload exceeds 20 MiB. Export a smaller workbook.');};}
const xmlPayload=(text:string)=>text.replace(/[&<>"'\x00-\x1f]/g,ch=>ch==='&'?'&amp;':ch==='<'?'&lt;':ch==='>'?'&gt;':ch==='"'?'&quot;':ch==="'"?'&apos;':'_x0000_');
export async function workbookFiles(request:Import,parse?:Parse):Promise<{book:Workbook;warnings:string[]}>;
export async function workbookFiles(request:Export,parse?:Parse):Promise<{bytes:Uint8Array;warnings:string[]}>;
export async function workbookFiles(request:Import|Export,parse:Parse=text=>new DOMParser().parseFromString(text,'application/xml')):Promise<{book:Workbook;warnings:string[]}|{bytes:Uint8Array;warnings:string[]}>{
 if(request.operation==='import'){
  if(request.bytes.length>20*1024*1024)throw new Error('Workbook files must be at most 20 MiB.');const warnings=new Set<string>();
  const entries=request.format==='xlsx'?await openWorkbookZip(request.bytes):undefined;
  if(entries){
   if(!entries.has('xl/workbook.xml'))throw new Error('Choose an XLSX workbook.');
   if([...entries.keys()].some(p=>/vbaProject|macrosheets/i.test(p)))warnings.add('Macros were excluded and never executed.');
   if([...entries.keys()].some(p=>/externalLinks/i.test(p)))warnings.add('External workbook links are not loaded.');
   if([...entries.keys()].some(p=>/xl\/(drawings|charts|media)\//.test(p)))warnings.add('Charts and embedded images are not supported.');
  }
  const vendor=request.format==='csv'?XLSX.read(csvText(request.bytes),{type:'string',raw:true,cellFormula:false,FS:','}):XLSX.read(request.bytes,{type:'array',cellNF:true,cellStyles:true,cellDates:false,bookVBA:false});
  if(vendor.Workbook?.WBProps?.date1904)throw new Error('This workbook uses the 1904 date system. Convert it to the 1900 date system before importing.');
  if(vendor.SheetNames.length>32)throw new Error('Workbooks support at most 32 sheets.');
  if(vendor.Workbook?.Names?.length)warnings.add('Named ranges are not supported.');
  const visual=entries?xlsxStyles.read(entries,parse):{styles:new Map<string,Record<string,Format>>(),warnings:[]};visual.warnings.forEach(w=>warnings.add(w));
  let count=0;const sheets=vendor.SheetNames.map((name,index)=>{
   const source=vendor.Sheets[name]!;const bounds=XLSX.utils.decode_range(source['!ref']??'A1');if(bounds.e.r>=10000||bounds.e.c>=256)throw new Error('Each sheet supports up to 10,000 rows and 256 columns.');
   if(source['!merges']?.length)warnings.add('Merged cells were imported as separate cells.');if(source['!protect'])warnings.add('Sheet protection is not supported.');if(source['!autofilter'])warnings.add('Reapply filters using Data → Filter selection.');
   const cells:Record<string,Workbook['sheets'][number]['cells'][string]>={},rowHeights:Record<string,number>={},columnWidths:Record<string,number>={};
   for(const[address,value]of Object.entries(source)){
    if(address.startsWith('!'))continue;if(++count>50000)throw new Error('Workbooks support up to 50,000 stored cells.');const cell=value as XLSX.CellObject;
    if(cell.l)warnings.add('Hyperlinks were imported as text.');if(cell.c)warnings.add('Cell comments are not supported.');
    let input:string;if(cell.f)input=`=${cell.f}`;else if(cell.t==='e')input=`=${({0:'#NULL!',7:'#DIV/0!',15:'#VALUE!',23:'#REF!',29:'#NAME?',36:'#NUM!',42:'#N/A',43:'#GETTING_DATA'} as Record<number,string>)[Number(cell.v)]??'#ERROR!'}`;else if(cell.t==='n'||cell.t==='b')input=String(cell.v??'');else if(request.format==='csv'){
     const raw=String(cell.v??'');input=/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)?raw:asText(raw);
    }else input=asText(String(cell.v??''));
    const format={...readNumberFormat(cell.z as string|undefined,warnings),...visual.styles.get(name)?.[address]};cells[address]={input,...(Object.keys(format).length?{format}:{})};
   }
   source['!cols']?.forEach((col,i)=>{const n=col.wpx??(col.wch!==undefined?Math.round(col.wch*7+5):undefined);if(n!==undefined&&i<=bounds.e.c)columnWidths[i]=Math.max(32,Math.min(480,Math.round(n)));if(col.hidden)warnings.add('Hidden rows/columns were made visible.');});
   source['!rows']?.forEach((row,i)=>{const n=row.hpx??(row.hpt!==undefined?row.hpt*4/3:undefined);if(n!==undefined&&i<=bounds.e.r)rowHeights[i]=Math.max(18,Math.min(240,Math.round(n)));if(row.hidden)warnings.add('Hidden rows/columns were made visible.');});
   return{id:`sheet-${index+1}`,name,rows:Math.max(1000,bounds.e.r+1),columns:Math.max(52,bounds.e.c+1),cells,rowHeights,columnWidths};
  });
  const book=workbookDocument({operation:'read',value:{schema:1,sheets}}),calc=evaluator(book);
  for(const sheet of book.sheets)for(const[address,cell]of Object.entries(sheet.cells))if(cell.input.startsWith('=')){const ref=sheetReferences.read(address),value=calc.cell(sheet.name,ref.row,ref.column);if(typeof value==='object'&&['#NAME?','#ERROR!','#REF!'].includes(value.error))warnings.add('Unsupported formulas/references remain editable and display errors instead of cached results.');}
  return{book,warnings:[...warnings]};
 }
 const book=request.book,calc=evaluator(book),warnings:string[]=[],charge=payloadBudget();
 if(request.format==='csv'){
  const sheet=book.sheets.find(s=>s.id===(request.sheet??book.sheets[0]!.id));if(!sheet)throw new Error('Choose a sheet to export.');
  const used=Object.keys(sheet.cells).map(sheetReferences.read);const rows=used.length?Math.max(...used.map(r=>r.row))+1:1,columns=used.length?Math.max(...used.map(r=>r.column))+1:1;
  if(rows*columns>1000000)throw new Error('CSV export supports up to one million positions; select a smaller used range.');
  const lines:string[]=[];for(let r=0;r<rows;r++){const row:string[]=[];for(let c=0;c<columns;c++){const value=calc.cell(sheet.name,r,c);let text=formatSheetValue(value);if(typeof value==='string'&&/^[=+\-@\t\r]/.test(text))text=`'${text}`;const field=/[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;charge(field,c?1:r?2:0);row.push(field);}lines.push(row.join(','));}
  if(book.sheets.length>1)warnings.push('CSV contains only the active sheet and computed values.');return{bytes:new TextEncoder().encode(lines.join('\r\n')),warnings};
 }
 const vendor=XLSX.utils.book_new();let positions=0;
 for(const sheet of book.sheets){
  const output:XLSX.WorkSheet={};let maxRow=0,maxColumn=0;
  for(const[address,cell]of Object.entries(sheet.cells)){
   const ref=sheetReferences.read(address),value=calc.cell(sheet.name,ref.row,ref.column);maxRow=Math.max(maxRow,ref.row);maxColumn=Math.max(maxColumn,ref.column);
   const item:XLSX.CellObject={t:typeof value==='number'?'n':typeof value==='boolean'?'b':'s',v:typeof value==='object'?value.error:value};
   charge(xmlPayload(formatSheetValue(value)),256);if(cell.input.startsWith('='))charge(xmlPayload(cell.input));
   if(cell.input.startsWith('='))item.f=cell.input.slice(1);if(cell.format)item.z=numberFormat(cell.format);output[address]=item;
  }
  maxRow=Math.max(maxRow,...Object.keys(sheet.rowHeights).map(Number));maxColumn=Math.max(maxColumn,...Object.keys(sheet.columnWidths).map(Number));
  positions+=(maxRow+1)*(maxColumn+1);if(positions>5000000)throw new Error('XLSX export supports up to five million used cell positions. Export a smaller workbook.');
  output['!ref']=`A1:${XLSX.utils.encode_cell({r:maxRow,c:maxColumn})}`;output['!cols']=[];output['!rows']=[];
  for(const[index,width]of Object.entries(sheet.columnWidths))output['!cols'][Number(index)]={wpx:width};for(const[index,height]of Object.entries(sheet.rowHeights))output['!rows'][Number(index)]={hpx:height};
  if(sheet.filter){const r=sheet.filter.range;output['!autofilter']={ref:`${XLSX.utils.encode_cell({r:r.r0,c:r.c0})}:${XLSX.utils.encode_cell({r:r.r1,c:r.c1})}`};warnings.push('XLSX preserves the filter range; the text query stays in the native project.');}
  XLSX.utils.book_append_sheet(vendor,output,sheet.name);
 }
 const entries=await openWorkbookZip(new Uint8Array(XLSX.write(vendor,{type:'array',bookType:'xlsx',compression:true})));xlsxStyles.write(entries,book,parse);
 return{bytes:writeWorkbookZip(entries),warnings};
}
