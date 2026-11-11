import assert from 'node:assert/strict';
import test from 'node:test';
import { makeLinearEntities, type LinearRequest, type LinearEntity } from './sketch-linear-primitives.ts';
import { evaluateDimension } from './dimension-expressions.ts';

const tolerance = { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-10 };
const request = (tool: LinearRequest['tool'], anchors: LinearRequest['anchors'], sides?: number): LinearRequest => ({
  tool, anchors, construction: false, tolerance,
  ids: Array.from({ length: tool === 'point' || tool === 'line' ? 1 : tool === 'polygon' ? sides ?? 0 : 4 }, (_, i) => `e${i}`),
  ...(sides === undefined ? {} : { sides }),
});
const segment = (id: string, a: readonly [number, number], b: readonly [number, number], construction = false): LinearEntity => ({
  id, kind: 'segment', a, b, construction,
});
const near = (a: number, b: number, bound = 1e-10) => assert.ok(Math.abs(a - b) <= bound, `${a} != ${b}`);
const reject = (r: LinearRequest, name: string) => assert.throws(() => makeLinearEntities(r), (e: unknown) => {
  assert.ok(e instanceof Error); assert.equal(e.name, name); assert.ok(e.message.length > name.length); return true;
});
function segments(entities: LinearEntity[]) {
  return entities.map(e => { assert.equal(e.kind, 'segment'); return e as Extract<LinearEntity, { kind: 'segment' }>; });
}

test('C07 golden point and construction line preserve coordinates and identities', () => {
  assert.deepEqual(makeLinearEntities(request('point', [[3, -2]])), [{ id: 'e0', kind: 'point', p: [3, -2], construction: false }]);
  assert.deepEqual(makeLinearEntities({ ...request('line', [[-2, 3], [10, 7]]), construction: true }), [segment('e0', [-2, 3], [10, 7], true)]);
});

test('C07 golden 100 by 60 plate rectangle uses the chosen opposite corners', () => {
  assert.deepEqual(makeLinearEntities(request('corner-rectangle', [[0, 0], [100, 60]])), [
    segment('e0', [0, 0], [100, 0]), segment('e1', [100, 0], [100, 60]),
    segment('e2', [100, 60], [0, 60]), segment('e3', [0, 60], [0, 0]),
  ]);
});

test('C07 golden centered 20 by 20 pocket and reversed rectangle anchors', () => {
  assert.deepEqual(makeLinearEntities(request('center-rectangle', [[50, 30], [60, 40]])), [
    segment('e0', [40, 20], [60, 20]), segment('e1', [60, 20], [60, 40]),
    segment('e2', [60, 40], [40, 40]), segment('e3', [40, 40], [40, 20]),
  ]);
  assert.deepEqual(makeLinearEntities(request('corner-rectangle', [[5, 7], [-1, -3]])), [
    segment('e0', [5, 7], [-1, 7]), segment('e1', [-1, 7], [-1, -3]),
    segment('e2', [-1, -3], [5, -3]), segment('e3', [5, -3], [5, 7]),
  ]);
});

test('C07 six-sided polygon has the prescribed radius, first vertex and counterclockwise direction', () => {
  const edges = segments(makeLinearEntities(request('polygon', [[0, 0], [10, 0]], 6)));
  const vertices = [[10, 0], [5, 8.660254037844386], [-5, 8.660254037844386], [-10, 0], [-5, -8.660254037844386], [5, -8.660254037844386]];
  assert.deepEqual(edges[0]!.a, [10, 0]);
  for (let i = 0; i < 6; i++) {
    assert.equal(edges[i]!.id, `e${i}`); near(edges[i]!.a[0], vertices[i]![0]!); near(edges[i]!.a[1], vertices[i]![1]!);
    assert.deepEqual(edges[i]!.b, edges[(i + 1) % 6]!.a);
  }
});

test('C07 polygon regularity and orientation hold for translated, rotated and differently sized fixtures', () => {
  for (let sides = 3; sides <= 80; sides++) for (const radius of [0.25, 10, 100]) {
    const angle = sides * 0.31, center = [-12, 7] as const;
    const vertex = [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)] as const;
    const edges = segments(makeLinearEntities(request('polygon', [center, vertex], sides)));
    assert.equal(edges.length, sides); assert.deepEqual(edges[0]!.a, vertex);
    let area = 0;
    for (const [i, e] of edges.entries()) {
      near(Math.hypot(e.a[0] - center[0], e.a[1] - center[1]), radius);
      near(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 2 * radius * Math.sin(Math.PI / sides));
      assert.deepEqual(e.b, edges[(i + 1) % sides]!.a);
      area += ((e.a[0] - center[0]) * (e.b[1] - center[1]) - (e.b[0] - center[0]) * (e.a[1] - center[1])) / 2;
    }
    near(area, sides * radius ** 2 * Math.sin(2 * Math.PI / sides) / 2, 1e-8);
  }
});

test('C07 every primitive applies construction to all output entities', () => {
  for (const tool of ['point', 'line', 'corner-rectangle', 'center-rectangle', 'polygon'] as const) {
    const r = request(tool, tool === 'point' ? [[0, 0]] : [[0, 0], [4, 3]], 5);
    assert.ok(makeLinearEntities({ ...r, construction: true }).every(e => e.construction));
    assert.ok(makeLinearEntities({ ...r, construction: false }).every(e => !e.construction));
  }
});

test('C07 anchor-count errors cover every drawing tool on both sides of its boundary', () => {
  for (const tool of ['point', 'line', 'corner-rectangle', 'center-rectangle', 'polygon'] as const) {
    const count = tool === 'point' ? 1 : 2;
    for (const n of [count - 1, count + 1]) reject(request(tool, Array.from({ length: n }, (_, i) => [i, i]), 3), 'AnchorCountError');
  }
});

test('C07 entity ID count matches point, line and each closed composite exactly', () => {
  for (const tool of ['point', 'line', 'corner-rectangle', 'center-rectangle', 'polygon'] as const) {
    const r = request(tool, tool === 'point' ? [[0, 0]] : [[0, 0], [4, 3]], 7);
    reject({ ...r, ids: r.ids.slice(1) }, 'IdCountError');
    reject({ ...r, ids: [...r.ids, 'extra'] }, 'IdCountError');
  }
});

test('C07 polygon side count rejects missing, noninteger and less than three values', () => {
  const r = request('polygon', [[0, 0], [4, 3]]);
  reject(r, 'InvalidPolygonError');
  for (const sides of [-4, 0, 1, 2, 3.5, NaN, Infinity]) reject({ ...r, sides }, 'InvalidPolygonError');
  assert.equal(makeLinearEntities(request('polygon', [[0, 0], [4, 3]], 3)).length, 3);
});

test('C07 line and rectangle dimensions must exceed the explicit linear tolerance', () => {
  const t = { ...tolerance, linearMm: 0.5 };
  for (const d of [0, 0.25, 0.5]) {
    reject({ ...request('line', [[0, 0], [d, 0]]), tolerance: t }, 'DegenerateGeometryError');
    for (const tool of ['corner-rectangle', 'center-rectangle'] as const) {
      const half = tool === 'center-rectangle' ? d / 2 : d;
      reject({ ...request(tool, [[0, 0], [half, 2]]), tolerance: t }, 'DegenerateGeometryError');
      reject({ ...request(tool, [[0, 0], [2, half]]), tolerance: t }, 'DegenerateGeometryError');
    }
  }
  assert.equal(makeLinearEntities({ ...request('line', [[0, 0], [0.50000001, 0]]), tolerance: t }).length, 1);
  assert.equal(makeLinearEntities({ ...request('point', [[0, 0]]), tolerance: t }).length, 1);
});

test('C07 polygon rejects collapsed radii and edges below document resolution', () => {
  reject(request('polygon', [[2, 3], [2, 3]], 5), 'DegenerateGeometryError');
  reject({ ...request('polygon', [[0, 0], [1, 0]], 100), tolerance: { ...tolerance, linearMm: 0.1 } }, 'DegenerateGeometryError');
});

test('C07 nonrepresentable computed geometry fails instead of returning infinite coordinates', () => {
  reject(request('center-rectangle', [[1e308, 1e308], [-1e308, -1e308]]), 'DegenerateGeometryError');
  reject(request('polygon', [[-1e308, 0], [1e308, 0]], 3), 'DegenerateGeometryError');
  reject(request('line', [[-1e308, 0], [1e308, 0]]), 'DegenerateGeometryError');
});

test('C07 frozen inputs stay unchanged and output arrays do not alias inputs or sibling endpoints', () => {
  const r = request('corner-rectangle', [[-3, -2], [7, 8]]);
  for (const a of r.anchors) Object.freeze(a);
  Object.freeze(r.anchors); Object.freeze(r.ids); Object.freeze(r.tolerance); Object.freeze(r);
  const before = structuredClone(r), output = segments(makeLinearEntities(r));
  const original = structuredClone(output);
  (output[0]!.a as [number, number])[0] = 1000;
  assert.deepEqual(r, before); assert.deepEqual(output[3]!.b, [-3, -2]);
  assert.deepEqual(makeLinearEntities(r), original);
  const p = request('point', [[1, 2]]), result = makeLinearEntities(p)[0]!;
  assert.equal(result.kind, 'point');
  if (result.kind === 'point') { (result.p as [number, number])[0] = 8; assert.deepEqual(p.anchors, [[1, 2]]); }
});

test('C07 real C03 seam preserves millimetre dimensions evaluated from an inch document', () => {
  const context = { units: 'inch' as const, variables: { width: { value: 100, kind: 'length' as const } } };
  const x = evaluateDimension({ expression: { source: 'width', kind: 'length' }, context }).value;
  const y = evaluateDimension({ expression: { source: '60mm', kind: 'length' }, context }).value;
  const edges = segments(makeLinearEntities(request('corner-rectangle', [[0, 0], [x, y]])));
  assert.deepEqual(edges.map(e => e.a), [[0, 0], [100, 0], [100, 60], [0, 60]]);
});
