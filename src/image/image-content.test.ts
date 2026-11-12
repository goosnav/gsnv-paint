import { test } from 'node:test'; import assert from 'node:assert/strict';
import { imageContent, ImageContentError, TILE } from './image-content.ts';
import { paintRaster } from './raster-ops.ts';

test('I-CONTENT new documents tile the image with clipped edge tiles', () => {
  const doc = imageContent({ operation: 'new', width: TILE + 10, height: 3, fill: [255, 255, 255, 255] });
  assert.equal(doc.tiles.length, 2); assert.equal(doc.tiles[0]!.length, TILE * 3 * 4); assert.equal(doc.tiles[1]!.length, 10 * 3 * 4);
  assert.ok(Object.isFrozen(doc)); assert.throws(() => imageContent({ operation: 'new', width: 0, height: 1, fill: [0, 0, 0, 0] }), RangeError);
});

test('I-CONTENT update reuses untouched tiles and copies the working raster', () => {
  const doc = imageContent({ operation: 'new', width: TILE * 2, height: TILE * 2, fill: [255, 255, 255, 255] });
  const raster = imageContent({ operation: 'raster', value: doc });
  paintRaster(raster, { kind: 'stroke', points: [[TILE + 5, 5]], size: 1, color: [0, 0, 0, 255], tip: 'square' });
  const next = imageContent({ operation: 'update', previous: doc, raster });
  assert.equal(next.tiles[0], doc.tiles[0]); assert.equal(next.tiles[2], doc.tiles[2]); assert.equal(next.tiles[3], doc.tiles[3]);
  assert.notEqual(next.tiles[1], doc.tiles[1]); assert.deepEqual([...next.tiles[1]!.slice((5 * TILE + 5) * 4, (5 * TILE + 5) * 4 + 4)], [0, 0, 0, 255]);
  raster.data.fill(7); assert.deepEqual([...next.tiles[1]!.slice(0, 4)], [255, 255, 255, 255], 'later raster edits do not leak into the snapshot');
  assert.deepEqual([...doc.tiles[1]!.slice((5 * TILE + 5) * 4, (5 * TILE + 5) * 4 + 4)], [255, 255, 255, 255]);
  const resized = imageContent({ operation: 'update', previous: doc, raster: { width: 1, height: 1, data: new Uint8ClampedArray(4) } });
  assert.equal(resized.width, 1); assert.equal(resized.tiles.length, 1);
});

test('I-CONTENT native encode/decode is byte exact and rejects malformed content', () => {
  const doc = imageContent({ operation: 'new', width: 3, height: 2, fill: [1, 2, 3, 4] });
  const raster = imageContent({ operation: 'raster', value: doc }); raster.data[0] = 200;
  const edited = imageContent({ operation: 'update', previous: doc, raster });
  const encoded = imageContent({ operation: 'encode', value: edited });
  assert.deepEqual(encoded.content, { width: 3, height: 2, encoding: 'rgba8', asset: 'pixels' });
  assert.deepEqual([...encoded.bytes.slice(0, 8)], [200, 2, 3, 4, 1, 2, 3, 4]);
  const decoded = imageContent({ operation: 'decode', content: JSON.parse(JSON.stringify(encoded.content)), bytes: encoded.bytes.slice() });
  assert.deepEqual(decoded, edited);
  for (const content of [null, [], { ...encoded.content, encoding: 'png' }, { ...encoded.content, extra: 1 }, { ...encoded.content, width: 0 }, { ...encoded.content, width: 1.5 }])
    assert.throws(() => imageContent({ operation: 'decode', content, bytes: encoded.bytes }), ImageContentError);
  assert.throws(() => imageContent({ operation: 'decode', content: encoded.content, bytes: encoded.bytes.slice(1) }), ImageContentError);
  assert.throws(() => imageContent({ operation: 'raster', value: { width: 2, height: 2, tiles: [] } }), RangeError);
});
