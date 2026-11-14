import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSource } from './image-source.ts';
import { imageContent } from '../image/image-content.ts';
const stamp = { workspace: 'image' as const, documentId: 'image', identity: 'r1', epoch: 1, viewRevision: 'r1' };
test('D02 literal layered alpha golden copies committed source without flattening its layers', () => {
  const layer = (id: string, data: number[], visible = true) => ({ meta: { id, name: id, visible, opacity: 1, blend: 'normal' as const }, raster: { width: 2, height: 2, data: new Uint8ClampedArray(data) } });
  const value = imageContent({ operation: 'layers', previous: null, width: 2, height: 2, activeLayerId: 'top', layers: [
    layer('bottom', [255,0,0,255,0,0,0,0,0,0,255,255,0,0,0,0]), layer('top', [0,0,0,0,0,255,0,128,255,0,0,128,0,0,0,0]), layer('hidden', Array(4).fill([1,2,3,255]).flat(), false),
  ] });
  const before = structuredClone(imageContent({ operation: 'encode', value }));
  const result = imageSource({ value, source: stamp, label: 'Layers' });
  assert.deepEqual([...result.pixels.rgba], [255,0,0,255,0,255,0,128,128,0,127,255,0,0,0,0]);
  result.pixels.rgba.fill(99); assert.deepEqual(imageContent({ operation: 'encode', value }), before); assert.equal(value.layers.length, 3); assert.equal(value.activeLayerId, 'top');
});
test('D02 opacity/blend goldens use the declared integer rounding', () => {
  for (const [blend, opacity, expected] of [['normal', .5, [164,82,125,255]], ['multiply', 1, [100,25,39,255]]] as const) {
    const value = imageContent({ operation: 'layers', previous: null, width: 1, height: 1, activeLayerId: 'b', layers: [
      { meta: { id: 'a', name: 'a', visible: true, opacity: 1, blend: 'normal' }, raster: { width: 1, height: 1, data: new Uint8ClampedArray([128,64,200,255]) } },
      { meta: { id: 'b', name: 'b', visible: true, opacity, blend }, raster: { width: 1, height: 1, data: new Uint8ClampedArray([200,100,50,255]) } },
    ] });
    assert.deepEqual([...imageSource({ value, source: stamp, label: 'Blend' }).pixels.rgba], expected);
  }
});
