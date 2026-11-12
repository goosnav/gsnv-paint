import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { stepExchange } from './step-exchange.ts';
import { sketchRegions } from './sketch-regions.ts';
import type { KernelSession } from './kernel-runtime.ts';
const polygon=[[0,0],[100,0],[100,60],[0,60]] as const;
function fake(failure:string){
 const allocated:{deleted:boolean;delete():void}[]=[],retained:object[]=[];
 const object=(extra={})=>{const o={deleted:false,delete(){assert.equal(this.deleted,false);this.deleted=true;},...extra};allocated.push(o);return o;};
 const factory=(fn:()=>object)=>function(){return fn();};
 const solid=object();
 const library={gp_Pnt:factory(()=>object()),gp_Vec:factory(()=>object()),gp_Dir:factory(()=>object()),gp_Ax2:factory(()=>object()),gp_Circ:factory(()=>object()),
  BRepBuilderAPI_MakeEdge:factory(()=>object({Edge:()=>object()})),BRepBuilderAPI_MakeWire:factory(()=>object({Add(){},IsDone:()=>failure!=='wire',Wire:()=>object()})),
  BRepBuilderAPI_MakeFace:factory(()=>object({Add(){},IsDone:()=>failure!=='face',Face:()=>object()})),BRepPrimAPI_MakePrism:factory(()=>object({IsDone:()=>failure!=='prism',Shape:()=>solid})),
  BRepCheck_Analyzer:factory(()=>object({IsValid:()=>failure!=='invalid'}))};
 const session={library,isClosed:()=>failure==='closed',retain(shape:object){retained.push(shape);return{id:1,generation:7};}} as unknown as KernelSession;
 return {session,allocated,retained,solid};
}
test('C59 golden retains only the validated solid and releases temporary native resources',()=>{
 const f=fake(''),source=JSON.stringify(polygon);
 assert.deepEqual(buildLinearPrism({session:f.session,polygon,depth:10}),{id:1,generation:7});
 assert.deepEqual(f.retained,[f.solid]);assert.equal(f.solid.deleted,false);assert.ok(f.allocated.filter(o=>o!==f.solid).every(o=>o.deleted));assert.equal(JSON.stringify(polygon),source);
});
test('C59 every unsuccessful builder and invalid solid fails without publishing a token',()=>{
 for(const failure of ['wire','face','prism','invalid']){
  const f=fake(failure);assert.throws(()=>buildLinearPrism({session:f.session,polygon,depth:10}),{name:'ExtrusionError'});assert.equal(f.retained.length,0);
  assert.ok(f.allocated.filter(o=>o!==f.solid||failure==='invalid').every(o=>o.deleted));
 }
 const f=fake('closed');assert.throws(()=>buildLinearPrism({session:f.session,polygon,depth:10}),{name:'DisposedSessionError'});assert.equal(f.retained.length,0);
});
test('C59 real kernel seam: reversed prism survives STEP export and independent re-import',async()=>{
 const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),print:()=>{}});
 const shapes=new Map<number,ReturnType<KernelSession['resolve']>>();let sequence=0;
 const session:KernelSession={generation:1,library,isClosed:()=>false,retain(shape){const id=++sequence;shapes.set(id,shape);return{id,generation:1};},resolve(token){assert.equal(token.generation,1);assert.ok(shapes.has(token.id));return shapes.get(token.id)!;},release(token){shapes.get(token.id)!.delete();shapes.delete(token.id);}};
 for(const depth of [-10,10]){
  const token=buildLinearPrism({session,polygon,depth});
  const file=stepExchange({action:'export',session,units:'mm',bodies:{shapes:[{bodyId:'plate',token}],topology:[],operands:[],diagnostics:[]}}).file!;session.release(token);
  const restored=stepExchange({action:'import',session,units:'mm',bytes:file.bytes}).bodies!;assert.equal(restored.shapes.length,1);
  const props=new library.GProp_GProps();library.BRepGProp.VolumeProperties(session.resolve(restored.shapes[0]!.token),props,true,false,false);assert.ok(Math.abs(props.Mass()-60000)<1e-6);
  const center=props.CentreOfMass();assert.ok(Math.abs(center.Z()-depth/2)<1e-8);center.delete();props.delete();session.release(restored.shapes[0]!.token);
 }
 assert.equal(shapes.size,0);
});
test('C59 real kernel: plate regions with circular and polygon holes have exact volume and survive STEP',async()=>{
 const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),print:()=>{}});
 const shapes=new Map<number,ReturnType<KernelSession['resolve']>>();let sequence=0;
 const session:KernelSession={generation:1,library,isClosed:()=>false,retain(shape){const id=++sequence;shapes.set(id,shape);return{id,generation:1};},resolve(token){return shapes.get(token.id)!;},release(token){shapes.get(token.id)!.delete();shapes.delete(token.id);}};
 const volume=(token:{id:number;generation:number})=>{const props=new library.GProp_GProps();library.BRepGProp.VolumeProperties(session.resolve(token),props,true,false,false);const v=props.Mass();props.delete();return v;};
 const region=sketchRegions({tolerance:1e-7,entities:[
  ...[[0,0],[100,0],[100,60],[0,60]].map((a,i,p)=>({id:`e${i}`,kind:'segment' as const,a:a as [number,number],b:p[(i+1)%4] as [number,number],construction:false})),
  {id:'h1',kind:'circle',center:[20,30],radius:5,construction:false},{id:'h2',kind:'circle',center:[80,30],radius:8,construction:false},
  ...[[40,20],[60,20],[60,40],[40,40]].map((a,i,p)=>({id:`s${i}`,kind:'segment' as const,a:a as [number,number],b:p[(i+1)%4] as [number,number],construction:false}))]});
 for(const depth of [10,-10]){
  const token=buildLinearPrism({session,region,depth}),expected=(6000-Math.PI*25-Math.PI*64-400)*10;
  assert.ok(Math.abs(volume(token)-expected)<1e-6,`${volume(token)} vs ${expected}`);
  const file=stepExchange({action:'export',session,units:'mm',bodies:{shapes:[{bodyId:'plate',token}],topology:[],operands:[],diagnostics:[]}}).file!;session.release(token);
  const restored=stepExchange({action:'import',session,units:'mm',bytes:file.bytes}).bodies!;assert.ok(Math.abs(volume(restored.shapes[0]!.token)-expected)<1e-6);session.release(restored.shapes[0]!.token);
 }
 const cylinder=buildLinearPrism({session,region:sketchRegions({tolerance:1e-7,entities:[{id:'c',kind:'circle',center:[0,0],radius:10,construction:false},{id:'i',kind:'circle',center:[0,0],radius:4,construction:false}]}),depth:5});
 assert.ok(Math.abs(volume(cylinder)-Math.PI*(100-16)*5)<1e-6);session.release(cylinder);assert.equal(shapes.size,0);
});
