import assert from 'node:assert/strict';import test from 'node:test';import {JSDOM} from 'jsdom';
import {createSpreadsheetWorkspace} from './spreadsheet-workspace.ts';import {workbookDocument,type Workbook} from './workbook-document.ts';import {editWorkbook} from './workbook-edits.ts';import type {AppDocument} from '../app/app-shell.ts';
test('E04 native save flushes formula input and sheet edits remain independently undoable',()=>{
 const dom=new JSDOM('<div id="root"></div>'),doc=dom.window.document,root=doc.querySelector<HTMLElement>('#root')!;
 const adapter=createSpreadsheetWorkspace({document:doc,URL:{createObjectURL:()=>'',revokeObjectURL(){}},setTimeout});let snapshot={...adapter.create!(),identity:'r0'};const history:AppDocument[]=[];
 const view=adapter.mount({root,commit(next,label,base){assert.equal(base,snapshot.identity);assert.ok(label);history.push(snapshot);snapshot={...next,identity:`r${history.length}`};view.render(snapshot,{zoom:1,pan:{x:0,y:0}});},dialog(){},invalidate(){},async open(next){snapshot={...next,identity:'new'};view.render(snapshot,{zoom:1,pan:{x:0,y:0}});return true;}});
 view.render(snapshot,{zoom:1,pan:{x:0,y:0}});const formula=root.querySelector<HTMLInputElement>('[aria-label="Formula or value"]')!;formula.value='=2+3';formula.dispatchEvent(new dom.window.Event('input'));view.flush!();
 assert.equal((snapshot.value as Workbook).sheets[0]!.cells.A1!.input,'=2+3');assert.equal(root.querySelector('[data-cell="A1"]')!.textContent,'5');
 const pkg=adapter.encode(snapshot);assert.deepEqual(adapter.decode(pkg).value,snapshot.value);assert.equal(pkg.project.format,'gsnv-spreadsheet');
 view.command('sheet.add');assert.equal((snapshot.value as Workbook).sheets.length,2);view.render({...history.at(-1)!,identity:'undo'},{zoom:1,pan:{x:0,y:0}});assert.equal(root.querySelectorAll('[data-sheet-tab]').length,1);
 assert.throws(()=>adapter.decode({...pkg,project:{...pkg.project,content:{schema:1,sheets:[]}}}),/sheet/i);view.dispose();assert.equal(root.childElementCount,0);dom.window.close();
});
test('E04 oversized clipboard output rejects before Cut can clear selected cells',()=>{
 const dom=new JSDOM('<div id="root"></div>'),doc=dom.window.document,root=doc.querySelector<HTMLElement>('#root')!;
 let book=workbookDocument({operation:'new'});book=editWorkbook(book,{type:'cells',sheet:'sheet-1',cells:Array.from({length:200},(_,i)=>({address:`A${i+1}`,input:i===0?'é'.repeat(8192):'=$A$1&$A$1&$A$1'}))});
 const adapter=createSpreadsheetWorkspace({document:doc,URL:{createObjectURL:()=>'',revokeObjectURL(){}},setTimeout});let commits=0;
 const view=adapter.mount({root,commit(){commits++;},dialog(){},invalidate(){},async open(){return false;}});
 view.render({...adapter.create!(),value:book,identity:'r0'},{zoom:1,pan:{x:0,y:0}});
 const range=root.querySelector<HTMLInputElement>('[aria-label="Cell address or range"]')!;range.value='A1:A200';range.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter'}));view.command('edit.cut');
 assert.match(root.querySelector('.sheet-notice')!.textContent!,/clipboard.*4 MiB/i);assert.equal(commits,0);view.dispose();dom.window.close();
});
