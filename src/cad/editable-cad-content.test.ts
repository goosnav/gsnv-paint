import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editableCADContent } from './editable-cad-content.ts';
const fresh = () => editableCADContent({ operation: 'new' });
const read = (value: unknown) => editableCADContent({ operation: 'read', value });
test('C50 golden new document uses the existing canonical CAD content schema', () => {
  assert.deepEqual(fresh(), {
    units: 'mm', tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 }, variables: [],
    graph: { revision: 0, rollback: 1, features: [{ id: 'sketch-1', name: 'Sketch 1', kind: 'sketch', dependsOn: [], suppressed: false,
      definition: { kind: 'sketch', sketch: { id: 'sketch-1', name: 'Sketch 1', plane: 'XY', entities: [], constraints: [], dimensions: [], projected: [] } } }] },
    assets: [], appearance: { mode: 'shaded-edges', bodyColors: {}, faceColors: [], section: { enabled: false, frame: { origin: [0,0,0], x: [1,0,0], y: [0,1,0], normal: [0,0,1] }, offsetMm: 0 } }, drawing: null,
  });
});
test('C50 JSON round trip owns its arrays and rejects malformed or unsupported content', () => {
  const original = fresh(), copy = read(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(copy, original); copy.graph.features[0].name = 'Changed'; assert.equal(original.graph.features[0].name, 'Sketch 1');
  const invalid: unknown[] = [null, [], {}, { ...original, surprise: true }, { ...original, units: 'cm' }, { ...original, drawing: {} }, { ...original, assets: [{}] }];
  for (const value of invalid) assert.throws(() => read(value), { name: 'CADContentError' });
  for (const revision of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => read({ ...original, graph: { ...original.graph, revision } }), /revision/);
  assert.equal(read({ ...original, graph: { ...original.graph, revision: Number.MAX_SAFE_INTEGER } }).graph.revision, Number.MAX_SAFE_INTEGER);
});
test('C50 segment geometry and reference checks reject data loss', () => {
  const value = fresh(), sketch = value.graph.features[0].definition.sketch;
  sketch.entities.push({ id: 'e', kind: 'segment', a: [0,0], b: [10,0], construction: false });
  sketch.constraints.push({ id: 'h', kind: 'horizontal', entityIds: ['e'], pointRoles: [], inferred: true });
  sketch.dimensions.push({ id: 'd', kind: 'linear', entityIds: ['e'], anchors: [[0,0],[10,0]], value: { source: 'width / 2', kind: 'length' }, label: [5,5] });
  assert.deepEqual(read(value), value);
  for (let i = 1; i <= 30; i++) { sketch.entities[0] = { ...(sketch.entities[0] as Extract<typeof sketch.entities[0], { kind: 'segment' }>), b: [i,0] }; assert.deepEqual(read(JSON.parse(JSON.stringify(value))), value); }
  const bad = (mutate: (x: any) => void) => { const v = JSON.parse(JSON.stringify(value)); mutate(v.graph.features[0].definition.sketch); assert.throws(() => read(v), { name: 'CADContentError' }); };
  bad(x => x.entities.push(x.entities[0])); bad(x => x.entities[0].b = [0,0]); bad(x => x.entities[0].b = [Infinity,0]);
  bad(x => x.constraints[0].entityIds = ['missing']); bad(x => x.dimensions[0].kind = 'radius'); bad(x => x.plane = 'ZX'); bad(x => x.extra = 1);
  const circle = { id: 'c', kind: 'circle', center: [5, 5], radius: 2, construction: false };
  const withCircle = (mutate: (x: any) => void = () => {}) => { const v = JSON.parse(JSON.stringify(value)); const s = v.graph.features[0].definition.sketch; s.entities.push({ ...circle }); mutate(s); return v; };
  assert.deepEqual(read(withCircle(x => { x.constraints.push({ id: 'cf', kind: 'fix', entityIds: ['c'], pointRoles: ['center'], inferred: true }); x.dimensions.push({ id: 'cd', kind: 'diameter', entityIds: ['c'], anchors: [[3,5],[7,5]], value: { source: '4', kind: 'length' }, label: [8,8] }); })).graph.features[0].definition.sketch.entities[1], circle);
  for (const mutate of [(x: any) => { x.entities[1].radius = 0; }, (x: any) => { x.entities[1].radius = Infinity; }, (x: any) => { x.entities[1].center = [1]; }, (x: any) => { x.entities[1].a = [0,0]; },
    (x: any) => { x.constraints.push({ id: 'h2', kind: 'horizontal', entityIds: ['c'], pointRoles: [], inferred: false }); },
    (x: any) => { x.constraints.push({ id: 'cf', kind: 'fix', entityIds: ['c'], pointRoles: ['a'], inferred: true }); },
    (x: any) => { x.constraints.push({ id: 'ef', kind: 'fix', entityIds: ['e'], pointRoles: ['center'], inferred: true }); },
    (x: any) => { x.dimensions.push({ id: 'cd', kind: 'diameter', entityIds: ['e'], anchors: [[0,0],[1,0]], value: { source: '4', kind: 'length' }, label: [8,8] }); },
    (x: any) => { x.dimensions.push({ id: 'cl', kind: 'linear', entityIds: ['c'], anchors: [[0,0],[1,0]], value: { source: '4', kind: 'length' }, label: [8,8] }); }])
    assert.throws(() => read(withCircle(mutate)), { name: 'CADContentError' });
});

test('C50 optional position sources round trip and validate their complete controlled groups', () => {
  const value = fresh(), sketch = value.graph.features[0].definition.sketch;
  value.variables.push({ name: 'width', expression: { source: '100', kind: 'length' } });
  sketch.entities.push({ id: 'a', kind: 'segment', a: [0,0], b: [20,0], construction: false },
    { id: 'b', kind: 'segment', a: [20,0], b: [20,10], construction: false },
    { id: 'c', kind: 'circle', center: [90,10], radius: 3, construction: false },
    { id: 'd', kind: 'circle', center: [10,10], radius: 3, construction: false });
  sketch.constraints.push({ id: 'origin', kind: 'fix', entityIds: ['a'], pointRoles: ['a'], inferred: true,
    position: { x: { source: 'width / 2 - 10', kind: 'length' }, y: { source: '-5', kind: 'length' }, entityIds: ['a','b'] } },
  { id: 'center', kind: 'fix', entityIds: ['c'], pointRoles: ['center'], inferred: true,
    position: { x: { source: 'width - 10', kind: 'length' }, y: { source: '0', kind: 'length' }, entityIds: ['c'] } });
  assert.deepEqual(read(JSON.parse(JSON.stringify(value))), value);
  const legacy = structuredClone(value); for (const c of legacy.graph.features[0].definition.sketch.constraints) delete c.position;
  assert.deepEqual(read(legacy), legacy, 'legacy fixed coordinates remain supported');
  const invalid: [string, (s: any) => void][] = [
    ['missing coordinate', s => delete s.constraints[0].position.x],
    ['extra position field', s => s.constraints[0].position.z = 1],
    ['extra coordinate field', s => s.constraints[0].position.x.extra = 1],
    ['non-length coordinate', s => s.constraints[0].position.x.kind = 'angle'],
    ['missing variable', s => s.constraints[0].position.x.source = 'missing'],
    ['dimension mismatch', s => s.constraints[0].position.x.source = '2 deg'],
    ['nonfinite length', s => s.constraints[0].position.x.source = '1e309 mm'],
    ['division by zero', s => s.constraints[0].position.x.source = 'width / 0'],
    ['empty group', s => s.constraints[0].position.entityIds = []],
    ['missing anchor', s => s.constraints[0].position.entityIds = ['b']],
    ['duplicate group member', s => s.constraints[0].position.entityIds = ['a','a']],
    ['unknown group member', s => s.constraints[0].position.entityIds = ['a','absent']],
    ['mixed entity kinds', s => s.constraints[0].position.entityIds = ['a','c']],
    ['multiple circles', s => s.constraints[1].position.entityIds = ['c','d']],
    ['non-fix constraint', s => { s.constraints[0].kind = 'horizontal'; s.constraints[0].pointRoles = []; }],
    ['relation constraint', s => { s.constraints[0].kind = 'equal'; s.constraints[0].entityIds = ['a','b']; s.constraints[0].pointRoles = []; }],
    ['overlapping group', s => s.constraints.push({ id: 'overlap', kind: 'fix', entityIds: ['b'], pointRoles: ['b'], inferred: false,
      position: { x: { source: '10', kind: 'length' }, y: { source: '10', kind: 'length' }, entityIds: ['b'] } })],
  ];
  for (const [label, mutate] of invalid) {
    const copy = structuredClone(value); mutate(copy.graph.features[0].definition.sketch);
    assert.throws(() => read(copy), { name: 'CADContentError' }, label);
  }
});
