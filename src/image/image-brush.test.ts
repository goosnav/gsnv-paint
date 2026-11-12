import { test } from 'node:test'; import assert from 'node:assert/strict';
import { dab, dabLine, spray, smudgeDab, applyCoverage, gradientFill, shapeMask, magicWand, combineMasks, maskBounds, type Coverage } from './image-brush.ts';
import { createRaster } from './raster-ops.ts';

const cov = (w: number, h: number): Coverage => ({ width: w, height: h, data: new Float32Array(w * h) });

test('I-BRUSH soft dabs fall off from a solid core; flow accumulates but never exceeds 1', () => {
  const c = cov(21, 21); dab(c, 10.5, 10.5, 16, 0.5, 1);
  assert.equal(c.data[10 * 21 + 10], 1); assert.ok(c.data[10 * 21 + 16]! > 0 && c.data[10 * 21 + 16]! < 1); assert.equal(c.data[0], 0);
  const f = cov(5, 5); for (let i = 0; i < 30; i++) dab(f, 2.5, 2.5, 3, 1, 0.3); assert.ok(f.data[12]! > 0.99 && f.data[12]! <= 1);
  const line = cov(40, 5), r = dabLine(line, [2, 2.5], [38, 2.5], 4, 1, 1); assert.ok(r.rect!.width >= 36); assert.ok([...line.data.slice(2 * 40 + 4, 2 * 40 + 36)].every(v => v > 0.9), 'no gaps between dabs');
  assert.throws(() => dab(cov(2, 2), 0, 0, 0, 1, 1), RangeError);
  const s1 = cov(30, 30), s2 = cov(30, 30); spray(s1, 15, 15, 8, 40, 7); spray(s2, 15, 15, 8, 40, 7); assert.deepEqual(s1.data, s2.data); assert.ok(s1.data.some(v => v > 0));
});

test('I-BRUSH coverage modes: opacity caps paint, erase to transparent, clone from an offset, filter blend', () => {
  const raster = createRaster(3, 1, [255, 255, 255, 255]), base = raster.data.slice(), c = { width: 3, height: 1, data: new Float32Array([1, 0.5, 0]) }, rect = { x: 0, y: 0, width: 3, height: 1 };
  applyCoverage({ raster, base, cov: c, rect, mode: { kind: 'paint', color: [0, 0, 0, 255] }, opacity: 0.5 }); assert.deepEqual([...raster.data], [128, 128, 128, 255, 191, 191, 191, 255, 255, 255, 255, 255]);
  applyCoverage({ raster, base, cov: c, rect, mode: { kind: 'erase' }, opacity: 1 }); assert.deepEqual([raster.data[3], raster.data[7], raster.data[11]], [0, 128, 255]);
  const src = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255]);
  applyCoverage({ raster, base: src.slice(), cov: { width: 3, height: 1, data: new Float32Array([1, 1, 1]) }, rect, mode: { kind: 'clone', source: src, dx: 1, dy: 0 }, opacity: 1 });
  assert.deepEqual([...raster.data], [40, 50, 60, 255, 70, 80, 90, 255, 70, 80, 90, 255]);
  applyCoverage({ raster, base: src.slice(), cov: c, rect, mode: { kind: 'filter', filtered: new Uint8ClampedArray(12) }, opacity: 1 }); assert.deepEqual([...raster.data.slice(0, 4)], [0, 0, 0, 0]);
});

test('I-BRUSH gradients reach both end colours; linear is constant across its axis', () => {
  const r = createRaster(11, 3, [0, 0, 0, 0]); gradientFill(r, [0.5, 0], [10.5, 0], 'linear', [0, 0, 0, 255], [255, 255, 255, 255]);
  assert.equal(r.data[0], 0); assert.equal(r.data[10 * 4], 255); assert.equal(r.data[5 * 4], r.data[(2 * 11 + 5) * 4]); assert.ok(Math.abs(r.data[5 * 4]! - 128) <= 1);
  const radial = createRaster(11, 11, [0, 0, 0, 255]); gradientFill(radial, [5.5, 5.5], [10.5, 5.5], 'radial', [255, 0, 0, 255], [0, 0, 255, 0]);
  assert.equal(radial.data[(5 * 11 + 5) * 4], 255); assert.equal(radial.data[2], 0);
});

test('I-BRUSH selection masks: shapes, lasso, wand and combination', () => {
  assert.equal(shapeMask(10, 10, { kind: 'rectangle', a: [2, 2], b: [4.9, 5.9] }).reduce((s, v) => s + (v ? 1 : 0), 0), 12);
  const ellipse = shapeMask(9, 9, { kind: 'ellipse', a: [0, 0], b: [8, 8] }); assert.equal(ellipse[4 * 9 + 4], 255); assert.equal(ellipse[0], 0);
  const tri = shapeMask(10, 10, { kind: 'polygon', points: [[0, 0], [10, 0], [0, 10]] }); assert.equal(tri[1 * 10 + 1], 255); assert.equal(tri[9 * 10 + 9], 0);
  const img = createRaster(5, 1, [0, 0, 0, 255]); img.data.set([255, 255, 255], 2 * 4); img.data.set([10, 10, 10], 4 * 4);
  assert.deepEqual([...magicWand(img, 0, 0, 0, true)], [255, 255, 0, 0, 0]); assert.deepEqual([...magicWand(img, 0, 0, 20, false)], [255, 255, 0, 255, 255]); img.data.set([255, 255, 255], 3 * 4); assert.deepEqual([...magicWand(img, 0, 0, 20, true)], [255, 255, 0, 0, 0]);
  const a = new Uint8Array([255, 255, 0, 0]), b = new Uint8Array([0, 255, 255, 0]);
  assert.deepEqual([...combineMasks(a, b, 'add')], [255, 255, 255, 0]); assert.deepEqual([...combineMasks(a, b, 'subtract')], [255, 0, 0, 0]);
  assert.deepEqual([...combineMasks(a, b, 'intersect')], [0, 255, 0, 0]); assert.equal(combineMasks(a, b, 'replace'), b);
  assert.deepEqual(maskBounds(new Uint8Array([0, 0, 0, 255, 255, 0]), 3), { x: 0, y: 1, width: 2, height: 1 }); assert.equal(maskBounds(new Uint8Array(4), 2), null);
});

test('I-BRUSH smudge carries picked-up colour along the stroke and fades with distance', () => {
  const r = createRaster(40, 5, [255, 255, 255, 255]); for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) r.data.set([0, 0, 0, 255], (y * 40 + x) * 4);
  let { rect, carry } = smudgeDab(r, null, [2.5, 2.5], 4, 1, 0.8); assert.equal(rect, null);
  for (let x = 4; x <= 30; x += 1) ({ carry } = smudgeDab(r, carry, [x + 0.5, 2.5], 4, 1, 0.8));
  const at = (x: number) => r.data[(2 * 40 + x) * 4]!;
  assert.ok(at(8) < 80, 'colour carried well past the source'); assert.ok(at(8) <= at(20) && at(20) <= at(30), 'and fades along the stroke'); assert.equal(at(38), 255);
  assert.throws(() => smudgeDab(r, carry, [0, 0], 4, 1, 2), RangeError);
});
