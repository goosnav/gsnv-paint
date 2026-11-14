import { test } from 'node:test'; import assert from 'node:assert/strict'; import { JSDOM } from 'jsdom';
import { createSlidesWorkspace } from './slides-workspace.ts'; import type { SlidesDocument } from './slides-document.ts';
import type { FilePorts } from '../shared/file-access.ts'; import type { AppDocument } from '../app/app-shell.ts';
function fixture() {
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true}),doc=dom.window.document,root=doc.getElementById('root')!;
  let nextFile:File|null=null;
  const files:FilePorts={document:doc,URL:{createObjectURL:()=>'',revokeObjectURL(){}},setTimeout,showOpenFilePicker:async()=>nextFile?[{getFile:async()=>nextFile} as unknown as FileSystemFileHandle]:[]};
  const adapter=createSlidesWorkspace(files),history:{document:AppDocument;label:string}[]=[];let snapshot={...adapter.create!(),identity:'r0'};
  const view=adapter.mount({root,commit(document,label,base){assert.equal(base,snapshot.identity);history.push({document,label});snapshot={...document,identity:`r${history.length}`};view.render(snapshot,{zoom:1,pan:{x:0,y:0}});},dialog(){},invalidate(){},async open(document){snapshot={...document,identity:'opened'};view.render(snapshot,{zoom:1,pan:{x:0,y:0}});return true;}});
  view.render(snapshot,{zoom:1,pan:{x:0,y:0}});
  return {dom,doc,root,adapter,view,history,files,setFile(file:File){nextFile=file;},get snapshot(){return snapshot;},get deck(){return snapshot.value as SlidesDocument;}};
}
test('P03 factory, slide/element commands and pending-input native save preserve editable state', () => {
  const f=fixture();f.view.command('slides.text');assert.equal(f.deck.slides[0]!.elements.length,1);
  const field=f.root.querySelector<HTMLTextAreaElement>('[data-field="text"]')!;field.value='Pending edit saved immediately';field.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));f.view.flush!();
  const pkg=f.adapter.encode(f.snapshot),reopened=f.adapter.decode(pkg);assert.deepEqual(reopened.value,f.deck);assert.equal(pkg.project.format,'gsnv-slides');
  f.view.command('slides.duplicate');assert.equal(f.deck.slides.length,2);assert.equal(f.deck.slides[1]!.elements[0]!.kind,'text');
  f.view.command('slides.up');assert.equal(f.deck.slides[0]!.elements[0]!.kind,'text');
  f.view.command('slides.add');f.view.command('slides.rectangle');f.view.command('slides.ellipse');assert.equal(f.deck.slides[1]!.elements.length,2);
  f.view.command('slides.deleteElement');assert.equal(f.deck.slides[1]!.elements.length,1);f.view.command('slides.delete');assert.equal(f.deck.slides.length,2);
  assert.ok(f.history.length>=8);f.view.dispose();assert.equal(f.root.childElementCount,0);
});
test('P03 image decode failures and stale completions cannot change the deck or history', async () => {
  const f=fixture(),before=JSON.stringify(f.deck);let release:()=>void=()=>{};
  f.dom.window.HTMLImageElement.prototype.decode=()=>Promise.reject(new Error('bad image'));
  f.setFile(new File(['not an image'],'broken.png',{type:'image/png'}));f.view.command('slides.image');
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(JSON.stringify(f.deck),before);assert.equal(f.history.length,0);assert.match(f.root.querySelector('[role="alert"]')!.textContent!,/picture|image/i);
  f.dom.window.HTMLImageElement.prototype.decode=()=>new Promise<void>(resolve=>{release=resolve;});
  Object.defineProperty(f.dom.window.HTMLImageElement.prototype,'naturalWidth',{get:()=>1});Object.defineProperty(f.dom.window.HTMLImageElement.prototype,'naturalHeight',{get:()=>1});
  f.setFile(new File([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jltUAAAAASUVORK5CYII=','base64'))],'valid.png',{type:'image/png'}));
  f.view.command('slides.image');await new Promise(resolve=>setTimeout(resolve,20));f.view.command('slides.rectangle');const count=f.history.length;release();await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(f.history.length,count);assert.equal(f.deck.images.length,0);assert.match(f.root.querySelector('[role="alert"]')!.textContent!,/changed/i);f.view.dispose();
});
test('P03 multiple mounted decks retain independent selected slides and project values', () => {
  const a=fixture(),b=fixture();a.view.command('slides.add');a.view.command('slides.text');b.view.command('slides.ellipse');
  assert.equal(a.deck.slides.length,2);assert.equal(b.deck.slides.length,1);assert.equal(b.deck.slides[0]!.elements[0]!.kind,'ellipse');assert.equal(a.deck.slides[1]!.elements[0]!.kind,'text');
  a.view.dispose();b.view.dispose();
});
test('P03 a successfully decoded picture commits once and reopens from native binary assets', async () => {
  const f=fixture();f.dom.window.HTMLImageElement.prototype.decode=async()=>{};Object.defineProperty(f.dom.window.HTMLImageElement.prototype,'naturalWidth',{get:()=>1});Object.defineProperty(f.dom.window.HTMLImageElement.prototype,'naturalHeight',{get:()=>1});
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jltUAAAAASUVORK5CYII=','base64');
  f.setFile(new File([bytes],'picture.png',{type:'image/png'}));f.view.command('slides.image');await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(f.history.length,1);assert.equal(f.deck.slides[0]!.elements[0]!.kind,'image');const encoded=f.adapter.encode(f.snapshot);assert.deepEqual(encoded.assets[0]!.bytes,new Uint8Array(bytes));assert.deepEqual(f.adapter.decode(encoded).value,f.deck);f.view.dispose();
});
