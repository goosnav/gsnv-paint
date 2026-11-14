import test from 'node:test';
import assert from 'node:assert/strict';
import { kernelFixture } from './kernel-test-fixture.ts';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { transformPartPlane } from './kernel-plane-transform.ts';
import { stepExchange } from './step-exchange.ts';
import type { KernelSession } from './kernel-runtime.ts';
const polygon=[[0,0],[20,0],[20,10],[0,10]] as const;
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} vs ${b}`);
test('C72 real rigid planes preserve geometry, signed depth, ownership and STEP world coordinates',async()=>{
  const f=await kernelFixture();
  try{for(const depth of [6,-6])for(const plane of ['XY','XZ','YZ'] as const)for(let repeat=0;repeat<2;repeat++){
    const input=buildLinearPrism({session:f.session,polygon,depth}),token=transformPartPlane({session:f.session,token:input,plane});
    assert.equal(f.retained.size,1);assert.equal(f.retained.has(input.id),plane==='XY');
    const expected=plane==='XY'?[10,5,depth/2]:plane==='XZ'?[10,-depth/2,5]:[depth/2,10,5];
    const check=(t:typeof token)=>{const m=f.measure(t);near(m.volume,1200);near(m.area,760);m.center.forEach((v,i)=>near(v,expected[i]!));
      const wanted=plane==='XY'?[20,10,depth]:plane==='XZ'?[20,-depth,10]:[depth,20,10];
      assert.ok(m.vertices.some(p=>p.every((v,i)=>Math.abs(v-wanted[i]!)<1e-6)),'asymmetric transformed corner');};
    check(token);
    const bytes=stepExchange({action:'export',session:f.session,units:repeat?'inch':'mm',bodies:{shapes:[{bodyId:'prism',token}],topology:[],operands:[],diagnostics:[]}}).file!.bytes;f.session.release(token);
    const bodies=stepExchange({action:'import',session:f.session,units:'mm',bytes}).bodies!;assert.equal(bodies.shapes.length,1);check(bodies.shapes[0]!.token);f.session.release(bodies.shapes[0]!.token);assert.equal(f.retained.size,0);
  }}finally{f.close();}
});
function fake(failure:'done'|'invalid'|'null'|'multiple'|'mass'|'native'|'cleanup'|null){
  const calls:string[]=[],shape={IsNull:()=>false,ShapeType:()=>1,delete(){calls.push('shape-delete');}},result={...shape,IsNull:()=>failure==='null',ShapeType:()=>failure==='multiple'?2:1};
  const object=(extra={})=>({delete(){calls.push('delete');if(failure==='cleanup')throw new WebAssembly.RuntimeError('cleanup fault');},...extra});
  const factory=(fn:()=>object)=>function(){return fn();};
  const session={isClosed:()=>false,resolve(){calls.push('resolve');return shape;},release(){calls.push('release');},retain(){calls.push('retain');return{id:2,generation:1};},library:{
    TopAbs_ShapeEnum:{TopAbs_SOLID:1},gp_Trsf:factory(()=>object({SetValues(){calls.push('values');}})),
    BRepBuilderAPI_Transform:factory(()=>{calls.push('transform');if(failure==='native')throw 17;return object({IsDone:()=>failure!=='done',Shape:()=>result});}),
    BRepCheck_Analyzer:factory(()=>object({IsValid:()=>failure!=='invalid'})),GProp_GProps:factory(()=>object({Mass:()=>failure==='mass'?NaN:1})),BRepGProp:{VolumeProperties(){calls.push('mass');}},
  }} as unknown as KernelSession;return{session,calls};
}
test('C72 ordinary failures preserve input; native and cleanup faults stop every subsequent native call',()=>{
  for(const failure of ['done','invalid','null','multiple','mass'] as const){const f=fake(failure);assert.throws(()=>transformPartPlane({session:f.session,token:{id:1,generation:1},plane:'XZ'}),{name:'PlaneTransformError'});assert.ok(!f.calls.includes('release'));assert.ok(!f.calls.includes('retain'));}
  const f=fake('native');assert.throws(()=>transformPartPlane({session:f.session,token:{id:1,generation:1},plane:'YZ'}),e=>e===17);assert.deepEqual(f.calls,['resolve','values','transform']);
  const cleanup=fake('cleanup');assert.throws(()=>transformPartPlane({session:cleanup.session,token:{id:1,generation:1},plane:'YZ'}),WebAssembly.RuntimeError);assert.equal(cleanup.calls.filter(c=>c==='delete').length,1);assert.ok(!cleanup.calls.includes('release'));
  const closed=fake(null);assert.throws(()=>transformPartPlane({session:{...closed.session,isClosed:()=>true},token:{id:1,generation:1},plane:'XY'}),{name:'DisposedSessionError'});assert.deepEqual(closed.calls,[]);
});
