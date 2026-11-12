import { test } from 'node:test'; import assert from 'node:assert/strict';
import { imageContent, ImageContentError, TILE, type LayerMeta } from './image-content.ts';
import { createRaster, paintRaster } from './raster-ops.ts';

const meta = (id: string, extra: Partial<LayerMeta> = {}): LayerMeta => ({ id, name: id, visible: true, opacity: 1, blend: 'normal', ...extra });

test('I-CONTENT new documents have one opaque Background layer with clipped edge tiles', () => {
  const doc = imageContent({ operation: 'new', width: TILE + 10, height: 3, fill: [255, 255, 255, 255] });
  assert.deepEqual(doc.layers.map(l => [l.id, l.name, l.visible, l.opacity, l.blend]), [['background', 'Background', true, 1, 'normal']]);
  assert.equal(doc.layers[0]!.tiles.length, 2); assert.equal(doc.layers[0]!.tiles[1]!.length, 10 * 3 * 4); assert.ok(Object.isFrozen(doc));
  assert.throws(() => imageContent({ operation: 'new', width: 0, height: 1, fill: [0, 0, 0, 0] }), RangeError);
});

test('I-CONTENT layer updates share untouched tiles; stack edits reuse pixels without copies', () => {
  const doc = imageContent({ operation: 'new', width: TILE * 2, height: TILE, fill: [255, 255, 255, 255] }), raster = imageContent({ operation: 'raster', value: doc, layerId: 'background' });
  paintRaster(raster, { kind: 'stroke', points: [[TILE + 5, 5]], size: 1, color: [0, 0, 0, 255], tip: 'square' });
  const next = imageContent({ operation: 'update', previous: doc, layerId: 'background', raster });
  assert.equal(next.layers[0]!.tiles[0], doc.layers[0]!.tiles[0]); assert.notEqual(next.layers[0]!.tiles[1], doc.layers[0]!.tiles[1]);
  raster.data.fill(7); assert.equal(next.layers[0]!.tiles[1]![0], 255, 'snapshots do not alias the working raster');
  const stacked = imageContent({ operation: 'layers', previous: next, width: next.width, height: next.height, activeLayerId: 'copy', layers: [
    { meta: meta('background') }, { meta: meta('copy', { name: 'Copy', opacity: 0.5, blend: 'multiply' }), from: 'background' }, { meta: meta('new'), raster: createRaster(TILE * 2, TILE, [0, 0, 0, 0]) }] });
  assert.equal(stacked.layers[1]!.tiles[1], next.layers[0]!.tiles[1]); assert.equal(stacked.activeLayerId, 'copy'); assert.equal(stacked.layers[2]!.tiles[0]![3], 0);
  assert.throws(() => imageContent({ operation: 'layers', previous: next, width: 10, height: 10, activeLayerId: 'background', layers: [{ meta: meta('background') }] }), RangeError);
  assert.throws(() => imageContent({ operation: 'layers', previous: next, width: next.width, height: next.height, activeLayerId: 'x', layers: [{ meta: meta('background') }] }), RangeError);
  assert.throws(() => imageContent({ operation: 'layers', previous: next, width: next.width, height: next.height, activeLayerId: 'background', layers: [{ meta: meta('background', { blend: 'hue' as never }) }] }), RangeError);
  assert.throws(() => imageContent({ operation: 'update', previous: doc, layerId: 'nope', raster }), RangeError);
});

test('I-CONTENT native encode/decode is byte exact per layer and still opens single-layer projects', () => {
  const base = imageContent({ operation: 'new', width: 3, height: 2, fill: [1, 2, 3, 4] });
  const doc = imageContent({ operation: 'layers', previous: base, width: 3, height: 2, activeLayerId: 'top', layers: [{ meta: meta('background') }, { meta: meta('top', { name: 'Top', visible: false, opacity: 0.25, blend: 'screen' }), raster: createRaster(3, 2, [9, 8, 7, 6]) }] });
  const encoded = imageContent({ operation: 'encode', value: doc });
  assert.equal(encoded.content.encoding, 'rgba8-layers'); assert.deepEqual(encoded.assets.map(a => a.id), ['pixels-0', 'pixels-1']); assert.deepEqual([...encoded.assets[1]!.bytes.slice(0, 4)], [9, 8, 7, 6]);
  const decoded = imageContent({ operation: 'decode', content: JSON.parse(JSON.stringify(encoded.content)), assets: encoded.assets.map(a => ({ id: a.id, bytes: a.bytes.slice() })) });
  assert.deepEqual(decoded, doc);
  const legacy = imageContent({ operation: 'decode', content: { width: 3, height: 2, encoding: 'rgba8', asset: 'pixels' }, assets: [{ id: 'pixels', bytes: new Uint8Array(24).fill(5) }] });
  assert.deepEqual(legacy.layers.map(l => l.name), ['Background']); assert.equal(legacy.layers[0]!.tiles[0]![0], 5);
  for (const content of [null, [], { ...encoded.content, extra: 1 }, { ...encoded.content, width: 0 }, { ...encoded.content, layers: [{ ...encoded.content.layers[0], blend: 'hue' }] }, { ...encoded.content, activeLayerId: 'missing' }])
    assert.throws(() => imageContent({ operation: 'decode', content, assets: encoded.assets }), ImageContentError);
  assert.throws(() => imageContent({ operation: 'decode', content: encoded.content, assets: [encoded.assets[0]!] }), ImageContentError);
});
