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
  const result=p.accept(shifted); assert.deepEqual(result[0]!.a,[3,4]); assert.deepEqual(result[0]!.b,result[1]!.a);
  sketch.dimensions[0]!.value.source='-1'; assert.throws(()=>linearSketchProgram({sketch,context,tolerance:1e-7}), /positive/);
});
test('C52 a collapsed solved edge is rejected instead of publishing unusable sketch geometry',()=>{
 const content=editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'line',id:'e',a:[0,0],b:[10,0]}});
 const p=linearSketchProgram({sketch:content.graph.features[0].definition.sketch,context,tolerance:1e-7});
 assert.throws(()=>p.accept(p.primitives.map(v=>v.type==='point'?{...v,x:0,y:0}:v)),/collapsed/);
});
