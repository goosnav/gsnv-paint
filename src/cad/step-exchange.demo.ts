/** C37 Node demo; production exchange must run inside the CAD worker. */
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { kernelRuntime } from './kernel-runtime.ts';
import { stepExchange } from './step-exchange.ts';

const origin='https://step-demo.test';
const hooks=registerHooks({resolve(s,c,n){return s.startsWith(origin)?{url:s,shortCircuit:true}:n(s,c);},load(u,c,n){return u.startsWith(origin)?{format:'module',shortCircuit:true,source:'export default ()=>globalThis.__C37_DEMO();'}:n(u,c);}});
const bytes=await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
const saved=new Map(['location','importScripts','__C37_DEMO'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
Object.defineProperty(globalThis,'location',{configurable:true,value:new URL(origin)});
Object.defineProperty(globalThis,'importScripts',{configurable:true,value:()=>{}});
Object.defineProperty(globalThis,'__C37_DEMO',{configurable:true,value:()=>init({wasmBinary:bytes,print:()=>{}})});
const opened=await kernelRuntime({action:'open',config:{moduleUrl:`${origin}/occt.js`,wasmUrl:`${origin}/occt.wasm`,mode:'single',tolerance:{linearMm:1e-7,angularRad:1e-9,relative:1e-9}}});
const session=opened.session!,oc=session.library;
try{
  const maker=new oc.BRepPrimAPI_MakeBox(100,60,10),token=session.retain(maker.Shape());maker.delete();
  const file=stepExchange({action:'export',session,units:'inch',bodies:{shapes:[{bodyId:'plate',token}],topology:[],operands:[],diagnostics:[]}}).file!;
  session.release(token);
  const imported=stepExchange({action:'import',session,units:'mm',bytes:file.bytes}).bodies!;
  const props=new oc.GProp_GProps();oc.BRepGProp.VolumeProperties(session.resolve(imported.shapes[0]!.token),props,true,false,false);
  console.log(JSON.stringify({name:file.name,bytes:file.bytes.length,fileUnits:'inch',importedBodies:imported.shapes.length,volumeMm3:props.Mass()},null,2));
  props.delete();for(const body of imported.shapes)session.release(body.token);
}finally{await kernelRuntime({action:'close',session});hooks.deregister();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}
