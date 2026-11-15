import test from 'node:test';
import assert from 'node:assert/strict';
import { downpixelImage } from './image-downpixel.ts';
const raster = { width: 5, height: 3, data: Uint8ClampedArray.from(Array.from({ length: 15 }, (_, i) => [i, 0, 0, i * 17]).flat()) };
const red = (data: Uint8ClampedArray) => Array.from({ length: data.length / 4 }, (_, i) => data[i * 4]);

test('Down-pixel samples cell centres and copies exact RGBA into smaller image', () => {
  const before = raster.data.slice(), out = downpixelImage(raster, { width: 2, height: 2, resize: true });
  assert.equal(out.width, 2); assert.equal(out.height, 2); assert.deepEqual(red(out.data), [1, 3, 11, 13]);
  assert.deepEqual([...out.data], [1, 0, 0, 17, 3, 0, 0, 51, 11, 0, 0, 187, 13, 0, 0, 221]); assert.deepEqual(raster.data, before);
});

test('Retain-size mode is exact nearest replication including odd edges; identity owns its data', () => {
  const out = downpixelImage(raster, { width: 2, height: 2, resize: false });
  assert.equal(out.width, 5); assert.equal(out.height, 3); assert.deepEqual(red(out.data), [1, 1, 3, 3, 3, 11, 11, 13, 13, 13, 11, 11, 13, 13, 13]);
  const identity = downpixelImage(raster, { width: 5, height: 3, resize: false }); assert.deepEqual(identity.data, raster.data); assert.notEqual(identity.data, raster.data);
  assert.deepEqual(red(downpixelImage(raster, { width: 1, height: 1, resize: false }).data), Array(15).fill(7));
});

test('Down-pixel rejects enlargement, fractional dimensions and malformed input', () => {
  for (const size of [[0, 1], [2, 0], [6, 2], [3, 4], [1.5, 2], [NaN, 2]]) assert.throws(() => downpixelImage(raster, { width: size[0]!, height: size[1]!, resize: true }), RangeError);
  assert.throws(() => downpixelImage({ ...raster, data: new Uint8ClampedArray(1) }, { width: 2, height: 2, resize: true }), RangeError);
  assert.throws(() => downpixelImage(raster, { width: 2, height: 2, resize: 'yes' as unknown as boolean }), RangeError);
});
