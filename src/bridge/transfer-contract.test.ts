import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transferRaster, type TransferRaster } from './transfer-contract.ts';
const fixture = (): TransferRaster => ({ version: 1, route: 'image-to-video-bin', label: 'Test', source: { workspace: 'image', documentId: 'source', identity: 'r1', epoch: 1, viewRevision: 'v1' }, pixels: { width: 2, height: 1, rgba: new Uint8ClampedArray([1,2,3,4,255,0,90,128]), colorSpace: 'srgb', alpha: 'straight' } });
test('D01 accepts exactly the three routes and owns every delivered byte', () => {
  const input = fixture(), result = transferRaster(input); input.pixels.rgba[0] = 99;
  assert.deepEqual([...result.pixels.rgba], [1,2,3,4,255,0,90,128]); assert.notEqual(result.source, input.source);
  assert.equal(transferRaster({ ...fixture(), route: 'video-frame-to-image', source: { ...input.source, workspace: 'video' }, frame: { timelineSeconds: 1.5, fps: 30 } }).route, 'video-frame-to-image');
  assert.equal(transferRaster({ ...fixture(), route: 'cad-viewport-to-image', source: { ...input.source, workspace: 'cad' }, background: 'transparent' }).route, 'cad-viewport-to-image');
});
test('D01 rejects invalid direction, raster shape, representation, stamps and shared/detached buffers', () => {
  const input = fixture();
  for (const value of [null, { ...input, version: 2 }, { ...input, route: 'image-to-image' }, { ...input, source: { ...input.source, workspace: 'video' } }]) assert.throws(() => transferRaster(value));
  for (const patch of [{ width: 0 }, { width: 1.2 }, { width: 2 ** 53 }, { height: 16_777_217 }, { rgba: new Uint8ClampedArray(7) }, { colorSpace: 'display-p3' }, { alpha: 'premultiplied' }]) assert.throws(() => transferRaster({ ...input, pixels: { ...input.pixels, ...patch } }), { name: 'BridgeRasterError' });
  for (const patch of [{ identity: '' }, { epoch: -1 }, { epoch: NaN }, { viewRevision: '' }]) assert.throws(() => transferRaster({ ...input, source: { ...input.source, ...patch } }));
  assert.throws(() => transferRaster({ ...input, pixels: { ...input.pixels, rgba: new Uint8ClampedArray(new SharedArrayBuffer(8)) } }));
  const detached = fixture(); structuredClone(detached.pixels.rgba.buffer, { transfer: [detached.pixels.rgba.buffer] }); assert.throws(() => transferRaster(detached));
  assert.throws(() => transferRaster({ ...input, route: 'cad-viewport-to-image', source: { ...input.source, workspace: 'cad' }, background: 'opaque' }), { name: 'CadTransparencyError' });
  assert.throws(() => transferRaster({ ...input, route: 'video-frame-to-image', source: { ...input.source, workspace: 'video' }, frame: { timelineSeconds: NaN, fps: 30 } }));
});
test('D01 permits the exact Image pixel ceiling and rejects the next pixel before allocation', () => {
  const input = fixture(); assert.equal(transferRaster({ ...input, pixels: { ...input.pixels, width: 4096, height: 4096, rgba: new Uint8ClampedArray(4096 * 4096 * 4) } }).pixels.rgba.length, 67_108_864);
  assert.throws(() => transferRaster({ ...input, pixels: { ...input.pixels, width: 16_777_217, height: 1 } }));
});
