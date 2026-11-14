import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { stepPreview } from './step-preview.ts';
import { stepExchange } from './step-exchange.ts';
import type { KernelSession } from './kernel-runtime.ts';

async function fixture(){
  const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),print:()=>{},printErr:()=>{}});
  const retained=new Map<number,ReturnType<KernelSession['resolve']>>();let sequence=0;
  const session:KernelSession={generation:1,library,isClosed:()=>false,
    retain(shape){const id=++sequence;retained.set(id,shape);return{id,generation:1};},
    resolve(token){const shape=retained.get(token.id);assert.ok(shape,'live native token');return shape;},
    release(token){session.resolve(token).delete();retained.delete(token.id);},
  };
  function boxes(count=2){
    const shapes=[];
    for(let i=0;i<count;i++){const box=new library.BRepPrimAPI_MakeBox(10+i,20,30);shapes.push({bodyId:`box-${i}`,token:session.retain(box.Shape())});box.delete();}
    const bytes=stepExchange({action:'export',session,units:'mm',bodies:{shapes,topology:[],operands:[],diagnostics:[]}}).file!.bytes;
    for(const shape of shapes)session.release(shape.token);return bytes;
  }
  return {session,library,retained,boxes};
}
test('C68 real captured acceptance plate preserves physical size, repeat imports release every token',async()=>{
  const f=await fixture(),bytes=new Uint8Array(await readFile(new URL('./fixtures/acceptance-plate-120mm.step',import.meta.url))),before=bytes.slice();
  for(const units of ['mm','inch','mm'] as const){
    const result=stepPreview({session:f.session,bytes,units});assert.equal(result.bodies.length,1);
    assert.ok(Math.abs(result.solid.volume-68654.425)<68654.425*0.0001);
    const bounds=[0,1,2].map(axis=>{const values=[...result.solid.positions].filter((_,i)=>i%3===axis);return Math.max(...values)-Math.min(...values);});
    assert.deepEqual(bounds,[120,60,10]);assert.equal(f.retained.size,0);assert.ok(result.solid.indices.length>0);
  }
  assert.deepEqual(bytes,before);
});
test('C68 real multiple-body STEP preserves every body and rejects damaged/partial sources',async()=>{
  const f=await fixture(),bytes=f.boxes(),result=stepPreview({session:f.session,bytes,units:'inch'});
  assert.equal(result.bodies.length,2);assert.ok(Math.abs(result.bodies[0]!.volume-6000)<1e-7);assert.ok(Math.abs(result.bodies[1]!.volume-6600)<1e-7);
  assert.ok(Math.abs(result.solid.volume-12600)<1e-7);assert.equal(f.retained.size,0);
  const text=new TextDecoder().decode(bytes);let count=0;
  const broken=text.replace(/(MANIFOLD_SOLID_BREP\('[^']*',)#\d+(\))/g,(full,before,after)=>++count===2?`${before}#99999${after}`:full);
  assert.equal(count,2);assert.notEqual(broken,text);
  for(const data of [new Uint8Array(),new TextEncoder().encode('not STEP'),new TextEncoder().encode(broken)]){
    assert.throws(()=>stepPreview({session:f.session,bytes:data,units:'mm'}));assert.equal(f.retained.size,0);
  }
});
test('C68 ordinary failure on the second body releases it and every unconsumed body',async()=>{
  const f=await fixture(),bytes=f.boxes(3),original=f.library.BRepGProp.VolumeProperties;let calls=0;
  f.library.BRepGProp.VolumeProperties=new Proxy(original,{apply(target,receiver,args){
    calls++;if(calls===5)return;return Reflect.apply(target,receiver,args);
  }});
  try{assert.throws(()=>stepPreview({session:f.session,bytes,units:'mm'}),{name:'ExtrusionError'});assert.equal(f.retained.size,0);}
  finally{f.library.BRepGProp.VolumeProperties=original;}
});
for(const fault of [17,new WebAssembly.RuntimeError('native trap'),new Error('unknown native binding failure')]){
  test(`C68 native fault has no subsequent native calls: ${String(fault)}`,async()=>{
    const f=await fixture(),bytes=f.boxes(3),original=f.library.BRepGProp.VolumeProperties;let calls=0,faulted=false,after=0;
    const rawResolve=f.session.resolve,rawRelease=f.session.release;
    const session:KernelSession={...f.session,resolve(token){if(faulted)after++;return rawResolve(token);},release(token){if(faulted)after++;return rawRelease(token);}};
    f.library.BRepGProp.VolumeProperties=new Proxy(original,{apply(target,receiver,args){if(faulted)after++;if(++calls===5){faulted=true;throw fault;}return Reflect.apply(target,receiver,args);}});
    assert.throws(()=>stepPreview({session,bytes,units:'mm'}),cause=>cause===fault);
    assert.equal(after,0);assert.equal(f.retained.size,2,'worker termination owns the current and remaining native tokens');
    // The isolated simulated worker is abandoned after a fault, without native cleanup.
  });
}
