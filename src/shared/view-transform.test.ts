import assert from 'node:assert/strict';
import test from 'node:test';
import { viewTransform, type View2D, type ViewRequest } from './view-transform.ts';

const range = { min: 0.01, max: 64 };
const view = { zoom: 2, pan: { x: 10, y: -5 } };
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('S04 golden cursor-centered zoom, pan and document conversion', () => {
  assert.deepEqual(viewTransform({ view, range, action: { type: 'zoom', factor: 2, cursor: { x: 110, y: 45 } } }), { zoom: 4, pan: { x: -90, y: -55 } });
  assert.deepEqual(viewTransform({ view, range, action: { type: 'pan', delta: { x: -20, y: 40 } } }), { zoom: 2, pan: { x: -10, y: 35 } });
  assert.deepEqual(viewTransform({ view, range, action: { type: 'toDocument', point: { x: -10, y: -45 } } }), { x: -10, y: -20 });
});

test('S04 clamps exactly to 1% and 6400%, including product overflow/underflow', () => {
  for (const [factor, zoom] of [[0.001, 0.01], [1000, 64], [Number.MAX_VALUE, 64], [Number.MIN_VALUE, 0.01]]) {
    const result = viewTransform({ view, range, action: { type: 'zoom', factor: factor!, cursor: { x: 110, y: 45 } } });
    assert.equal(result.zoom, zoom);
    near((110 - result.pan.x) / result.zoom, 50);
    near((45 - result.pan.y) / result.zoom, 25);
  }
});

test('S04 fixed min/max range works and pan does not change zoom', () => {
  const fixed = { min: 4, max: 4 };
  assert.equal(viewTransform({ view, range: fixed, action: { type: 'zoom', factor: 0.01, cursor: { x: 0, y: 0 } } }).zoom, 4);
  assert.equal(viewTransform({ view, range, action: { type: 'pan', delta: { x: 0, y: 0 } } }).zoom, 2);
});

test('S04 cursor invariant and inverse property across negative/fractional coordinates', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const original: View2D = { zoom: 0.2 + seed / 10, pan: { x: -seed * 3.7, y: seed * 1.2 } };
    const cursor = { x: seed * 0.81 - 50, y: seed * 4.31 - 200 };
    const document = viewTransform({ view: original, range, action: { type: 'toDocument', point: cursor } });
    const zoomed = viewTransform({ view: original, range, action: { type: 'zoom', factor: 1.5, cursor } });
    const after = viewTransform({ view: zoomed, range, action: { type: 'toDocument', point: cursor } });
    near(after.x, document.x); near(after.y, document.y);
    const restored = viewTransform({ view: zoomed, range, action: { type: 'zoom', factor: 1 / 1.5, cursor } });
    near(restored.zoom, original.zoom); near(restored.pan.x, original.pan.x); near(restored.pan.y, original.pan.y);
  }
});

test('S04 frozen view and request are never mutated', () => {
  const frozen = Object.freeze({ zoom: 2, pan: Object.freeze({ x: 10, y: -5 }) });
  const request = Object.freeze({ view: frozen, range: Object.freeze(range), action: { type: 'pan' as const, delta: Object.freeze({ x: 1, y: 2 }) } });
  viewTransform(request);
  assert.deepEqual(frozen, view);
});

for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
  test(`S04 rejects invalid zoom/factor/range ${invalid}`, () => {
    for (const request of [
      { view: { ...view, zoom: invalid }, range, action: { type: 'pan', delta: { x: 0, y: 0 } } },
      { view, range, action: { type: 'zoom', factor: invalid, cursor: { x: 0, y: 0 } } },
      { view, range: { min: invalid, max: 64 }, action: { type: 'pan', delta: { x: 0, y: 0 } } },
      { view, range: { min: 0.01, max: invalid }, action: { type: 'pan', delta: { x: 0, y: 0 } } },
    ]) assert.throws(() => viewTransform(request as ViewRequest), RangeError);
  });
}

test('S04 rejects inverted bounds and nonfinite coordinates on every action', () => {
  assert.throws(() => viewTransform({ view, range: { min: 2, max: 1 }, action: { type: 'pan', delta: { x: 0, y: 0 } } }), RangeError);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    for (const point of [{ x: invalid, y: 0 }, { x: 0, y: invalid }]) {
      for (const action of [{ type: 'zoom', factor: 2, cursor: point }, { type: 'pan', delta: point }, { type: 'toDocument', point }] as const) {
        assert.throws(() => viewTransform({ view, range, action }), RangeError);
      }
      assert.throws(() => viewTransform({ view: { ...view, pan: point }, range, action: { type: 'pan', delta: { x: 0, y: 0 } } }), RangeError);
    }
  }
});

test('S04 rejects unrepresentable output instead of returning infinite coordinates', () => {
  assert.throws(() => viewTransform({ view: { zoom: 1, pan: { x: Number.MAX_VALUE, y: 0 } }, range, action: { type: 'pan', delta: { x: Number.MAX_VALUE, y: 0 } } }), RangeError);
});
