import { test } from 'node:test'; import assert from 'node:assert/strict';
import { compositeLayers, maskedMerge, BLEND_MODES, type BlendMode } from './image-composite.ts';
import { createRaster, type Raster, type Rect } from './raster-ops.ts';

const one = (rgba: [number, number, number, number]) => createRaster(1, 1, rgba);
const comp = (blend: BlendMode, top: [number, number, number, number], bottom: [number, number, number, number] = [128, 64, 200, 255], opacity = 1) => {
  const out = new Uint8ClampedArray(4); compositeLayers({ width: 1, height: 1, layers: [{ raster: one(bottom), visible: true, opacity: 1, blend: 'normal' }, { raster: one(top), visible: true, opacity, blend }], rect: { x: 0, y: 0, width: 1, height: 1 }, out }); return [...out];
};

test('I-COMPOSITE golden blend modes over an opaque base', () => {
  const top: [number, number, number, number] = [200, 100, 50, 255];
  assert.deepEqual(comp('normal', top), [200, 100, 50, 255]);
  assert.deepEqual(comp('multiply', top), [100, 25, 39, 255]);
  assert.deepEqual(comp('screen', top), [228, 139, 211, 255]);
  assert.deepEqual(comp('darken', top), [128, 64, 50, 255]); assert.deepEqual(comp('lighten', top), [200, 100, 200, 255]);
  assert.deepEqual(comp('difference', top), [72, 36, 150, 255]);
  assert.deepEqual(comp('overlay', top), [200, 50, 167, 255]);
  assert.deepEqual(comp('normal', top, undefined, 0.5), [164, 82, 125, 255]);
  assert.deepEqual(comp('normal', [255, 0, 0, 0]), [128, 64, 200, 255], 'transparent pixels leave the base');
  assert.equal(BLEND_MODES.length, 7);
});

test('I-COMPOSITE transparent stacks, hidden layers and rectangle bounds', () => {
  const out = new Uint8ClampedArray(8), half = createRaster(2, 1, [255, 0, 0, 128]), hidden = createRaster(2, 1, [0, 0, 255, 255]);
  compositeLayers({ width: 2, height: 1, layers: [{ raster: half, visible: true, opacity: 1, blend: 'multiply' }, { raster: hidden, visible: false, opacity: 1, blend: 'normal' }], rect: { x: 1, y: 0, width: 5, height: 1 }, out });
  assert.deepEqual([...out], [0, 0, 0, 0, 255, 0, 0, 128]);
  assert.throws(() => compositeLayers({ width: 2, height: 1, layers: [{ raster: one([0, 0, 0, 0]), visible: true, opacity: 1, blend: 'normal' }], rect: { x: 0, y: 0, width: 1, height: 1 }, out }), RangeError);
});

test('I-COMPOSITE one-layer path preserves every alpha value, blend mode, crop and hidden RGB semantics', () => {
  const width = 257, height = 3, raster = createRaster(width, height, [0, 0, 0, 0]);
  for (let p = 0; p < width * height; p++) raster.data.set([(p * 37) % 256, (p * 53 + 11) % 256, (p * 71 + 31) % 256, p % 256], p * 4);
  // A single source over transparency has this closed-form result, independent
  // of blend mode. Keep the expected pixels independent of compositor code.
  function expected(rect: Rect, source: Raster) {
    const out = new Uint8ClampedArray(source.data.length).fill(19);
    for (let y = Math.max(0, rect.y); y < Math.min(height, rect.y + rect.height); y++) for (let x = Math.max(0, rect.x); x < Math.min(width, rect.x + rect.width); x++) {
      const i = (y * width + x) * 4;
      out.set(source.data[i + 3] ? source.data.subarray(i, i + 4) : [0, 0, 0, 0], i);
    }
    return out;
  }
  const hidden = { raster: createRaster(width, height, [255, 7, 9, 255]), visible: false, opacity: 1, blend: 'multiply' as const };
  const transparent = { raster: createRaster(width, height, [83, 19, 147, 0]), visible: true, opacity: 1, blend: 'normal' as const };
  for (const blend of BLEND_MODES) for (const rect of [{ x: 0, y: 0, width, height }, { x: -3, y: 1, width: 260, height: 5 }, { x: 7, y: 0, width: 0, height: 2 }]) {
    const out = new Uint8ClampedArray(raster.data.length).fill(19), before = raster.data.slice();
    compositeLayers({ width, height, rect, out, layers: [hidden, { raster, visible: true, opacity: 1, blend }, { ...hidden, visible: true, opacity: 0 }] });
    const general = new Uint8ClampedArray(raster.data.length).fill(19);
    compositeLayers({ width, height, rect, out: general, layers: [{ raster, visible: true, opacity: 1, blend }, transparent] });
    assert.deepEqual(out, expected(rect, raster)); assert.deepEqual(out, general); assert.deepEqual(raster.data, before);
  }
});

test('I-COMPOSITE masked merge keeps edits inside the selection and interpolates soft edges', () => {
  const target = createRaster(3, 1, [255, 255, 255, 255]), base = new Uint8ClampedArray(12);
  maskedMerge({ target, base, mask: new Uint8Array([255, 128, 0]), rect: { x: 0, y: 0, width: 3, height: 1 } });
  assert.deepEqual([...target.data], [255, 255, 255, 255, 128, 128, 128, 128, 0, 0, 0, 0]);
});
