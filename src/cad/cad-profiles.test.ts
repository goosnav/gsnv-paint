import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { make_gcs_wrapper } from '@salusoft89/planegcs';
import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
import { cadExpressionPolicy } from './cad-expression-policy.ts';
import { materializeSketchProfile, type ProfileSource } from './sketch-profile-source.ts';
import { linearSketchProgram } from './linear-sketch-program.ts';
import { buildPart } from './part-builder.ts';
import { kernelFixture } from './kernel-test-fixture.ts';
import { stepExchange } from './step-exchange.ts';
import type { SolverSession } from './solver-runtime.ts';
const length=(source:string)=>({source,kind:'length' as const});
const rectangle=():ProfileSource=>({id:'centered',kind:'center-rectangle',entityIds:['a','b','c','d'],center:[length('10'),length('20')],width:length('width'),height:length('8'),construction:false});
test('C51 profile routing preserves source, global IDs, target isolation and one atomic revision',()=>{
  let content=editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'variable',name:'width',source:'12'}});
  const before=structuredClone(content),profile=rectangle();
  content=editCADContent({content,action:{kind:'add-profile',profile} as CADAction});
  assert.equal(content.graph.revision,before.graph.revision+1);
  const stored=content.graph.features[0].definition.sketch.profiles?.[0];assert.ok(stored?.kind==='center-rectangle');assert.equal(stored.width.source,'width');
  assert.deepEqual(before.graph.features[0].definition.sketch.entities,[]);assert.notEqual(content.graph.features[0].definition.sketch.profiles?.[0],profile);
  const unchanged=structuredClone(content),reject=(action:unknown,sketch?:string)=>{assert.throws(()=>editCADContent({content,action:action as CADAction,sketch}));assert.deepEqual(content,unchanged);};
  reject({kind:'add-profile',profile:{...profile,id:'new'}});reject({kind:'remove',ids:['a']});reject({kind:'construction',ids:['a'],enabled:true});
  reject({kind:'constraint',id:'fixed',axis:'horizontal',entity:'a'});reject({kind:'units',units:'inch'},'missing');reject({kind:'unsupported'});
  content=editCADContent({content,action:{kind:'extrude',id:'boss',depth:'5'}});
  content=editCADContent({content,action:{kind:'add-cut',id:'cut'}});
  const foreign={...rectangle(),id:'cut-profile',entityIds:['a','cut-b','cut-c','cut-d']};
  assert.throws(()=>editCADContent({content,action:{kind:'add-profile',profile:foreign} as CADAction,sketch:'cut'}),/already used/);
  content=editCADContent({content,action:{kind:'construction',ids:profile.entityIds,enabled:true} as CADAction});
  assert.equal(content.graph.features[0].definition.sketch.profiles?.[0]?.construction,true);
  assert.equal(content.graph.features[2]!.kind,'pocket');
  content=editCADContent({content,action:{kind:'variable',name:'width',source:'30'}});
  content=editCADContent({content,action:{kind:'detach-profile',id:profile.id} as CADAction});
  const first=content.graph.features[0].definition.sketch.entities[0]!;assert.equal(first.kind,'segment');if(first.kind!=='segment')throw Error('fixture');
  assert.deepEqual(first.a,[-5,16]);assert.deepEqual(first.b,[25,16]);assert.deepEqual(content.graph.features[0].definition.sketch.profiles,[]);
  assert.deepEqual(editableCADContent({operation:'read',value:JSON.parse(JSON.stringify(content))}),content);
  content.graph.revision=Number.MAX_SAFE_INTEGER;assert.throws(()=>editCADContent({content,action:{kind:'clear'}}),/revision limit/);
});
test('C52 materializes formulas before endpoint sharing and fixes a center-preserving profile in real PlaneGCS',async()=>{
  let content=editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'variable',name:'width',source:'12'}});
  const profile=rectangle(),sketch=content.graph.features[0].definition.sketch;
  const context=()=>cadExpressionPolicy({units:content.units,variables:content.variables,linearMm:content.tolerance.linearMm}).context;
  sketch.profiles=[profile];sketch.entities=materializeSketchProfile({profile,context:context(),tolerance:content.tolerance}).entities;
  const original=structuredClone(sketch),gcs=await make_gcs_wrapper(fileURLToPath(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm',import.meta.url)));
  try {for(const width of [12,30]) {
    content.variables[0]!.expression.source=String(width);
    const program=linearSketchProgram({sketch,context:context(),tolerance:content.tolerance});
    assert.equal(program.primitives.filter(p=>p.type==='point'&&p.fixed).length,4);
    gcs.clear_data();gcs.push_primitives_and_params(program.primitives);assert.equal(gcs.solve(),0);gcs.apply_solution();assert.equal(gcs.gcs.dof(),0);
    const entities=program.accept(gcs.sketch_index.get_primitives());
    const points=entities.flatMap(e=>e.kind==='segment'?[e.a,e.b]:[]);
    assert.equal(Math.min(...points.map(p=>p[0])),10-width/2);assert.equal(Math.max(...points.map(p=>p[0])),10+width/2);
    assert.equal(Math.min(...points.map(p=>p[1])),16);assert.equal(Math.max(...points.map(p=>p[1])),24);assert.deepEqual(sketch,original);
  }}finally{gcs.destroy_gcs_module();}
});
test('profile native golden: polygon with hole, construction exclusion and parameter rebuild in all planes and STEP units',async()=>{
  const fixture=await kernelFixture(),gcs=await make_gcs_wrapper(fileURLToPath(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm',import.meta.url)));
  const solver:SolverSession={generation:1,engine:gcs,dof:()=>gcs.gcs.dof(),snapshot:()=>gcs.sketch_index.get_primitives(),isClosed:()=>false};
  try {for(const plane of ['XY','XZ','YZ'] as const) {
    let content=editableCADContent({operation:'new'});const edit=(action:CADAction)=>{content=editCADContent({content,action});};
    edit({kind:'plane',plane});edit({kind:'variable',name:'radius',source:'10'});
    const polygon:ProfileSource={id:'hexagon',kind:'regular-polygon',entityIds:Array.from({length:6},(_,i)=>`hex-${i}`),center:[length('3'),length('-4')],sides:6,radius:length('radius'),rotation:{source:'30 deg',kind:'angle'},construction:false};
    edit({kind:'add-profile',profile:polygon} as CADAction);
    edit({kind:'add-profile',profile:{...rectangle(),id:'construction',entityIds:['guide-a','guide-b','guide-c','guide-d'],width:length('50'),height:length('50'),construction:true}} as CADAction);
    edit({kind:'circle',prefix:'hole',diameter:'4',center:['3','-4']});edit({kind:'extrude',id:'boss',depth:'5'});
    const seeds=structuredClone(content.graph.features[0].definition.sketch.entities);
    for(const radius of [10,12]) {edit({kind:'variable',name:'radius',source:`${radius} mm`});
      for(const units of ['mm','inch','mm'] as const) {
        if(content.units!==units)edit({kind:'units',units});
        const decoded=editableCADContent({operation:'read',value:JSON.parse(JSON.stringify(content))});
        const part=await buildPart({content:decoded,solver,kernel:async()=>fixture.session});assert.ok(part.token);assert.equal(part.dof,0);assert.equal(fixture.retained.size,1);
        const expected=(3*Math.sqrt(3)*radius*radius/2-4*Math.PI)*5;
        const center=plane==='XY'?[3,-4,2.5]:plane==='XZ'?[3,-2.5,-4]:[2.5,3,-4];
        const check=(token:Parameters<typeof fixture.measure>[0])=>{const m=fixture.measure(token);assert.ok(Math.abs(m.volume-expected)<1e-6);m.center.forEach((v,i)=>assert.ok(Math.abs(v-center[i]!)<1e-6));};check(part.token);
        const vertices:[number,number][]=part.sketches['sketch-1']!.filter(e=>polygon.entityIds.includes(e.id)).flatMap(e=>e.kind==='segment'?[e.a]:[]);
        assert.equal(vertices.length,6);vertices.forEach(v=>assert.ok(Math.abs(Math.hypot(v[0]-3,v[1]+4)-radius)<1e-8));
        const bytes=stepExchange({action:'export',session:fixture.session,units,bodies:{shapes:[{bodyId:'hex',token:part.token}],topology:[],operands:[],diagnostics:[]}}).file!.bytes;
        fixture.session.release(part.token);const bodies=stepExchange({action:'import',session:fixture.session,units,bytes}).bodies!;assert.equal(bodies.shapes.length,1);check(bodies.shapes[0]!.token);fixture.session.release(bodies.shapes[0]!.token);assert.equal(fixture.retained.size,0);
        assert.deepEqual(content.graph.features[0].definition.sketch.entities,seeds);assert.equal(content.graph.features[0].definition.sketch.profiles?.[0]?.kind,'regular-polygon');
      }
    }
  }}finally{fixture.close();gcs.destroy_gcs_module();}
});
