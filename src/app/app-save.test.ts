import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {mountApp,type WorkspaceAdapter,type AppDocument} from './app-shell.ts';
import {nativeContainer} from '../shared/native-container.ts';
import type {FilePorts} from '../shared/file-access.ts';
function setup(){
 const dom=new JSDOM('<main id="app"></main>',{url:'https://save.test'}),document=dom.window.document,root=document.querySelector<HTMLElement>('main')!;
 Object.assign(dom.window.HTMLElement.prototype,{setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return false;}});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const writes:Uint8Array[]=[],exports:string[]=[];let saves=0,allowed=true,staged=false,flushFails=false,disableOnFlush=false,current:AppDocument|undefined,identity='',edit:()=>void=()=>{};
 const adapter:WorkspaceAdapter={create:()=>({id:'picture',title:'Drawing',format:'gsnv-image',version:1,value:{name:'before'}}),decode:p=>({...p.project,value:p.project.content}),encode:d=>({project:{format:'gsnv-image',version:1,id:d.id,title:d.title,content:d.value as {name:string}},assets:[]}),mount(host){edit=()=>{host.commit({...current!,value:{name:'after'}},'Edit',identity);};return{render(d){current=d;identity=d?.identity??'';},model:()=>({menus:[{id:'image',label:'Image',items:[{id:'image.exportPNG',label:'Export PNG…',shortcut:'',enabled:!!current&&allowed,icon:'export',toolbar:true}]}],tools:[],panels:[]}),context:()=>({viewRole:'canvas2d',activeTool:'brush',status:'Ready'}),command:id=>exports.push(id),gesture(){},flush(){if(flushFails)throw new Error('Finish editing first');if(disableOnFlush)allowed=false;if(staged){staged=false;edit();}},dispose(){}};}};
 const files:FilePorts={document,URL:{createObjectURL:()=>'',revokeObjectURL(){}},setTimeout:f=>f(),showSaveFilePicker:async()=>({requestPermission:async()=> 'granted',createWritable:async()=>({write:async(b:Uint8Array)=>writes.push(b.slice()),close:async()=>{saves++;},abort:async()=>{}})}) as unknown as FileSystemFileHandle};
 const app=mountApp({root,adapters:{image:adapter},files,recovery:{indexedDB:new IDBFactory()},probe:{environment:{},codecRequests:[]}});
 const button=(selector:string)=>root.querySelector<HTMLButtonElement>(selector)!;
 const choose=(id:string)=>{const select=root.querySelector<HTMLSelectElement>('dialog select')!;select.value=id;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 const confirm=()=>[...root.querySelectorAll<HTMLButtonElement>('dialog button')].find(b=>b.textContent==='Continue')!.click();
 return{dom,root,app,button,choose,confirm,writes,exports,get saves(){return saves;},edit:()=>edit(),stage:()=>{staged=true;},disable:()=>{allowed=false;},failFlush:()=>{flushFails=true;},disableOnFlush:()=>{disableOnFlush=true;}};
}
test('A-SHELL Image starts first and Save popup cancellation never writes or exports',async()=>{
 const f=setup();await f.app.ready;assert.equal(f.app.snapshot().workspace,'image');assert.equal(f.root.querySelector('[role=tab]')!.getAttribute('aria-label'),'Image');
 await f.app.dispatch('file.new');const before=f.app.snapshot().documents.image;
 f.button('.gc-standard [data-command="file.saveOptions"]').click();assert.ok(f.root.querySelector('dialog'));
 assert.deepEqual([...f.root.querySelectorAll('dialog option')].map(n=>(n as HTMLOptionElement).value),['file.save','image.exportPNG']);
 f.choose('image.exportPNG');[...f.root.querySelectorAll<HTMLButtonElement>('dialog button')].find(b=>b.textContent==='Cancel')!.click();await f.app.idle();
 assert.equal(f.app.snapshot().documents.image,before);assert.equal(f.writes.length,0);assert.deepEqual(f.exports,[]);f.app.dispose();
});
test('A-SHELL Save/export choices flush edits and keep exports separate from project saved state',async()=>{
 const f=setup();await f.app.ready;await f.app.dispatch('file.new');f.stage();
 f.button('.gc-standard [data-command="file.saveOptions"]').click();assert.deepEqual(f.app.snapshot().documents.image!.value,{name:'after'});
 f.choose('image.exportPNG');f.confirm();await f.app.idle();assert.deepEqual(f.exports,['image.exportPNG']);assert.equal(f.app.snapshot().dirty.image,true);
 f.button('[data-menu="file"]').click();f.button('.gc-menubar [data-command="file.saveOptions"]').click();f.button('.gc-submenu [data-command="file.save"]').click();await f.app.idle();
 assert.equal(f.saves,1);const decoded=nativeContainer({op:'decode',parts:f.writes});assert.equal(decoded.project.format,'gsnv-image');assert.deepEqual(decoded.project.content,{name:'after'});assert.equal(f.app.snapshot().dirty.image,false);
 f.edit();await f.app.dispatch('file.save');await f.app.idle();assert.equal(f.saves,2);assert.equal(f.root.querySelector('dialog'),null);f.app.dispose();
});
test('A-SHELL Export popup offers exports only and rechecks live availability before dispatch',async()=>{
 const f=setup();await f.app.ready;await f.app.dispatch('file.new');f.button('.gc-standard [data-command="file.export"]').click();
 assert.deepEqual([...f.root.querySelectorAll('dialog option')].map(n=>(n as HTMLOptionElement).value),['image.exportPNG']);
 f.disable();f.confirm();await f.app.idle();assert.deepEqual(f.exports,[]);assert.match(f.app.snapshot().message,/available/i);assert.equal(f.writes.length,0);f.app.dispose();
});

test('A-SHELL File Save export commits pending input and aborts failed or invalidating flushes',async()=>{
 for(const scenario of ['commit','failure','disable'] as const){
  const f=setup();await f.app.ready;await f.app.dispatch('file.new');f.stage();
  if(scenario==='failure')f.failFlush();if(scenario==='disable')f.disableOnFlush();
  f.button('[data-menu="file"]').click();f.button('.gc-menubar [data-command="file.saveOptions"]').click();f.button('.gc-submenu [data-command="image.exportPNG"]').click();await f.app.idle();
  assert.deepEqual(f.exports,scenario==='commit'?['image.exportPNG']:[]);
  if(scenario==='commit')assert.deepEqual(f.app.snapshot().documents.image!.value,{name:'after'});
  assert.equal(f.app.snapshot().dirty.image,true);assert.equal(f.saves,0);f.app.dispose();
 }
});
