import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editableCADContent, bossOf } from './editable-cad-content.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
import { evaluateDimension } from './dimension-expressions.ts';
import { evaluateVariables } from './named-variables.ts';
const fresh = () => editableCADContent({ operation: 'new' });
const seg = (e: unknown) => e as { a: [number, number]; b: [number, number] };
const edit = (content: ReturnType<typeof fresh>, action: CADAction) => {
  const before = JSON.stringify(content), result = editCADContent({ content, action });
  assert.equal(JSON.stringify(content), before); assert.deepEqual(editableCADContent({ operation: 'read', value: result }), result); return result;
};

test('C51 changing units preserves physical values, named formulas and reopened feature parameters', () => {
  let value = fresh();
  value.variables = [{ name: 'width', expression: { source: '80 + 20', kind: 'length' } }, { name: 'half', expression: { source: 'width / 2', kind: 'length' } }];
  value = edit(value, { kind: 'rectangle', prefix: 'r', width: 'width', height: 'half + 10' });
  value = edit(value, { kind: 'extrude', id: 'boss', depth: '(5 + 5)' });
  value = edit(value, { kind: 'edge-feature', id: 'round', feature: 'fillet', edges: 'vertical', size: '5 mm' });
  value = edit(value, { kind: 'add-cut', id: 'cut' });
  value = editCADContent({ content: value, sketch: 'cut', action: { kind: 'circle', prefix: 'hole', diameter: '6', center: [10,10] } });
  value = edit(value, { kind: 'cut-extent', id: 'cut', depth: '2 * 2' });
  const parameters = (content: typeof value) => {
    const context = evaluateVariables({ variables: content.variables, units: content.units }).context;
    const sources = content.graph.features.flatMap(f => f.kind === 'sketch' ? f.definition.sketch.dimensions.map(d => d.value)
      : f.kind === 'extrude' ? [f.definition.extent.distance] : f.kind === 'revolve' ? [f.definition.angle] : f.kind === 'pocket' ? [...f.definition.sketch.dimensions.map(d => d.value), ...(f.definition.extent.kind === 'blind' ? [f.definition.extent.distance] : [])] : [f.definition.size]);
    return sources.map(expression => evaluateDimension({ expression, context }).value);
  };
  const expected = parameters(value);
  assert.deepEqual(expected, [100,60,10,5,6,4]);
  value = edit(value, { kind: 'units', units: 'inch' });
  assert.deepEqual(parameters(value), expected);
  assert.equal(value.variables[1]!.expression.source, 'width / 2');
  value = editableCADContent({ operation: 'read', value: JSON.parse(JSON.stringify(value)) });
  assert.deepEqual(parameters(value), expected);
  const sources = JSON.stringify(value.variables);
  value = edit(value, { kind: 'units', units: 'mm' });
  assert.deepEqual(parameters(value), expected); assert.equal(JSON.stringify(value.variables), sources);
  value.variables[0]!.expression.source = '120 mm';
  assert.deepEqual(parameters(value), [120,70,10,5,6,4], 'named formulas remain parametric');
  value = edit(value, { kind: 'units', units: 'inch' });
  value = edit(value, { kind: 'dimension', id: 'r-width', source: '2' });
  assert.equal(parameters(value)[0], 50.8, 'new input adopts the selected units');
});
test('C51 rectangle stores real driving constraints and edits preserve source expressions', () => {
  let value = edit(fresh(), { kind: 'rectangle', prefix: 'r', width: '100', height: '60' });
  const s = value.graph.features[0].definition.sketch;
  assert.deepEqual(s.entities.map(e => [seg(e).a,seg(e).b]), [[[0,0],[100,0]],[[100,0],[100,60]],[[100,60],[0,60]],[[0,60],[0,0]]]);
  assert.deepEqual(s.constraints.map(c => c.kind), ['horizontal','vertical','horizontal','vertical','fix']);
  assert.deepEqual(s.dimensions.map(d => d.value.source), ['100','60']);
  value = edit(value, { kind: 'extrude', id: 'boss', depth: '5 * 2' });
  value = edit(value, { kind: 'dimension', id: s.dimensions[0]!.id, source: '120' });
  assert.equal(value.graph.revision, 3); assert.equal(bossOf(value)!.definition.extent.distance.source, '5 * 2');
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
 assert.deepEqual(s.constraints.at(-1),{id:'h1-center',kind:'fix',entityIds:['h1-circle'],pointRoles:['center'],inferred:true,
   position:{x:{source:'20 mm',kind:'length'},y:{source:'30 mm',kind:'length'},entityIds:['h1-circle']}});
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

test('C51 coordinate strings retain formulas while numeric placement stays canonical mm in inches', () => {
  let value = edit(fresh(), { kind: 'variable', name: 'width', source: '100 mm' });
  value = edit(value, { kind: 'units', units: 'inch' });
  value = edit(value, { kind: 'rectangle', prefix: 'r', width: '20 mm', height: '10 mm', origin: ['width / 2 - 10 mm', '-1'] });
  value = edit(value, { kind: 'circle', prefix: 'numeric', diameter: '2 mm', center: [1,-1] });
  value = edit(value, { kind: 'circle', prefix: 'text', diameter: '2 mm', center: ['1','-1'] });
  const sketch = value.graph.features[0].definition.sketch;
  assert.deepEqual(seg(sketch.entities[0]).a, [40,-25.4]);
  assert.deepEqual(sketch.entities.slice(4).map(e => e.kind === 'circle' ? e.center : null), [[1,-1],[25.4,-25.4]]);
  assert.deepEqual(sketch.constraints.find(c => c.id === 'r-origin')!.position, {
    x: { source: 'width / 2 - 10 mm', kind: 'length' }, y: { source: '-1', kind: 'length' }, entityIds: ['r-edge-0','r-edge-1','r-edge-2','r-edge-3'],
  });
  assert.equal(sketch.constraints.find(c => c.id === 'numeric-center')!.position!.x.source, '1 mm');
  assert.equal(sketch.constraints.find(c => c.id === 'text-center')!.position!.x.source, '1');
  const before = structuredClone(sketch.entities);
  value = edit(value, { kind: 'edit-position', id: 'r-origin', x: 'width / 2', y: '0' });
  assert.deepEqual(value.graph.features[0].definition.sketch.entities, before, 'source geometry is not baked by a position edit');
  assert.equal(value.graph.features[0].definition.sketch.constraints.find(c => c.id === 'r-origin')!.position!.x.source, 'width / 2');
  value = edit(value, { kind: 'remove', ids: ['r-edge-2'] });
  assert.ok(!value.graph.features[0].definition.sketch.constraints.some(c => c.id === 'r-origin'), 'deleting any controlled member removes the positional constraint');
});

test('C51 position formulas remain physically stable and parametric through units and JSON reopen', () => {
  let value = edit(fresh(), { kind: 'variable', name: 'width', source: '100' });
  value = edit(value, { kind: 'rectangle', prefix: 'r', width: 'width', height: '60' });
  value = edit(value, { kind: 'extrude', id: 'boss', depth: '10' });
  value = edit(value, { kind: 'add-cut', id: 'cut' });
  value = editCADContent({ content: value, sketch: 'cut', action: { kind: 'circle', prefix: 'hole', diameter: '6', center: ['width - 10','10'] } });
  const coordinates = (content: typeof value) => {
    const cut = content.graph.features[2]; assert.equal(cut!.kind, 'pocket'); if (cut!.kind !== 'pocket') throw new Error('cut');
    const position = cut!.definition.sketch.constraints[0]!.position!;
    const context = evaluateVariables({ variables: content.variables, units: content.units }).context;
    return [position.x, position.y].map(expression => evaluateDimension({ expression, context }).value);
  };
  assert.deepEqual(coordinates(value), [90,10]);
  value = edit(value, { kind: 'units', units: 'inch' });
  value = editableCADContent({ operation: 'read', value: JSON.parse(JSON.stringify(value)) });
  assert.deepEqual(coordinates(value), [90,10]);
  value = edit(value, { kind: 'variable', name: 'width', source: '120 mm' });
  assert.deepEqual(coordinates(value), [110,10]);
  value = edit(value, { kind: 'units', units: 'mm' });
  assert.deepEqual(coordinates(value), [110,10]);
  value = editCADContent({ content: value, sketch: 'cut', action: { kind: 'edit-position', id: 'hole-center', x: 'width - 20', y: '-5' } });
  assert.deepEqual(coordinates(value), [100,-5]);
});

test('C51 named variables preserve kinds, reject broken dependents and remove only unused names atomically', () => {
  let value = edit(fresh(), { kind: 'variable', name: 'width', source: '100' });
  value = edit(value, { kind: 'variable', name: 'half', source: 'width / 2' });
  value = edit(value, { kind: 'variable', name: 'ratio', source: '2', dimensionKind: 'scalar' });
  value = edit(value, { kind: 'variable', name: 'ratio', source: '3' });
  assert.equal(value.variables.find(v => v.name === 'ratio')!.expression.kind, 'scalar');
  value = edit(value, { kind: 'rectangle', prefix: 'r', width: 'width', height: 'half', origin: ['width / ratio','0'] });
  const before = JSON.stringify(value);
  const invalid: CADAction[] = [
    { kind: 'variable', name: 'bad name', source: '2' }, { kind: 'variable', name: 'mm', source: '2' },
    { kind: 'variable', name: 'width', source: 'half' }, { kind: 'variable', name: 'width', source: 'missing' },
    { kind: 'variable', name: 'width', source: '1 / 0' }, { kind: 'variable', name: 'width', source: '0' },
    { kind: 'variable', name: 'width', source: '2', dimensionKind: 'angle' },
    { kind: 'remove-variable', name: 'width' }, { kind: 'remove-variable', name: 'ratio' }, { kind: 'remove-variable', name: 'absent' },
    { kind: 'edit-position', id: 'r-origin', x: '50', y: 'missing' },
    { kind: 'edit-position', id: 'r-origin', x: '50', y: '1e309' },
    { kind: 'edit-position', id: 'r-origin', x: '50', y: '2 deg' },
    { kind: 'edit-position', id: 'r-axis-0', x: '50', y: '0' },
    { kind: 'edit-position', id: 'missing', x: '50', y: '0' },
  ];
  for (const action of invalid) { assert.throws(() => editCADContent({ content: value, action }), JSON.stringify(action)); assert.equal(JSON.stringify(value), before); }
  value = edit(value, { kind: 'variable', name: 'unused', source: '2', dimensionKind: 'angle' });
  value = edit(value, { kind: 'remove-variable', name: 'unused' });
  assert.ok(!value.variables.some(v => v.name === 'unused'));
  value = edit(value, { kind: 'variable', name: 'width', source: '120' });
  assert.equal(value.variables.find(v => v.name === 'half')!.expression.source, 'width / 2');
  assert.equal(value.graph.features[0].definition.sketch.dimensions[0]!.value.source, 'width');
});

test('C51 variable deletion checks dimensions, feature parameters and cut positions independently', () => {
  const create = () => edit(fresh(), { kind: 'variable', name: 'v', source: '10' });
  const cases = [
    edit(create(), { kind: 'rectangle', prefix: 'r', width: 'v', height: '20' }),
    edit(edit(create(), { kind: 'rectangle', prefix: 'r', width: '20', height: '20' }), { kind: 'extrude', id: 'boss', depth: 'v' }),
  ];
  let base = edit(edit(create(), { kind: 'rectangle', prefix: 'r', width: '20', height: '20' }), { kind: 'extrude', id: 'boss', depth: '5' });
  cases.push(edit(base, { kind: 'edge-feature', id: 'f', feature: 'fillet', edges: 'vertical', size: 'v / 10' }));
  base = edit(base, { kind: 'add-cut', id: 'cut' });
  cases.push(edit(base, { kind: 'cut-extent', id: 'cut', depth: 'v / 5' }));
  cases.push(editCADContent({ content: base, sketch: 'cut', action: { kind: 'circle', prefix: 'h', diameter: '4', center: ['v','5'] } }));
  for (const value of cases) {
    const before = JSON.stringify(value); assert.throws(() => editCADContent({ content: value, action: { kind: 'remove-variable', name: 'v' } }), /v/);
    assert.equal(JSON.stringify(value), before);
  }
});
