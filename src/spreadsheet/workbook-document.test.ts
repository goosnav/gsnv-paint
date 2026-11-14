import{test}from'node:test';import assert from'node:assert/strict';
import{workbookDocument,WorkbookError}from'./workbook-document.ts';
import{editWorkbook}from'./workbook-edits.ts';
import{createSheetEvaluator}from'./sheet-formulas.ts';
import{sheetReferences}from'./sheet-references.ts';
test('E01 costly sort keys reject atomically when the calculation budget is exhausted',()=>{
 let book=workbookDocument({operation:'new'});book=editWorkbook(book,{type:'cells',sheet:'sheet-1',cells:Array.from({length:30},(_,i)=>({address:`K${i+1}`,input:'=SUM(A1:J10000)'}))});
 const before=JSON.stringify(book);
 assert.throws(()=>editWorkbook(book,{type:'sort',sheet:'sheet-1',range:{r0:0,r1:29,c0:10,c1:10},column:10,direction:'ascending',header:false}),/sort.*calculation.*budget/i);
 assert.equal(JSON.stringify(book),before);
});
test('E01 workbook cells and styles are immutable and round trip without losing source formulas',()=>{
 const empty=workbookDocument({operation:'new'}),id=empty.sheets[0]!.id;
 const edited=editWorkbook(empty,{type:'cells',sheet:id,cells:[{address:'A1',input:'Price'},{address:'B2',input:'12.5'},{address:'C2',input:'=B2*2'}]});
 const formatted=editWorkbook(edited,{type:'format',sheet:id,range:{r0:1,c0:1,r1:1,c1:2},format:{bold:true,number:'currency',decimals:2,color:'#123456'}});
 assert.deepEqual(empty.sheets[0]!.cells,{});assert.equal(edited.sheets[0]!.cells.B2!.format,undefined);
 assert.equal(formatted.sheets[0]!.cells.C2!.input,'=B2*2');assert.equal(formatted.sheets[0]!.cells.B2!.format!.bold,true);
 assert.deepEqual(workbookDocument({operation:'read',value:JSON.parse(JSON.stringify(formatted))}),formatted);
 assert.throws(()=>workbookDocument({operation:'read',value:{...formatted,evil:true}}),WorkbookError);
 assert.throws(()=>editWorkbook(formatted,{type:'cells',sheet:id,cells:[{address:'A0',input:'bad'}]}),WorkbookError);
});
test('E01 multi-sheet edits, rename and delete update explicit formula references safely',()=>{
 let book=workbookDocument({operation:'new'}),first=book.sheets[0]!.id;
 book=editWorkbook(book,{type:'add-sheet',id:'sales',name:'Sales data'});
 book=editWorkbook(book,{type:'cells',sheet:first,cells:[{address:'A1',input:"='Sales data'!B2+1"}]});
 book=editWorkbook(book,{type:'rename-sheet',sheet:'sales',name:"Bob's sales"});assert.equal(book.sheets[0]!.cells.A1!.input,"='Bob''s sales'!B2+1");
 assert.throws(()=>editWorkbook(book,{type:'rename-sheet',sheet:'sales',name:'sheet1'}),WorkbookError);
 book=editWorkbook(book,{type:'move-sheet',sheet:'sales',index:0});assert.equal(book.sheets[0]!.id,'sales');
 book=editWorkbook(book,{type:'delete-sheet',sheet:'sales'});assert.equal(book.sheets[0]!.cells.A1!.input,'=#REF!+1');
 assert.throws(()=>editWorkbook(book,{type:'delete-sheet',sheet:first}),WorkbookError);
});
test('E01 fill moves relative formulas while row insertion/deletion tracks absolute references and ranges',()=>{
 let book=workbookDocument({operation:'new'}),sheet=book.sheets[0]!.id;
 book=editWorkbook(book,{type:'cells',sheet,cells:[{address:'A1',input:'2'},{address:'B1',input:'=A1+$A$1'},{address:'D1',input:'=SUM(A1:A3)'},{address:'E1',input:'=$A$2'}]});
 book=editWorkbook(book,{type:'fill',sheet,source:{r0:0,c0:1,r1:0,c1:1},target:{r0:1,c0:1,r1:2,c1:1}});assert.equal(book.sheets[0]!.cells.B3!.input,'=A3+$A$1');
 book=editWorkbook(book,{type:'insert',sheet,axis:'row',index:1,count:1});assert.equal(book.sheets[0]!.cells.B4!.input,'=A4+$A$1');assert.equal(book.sheets[0]!.cells.D1!.input,'=SUM(A1:A4)');assert.equal(book.sheets[0]!.cells.E1!.input,'=$A$3');
 book=editWorkbook(book,{type:'delete',sheet,axis:'row',index:2,count:1});assert.equal(book.sheets[0]!.cells.E1!.input,'=#REF!');assert.equal(book.sheets[0]!.cells.D1!.input,'=SUM(A1:A3)');
 const e=createSheetEvaluator({sheets:book.sheets.map(s=>s.name),read:(name,row,column)=>book.sheets.find(s=>s.name===name)!.cells[sheetReferences.write({row,column,absoluteRow:false,absoluteColumn:false})]?.input});assert.equal(e.cell('Sheet1',0,3),2);
});
test('E01 sort keeps records together; filters and dimensions persist; invalid edits are atomic',()=>{
 let book=workbookDocument({operation:'new'}),sheet=book.sheets[0]!.id;
 book=editWorkbook(book,{type:'cells',sheet,cells:[{address:'A1',input:'Name'},{address:'B1',input:'Score'},{address:'A2',input:'Beta'},{address:'B2',input:'9'},{address:'A3',input:'Alpha'},{address:'B3',input:'10'}]});
 book=editWorkbook(book,{type:'sort',sheet,range:{r0:0,c0:0,r1:2,c1:1},column:1,direction:'descending',header:true});assert.equal(book.sheets[0]!.cells.A2!.input,'Alpha');assert.equal(book.sheets[0]!.cells.B2!.input,'10');
 book=editWorkbook(book,{type:'filter',sheet,range:{r0:0,c0:0,r1:2,c1:1},column:0,query:'alpha'});
 book=editWorkbook(book,{type:'resize',sheet,axis:'column',index:0,size:180});assert.equal(book.sheets[0]!.columnWidths[0],180);assert.equal(book.sheets[0]!.filter!.query,'alpha');
 const saved=JSON.stringify(book);assert.throws(()=>editWorkbook(book,{type:'insert',sheet,axis:'row',index:0,count:10000}),WorkbookError);assert.equal(JSON.stringify(book),saved);
 assert.throws(()=>editWorkbook(book,{type:'resize',sheet,axis:'column',index:0,size:0}),WorkbookError);
});

test('E01 fractional sort coordinates reject atomically',()=>{
 const book=workbookDocument({operation:'new'}),before=JSON.stringify(book);
 assert.throws(()=>editWorkbook(book,{type:'sort',sheet:'sheet-1',range:{r0:0,c0:0,r1:2,c1:2},column:1.5,direction:'ascending',header:false}),WorkbookError);
 assert.equal(JSON.stringify(book),before);
});

test('E01 native validation rejects sparse sheet arrays before they reach the grid',()=>{
 const valid=workbookDocument({operation:'new'});
 for(const sheets of [new Array(1),Object.assign(new Array(2),{1:valid.sheets[0]})])assert.throws(()=>workbookDocument({operation:'read',value:{schema:1,sheets}}),WorkbookError);
});

test('E01 declared workbook and cell bounds reject before accepting oversized content',()=>{
 const initial=workbookDocument({operation:'new'}),base=initial.sheets[0]!,at=(i:number)=>sheetReferences.write({row:Math.floor(i/256),column:i%256,absoluteRow:false,absoluteColumn:false});
 const cells=Object.fromEntries(Array.from({length:50000},(_,i)=>[at(i),{input:'1'}]));
 const value={schema:1,sheets:[{...base,rows:10000,columns:256,cells}]};assert.equal(Object.keys(workbookDocument({operation:'read',value}).sheets[0]!.cells).length,50000);
 assert.throws(()=>workbookDocument({operation:'read',value:{...value,sheets:[{...value.sheets[0],cells:{...cells,[at(50000)]:{input:'2'}}}]}}),WorkbookError);
 for(const field of [{rows:10001},{columns:257},{cells:{A1:{input:'x'.repeat(8193)}}}])assert.throws(()=>workbookDocument({operation:'read',value:{schema:1,sheets:[{...base,...field}]}}),WorkbookError);
 assert.throws(()=>workbookDocument({operation:'read',value:{schema:1,sheets:Array.from({length:33},(_,i)=>({...base,id:`sheet-${i}`,name:`Sheet${i}`}))}}),WorkbookError);
});

test('E01 cross-sheet structural edits clip reversed ranges and preserve string literals',()=>{
 let book=workbookDocument({operation:'new'});book=editWorkbook(book,{type:'add-sheet',id:'other',name:"Other data"});
 book=editWorkbook(book,{type:'cells',sheet:'sheet-1',cells:[{address:'A1',input:"=SUM('Other data'!$C$5:$A$1)&\"C5:A1\""},{address:'B1',input:'=SUM(C5:A1)'}]});
 book=editWorkbook(book,{type:'cells',sheet:'other',cells:[{address:'A1',input:'5'},{address:'C5',input:'9'}]});
 const old=book;book=editWorkbook(book,{type:'delete',sheet:'other',axis:'row',index:0,count:2});
 assert.equal(book.sheets[0]!.cells.A1!.input,"=SUM('Other data'!$C$3:$A$1)&\"C5:A1\"");assert.equal(book.sheets[0]!.cells.B1!.input,'=SUM(C5:A1)');
 assert.equal(book.sheets[1]!.cells.C3!.input,'9');assert.equal(old.sheets[1]!.cells.C5!.input,'9');
 book=editWorkbook(book,{type:'insert',sheet:'other',axis:'column',index:1,count:2});assert.equal(book.sheets[0]!.cells.A1!.input,"=SUM('Other data'!$E$3:$A$1)&\"C5:A1\"");
 book=editWorkbook(book,{type:'delete',sheet:'other',axis:'column',index:0,count:5});assert.equal(book.sheets[0]!.cells.A1!.input,'=SUM(#REF!)&"C5:A1"');
});
