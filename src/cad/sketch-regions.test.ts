import { test } from 'node:test'; import assert from 'node:assert/strict';
import { sketchRegions } from './sketch-regions.ts';
import type { SketchEntity } from './editable-cad-content.ts';

const rect = (prefix: string, x: number, y: number, w: number, h: number): SketchEntity[] => {
  const p: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return p.map((a, i) => ({ id: `${prefix}${i}`, kind: 'segment', a, b: p[(i + 1) % 4]!, construction: false }));
};
const circle = (id: string, x: number, y: number, r: number, construction = false): SketchEntity => ({ id, kind: 'circle', center: [x, y], radius: r, construction });
const tolerance = 1e-7;
const signed = (points: [number, number][]) => points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

test('C64 plate with circular and rectangular holes orders loops by containment and orientation', () => {
  const entities = [circle('h1', 20, 30, 5), ...rect('slot', 50, 20, 30, 10), ...rect('plate', 0, 0, 100, 60).reverse(), circle('ref', 0, 0, 500, true)];
  const region = sketchRegions({ entities, tolerance });
  assert.equal(region.outer.kind, 'polygon'); assert.ok(signed((region.outer as { points: [number, number][] }).points) > 0);
  assert.deepEqual(region.holes.map(h => h.kind), ['polygon', 'circle']);
  assert.ok(signed((region.holes[0] as { points: [number, number][] }).points) < 0, 'polygon holes are clockwise');
  assert.deepEqual(region.holes[1], { kind: 'circle', center: [20, 30], radius: 5 });
  const shuffled = sketchRegions({ entities: [...entities].reverse(), tolerance });
  assert.deepEqual(shuffled.holes.map(h => h.kind), ['polygon', 'circle']); assert.equal(signed((shuffled.outer as { points: [number, number][] }).points), 6000);
});

test('C64 a lone circle or a circle with a concentric hole is a valid region', () => {
  assert.deepEqual(sketchRegions({ entities: [circle('c', 1, 2, 10)], tolerance }), { outer: { kind: 'circle', center: [1, 2], radius: 10 }, holes: [] });
  const tube = sketchRegions({ entities: [circle('in', 0, 0, 4), circle('out', 0, 0, 10)], tolerance });
  assert.equal((tube.outer as { radius: number }).radius, 10); assert.equal((tube.holes[0] as { radius: number }).radius, 4);
  const squareHole = sketchRegions({ entities: [circle('out', 0, 0, 10), ...rect('s', -2, -2, 4, 4)], tolerance });
  assert.equal(squareHole.holes[0]!.kind, 'polygon');
});

test('C64 rejects empty, open, touching, crossing, separate and nested loops with readable reasons', () => {
  const reject = (entities: SketchEntity[], pattern: RegExp) => assert.throws(() => sketchRegions({ entities, tolerance }), (e: Error) => e.name === 'ProfileError' && pattern.test(e.message));
  reject([], /closed profile/); reject([circle('c', 0, 0, 1, true)], /closed profile/);
  reject(rect('a', 0, 0, 10, 10).slice(0, 3), /open or branched|at least three/);
  reject([...rect('a', 0, 0, 10, 10), circle('c', 9.5, 5, 1)], /fully inside/);
  reject([...rect('a', 0, 0, 10, 10), circle('c', 5, 5, 5)], /fully inside/);
  reject([...rect('a', 0, 0, 10, 10), ...rect('b', 20, 0, 5, 5)], /fully inside/);
  reject([...rect('a', 0, 0, 100, 100), circle('c1', 30, 30, 10), circle('c2', 45, 30, 10)], /must not touch/);
  reject([...rect('a', 0, 0, 100, 100), ...rect('b', 10, 10, 50, 50), circle('c', 30, 30, 5)], /must not touch/);
  reject([...rect('a', 0, 0, 100, 100), ...rect('b', 10, 10, 20, 20), ...rect('c', 25, 25, 20, 20)], /must not touch/);
  reject([circle('c', 0, 0, 0)], /collapsed/); assert.throws(() => sketchRegions({ entities: [], tolerance: 0 }), /tolerance/);
});
