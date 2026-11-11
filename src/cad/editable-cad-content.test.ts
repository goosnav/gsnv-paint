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
  for (let i = 1; i <= 30; i++) { sketch.entities[0] = { ...sketch.entities[0]!, b: [i,0] }; assert.deepEqual(read(JSON.parse(JSON.stringify(value))), value); }
  const bad = (mutate: (x: any) => void) => { const v = JSON.parse(JSON.stringify(value)); mutate(v.graph.features[0].definition.sketch); assert.throws(() => read(v), { name: 'CADContentError' }); };
  bad(x => x.entities.push(x.entities[0])); bad(x => x.entities[0].b = [0,0]); bad(x => x.entities[0].b = [Infinity,0]);
  bad(x => x.constraints[0].entityIds = ['missing']); bad(x => x.dimensions[0].kind = 'radius'); bad(x => x.plane = 'XZ'); bad(x => x.extra = 1);
});
