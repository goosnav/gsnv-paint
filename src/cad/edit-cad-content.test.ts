import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
const fresh = () => editableCADContent({ operation: 'new' });
const seg = (e: unknown) => e as { a: [number, number]; b: [number, number] };
const edit = (content: ReturnType<typeof fresh>, action: CADAction) => {
  const before = JSON.stringify(content), result = editCADContent({ content, action });
  assert.equal(JSON.stringify(content), before); assert.deepEqual(editableCADContent({ operation: 'read', value: result }), result); return result;
};
test('C51 rectangle stores real driving constraints and edits preserve source expressions', () => {
  let value = edit(fresh(), { kind: 'rectangle', prefix: 'r', width: '100', height: '60' });
  const s = value.graph.features[0].definition.sketch;
  assert.deepEqual(s.entities.map(e => [seg(e).a,seg(e).b]), [[[0,0],[100,0]],[[100,0],[100,60]],[[100,60],[0,60]],[[0,60],[0,0]]]);
  assert.deepEqual(s.constraints.map(c => c.kind), ['horizontal','vertical','horizontal','vertical','fix']);
  assert.deepEqual(s.dimensions.map(d => d.value.source), ['100','60']);
  value = edit(value, { kind: 'extrude', id: 'boss', depth: '5 * 2' });
  value = edit(value, { kind: 'dimension', id: s.dimensions[0]!.id, source: '120' });
  assert.equal(value.graph.revision, 3); assert.equal(value.graph.features[1]!.definition.extent.distance.source, '5 * 2');
  value = edit(value, { kind: 'remove', ids: [s.entities[0]!.id] });
  assert.equal(value.graph.features[0].definition.sketch.entities.length, 3);
  assert.ok(value.graph.features[0].definition.sketch.constraints.every(c => c.entityIds[0] !== s.entities[0]!.id));
  assert.equal(edit(value, { kind: 'remove-extrude' }).graph.features.length, 1);
});
test('C51 lines, constraints, units and named dimensions use real existing bricks', () => {
  let value = fresh(); value.units = 'inch';
  value.variables = [{ name: 'width', expression: { source: '2 inch', kind: 'length' } }];
  value = edit(value, { kind: 'rectangle', prefix: 'r', width: 'width / 2', height: '1' });
  assert.equal(seg(value.graph.features[0].definition.sketch.entities[0]).b[0], 25.4);
  value = edit(value, { kind: 'clear' }); value = edit(value, { kind: 'line', id: 'line', a: [0,0], b: [2,0] });
  value = edit(value, { kind: 'constraint', id: 'h', entity: 'line', axis: 'horizontal' });
  value = edit(value, { kind: 'remove-constraint', id: 'h' }); assert.equal(value.graph.features[0].definition.sketch.constraints.length, 0);
});
test('C51 errors preserve model and safe revision boundary', () => {
  const value = fresh();
  for (const action of [{ kind:'rectangle',prefix:'r',width:'0',height:'10' }, { kind:'extrude',id:'e',depth:'0' }, { kind:'dimension',id:'missing',source:'20' }, { kind:'constraint',id:'h',entity:'missing',axis:'horizontal' }, { kind:'remove-constraint',id:'bad' }] as CADAction[]) {
    assert.throws(() => editCADContent({ content:value, action }), { name: 'CADEditError' });
  }
  value.graph.revision = Number.MAX_SAFE_INTEGER;
  assert.throws(() => editCADContent({ content:value, action:{ kind:'clear' } }), /revision/i);
  value.graph.revision = Number.MAX_SAFE_INTEGER - 1;
  assert.equal(edit(value, {kind:'clear'}).graph.revision, Number.MAX_SAFE_INTEGER);
  const line = edit(fresh(), {kind:'line',id:'x',a:[0,0],b:[1,1]});
  assert.throws(() => editCADContent({content:line,action:{kind:'line',id:'x',a:[0,0],b:[2,2]}}), /ID/);
  assert.throws(() => editCADContent({content:fresh(),action:{kind:'line',id:'x',a:[NaN,0],b:[2,2]}}));
});

test('C51 pointer-positioned rectangle preserves its supplied fixed corner',()=>{
 const result=edit(fresh(),{kind:'rectangle',prefix:'r',width:'20',height:'30',origin:[-10,5]});
 assert.deepEqual(seg(result.graph.features[0].definition.sketch.entities[0]).a,[-10,5]);
 assert.deepEqual(seg(result.graph.features[0].definition.sketch.entities[1]).b,[10,35]);
});

test('C51 circles add a fixed center and diameter, survive a replacing rectangle and delete with their relations',()=>{
 let value=edit(fresh(),{kind:'rectangle',prefix:'r',width:'100',height:'60'});
 value=edit(value,{kind:'circle',prefix:'h1',diameter:'10',center:[20,30]});
 let s=value.graph.features[0].definition.sketch;
 assert.deepEqual(s.entities.at(-1),{id:'h1-circle',kind:'circle',center:[20,30],radius:5,construction:false});
 assert.deepEqual(s.constraints.at(-1),{id:'h1-center',kind:'fix',entityIds:['h1-circle'],pointRoles:['center'],inferred:true});
 assert.deepEqual(s.dimensions.map(d=>[d.kind,d.value.source]),[['linear','100'],['linear','60'],['diameter','10']]);
 value=edit(value,{kind:'rectangle',prefix:'r2',width:'80',height:'50'});s=value.graph.features[0].definition.sketch;
 assert.deepEqual(s.entities.map(e=>e.kind),['segment','segment','segment','segment','circle']);
 assert.deepEqual(s.dimensions.map(d=>d.id),['r2-width','r2-height','h1-diameter']);assert.ok(s.constraints.some(c=>c.id==='h1-center'));
 value=edit(value,{kind:'dimension',id:'h1-diameter',source:'12'});
 assert.throws(()=>editCADContent({content:value,action:{kind:'constraint',id:'h',entity:'h1-circle',axis:'horizontal'}}),/Select a line/);
 assert.throws(()=>editCADContent({content:value,action:{kind:'circle',prefix:'h1',diameter:'4',center:[0,0]}}),/already used/);
 assert.throws(()=>editCADContent({content:value,action:{kind:'circle',prefix:'z',diameter:'0',center:[0,0]}}),/exceed/);
 value=edit(value,{kind:'remove',ids:['h1-circle']});s=value.graph.features[0].definition.sketch;
 assert.equal(s.entities.length,4);assert.ok(!s.constraints.some(c=>c.id==='h1-center'));assert.ok(!s.dimensions.some(d=>d.id==='h1-diameter'));
});
