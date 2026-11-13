import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent } from './edit-cad-content.ts';
import { linearSketchProgram } from './linear-sketch-program.ts';
const context = { units: 'mm', variables: {} } as const;
test('C52 exact one-line program golden; H/V and length map to native primitives', () => {
  let content = editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'line',id:'e',a:[0,0],b:[10,0]}});
  content = editCADContent({content,action:{kind:'constraint',id:'h',entity:'e',axis:'horizontal'}});
  const sketch = content.graph.features[0].definition.sketch;
  const p = linearSketchProgram({sketch,context,tolerance:1e-7});
  assert.deepEqual(p.primitives,[{id:'p0',type:'point',x:0,y:0,fixed:false},{id:'p1',type:'point',x:10,y:0,fixed:false},{id:'e',type:'line',p1_id:'p0',p2_id:'p1'},{id:'h',type:'horizontal_l',l_id:'e'}]);
  assert.deepEqual(p.accept(p.primitives),sketch.entities);
  assert.throws(()=>p.accept([]), {name:'SketchProgramError'});
  assert.throws(()=>p.accept(p.primitives.map(v=>v.type==='point'?{...v,x:NaN}:v)), /finite/);
});
test('C52 rectangle shared endpoints, fixed origin and expressions survive the real edit seam', () => {
  const content = editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'rectangle',prefix:'r',width:'50 * 2',height:'60'}});
  const sketch = content.graph.features[0].definition.sketch, before=JSON.stringify(sketch);
  const p=linearSketchProgram({sketch,context,tolerance:1e-7});
  assert.equal(p.primitives.filter(v=>v.type==='point').length,4);
  assert.equal(p.primitives.filter(v=>v.type==='point'&&v.fixed).length,1);
  assert.deepEqual(p.primitives.filter(v=>v.type==='p2p_distance').map(v=>v.distance),[100,60]);
  assert.deepEqual(p.accept(p.primitives),sketch.entities); assert.equal(JSON.stringify(sketch),before);
  const shifted=p.primitives.map(v=>v.type==='point'?{...v,x:v.x+3,y:v.y+4}:v);
  const result=p.accept(shifted) as unknown as {a:number[];b:number[]}[]; assert.deepEqual(result[0]!.a,[3,4]); assert.deepEqual(result[0]!.b,result[1]!.a);
  sketch.dimensions[0]!.value.source='-1'; assert.throws(()=>linearSketchProgram({sketch,context,tolerance:1e-7}), /positive/);
});
test('C52 a collapsed solved edge is rejected instead of publishing unusable sketch geometry',()=>{
 const content=editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'line',id:'e',a:[0,0],b:[10,0]}});
 const p=linearSketchProgram({sketch:content.graph.features[0].definition.sketch,context,tolerance:1e-7});
 assert.throws(()=>p.accept(p.primitives.map(v=>v.type==='point'?{...v,x:0,y:0}:v)),/collapsed/);
});
test('C52 circles map to a fixed center and diameter that the real PlaneGCS solver satisfies', async () => {
  const { make_gcs_wrapper } = await import('@salusoft89/planegcs');
  let content = editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'rectangle',prefix:'r',width:'100',height:'60'}});
  content = editCADContent({content,action:{kind:'circle',prefix:'h',diameter:'10',center:[20,30]}});
  const sketch = content.graph.features[0].definition.sketch;
  sketch.entities[4] = { ...sketch.entities[4]!, radius: 3, center: [20, 30] } as typeof sketch.entities[4]; // Drawn size differs from the driving diameter.
  sketch.dimensions[2]!.value.source = '2 * 7';
  const p = linearSketchProgram({sketch,context,tolerance:1e-7});
  const circle = p.primitives.find(v=>v.type==='circle')!; assert.equal(circle.id,'h-circle');
  assert.deepEqual(p.primitives.find(v=>v.type==='circle_diameter'),{id:'h-diameter',type:'circle_diameter',c_id:'h-circle',diameter:14});
  assert.equal(p.primitives.filter(v=>v.type==='point'&&v.fixed).length,2);
  const gcs = await make_gcs_wrapper(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm', import.meta.url).pathname);
  try {
    gcs.push_primitives_and_params(p.primitives); assert.equal(gcs.solve(),0); gcs.apply_solution();
    assert.equal(gcs.gcs.dof(),0);
    const solved = p.accept(gcs.sketch_index.get_primitives()).at(-1) as { center:[number,number]; radius:number };
    assert.deepEqual(solved.center,[20,30]); assert.ok(Math.abs(solved.radius-7)<1e-9);
    assert.throws(()=>p.accept(gcs.sketch_index.get_primitives().map(v=>v.type==='circle'?{...v,radius:0}:v)),/collapsed circle/);
  } finally { gcs.destroy_gcs_module(); }
});

test('C52 parallel, perpendicular, equal and coincident constraints solve with the real PlaneGCS solver', async () => {
  const { make_gcs_wrapper } = await import('@salusoft89/planegcs');
  let content = editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'line',id:'a',a:[0,0],b:[10,0]}});
  content = editCADContent({content,action:{kind:'line',id:'b',a:[12,1],b:[20,9]}});
  content = editCADContent({content,action:{kind:'constraint',id:'h',entity:'a',axis:'horizontal'}});
  for (const [id, relation] of [['p', 'perpendicular'], ['e', 'equal'], ['c', 'coincident']] as const) content = editCADContent({content,action:{kind:'relation',id,relation,entities:['a','b']}});
  const sketch = content.graph.features[0].definition.sketch; assert.deepEqual(sketch.constraints.at(-1)!.pointRoles, ['b','a']);
  const p = linearSketchProgram({sketch,context,tolerance:1e-7}); assert.deepEqual(p.primitives.filter(v=>['perpendicular_ll','equal_length','p2p_coincident'].includes(v.type)).map(v=>v.type), ['perpendicular_ll','equal_length','p2p_coincident']);
  const gcs = await make_gcs_wrapper(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm', import.meta.url).pathname);
  try {
    gcs.push_primitives_and_params(p.primitives); assert.equal(gcs.solve(), 0); gcs.apply_solution();
    const [a, b] = p.accept(gcs.sketch_index.get_primitives()) as unknown as { a: [number, number]; b: [number, number] }[];
    const da = [a!.b[0]-a!.a[0], a!.b[1]-a!.a[1]], db = [b!.b[0]-b!.a[0], b!.b[1]-b!.a[1]];
    assert.ok(Math.abs(da[1]!) < 1e-6, 'a stays horizontal'); assert.ok(Math.abs(da[0]!*db[0]! + da[1]!*db[1]!) < 1e-6, 'perpendicular');
    assert.ok(Math.abs(Math.hypot(...da) - Math.hypot(...db)) < 1e-6, 'equal length'); assert.ok(Math.hypot(a!.b[0]-b!.a[0], a!.b[1]-b!.a[1]) < 1e-6, 'coincident');
  } finally { gcs.destroy_gcs_module(); }
});
