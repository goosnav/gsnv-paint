import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cadWorkerClient, type CADProtocol } from './cad-worker-client.ts';
import { editableCADContent } from './editable-cad-content.ts';
const assets={kernelModule:'/k.js',kernelWasm:'/k.wasm',solverModule:'/s.js',solverWasm:'/s.wasm'};
function fixture(){
 const workers:{sent:CADProtocol['request'][];terminated:boolean;reply(data:CADProtocol['reply']):void;error():void}[]=[],events:unknown[]=[];
 const client=cadWorkerClient({assets,onResult:(id,value)=>events.push([id,value]),onError:(id,error)=>events.push([id,error]),createWorker(){
   const listeners=new Map<string,Function>(); const w={sent:[] as CADProtocol['request'][],terminated:false,postMessage(m:CADProtocol['request']){this.sent.push(m);},terminate(){this.terminated=true;},addEventListener(k:string,cb:Function){listeners.set(k,cb);},removeEventListener(k:string){listeners.delete(k);},reply(data:CADProtocol['reply']){listeners.get('message')?.({data});},error(){listeners.get('error')?.({message:'native fault',preventDefault(){}});}};workers.push(w);return w as unknown as Worker;
 }});return{client,workers,events};
}
const content=()=>editableCADContent({operation:'new'}),value={entities:[],dof:0,solid:null};
test('C55 publishes only latest revision; cancel and disposal prevent late results',()=>{
 const f=fixture();f.client.submit('a',content());f.client.submit('b',content());f.client.submit('c',content());const w=f.workers[0]!;
 assert.equal(w.sent.length,1);w.reply({id:1,ok:true,value});assert.deepEqual(f.events,[]);assert.equal(w.sent.length,2);
 w.reply({id:1,ok:true,value});assert.deepEqual(f.events,[]);w.reply({id:3,ok:true,value});assert.deepEqual(f.events,[['c',value]]);
 f.client.submit('d',content());f.client.cancel();assert.equal(w.terminated,true);w.reply({id:4,ok:true,value});assert.equal(f.events.length,1);
 f.client.submit('e',content());assert.equal(f.workers.length,2);f.client.dispose();f.client.dispose();assert.equal(f.workers[1]!.terminated,true);f.client.submit('f',content());assert.equal(f.workers.length,2);
});
test('C55 worker failures and watchdog terminate the worker and allow clean retry',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();f.client.submit('a',content());f.workers[0]!.error();assert.deepEqual(f.events,[['a','native fault']]);assert.ok(f.workers[0]!.terminated);
 f.client.submit('b',content());t.mock.timers.tick(30001);assert.match(String(f.events[1]),/timed out/i);assert.ok(f.workers[1]!.terminated);f.client.submit('c',content());f.workers[2]!.reply({id:3,ok:false,message:'Sketch is over-constrained.'});assert.match(String(f.events[2]),/over-constrained/);f.client.dispose();
});
test('C55 rejects missing worker ports before creating resources',()=>{
 assert.throws(()=>cadWorkerClient(null as unknown as Parameters<typeof cadWorkerClient>[0]),TypeError);
 assert.throws(()=>cadWorkerClient({assets,createWorker:()=>({} as Worker),onResult:null as unknown as ()=>void,onError(){}}),TypeError);
});
