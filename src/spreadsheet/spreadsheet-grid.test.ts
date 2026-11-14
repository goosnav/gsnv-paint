import assert from 'node:assert/strict';import test from 'node:test';import {JSDOM} from 'jsdom';
import {spreadsheetGrid} from './spreadsheet-grid.ts';import {workbookDocument} from './workbook-document.ts';import {editWorkbook} from './workbook-edits.ts';
test('E04 virtual grid edits raw formulas, supports keyboard selection, Escape and pending flush',()=>{
 const dom=new JSDOM('<div id="root"></div>'),root=dom.window.document.querySelector<HTMLElement>('#root')!;let book=workbookDocument({operation:'new'}),selection={r0:0,c0:0,r1:0,c1:0};const edits:string[]=[];
 const grid=spreadsheetGrid({root,onSelect(value){selection=value;grid.update(book,'sheet-1',selection);},onEdit(address,input){edits.push(input);book=editWorkbook(book,{type:'cells',sheet:'sheet-1',cells:[{address,input}]});grid.update(book,'sheet-1',selection);},onClipboard(){},onError(error){throw error;}});
 grid.update(book,'sheet-1',selection);const surface=root.querySelector<HTMLElement>('[role=grid]')!;
 assert.ok(root.querySelectorAll('[role=gridcell]').length<800);assert.equal(surface.getAttribute('aria-rowcount'),'1000');
 const stableCell=root.querySelector('[data-cell="A1"]');grid.update(book,'sheet-1',selection);surface.dispatchEvent(new dom.window.Event('scroll'));assert.equal(root.querySelector('[data-cell="A1"]'),stableCell);
 surface.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'=',bubbles:true}));const input=root.querySelector<HTMLInputElement>('[aria-label="Cell input"]')!;input.value='=4+5';grid.flush();
 assert.deepEqual(edits,['=4+5']);assert.equal(root.querySelector('[data-cell="A1"]')!.textContent,'9');
 surface.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));assert.deepEqual(selection,{r0:0,c0:0,r1:0,c1:1});
 grid.edit('cancel me');root.querySelector<HTMLInputElement>('[aria-label="Cell input"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(edits.length,1);
 grid.dispose();assert.equal(root.childElementCount,0);dom.window.close();
});
test('E04 complex filter calculations stop visibly rather than silently hiding unmatched rows',()=>{
 const dom=new JSDOM('<div id="root"></div>'),root=dom.window.document.querySelector<HTMLElement>('#root')!,errors:string[]=[];
 let book=workbookDocument({operation:'new'});book=editWorkbook(book,{type:'cells',sheet:'sheet-1',cells:Array.from({length:40},(_,i)=>({address:`K${i+1}`,input:'=SUM(A1:J10000)'}))});
 book=editWorkbook(book,{type:'filter',sheet:'sheet-1',range:{r0:0,r1:39,c0:10,c1:10},column:10,query:'nomatch'});
 const grid=spreadsheetGrid({root,onSelect(){},onEdit(){},onClipboard(){},onError(error){errors.push(String(error));}});grid.update(book,'sheet-1',{r0:0,r1:0,c0:0,c1:0});
 assert.ok(errors.some(message=>/calculation.*budget|filter.*complex/i.test(message)));assert.ok(root.querySelector('[data-cell="A2"]'),'a rejected filter must not hide rows');grid.dispose();dom.window.close();
});
