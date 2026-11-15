import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelPolicy, pixelCoverage } from './image-pixel-policy.ts';

test('Pixel policy defaults, owns nested palette data and freezes all metadata', () => {
  assert.deepEqual(pixelPolicy(), { mode: 'pixel-art', palette: null });
  const value = { mode: 'smooth', palette: { colours: [[0, 0, 0], [255, 255, 255]], dither: 'bayer' } };
  const policy = pixelPolicy(value); value.palette.colours[0]![0] = 100;
  assert.deepEqual(policy.palette!.colours[0], [0, 0, 0]);
  for (const item of [policy, policy.palette, policy.palette!.colours, ...policy.palette!.colours]) assert.equal(Object.isFrozen(item), true);
});

test('Pixel policy rejects unknown schemas, duplicate swatches and non-byte channels', () => {
  for (const value of [null, [], {}, { mode: 'bad', palette: null }, { mode: 'pixel-art', palette: null, extra: true },
    ...[[], [[0, 0, 0], [0, 0, 0]], [[-1, 0, 0]], [[1.5, 0, 0]], [[0, 0]], [[0, 0, 0, 255]], Array.from({ length: 257 }, (_, i) => [i & 255, i >> 8, 0])].map(colours => ({ mode: 'pixel-art', palette: { colours, dither: 'none' } })),
    { mode: 'pixel-art', palette: { colours: [[0, 0, 0]], dither: 'random' } }, { mode: 'pixel-art', palette: { colours: [[0, 0, 0]], dither: 'none', extra: true } },
  ]) assert.throws(() => pixelPolicy(value), RangeError);
});

test('Pixel coverage hardens generated coverage only, without changing the source', () => {
  const data = new Uint8ClampedArray([200, 10, 30, 0, 200, 10, 30, 127, 200, 10, 30, 128, 200, 10, 30, 255]);
  const raster = { width: 4, height: 1, data }, before = data.slice();
  assert.deepEqual([...pixelCoverage(raster, 'pixel-art').data], [0, 0, 0, 0, 0, 0, 0, 0, 200, 10, 30, 255, 200, 10, 30, 255]);
  const smooth = pixelCoverage(raster, 'smooth'); assert.deepEqual(smooth.data, before); assert.notEqual(smooth.data, data); assert.deepEqual(data, before);
  for (const mode of ['bad', null]) assert.throws(() => pixelCoverage(raster, mode as 'smooth'), RangeError);
  for (const bad of [{ ...raster, width: 0 }, { ...raster, height: 2 }, { ...raster, data: new Uint8Array(16) }]) assert.throws(() => pixelCoverage(bad as typeof raster, 'pixel-art'), RangeError);
});
