import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { cadSTEPExport } from './cad-step-export.ts';
import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent } from './edit-cad-content.ts';
import type { FilePorts } from '../shared/file-access.ts';
const content=editableCADContent({operation:'new'}),bytes=new Uint8Array([73,83,79]);
const assets={kernelModule:'/occt.js',kernelWasm:'/occt.wasm',solverModule:'/solver.js',solverWasm:'/solver.wasm'};
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};}
function fixture(native=false){
 const events:string[]=[],statuses:{state:string;message:string}[]=[],workers:TestWorker[]=[],writes:number[][]=[];
 const picker=deferred<FileSystemFileHandle>();let blob:Blob|undefined,failWrite=false,writeGate:Promise<void>|undefined;
 class TestWorker extends EventTarget {terminated=0;requests:unknown[]=[];postMessage(value:unknown){events.push('worker.post');this.requests.push(value);}terminate(){this.terminated++;events.push('worker.terminate');}reply(value:unknown={ok:true,file:{name:'part.step',mime:'model/step',bytes}}){this.dispatchEvent(new MessageEvent('message',{data:value}));}}
 const files:FilePorts={
  document:{body:{append(){}},createElement(){return{href:'',download:'',click(){events.push('download');},remove(){}};}} as unknown as FilePorts['document'],
  URL:{createObjectURL(value:Blob|MediaSource){blob=value as Blob;return'blob:export';},revokeObjectURL(){events.push('url.revoke');}},setTimeout(callback){callback();},
  ...(native?{showSaveFilePicker:async(options:unknown)=>{events.push('picker');assert.deepEqual(options,{suggestedName:'plate.step',types:[{accept:{'model/step':['.step']}}]});return picker.promise;}}:{}),
 };
 const handle={name:'plate.step',async createWritable(){events.push('file.open');return{async write(value:Uint8Array){events.push('file.write');if(failWrite)throw new Error('Disk full');writes.push([...value]);await writeGate;},async close(){events.push('file.close');},async abort(){events.push('file.abort');}};}} as unknown as FileSystemFileHandle;
 const ports={files,assets,createWorker(){events.push('worker.create');const worker=new TestWorker();workers.push(worker);return worker;},onStatus(state:'busy'|'ready'|'error',message:string){statuses.push({state,message});}};
 return {ports,events,statuses,workers,writes,picker,handle,get blob(){return blob;},set failWrite(v:boolean){failWrite=v;},set writeGate(v:Promise<void>){writeGate=v;}};
}
const request=()=>({content:structuredClone(content),name:'plate.step'});
test('C60 rejects invalid callbacks or absent file ports',()=>{
 const f=fixture();for(const patch of [{createWorker:null},{onStatus:null},{files:null}])assert.throws(()=>cadSTEPExport({...f.ports,...patch} as never),{name:'TypeError'});
});
test('C60 native golden starts picker first, writes returned bytes once, closes, then reports saved',async()=>{
 const f=fixture(true),exporter=cadSTEPExport(f.ports),source=request();const task=exporter.run(source);
 assert.deepEqual(f.events,['picker']);assert.equal(f.workers.length,0);source.content.units='inch';
 f.picker.resolve(f.handle);await setImmediate();assert.equal(f.workers.length,1);
 assert.deepEqual(f.workers[0]!.requests,[{content,assets}]);f.workers[0]!.reply();await task;
 assert.deepEqual(f.writes,[[73,83,79]]);assert.deepEqual(f.events,['picker','worker.create','worker.post','worker.terminate','file.open','file.write','file.close']);
 assert.deepEqual(f.statuses.at(-1),{state:'ready',message:'STEP saved: plate.step'});exporter.dispose();
});
test('C60 fallback golden hands exact bytes to a browser download and revokes the object URL',async()=>{
 const f=fixture(),exporter=cadSTEPExport(f.ports),task=exporter.run(request());await setImmediate();f.workers[0]!.reply();await task;
 assert.deepEqual([...new Uint8Array(await f.blob!.arrayBuffer())],[73,83,79]);assert.ok(f.events.includes('download'));assert.ok(f.events.includes('url.revoke'));
 assert.deepEqual(f.statuses.at(-1),{state:'ready',message:'STEP download handed to browser: plate.step'});assert.equal(f.workers[0]!.terminated,1);exporter.dispose();
});
test('C60 cancel during picker or worker ignores late resources and never downloads',async()=>{
 const f=fixture(true),exporter=cadSTEPExport(f.ports),task=exporter.run(request());exporter.cancel();await task;f.picker.resolve(f.handle);await setImmediate();assert.equal(f.workers.length,0);assert.equal(f.writes.length,0);
 const g=fixture(),other=cadSTEPExport(g.ports),working=other.run(request());await setImmediate();other.cancel();g.workers[0]!.reply();await working;assert.equal(g.workers[0]!.terminated,1);assert.equal(g.blob,undefined);assert.match(g.statuses.at(-1)!.message,/canceled/);exporter.dispose();other.dispose();
});
test('C60 a new export replaces the previous job; disposal stops and ignores all late work',async()=>{
 const f=fixture(),exporter=cadSTEPExport(f.ports),first=exporter.run(request());await setImmediate();const second=exporter.run(request());await setImmediate();f.workers[0]!.reply();assert.equal(f.blob,undefined);
 f.workers[1]!.reply();await Promise.all([first,second]);assert.equal(f.events.filter(e=>e==='download').length,1);
 const third=exporter.run(request());await setImmediate();const n=f.statuses.length;exporter.dispose();exporter.dispose();f.workers[2]!.reply();await third;await exporter.run(request());assert.equal(f.events.filter(e=>e==='download').length,1);assert.equal(f.statuses.length,n);assert.ok(f.workers.every(w=>w.terminated===1));
});
test('C60 distinguishes cancellation, worker failures, malformed replies and write failures',async()=>{
 for(const scenario of ['picker-cancel','picker-error','worker-error','message-error','explicit-error','bad-reply','empty-file','write']){
  const f=fixture(scenario.startsWith('picker')||scenario==='write');
  if(scenario.startsWith('picker'))f.ports.files.showSaveFilePicker=async()=>{throw Object.assign(new Error('Permission denied'),{name:scenario==='picker-cancel'?'AbortError':'NotAllowedError'});};
  const exporter=cadSTEPExport(f.ports),task=exporter.run(request());if(scenario==='write'){f.failWrite=true;f.picker.resolve(f.handle);}await setImmediate();
  const worker=f.workers[0];if(scenario==='worker-error')worker!.dispatchEvent(Object.assign(new Event('error',{cancelable:true}),{message:'Kernel failed'}));
  if(scenario==='message-error')worker!.dispatchEvent(new Event('messageerror', {cancelable:true}));
  if(scenario==='explicit-error')worker!.reply({ok:false,message:'The sketch is open.'});if(scenario==='bad-reply')worker!.reply({ok:true,file:{mime:'image/png',bytes}});
  if(scenario==='empty-file')worker!.reply({ok:true,file:{mime:'model/step',bytes:new Uint8Array()}});if(scenario==='write')worker!.reply();await task;
  assert.equal(f.statuses.at(-1)!.state,scenario==='picker-cancel'?'ready':'error');assert.equal(f.blob,undefined);if(worker)assert.equal(worker.terminated,1);if(scenario==='write')assert.ok(f.events.includes('file.abort'));exporter.dispose();
 }
});
test('C60 cancellation while writing aborts the pending native save before close',async()=>{
 const f=fixture(true),gate=deferred<void>();f.writeGate=gate.promise;const exporter=cadSTEPExport(f.ports),task=exporter.run(request());f.picker.resolve(f.handle);await setImmediate();f.workers[0]!.reply();await setImmediate();assert.ok(f.events.includes('file.write'));
 exporter.cancel();gate.resolve();await task;assert.ok(f.events.includes('file.abort'));assert.ok(!f.events.includes('file.close'));assert.match(f.statuses.at(-1)!.message,/canceled/);exporter.dispose();
});
function nativeCloseFixture(){
 const f=fixture(true),gate=deferred<void>();
 const stream=new WritableStream<Uint8Array>({write(value){f.writes.push([...value]);},async close(){f.events.push('close.started');await gate.promise;f.events.push('close.committed');},abort(){f.events.push('sink.abort');}});
 const writer=stream.getWriter();void writer.closed.catch(()=>{});
 const handle={name:'plate.step',async createWritable(){return writer;}} as unknown as FileSystemFileHandle;
 const exporter=cadSTEPExport(f.ports),task=exporter.run(request());f.picker.resolve(handle);
 return{...f,gate,exporter,task};
}
test('C60 an in-flight native close finishes honestly and cannot be canceled or replaced',async()=>{
 const f=nativeCloseFixture();await setImmediate();f.workers[0]!.reply();await setImmediate();assert.ok(f.events.includes('close.started'));
 try{
  f.exporter.cancel();assert.deepEqual(f.statuses.at(-1),{state:'busy',message:'STEP file save is finishing…'});
  await f.exporter.run(request());assert.equal(f.events.filter(e=>e==='picker').length,1);assert.equal(f.workers.length,1);
  assert.ok(!f.statuses.some(s=>/canceled/.test(s.message)));assert.ok(!f.events.includes('sink.abort'));
 }finally{f.gate.resolve();await f.task;f.exporter.dispose();}
 assert.ok(f.events.includes('close.committed'));assert.deepEqual(f.statuses.at(-1),{state:'ready',message:'STEP saved: plate.step'});
});
test('C60 a failed in-flight close reports the disk failure and releases the job for retry',async()=>{
 const f=nativeCloseFixture();await setImmediate();f.workers[0]!.reply();await setImmediate();f.exporter.cancel();f.gate.reject(new Error('Disk disconnected'));await f.task;
 assert.deepEqual(f.statuses.at(-1),{state:'error',message:'File operation failed: Disk disconnected'});assert.ok(!f.events.includes('close.committed'));assert.ok(!f.statuses.some(s=>/canceled|STEP saved/.test(s.message)));
 delete f.ports.files.showSaveFilePicker;const retry=f.exporter.run(request());await setImmediate();assert.equal(f.workers.length,2);f.workers[1]!.reply();await retry;
 assert.deepEqual(f.statuses.at(-1),{state:'ready',message:'STEP download handed to browser: plate.step'});f.exporter.dispose();
});
test('C60 disposal during an in-flight close suppresses late UI without claiming to revoke the commit',async()=>{
 const f=nativeCloseFixture();await setImmediate();f.workers[0]!.reply();await setImmediate();const count=f.statuses.length;f.exporter.dispose();await f.exporter.run(request());f.gate.resolve();await f.task;
 assert.equal(f.statuses.length,count);assert.equal(f.workers.length,1);assert.ok(f.events.includes('close.committed'));assert.ok(!f.events.includes('sink.abort'));
});
test('C60 worker timeout terminates work and cannot later publish',async context=>{
 context.mock.timers.enable({apis:['setTimeout']});const f=fixture(),exporter=cadSTEPExport(f.ports),task=exporter.run(request());await setImmediate();context.mock.timers.tick(30000);await task;f.workers[0]!.reply();
 assert.equal(f.statuses.at(-1)!.state,'error');assert.match(f.statuses.at(-1)!.message,/timed out/);assert.equal(f.workers[0]!.terminated,1);assert.equal(f.blob,undefined);exporter.dispose();
});
test('C60 revolve snapshots preserve angle sources and never download a canceled or failed solid',async()=>{
 const f=fixture(),exporter=cadSTEPExport(f.ports);
 const source=editCADContent({content:structuredClone(content),action:{kind:'revolve',id:'turned',axis:'v',angle:'360 deg'}});
 const first=exporter.run({content:source,name:'plate.step'});await setImmediate();
 const changed=editCADContent({content:source,action:{kind:'revolve',id:'turned',axis:'v',angle:'-90 deg'}});
 const second=exporter.run({content:changed,name:'plate.step'});await setImmediate();
 assert.deepEqual(f.workers[0]!.requests,[{content:source,assets}]);assert.deepEqual(f.workers[1]!.requests,[{content:changed,assets}]);
 f.workers[0]!.reply();assert.equal(f.blob,undefined);
 f.workers[1]!.reply({ok:false,message:'Revolve 1: invalid solid'});await Promise.all([first,second]);
 assert.equal(f.blob,undefined);assert.match(f.statuses.at(-1)!.message,/Revolve 1: invalid solid/);
 f.workers[1]!.reply();assert.equal(f.blob,undefined);
 const retry=exporter.run({content:source,name:'plate.step'});await setImmediate();f.workers[2]!.reply();await retry;
 assert.equal(f.events.filter(e=>e==='download').length,1);assert.ok(f.workers.every(w=>w.terminated===1));exporter.dispose();
});
