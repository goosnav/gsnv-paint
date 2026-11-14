import test from 'node:test';
import assert from 'node:assert/strict';
import {kernelFixture} from './kernel-test-fixture.ts';
import {stepExchange} from './step-exchange.ts';
import {revolveProof,proofBounds} from './revolve-proof-fixture.ts';
import type {KernelSession} from './kernel-runtime.ts';
import {materializeSketchProfile,type ProfileSource} from './sketch-profile-source.ts';
import {cadExpressionPolicy} from './cad-expression-policy.ts';
const near=(a:number,b:number,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} vs ${b}`);
const tube=(outer=20)=>({kind:'polygon' as const,points:[[10,0],[outer,0],[outer,12],[10,12]] as [number,number][]});
test('native revolve proof: full and signed quarter tubes, edited radius, analytic position, repeated ownership and STEP',async()=>{
 const f=await kernelFixture();
 const length=(source:string)=>({source,kind:'length' as const}),source:ProfileSource={id:'section',kind:'center-rectangle',entityIds:['a','b','c','d'],center:[length('(radius + 10 mm) / 2'),length('6 mm')],width:length('radius - 10 mm'),height:length('12 mm'),construction:false},original=structuredClone(source);
 try{for(const radius of [20,25])for(const angle of [2*Math.PI,Math.PI/2,-Math.PI/2])for(const units of ['mm','inch'] as const){
  const context=cadExpressionPolicy({units,variables:[{name:'radius',expression:length(`${radius} mm`)}],linearMm:1e-7}).context;
  const section=materializeSketchProfile({profile:source,context,tolerance:{linearMm:1e-7,angularRad:1e-9,relative:1e-9}});
  const token=revolveProof({session:f.session,profile:{kind:'polygon',points:section.entities.map(e=>e.a)},angle}),quarter=Math.abs(angle)<2*Math.PI;
  const check=(t:typeof token)=>{
   const m=f.measure(t),expected=(radius**2-100)*Math.PI*12*(quarter?.25:1);near(m.volume,expected);near(m.center[1]!,6);
   const centroid=quarter?4*(radius**3-1000)/(3*Math.PI*(radius**2-100)):0;near(m.center[0]!,centroid);near(m.center[2]!,quarter?-Math.sign(angle)*centroid:0);
   const bounds=proofBounds(f.session,t),min=quarter?[0,0,angle>0?-radius:0]:[-radius,0,-radius],max=quarter?[radius,12,angle>0?0:radius]:[radius,12,radius];
   bounds.min.forEach((v,i)=>near(v,min[i]!));bounds.max.forEach((v,i)=>near(v,max[i]!));assert.equal(bounds.faces,quarter?6:4,'quarter sweeps include both planar caps');
   if(quarter)assert.ok(m.vertices.some(v=>Math.abs(v[0]!)<1e-7&&Math.abs(v[1]!-12)<1e-7&&Math.abs(v[2]!+Math.sign(angle)*radius)<1e-7),'end cap occupies the signed quarter-sector');
  };
  assert.equal(f.retained.size,1);check(token);
  const bytes=stepExchange({action:'export',session:f.session,units,bodies:{shapes:[{bodyId:'turned-tube',token}],topology:[],operands:[],diagnostics:[]}}).file!.bytes;f.session.release(token);
  const bodies=stepExchange({action:'import',session:f.session,units,bytes}).bodies!;assert.equal(bodies.shapes.length,1);check(bodies.shapes[0]!.token);f.session.release(bodies.shapes[0]!.token);assert.equal(f.retained.size,0);assert.deepEqual(source,original);
 }}finally{f.close();}
});
test('native revolve proof: axis-touching rectangle gives a cylinder and offset circle gives a torus',async()=>{
 const f=await kernelFixture();
 try{
  const fixtures=[{profile:{kind:'polygon' as const,points:[[0,0],[10,0],[10,12],[0,12]] as [number,number][]},volume:1200*Math.PI,area:440*Math.PI,min:[-10,0,-10],max:[10,12,10]},
   {profile:{kind:'circle' as const,center:[20,6] as [number,number],radius:3},volume:360*Math.PI**2,area:240*Math.PI**2,min:[-23,3,-23],max:[23,9,23]}];
  for(const fixture of fixtures){const token=revolveProof({session:f.session,profile:fixture.profile,angle:2*Math.PI}),m=f.measure(token),bounds=proofBounds(f.session,token);near(m.volume,fixture.volume);near(m.area,fixture.area);m.center.forEach((v,i)=>near(v,[0,6,0][i]!));bounds.min.forEach((v,i)=>near(v,fixture.min[i]!));bounds.max.forEach((v,i)=>near(v,fixture.max[i]!));f.session.release(token);assert.equal(f.retained.size,0);}
 }finally{f.close();}
});
test('revolve proof preflight rejects invalid angle, zero axis, cross-axis and self-intersecting input before native calls',()=>{
 let native=0;const session={isClosed:()=>false,library:new Proxy({},{get(){native++;throw Error('unexpected native call');}})} as unknown as KernelSession;
 for(const angle of [0,1e-12,2*Math.PI+.01,NaN,Infinity])assert.throws(()=>revolveProof({session,profile:tube(),angle}),/angle/i);
 assert.throws(()=>revolveProof({session,profile:tube(),angle:1,axis:[0,0,0]}),/axis/i);
 assert.throws(()=>revolveProof({session,profile:{kind:'polygon',points:[[-1,0],[2,0],[2,3],[-1,3]]},angle:1}),/axis/i);
 assert.throws(()=>revolveProof({session,profile:{kind:'polygon',points:[[5,0],[10,5],[5,5],[10,0]]},angle:1}),/cross|intersect|area/i);
 assert.throws(()=>revolveProof({session,profile:{kind:'circle',center:[2,0],radius:3},angle:1}),/axis/i);
 assert.equal(native,0);
});
function fake(failure:'done'|'invalid'|'empty'|'multiple'|'mass'|'numeric'|'runtime'|'cleanup'){
 const calls:string[]=[],call=<T>(name:string,value:T):T=>{calls.push(name);return value;};
 const object=(name:string,extra:Record<string,unknown>={})=>({delete(){call(`${name}.delete`,undefined);if(failure==='cleanup')throw new WebAssembly.RuntimeError('cleanup');},...extra});
 const ctor=(name:string,fn=()=>object(name))=>function(){call(name,undefined);return fn();};
 const shape=object('shape',{IsNull:()=>call('null',failure==='empty'),ShapeType:()=>call('type',failure==='multiple'?2:1)});
 const session={isClosed:()=>false,retain(){call('retain',undefined);return{id:1,generation:1};},library:{
  TopAbs_ShapeEnum:{TopAbs_SOLID:1},gp_Pnt:ctor('point'),gp_Dir:ctor('direction'),gp_Ax1:ctor('axis'),
  BRepBuilderAPI_MakeWire:ctor('wire-builder',()=>object('wire-builder',{Add(){call('add-edge',undefined);},IsDone:()=>true,Wire:()=>object('wire')})),
  BRepBuilderAPI_MakeEdge:ctor('edge-builder',()=>object('edge-builder',{Edge:()=>object('edge')})),
  BRepBuilderAPI_MakeFace:ctor('face-builder',()=>object('face-builder',{IsDone:()=>true,Face:()=>object('face')})),
  BRepPrimAPI_MakeRevol:ctor('revolve',()=>{if(failure==='numeric')throw 23;return object('revolve',{IsDone:()=>call('done',failure!=='done'),Shape:()=>{call('shape',undefined);if(failure==='runtime')throw new WebAssembly.RuntimeError('native');return shape;}});}),
  BRepCheck_Analyzer:ctor('analyzer',()=>object('analyzer',{IsValid:()=>call('valid',failure!=='invalid')})),
  GProp_GProps:ctor('mass',()=>object('mass',{Mass:()=>call('mass-value',failure==='mass'?NaN:1)})),BRepGProp:{VolumeProperties(){call('volume',undefined);}},
 }} as unknown as KernelSession;return{session,calls};
}
test('revolve proof rejects empty/multiple/invalid outcomes and makes no native calls after native or cleanup faults',()=>{
 for(const failure of ['done','invalid','empty','multiple','mass'] as const){const f=fake(failure);assert.throws(()=>revolveProof({session:f.session,profile:tube(),angle:1}),{name:'RevolveProofError'});assert.ok(!f.calls.includes('retain'));assert.ok(f.calls.some(c=>c.endsWith('.delete')));}
 const numeric=fake('numeric');assert.throws(()=>revolveProof({session:numeric.session,profile:tube(),angle:1}),e=>e===23);assert.equal(numeric.calls.at(-1),'revolve');assert.ok(!numeric.calls.some(c=>c.endsWith('.delete')));
 const runtime=fake('runtime');assert.throws(()=>revolveProof({session:runtime.session,profile:tube(),angle:1}),WebAssembly.RuntimeError);assert.equal(runtime.calls.at(-1),'shape');assert.ok(!runtime.calls.some(c=>c.endsWith('.delete')));
 const cleanup=fake('cleanup');assert.throws(()=>revolveProof({session:cleanup.session,profile:tube(),angle:1}),WebAssembly.RuntimeError);assert.equal(cleanup.calls.filter(c=>c.endsWith('.delete')).length,1);assert.ok(!cleanup.calls.includes('retain'));
});
