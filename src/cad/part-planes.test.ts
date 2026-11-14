import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { make_gcs_wrapper } from '@salusoft89/planegcs';
import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
import { buildPart } from './part-builder.ts';
import { kernelFixture } from './kernel-test-fixture.ts';
import { stepExchange } from './step-exchange.ts';
import type { SolverSession } from './solver-runtime.ts';
test('plane edit is atomic, inherited by cuts, persisted and rejects mixed or unsupported planes',()=>{
  let content=editableCADContent({operation:'new'});
  content=editCADContent({content,action:{kind:'rectangle',prefix:'r',width:'20',height:'10'}});
  content=editCADContent({content,action:{kind:'extrude',id:'boss',depth:'6'}});
  const before=structuredClone(content);
  content=editCADContent({content,action:{kind:'plane',plane:'XZ'} as CADAction});
  content=editCADContent({content,action:{kind:'add-cut',id:'cut'}});
  assert.equal(content.graph.features[0].definition.sketch.plane,'XZ');
  const cut=content.graph.features[2]!;assert.equal(cut.kind,'pocket');if(cut.kind!=='pocket')throw Error('cut');
  assert.equal(cut.definition.sketch.plane,'XZ');
  assert.deepEqual(editableCADContent({operation:'read',value:JSON.parse(JSON.stringify(content))}),content);
  assert.equal(before.graph.features[0].definition.sketch.plane,'XY');
  const bad=structuredClone(content);bad.graph.features[0].definition.sketch.plane='YZ' as 'XY';
  assert.throws(()=>editableCADContent({operation:'read',value:bad}),/plane/i);
  assert.throws(()=>editCADContent({content,action:{kind:'plane',plane:'ZX'} as unknown as CADAction}),/plane/i);
});
test('real part planes preserve local fillet/cut intent and asymmetric world positions through units and STEP',async()=>{
  const f=await kernelFixture(),wrapper=await make_gcs_wrapper(fileURLToPath(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm',import.meta.url)));
  const solver:SolverSession={generation:1,engine:wrapper,dof:()=>wrapper.gcs.dof(),snapshot:()=>wrapper.sketch_index.get_primitives(),isClosed:()=>false};
  try{for(const plane of ['XY','XZ','YZ'] as const){
    let content=editableCADContent({operation:'new'});const edit=(action:CADAction,sketch?:string)=>{content=editCADContent({content,action,sketch});};
    edit({kind:'plane',plane} as CADAction);edit({kind:'rectangle',prefix:'outer',width:'20',height:'10'});edit({kind:'extrude',id:'boss',depth:'6'});
    edit({kind:'edge-feature',id:'round',feature:'fillet',edges:'vertical',size:'1'});edit({kind:'add-cut',id:'hole'});edit({kind:'rectangle',prefix:'hole',width:'4',height:'2',origin:[2,3]},'hole');
    const rounded=1200-(4-Math.PI)*6,expected=rounded-48,localCenter=[(rounded*10-48*4)/expected,(rounded*5-48*4)/expected,3];
    const map=(p:number[])=>plane==='XY'?p:plane==='XZ'?[p[0]!,-p[2]!,p[1]!]:[p[2]!,p[0]!,p[1]!];
    const check=(token:Parameters<typeof f.measure>[0])=>{const m=f.measure(token);assert.ok(Math.abs(m.volume-expected)<1e-6);m.center.forEach((v,i)=>assert.ok(Math.abs(v-map(localCenter)[i]!)<1e-6));
      for(const p of [[2,3,0],[6,5,6]])assert.ok(m.vertices.some(v=>v.every((n,i)=>Math.abs(n-map(p)[i]!)<1e-6)),'actual cut corners rotate with the body');};
    for(const units of ['mm','inch','mm'] as const){if(content.units!==units)edit({kind:'units',units});
      const part=await buildPart({content:editableCADContent({operation:'read',value:JSON.parse(JSON.stringify(content))}),solver,kernel:async()=>f.session});assert.ok(part.token);check(part.token);assert.equal(f.retained.size,1);
      const bytes=stepExchange({action:'export',session:f.session,units,bodies:{shapes:[{bodyId:'part',token:part.token}],topology:[],operands:[],diagnostics:[]}}).file!.bytes;f.session.release(part.token);
      const bodies=stepExchange({action:'import',session:f.session,units,bytes}).bodies!;assert.equal(bodies.shapes.length,1);check(bodies.shapes[0]!.token);f.session.release(bodies.shapes[0]!.token);assert.equal(f.retained.size,0);
    }
  }}finally{f.close();wrapper.destroy_gcs_module();}
});
