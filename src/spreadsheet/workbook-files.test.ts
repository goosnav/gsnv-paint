import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import * as XLSX from 'xlsx';
import {workbookDocument} from './workbook-document.ts';
import {editWorkbook} from './workbook-edits.ts';
import {workbookFiles} from './workbook-files.ts';
import {openWorkbookZip,writeWorkbookZip} from './workbook-zip.ts';
const parse=(text:string)=>new (new JSDOM('').window.DOMParser)().parseFromString(text,'application/xml');
function fixture(){
 let book=workbookDocument({operation:'new'});
 book=editWorkbook(book,{type:'cells',sheet:'sheet-1',cells:[{address:'A1',input:'Name'},{address:'B1',input:'Cost'},{address:'A2',input:'Paper'},{address:'B2',input:'12.5'},{address:'B3',input:'=B2*2'},{address:'A4',input:"'=literal"},{address:'A5',input:"'0012"}]});
 book=editWorkbook(book,{type:'format',sheet:'sheet-1',range:{r0:0,r1:0,c0:0,c1:1},format:{bold:true,italic:true,color:'#123456',fill:'#abcdef',align:'center'}});
 book=editWorkbook(book,{type:'format',sheet:'sheet-1',range:{r0:1,r1:2,c0:1,c1:1},format:{number:'currency',decimals:2}});
 book=editWorkbook(book,{type:'resize',sheet:'sheet-1',axis:'column',index:0,size:180});
 book=editWorkbook(book,{type:'add-sheet',id:'totals',name:'Annual totals'});
 return editWorkbook(book,{type:'cells',sheet:'totals',cells:[{address:'A1',input:'=Sheet1!B3'}]});
}
test('E03 real XLSX roundtrip preserves sources, names and supported styles',async()=>{
 const source=fixture(),out=await workbookFiles({operation:'export',book:source,format:'xlsx'},parse);
 const actual=XLSX.read(out.bytes,{type:'array',cellNF:true});
 assert.deepEqual(actual.SheetNames,['Sheet1','Annual totals']);assert.equal(actual.Sheets.Sheet1!.B3.f,'B2*2');assert.equal(actual.Sheets.Sheet1!.B3.v,25);assert.equal(actual.Sheets.Sheet1!.A5.v,'0012');
 const reopened=await workbookFiles({operation:'import',bytes:out.bytes,format:'xlsx'},parse);
 const sheet=reopened.book.sheets[0]!;
 for(const key of ['A1','B1','A2','B2','B3','A4','A5'])assert.deepEqual(sheet.cells[key],source.sheets[0]!.cells[key]);
 assert.equal(sheet.columnWidths[0],180);assert.equal(reopened.book.sheets[1]!.cells.A1!.input,'=Sheet1!B3');assert.deepEqual(reopened.warnings,[]);
});
test('E03 CSV preserves UTF-8 quoted values and treats imported formulas as inert text',async()=>{
 const input=new TextEncoder().encode('Name,Note,Value\r\n"Café","a,b\nnext",12.5\r\n=WEBSERVICE("x"),"""quoted""",-3\r\n');
 const {book}=await workbookFiles({operation:'import',bytes:input,format:'csv'},parse);
 assert.equal(book.sheets[0]!.cells.B2!.input,'a,b\nnext');assert.equal(book.sheets[0]!.cells.A3!.input,"'=WEBSERVICE(\"x\")");
 const out=await workbookFiles({operation:'export',book,format:'csv'},parse);
 assert.match(new TextDecoder().decode(out.bytes),/Café,"a,b\nnext",12.5/);assert.match(new TextDecoder().decode(out.bytes),/'=WEBSERVICE/);
});
test('E03 unsupported workbook features are diagnosed and formulas stay editable',async()=>{
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['label'],[1]]);sheet.A2={t:'n',v:100,f:'UNSUPPORTED(4)'};sheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:1}}];XLSX.utils.book_append_sheet(book,sheet,'Test');
 const result=await workbookFiles({operation:'import',bytes:new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})),format:'xlsx'},parse);
 assert.equal(result.book.sheets[0]!.cells.A2!.input,'=UNSUPPORTED(4)');assert.ok(result.warnings.some(x=>/merged/i.test(x)));assert.ok(result.warnings.some(x=>/unsupported formula/i.test(x)));
});
test('E03 malformed, oversized and misleading ZIP sizes reject before replacing a workbook',async()=>{
 await assert.rejects(workbookFiles({operation:'import',bytes:new Uint8Array([1,2,3]),format:'xlsx'},parse),/ZIP|XLSX/);
 await assert.rejects(workbookFiles({operation:'import',bytes:new Uint8Array(20*1024*1024+1),format:'xlsx'},parse),/20 MiB/);
 const zipped=writeWorkbookZip(new Map([['test.xml',new TextEncoder().encode('hello')]]));assert.equal(new TextDecoder().decode((await openWorkbookZip(zipped)).get('test.xml')),'hello');
 const corrupt=zipped.slice(),view=new DataView(corrupt.buffer);let center=-1;for(let i=0;i<corrupt.length-4;i++)if(view.getUint32(i,true)===0x02014b50){center=i;break;}assert.ok(center>=0);view.setUint32(center+24,1,true);
 await assert.rejects(openWorkbookZip(corrupt),/size|length|ZIP/i);
 await assert.rejects(workbookFiles({operation:'import',bytes:new TextEncoder().encode(','.repeat(256)),format:'csv'},parse),/256 columns/);
 await assert.rejects(workbookFiles({operation:'import',bytes:new TextEncoder().encode('1\n'.repeat(10001)),format:'csv'},parse),/10,000 rows/);
});
test('E03 empty row/column sizing and literal spreadsheet errors survive XLSX',async()=>{
 let source=fixture();source=editWorkbook(source,{type:'resize',sheet:'sheet-1',axis:'column',index:12,size:240});source=editWorkbook(source,{type:'resize',sheet:'sheet-1',axis:'row',index:50,size:36});
 const exported=await workbookFiles({operation:'export',book:source,format:'xlsx'},parse),opened=await workbookFiles({operation:'import',bytes:exported.bytes,format:'xlsx'},parse);
 assert.equal(opened.book.sheets[0]!.columnWidths[12],240);assert.equal(opened.book.sheets[0]!.rowHeights[50],36);
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,{A1:{t:'e',v:7},'!ref':'A1'},'Errors');
 const error=await workbookFiles({operation:'import',bytes:new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})),format:'xlsx'},parse);
 assert.equal(error.book.sheets[0]!.cells.A1!.input,'=#DIV/0!');
});
test('E03 numeric-looking text keeps whitespace/type, unsupported 1904 date systems reject visibly',async()=>{
 const source=XLSX.utils.book_new();XLSX.utils.book_append_sheet(source,XLSX.utils.aoa_to_sheet([[' 0012 ','\t2\t']]),'Text');
 const opened=await workbookFiles({operation:'import',bytes:new Uint8Array(XLSX.write(source,{type:'array',bookType:'xlsx'})),format:'xlsx'},parse);
 assert.equal(opened.book.sheets[0]!.cells.A1!.input,"' 0012 ");assert.equal(opened.book.sheets[0]!.cells.B1!.input,"'\t2\t");
 source.Workbook={WBProps:{date1904:true}};
 await assert.rejects(workbookFiles({operation:'import',bytes:new Uint8Array(XLSX.write(source,{type:'array',bookType:'xlsx'})),format:'xlsx'},parse),/1904/);
});
test('E03 export bounds aggregate text before producing oversized CSV/XLSX',async()=>{
 let book=workbookDocument({operation:'new'});
 book=workbookDocument({operation:'read',value:{...book,sheets:book.sheets.map(s=>({...s,rows:2000}))}});
 book=editWorkbook(book,{type:'cells',sheet:'sheet-1',cells:Array.from({length:1100},(_,i)=>({address:`A${i+1}`,input:i===0?'é'.repeat(8192):'=$A$1&$A$1&$A$1'}))});
 await assert.rejects(workbookFiles({operation:'export',book,format:'csv'},parse),/export.*20 MiB/i);
 await assert.rejects(workbookFiles({operation:'export',book,format:'xlsx'},parse),/export.*(?:20|48) MiB/i);
});
test('E03 unsupported indexed font colors produce a visible diagnostic',async()=>{
 const source=XLSX.utils.book_new();XLSX.utils.book_append_sheet(source,XLSX.utils.aoa_to_sheet([['Red text']]),'Color');
 const entries=await openWorkbookZip(new Uint8Array(XLSX.write(source,{type:'array',bookType:'xlsx'}))),styles=new TextDecoder().decode(entries.get('xl/styles.xml'));
 entries.set('xl/styles.xml',new TextEncoder().encode(styles.replace(/<color[^>]*\/>/,'<color indexed="10"/>')));
 const result=await workbookFiles({operation:'import',bytes:writeWorkbookZip(entries),format:'xlsx'},parse);
 assert.ok(result.warnings.some(message=>/indexed.*font color/i.test(message)));
});
test('E03 file calculation budget aborts costly workbook batches with a readable error',async()=>{
 let book=workbookDocument({operation:'new'});
 book=editWorkbook(book,{type:'cells',sheet:'sheet-1',cells:Array.from({length:30},(_,i)=>({address:`K${i+1}`,input:'=SUM(A1:J10000)'}))});
 await assert.rejects(workbookFiles({operation:'export',book,format:'csv'},parse),/calculation.*budget/i);
 const source=XLSX.utils.book_new(),sheet:XLSX.WorkSheet={'!ref':'K1:K30'};for(let i=1;i<=30;i++)sheet[`K${i}`]={t:'n',v:0,f:'SUM(A1:J10000)'};XLSX.utils.book_append_sheet(source,sheet,'Work');
 await assert.rejects(workbookFiles({operation:'import',bytes:new Uint8Array(XLSX.write(source,{type:'array',bookType:'xlsx'})),format:'xlsx'},parse),/calculation.*budget/i);
});
