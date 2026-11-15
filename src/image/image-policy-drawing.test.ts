import test from 'node:test';
import assert from 'node:assert/strict';
import { paintPolicyShape, resizePolicyRaster } from './image-policy-drawing.ts';
import { createRaster, paintRaster, type RGBA } from './raster-ops.ts';
import { transformRaster } from './raster-transform.ts';
import type { ImageOperation } from './image-operation-types.ts';
import { imageContent } from './image-content.ts';
import { applyImageOperation } from './image-operations.ts';
const red: RGBA = [240, 20, 30, 255], blue: RGBA = [10, 30, 230, 255];
type Shape = Extract<ImageOperation, { kind: 'shape' }>;
const shape = (shape: Shape['shape'], a: Shape['a'] = [0, 0], b: Shape['b'] = [3, 3]): Shape => ({ kind: 'shape', shape, a, b, size: 1, stroke: null, fill: red });
const alphas = (r: ReturnType<typeof createRaster>) => Array.from(r.data).filter((_, i) => i % 4 === 3);
const pixel = (r: ReturnType<typeof createRaster>, x: number, y: number) => Array.from(r.data.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4));

test('pixel policy delegates byte-exact existing rectangle, ellipse and line drawing', () => {
  for (const type of ['rectangle', 'ellipse', 'line'] as const) {
    const op = { ...shape(type, [1.2, 1.8], [7.8, 6.1]), stroke: blue, size: 2 };
    const actual = createRaster(9, 8, [1, 2, 3, 127]), expected = createRaster(9, 8, [1, 2, 3, 127]);
    const rect = paintRaster(expected, type === 'line' ? { kind: 'stroke', points: [op.a, op.b], size: op.size, color: blue, tip: 'round' } : { ...op, kind: type });
    assert.deepEqual(paintPolicyShape(actual, op, 'pixel-art'), rect); assert.deepEqual(actual, expected);
  }
});

test('smooth ellipse has deterministic coverage while pixel ellipse has binary edges', () => {
  const smooth = createRaster(4, 4, [0, 0, 0, 0]), sharp = createRaster(4, 4, [0, 0, 0, 0]);
  assert.deepEqual(paintPolicyShape(smooth, shape('ellipse'), 'smooth'), { x: 0, y: 0, width: 4, height: 4 });
  assert.deepEqual(alphas(smooth), [96, 239, 239, 96, 239, 255, 255, 239, 239, 255, 255, 239, 96, 239, 239, 96]);
  paintPolicyShape(sharp, shape('ellipse'), 'pixel-art');
  assert.ok(alphas(sharp).every(a => a === 0 || a === 255));
  for (let i = 0; i < smooth.data.length; i += 4) assert.deepEqual(Array.from(smooth.data.slice(i, i + 3)), [240, 20, 30]);
});

test('fractional rectangle coverage and inward stroke colours remain separate', () => {
  const fractional = createRaster(3, 3, [0, 0, 0, 0]);
  paintPolicyShape(fractional, shape('rectangle', [.5, .5], [1.5, 1.5]), 'smooth');
  assert.deepEqual(alphas(fractional), [64, 128, 64, 128, 255, 128, 64, 128, 64]);
  const outlined = createRaster(6, 6, [0, 0, 0, 0]);
  paintPolicyShape(outlined, { ...shape('rectangle', [0, 0], [5, 5]), stroke: blue }, 'smooth');
  assert.deepEqual(pixel(outlined, 0, 0), blue); assert.deepEqual(pixel(outlined, 3, 3), red);
  assert.ok(alphas(outlined).every(a => a === 255));
});

test('smooth lines use round caps and partial coverage rather than changing the source colour', () => {
  const raster = createRaster(6, 5, [0, 0, 0, 0]);
  paintPolicyShape(raster, { ...shape('line', [1, 2], [3, 2]), stroke: red, fill: null }, 'smooth');
  assert.deepEqual(pixel(raster, 1, 2), [240, 20, 30, 223]);
  assert.deepEqual(pixel(raster, 2, 2), red); assert.deepEqual(pixel(raster, 3, 2), [240, 20, 30, 223]);
  assert.deepEqual(pixel(raster, 2, 1), [0, 0, 0, 0]);
});

test('smooth coverage composites intentional alpha over destination once', () => {
  const raster = createRaster(3, 3, [0, 0, 255, 255]);
  paintPolicyShape(raster, { ...shape('rectangle', [0, 0], [2, 2]), fill: [255, 0, 0, 128] }, 'smooth');
  assert.deepEqual(pixel(raster, 1, 1), [128, 0, 127, 255]);
  const unchanged = raster.data.slice();
  assert.equal(paintPolicyShape(raster, { ...shape('rectangle'), fill: [0, 0, 0, 0] }, 'smooth'), null);
  assert.deepEqual(raster.data, unchanged);
});

test('smooth work clips to visible pixels even for enormous offscreen geometry', () => {
  const raster = createRaster(2, 2, [0, 0, 0, 0]);
  assert.equal(paintPolicyShape(raster, shape('ellipse', [-1e6, -1e6], [-5, -5]), 'smooth'), null);
  assert.deepEqual(paintPolicyShape(raster, shape('rectangle', [-1e6, -1e6], [1e6, 1e6]), 'smooth'), { x: 0, y: 0, width: 2, height: 2 });
  assert.ok(alphas(raster).every(a => a === 255));
  assert.equal(paintPolicyShape(raster, shape('rectangle', [-1e6, -1e6], [1e6, 1e6]), 'smooth'), null);
});

test('resize uses nearest exact pixels for pixel mode and clamped premultiplied bilinear for smooth', () => {
  const raster = createRaster(2, 1, [0, 0, 0, 0]); raster.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
  const original = raster.data.slice(), nearest = resizePolicyRaster(raster, 4, 1, 'pixel-art');
  assert.deepEqual(nearest, transformRaster(raster, { kind: 'resize', width: 4, height: 1 }));
  const smooth = resizePolicyRaster(raster, 4, 1, 'smooth');
  assert.deepEqual(Array.from(smooth.data), [255, 0, 0, 255, 191, 0, 64, 255, 64, 0, 191, 255, 0, 0, 255, 255]);
  assert.deepEqual(raster.data, original); assert.notEqual(nearest.data, raster.data); assert.notEqual(smooth.data, raster.data);
  const one = createRaster(1, 1, [18, 99, 203, 255]);
  assert.deepEqual(resizePolicyRaster(one, 3, 3, 'smooth'), createRaster(3, 3, [18, 99, 203, 255]));
});

test('smooth resize never leaks hidden transparent colour into visible samples', () => {
  const raster = createRaster(2, 1, [0, 0, 0, 0]); raster.data.set([255, 0, 0, 255, 0, 255, 0, 0]);
  const smooth = resizePolicyRaster(raster, 4, 1, 'smooth');
  assert.deepEqual(Array.from(smooth.data), [255, 0, 0, 255, 255, 0, 0, 191, 255, 0, 0, 64, 0, 0, 0, 0]);
});

test('invalid policy, geometry, colours and raster sizes reject before writes', () => {
  const raster = createRaster(4, 4, [0, 0, 0, 0]);
  for (const op of [{ ...shape('ellipse'), a: [NaN, 0] }, { ...shape('ellipse'), size: 0 }, { ...shape('ellipse'), fill: [256, 0, 0, 255] }, shape('line')]) {
    assert.throws(() => paintPolicyShape(raster, op as Shape, 'smooth'), RangeError); assert.ok(raster.data.every(n => n === 0));
  }
  assert.throws(() => paintPolicyShape(raster, shape('ellipse'), 'unknown' as 'smooth'), RangeError);
  for (const [w, h] of [[0, 1], [1.5, 2], [4097, 4097], [NaN, 2]]) assert.throws(() => resizePolicyRaster(raster, w!, h!, 'smooth'), RangeError);
  assert.throws(() => resizePolicyRaster({ ...raster, data: new Uint8ClampedArray(1) }, 2, 2, 'smooth'), RangeError);
});

test('semantic replay uses document policy for shapes and resizing without changing the source', () => {
  const original = imageContent({ operation: 'new', width: 4, height: 4, fill: [0, 0, 0, 0], policy: { mode: 'smooth', palette: null } });
  const drawn = applyImageOperation({ image: original, clipboard: null }, shape('ellipse'));
  const raster = imageContent({ operation: 'raster', value: drawn.image, layerId: original.activeLayerId });
  assert.deepEqual(alphas(raster), [96, 239, 239, 96, 239, 255, 255, 239, 239, 255, 255, 239, 96, 239, 239, 96]);
  assert.ok(imageContent({ operation: 'raster', value: original, layerId: original.activeLayerId }).data.every(n => n === 0));
  let pixels = imageContent({ operation: 'new', width: 2, height: 1, fill: [255, 0, 0, 255], policy: { mode: 'smooth', palette: null } });
  const work = imageContent({ operation: 'raster', value: pixels, layerId: pixels.activeLayerId }); work.data.set([0, 0, 255, 255], 4);
  pixels = imageContent({ operation: 'update', previous: pixels, layerId: pixels.activeLayerId, raster: work });
  const resized = applyImageOperation({ image: pixels, clipboard: null }, { kind: 'transform', transform: { kind: 'resize', width: 4, height: 1 } });
  assert.deepEqual(Array.from(imageContent({ operation: 'raster', value: resized.image, layerId: resized.image.activeLayerId }).data), [255, 0, 0, 255, 191, 0, 64, 255, 64, 0, 191, 255, 0, 0, 255, 255]);
});
