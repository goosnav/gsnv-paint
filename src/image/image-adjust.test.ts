import { test } from 'node:test'; import assert from 'node:assert/strict';
import { adjustRaster, monotoneLut, blurRaster, type AdjustOp } from './image-adjust.ts';
import { createRaster, type Raster } from './raster-ops.ts';

const ramp = (): Raster => { const r = createRaster(256, 1, [0, 0, 0, 255]); for (let x = 0; x < 256; x++) r.data.set([x, x, x], x * 4); return r; };
const apply = (op: AdjustOp, r = ramp()) => { adjustRaster(r, op); return r; };
const red = (r: Raster, x: number) => r.data[x * 4]!;

test('I-ADJUST identity settings leave pixels unchanged', () => {
  for (const op of [{ kind: 'brightnessContrast', brightness: 0, contrast: 0 }, { kind: 'hueSaturation', hue: 0, saturation: 0, lightness: 0 }, { kind: 'levels', inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 },
    { kind: 'curves', shadows: 64, midtones: 128, highlights: 192 }, { kind: 'colorBalance', cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }] as AdjustOp[]) assert.deepEqual(apply(op).data, ramp().data, op.kind);
});

test('I-ADJUST known values for tonal and colour adjustments', () => {
  assert.equal(red(apply({ kind: 'brightnessContrast', brightness: 40, contrast: 0 }), 100), 151);
  const c = apply({ kind: 'brightnessContrast', brightness: 0, contrast: 50 }); assert.ok(red(c, 60) < 60 && red(c, 200) > 200);
  assert.equal(red(apply({ kind: 'invert' }), 10), 245); assert.equal(red(apply({ kind: 'threshold', level: 128 }), 127), 0); assert.equal(red(apply({ kind: 'threshold', level: 128 }), 128), 255);
  assert.deepEqual(new Set([...apply({ kind: 'posterize', levels: 2 }).data].filter((_, i) => i % 4 === 0)), new Set([0, 255]));
  const lv = apply({ kind: 'levels', inBlack: 50, inWhite: 200, gamma: 1, outBlack: 0, outWhite: 255 }); assert.equal(red(lv, 50), 0); assert.equal(red(lv, 200), 255); assert.equal(red(lv, 125), 128);
  const curve = monotoneLut([[0, 0], [64, 40], [128, 128], [192, 220], [255, 255]]); assert.equal(curve[128], 128); assert.ok(curve[64]! === 40 && curve[192]! === 220);
  for (let i = 1; i < 256; i++) assert.ok(curve[i]! >= curve[i - 1]!);
  const px = createRaster(1, 1, [200, 50, 50, 255]); adjustRaster(px, { kind: 'hueSaturation', hue: 120, saturation: 0, lightness: 0 }); assert.ok(px.data[1]! > px.data[0]! && px.data[1]! > px.data[2]!);
  const grey = createRaster(1, 1, [200, 50, 50, 255]); adjustRaster(grey, { kind: 'desaturate' }); assert.ok(grey.data[0] === grey.data[1] && grey.data[1] === grey.data[2]);
  assert.throws(() => apply({ kind: 'levels', inBlack: 100, inWhite: 50, gamma: 1, outBlack: 0, outWhite: 255 }), RangeError);
  assert.throws(() => apply({ kind: 'nope' } as never), RangeError);
});

test('I-ADJUST filters: blur keeps flat areas and transparent edges, sharpen raises edge contrast, pixelate averages, noise is seeded', () => {
  const flat = createRaster(10, 10, [90, 90, 90, 255]); adjustRaster(flat, { kind: 'gaussianBlur', radius: 3 }); assert.ok([...flat.data].every((v, i) => v === (i % 4 === 3 ? 255 : 90)));
  const edge = createRaster(10, 1, [255, 0, 0, 0]); edge.data.set([255, 0, 0, 255], 0); const b = blurRaster(edge, 4); assert.ok(b[4 * 2 + 3]! > 0 && b[4 * 2]! > 250, 'colour of a premultiplied blur stays red');
  const step = createRaster(10, 1, [50, 50, 50, 255]); for (let x = 5; x < 10; x++) step.data.set([200, 200, 200], x * 4);
  adjustRaster(step, { kind: 'unsharpMask', amount: 150, radius: 2, threshold: 0 }); assert.ok(step.data[4 * 4]! < 50 && step.data[5 * 4]! > 200);
  const pix = createRaster(4, 1, [0, 0, 0, 255]); pix.data.set([100, 100, 100], 0); adjustRaster(pix, { kind: 'pixelate', size: 2 }); assert.equal(pix.data[0], 50); assert.equal(pix.data[4], 50); assert.equal(pix.data[8], 0);
  const n1 = createRaster(8, 8, [128, 128, 128, 255]), n2 = createRaster(8, 8, [128, 128, 128, 255]);
  adjustRaster(n1, { kind: 'addNoise', amount: 40, monochrome: true, seed: 3 }); adjustRaster(n2, { kind: 'addNoise', amount: 40, monochrome: true, seed: 3 }); assert.deepEqual(n1.data, n2.data); assert.ok(n1.data[0] === n1.data[1]);
  const e = createRaster(5, 5, [100, 100, 100, 255]); adjustRaster(e, { kind: 'findEdges' }); assert.equal(e.data[12 * 4], 255); adjustRaster(e, { kind: 'emboss' }); assert.equal(e.data[12 * 4], 128);
  const region = createRaster(4, 1, [10, 10, 10, 255]); adjustRaster(region, { kind: 'invert' }, { x: 1, y: 0, width: 2, height: 1 }); assert.deepEqual([region.data[0], region.data[4], region.data[8], region.data[12]], [10, 245, 245, 10]);
});
