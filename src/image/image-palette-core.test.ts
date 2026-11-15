import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePalette, presetPalette } from './image-palette-core.ts';
const raster = (pixels: number[][]) => ({ width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flat()) });

test('Palette presets are deterministic, unique immutable RGB swatches at every supported size', () => {
  assert.deepEqual(presetPalette(2), [[0, 0, 0], [255, 255, 255]]);
  for (const n of [2, 4, 8, 16, 32, 64, 128, 256]) {
    const p = presetPalette(n); assert.equal(p.length, n); assert.equal(new Set(p.map(c => c.join(','))).size, n);
    assert.deepEqual(p, presetPalette(n)); assert.ok(Object.isFrozen(p)); assert.ok(p.every(c => Object.isFrozen(c) && c.length === 3 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255)));
  }
  for (const n of [0, 1, 3, 17, 512, NaN]) assert.throws(() => presetPalette(n), RangeError);
});

test('Palette generation preserves few exact visible colours and ignores hidden transparent RGB', () => {
  const r = raster([[17, 18, 19, 255], [17, 18, 19, 1], [20, 22, 24, 255], [250, 0, 100, 0]]), before = r.data.slice();
  assert.deepEqual(generatePalette(r, 2), [[17, 18, 19], [20, 22, 24]]); assert.deepEqual(r.data, before);
  assert.deepEqual(generatePalette(raster([[100, 0, 0, 0]]), 16), presetPalette(16));
  const one = generatePalette(raster([[19, 29, 39, 255]]), 4); assert.deepEqual(one[0], [19, 29, 39]); assert.equal(one.length, 4);
});

test('Median cut has literal weighted-centroid golden and input-order-independent tie rules', () => {
  const pixels = [[0, 0, 0, 255], [16, 0, 0, 255], [240, 0, 0, 255], [255, 0, 0, 255]];
  assert.deepEqual(generatePalette(raster(pixels), 2), [[8, 0, 0], [248, 0, 0]]);
  assert.deepEqual(generatePalette(raster(pixels.toReversed()), 2), generatePalette(raster(pixels), 2));
  const many = Array.from({ length: 300 }, (_, i) => [i % 256, (i * 13) % 256, Math.floor(i / 256) * 255, (i % 5) * 50 + 5]);
  const result = generatePalette(raster(many), 16); assert.equal(result.length, 16); assert.deepEqual(generatePalette(raster(many.toReversed()), 16), result);
  assert.ok(Object.isFrozen(result)); assert.ok(result.every(Object.isFrozen));
});

test('Palette generation rejects malformed rasters before processing', () => {
  for (const bad of [{ width: 0, height: 1, data: new Uint8ClampedArray() }, { width: 2, height: 1, data: new Uint8ClampedArray(4) }, { width: 1, height: 1, data: new Uint8Array(4) }]) assert.throws(() => generatePalette(bad as ReturnType<typeof raster>, 2), RangeError);
  assert.throws(() => generatePalette(raster([[0, 0, 0, 255]]), 7), RangeError);
});
