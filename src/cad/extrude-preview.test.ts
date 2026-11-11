import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { extrudePreview } from './extrude-preview.ts';
import type { KernelSession } from './kernel-runtime.ts';
const polygon:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[100,0],[100,60],[0,60]];
test('C54 invalid kernel result is never published (resource fake)',()=>{
 const allocated:{deleted:boolean;delete():void}[]=[];
 const object=(extra={})=>{const value={deleted:false,delete(){this.deleted=true;},...extra};allocated.push(value);return value;};
 const factory=(f:()=>object)=>function(){return f();};
 const shape=()=>object();
 const library={gp_Pnt:factory(shape),gp_Vec:factory(shape),BRepBuilderAPI_MakeEdge:factory(()=>object({Edge:shape})),
 BRepBuilderAPI_MakeWire:factory(()=>object({Add(){},IsDone:()=>true,Wire:shape})),BRepBuilderAPI_MakeFace:factory(()=>object({IsDone:()=>true,Face:shape})),
 BRepPrimAPI_MakePrism:factory(()=>object({IsDone:()=>true,Shape:shape})),BRepCheck_Analyzer:factory(()=>object({IsValid:()=>false}))};
 assert.throws(()=>extrudePreview({session:{library,isClosed:()=>false} as unknown as KernelSession,polygon,depth:10}),{name:'ExtrusionError'});
 assert.ok(allocated.every(v=>v.deleted));
});
test('C54 real OpenCascade smoke: exact plate, changed width, reversed depth and finite triangulation',async()=>{
 const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
 const shapes=new Map<number,ReturnType<KernelSession['resolve']>>();let sequence=0;
 const session:KernelSession={library,generation:1,isClosed:()=>false,retain(shape){const id=++sequence;shapes.set(id,shape);return{id,generation:1};},resolve(token){return shapes.get(token.id)!;},release(token){shapes.get(token.id)!.delete();shapes.delete(token.id);}};
 for(const [width,depth] of [[100,10],[120,10],[100,-10]]){
  const result=extrudePreview({session,polygon:polygon.map(p=>[p[0]===100?width!:p[0],p[1]]),depth:depth!});
  assert.ok(Math.abs(result.volume-width!*60*10)<1e-6); assert.ok(Math.abs(result.area-2*(width!*60+width!*10+600))<1e-6);
  assert.deepEqual(result.center.map(v=>Math.round(v*1e6)/1e6),[width!/2,30,depth!/2]);
  assert.equal(result.indices.length,36); assert.ok(result.positions.every(Number.isFinite));
  assert.ok(result.indices.every(i=>i<result.positions.length/3));
  assert.equal(shapes.size,0);
 }
});
