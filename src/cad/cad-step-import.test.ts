import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { cadSTEPImport } from './cad-step-import.ts';
import { isSTEPSource } from './cad-project-source.ts';
import type { CADProtocol } from './cad-worker-client.ts';
import type { FilePorts } from '../shared/file-access.ts';
const assets={kernelModule:'/k.js',kernelWasm:'/k.wasm',solverModule:'/s.js',solverWasm:'/s.wasm'};
function fixture(picker?:FilePorts['showOpenFilePicker']){
  const statuses:string[]=[],imports:unknown[][]=[],workers:{sent:CADProtocol['request'][];stopped:boolean;reply(value:CADProtocol['reply']):void}[]=[];let id=0;
  const files={showOpenFilePicker:picker??(async()=>[{getFile:async()=>new File(['ISO-10303-21;'],'part.step')} as FileSystemFileHandle]),document:{},URL:{},setTimeout} as unknown as FilePorts;
  const importer=cadSTEPImport({files,assets,id:()=>`id-${++id}`,onStatus:(_state,message)=>statuses.push(message),onImport:(...values)=>imports.push(values),createWorker(){
    const listeners=new Map<string,EventListener>();
    const worker={sent:[] as CADProtocol['request'][],stopped:false,postMessage(value:CADProtocol['request']){this.sent.push(value);},terminate(){this.stopped=true;},addEventListener(k:string,cb:EventListener){listeners.set(k,cb);},removeEventListener(k:string){listeners.delete(k);},reply(value:CADProtocol['reply']){listeners.get('message')?.({data:value} as MessageEvent);}};
    workers.push(worker);return worker as unknown as Worker;
  }});
  return{importer,statuses,imports,workers};
}
const solid={positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2]),volume:1,area:3,center:[0,0,0] as [number,number,number]};
const value={entities:[],dof:0,solid,bodies:[{id:'step-solid-1',volume:1,area:3,center:[0,0,0] as [number,number,number]}]};
test('C69 stages exact source bytes and publishes only after full worker validation',async()=>{
  const f=fixture(),task=f.importer.run({identity:'previous',units:'inch'});await setImmediate();
  assert.equal(f.imports.length,0);assert.equal(f.workers.length,1);const request=f.workers[0]!.sent[0]!;
  assert.ok(isSTEPSource(request.content));assert.equal(request.content.units,'inch');assert.equal(new TextDecoder().decode(request.content.assets[0].bytes),'ISO-10303-21;');
  f.workers[0]!.reply({id:request.id,ok:true,value});await task;
  assert.equal(f.imports.length,1);assert.equal(f.imports[0]![2],'previous');assert.ok(f.workers[0]!.stopped);f.importer.dispose();
});
test('C69 rejection and cancellation preserve the current project and allow retry',async()=>{
  const f=fixture(),task=f.importer.run({identity:'keep',units:'mm'});await setImmediate();
  f.workers[0]!.reply({id:1,ok:false,message:'Invalid second STEP body'});await task;
  assert.equal(f.imports.length,0);assert.match(f.statuses.at(-1)!,/Invalid second/);assert.ok(f.workers[0]!.stopped);
  const retry=f.importer.run({identity:'keep',units:'mm'});await setImmediate();f.importer.cancel();await retry;
  f.workers[1]!.reply({id:1,ok:true,value});assert.equal(f.imports.length,0);assert.ok(f.workers[1]!.stopped);f.importer.dispose();
});
test('C69 canceled or superseded picker results never start native work',async()=>{
  const resolve:((handles:FileSystemFileHandle[])=>void)[]=[],f=fixture(()=>new Promise(r=>resolve.push(r)));
  const first=f.importer.run({identity:null,units:'mm'}),second=f.importer.run({identity:'new',units:'mm'});await first;
  resolve[0]!([{getFile:async()=>new File(['old'],'old.step')} as FileSystemFileHandle]);await setImmediate();assert.equal(f.workers.length,0);
  f.importer.dispose();await second;resolve[1]!([{getFile:async()=>new File(['new'],'new.step')} as FileSystemFileHandle]);await setImmediate();assert.equal(f.workers.length,0);assert.equal(f.imports.length,0);
});
test('C69 bounds selected file size before reading and rejects empty or partial replies',async()=>{
  let slices=0;const f=fixture(async()=>[{getFile:async()=>({size:64*1024*1024+1,slice(){slices++;throw new Error('must not read');}})} as unknown as FileSystemFileHandle]);
  await f.importer.run({identity:'keep',units:'mm'});assert.equal(slices,0);assert.equal(f.workers.length,0);assert.match(f.statuses.at(-1)!,/exceeds/);f.importer.dispose();
  const empty=fixture(async()=>[{getFile:async()=>new File([],'empty.step')} as FileSystemFileHandle]);await empty.importer.run({identity:null,units:'mm'});assert.match(empty.statuses.at(-1)!,/nonempty/);empty.importer.dispose();
  const partial=fixture(),task=partial.importer.run({identity:null,units:'mm'});await setImmediate();partial.workers[0]!.reply({id:1,ok:true,value:{entities:[],dof:0,solid:null}});await task;assert.equal(partial.imports.length,0);assert.match(partial.statuses.at(-1)!,/complete/);partial.importer.dispose();
});
test('C69 invalid ports fail immediately and picker dismissal is a normal cancellation',async()=>{
  assert.throws(()=>cadSTEPImport(null as unknown as Parameters<typeof cadSTEPImport>[0]),TypeError);
  const f=fixture(async()=>{throw new DOMException('dismissed','AbortError');});await f.importer.run({identity:null,units:'mm'});assert.match(f.statuses.at(-1)!,/canceled/);assert.equal(f.workers.length,0);f.importer.dispose();
});
