import { test } from 'node:test'; import assert from 'node:assert/strict';
import { createRaster, paintRaster, type Raster, type RGBA } from './raster-ops.ts';

import { transformRaster, affineRaster } from './raster-transform.ts';

const K: RGBA = [0, 0, 0, 255], W: RGBA = [255, 255, 255, 255], R: RGBA = [255, 0, 0, 255];
/** Renders one channel as a picture: '#' for black, '.' for white, 'r' for red, '?' otherwise. */
const picture = (r: Raster) => Array.from({ length: r.height }, (_, y) => Array.from({ length: r.width }, (_, x) => {
  const i = (y * r.width + x) * 4, p = [...r.data.slice(i, i + 4)].join();
  return p === K.join() ? '#' : p === W.join() ? '.' : p === R.join() ? 'r' : '?';
}).join(''));

test('I-RASTER flips, rotations, crop, resize, canvas and invert never alias the input', () => {
  const r = createRaster(3, 2, W); paintRaster(r, { kind: 'stroke', points: [[0, 0]], size: 1, color: K, tip: 'square' });
  paintRaster(r, { kind: 'stroke', points: [[2, 1]], size: 1, color: R, tip: 'square' });
  assert.deepEqual(picture(r), ['#..', '..r']);
  assert.deepEqual(picture(transformRaster(r, { kind: 'flip', axis: 'horizontal' })), ['..#', 'r..']);
  assert.deepEqual(picture(transformRaster(r, { kind: 'flip', axis: 'vertical' })), ['..r', '#..']);
  assert.deepEqual(picture(transformRaster(r, { kind: 'rotate', turns: 1 })), ['.#', '..', 'r.']);
  assert.deepEqual(picture(transformRaster(r, { kind: 'rotate', turns: 2 })), ['r..', '..#']);
  assert.deepEqual(picture(transformRaster(r, { kind: 'rotate', turns: 3 })), ['.r', '..', '#.']);
  assert.deepEqual(picture(transformRaster(r, { kind: 'crop', rect: { x: 1, y: 1, width: 5, height: 5 } })), ['.r']);
  assert.throws(() => transformRaster(r, { kind: 'crop', rect: { x: 5, y: 5, width: 1, height: 1 } }), RangeError);
  assert.deepEqual(picture(transformRaster(r, { kind: 'resize', width: 6, height: 2 })), ['##....', '....rr']);
  assert.deepEqual(picture(transformRaster(r, { kind: 'canvas', width: 4, height: 1, fill: R })), ['#..r']);
  const inv = transformRaster(r, { kind: 'invert' }); assert.deepEqual(picture(inv)[0], '.##'); assert.deepEqual([...inv.data.slice(20, 24)], [0, 255, 255, 255]);
  assert.deepEqual(picture(r), ['#..', '..r']);
});

test('I-RASTER free transform scales and rotates about the centre into rotated bounds', async () => {
  const r = createRaster(10, 4, [255, 0, 0, 255]);
  const big = affineRaster(r, { scaleX: 200, scaleY: 50, angle: 0 }); assert.deepEqual([big.width, big.height], [20, 2]); assert.deepEqual([...big.data.slice(4 * 21, 4 * 22)], [255, 0, 0, 255]);
  const turned = affineRaster(r, { scaleX: 100, scaleY: 100, angle: 90 }); assert.deepEqual([turned.width, turned.height], [4, 10]); assert.equal(turned.data[(5 * 4 + 2) * 4 + 3], 255);
  const diamond = affineRaster(createRaster(10, 10, [0, 0, 255, 255]), { scaleX: 100, scaleY: 100, angle: 45 }); assert.equal(diamond.width, 14); assert.equal(diamond.data[3], 0, 'corners are transparent'); assert.equal(diamond.data[(7 * 14 + 7) * 4 + 3], 255);
  assert.throws(() => affineRaster(r, { scaleX: 0, scaleY: 100, angle: 0 }), RangeError);
});

test('I63 nearest affine sampling preserves exact colors and alpha, including rotated edges', () => {
  const source = createRaster(2, 2, [0, 0, 0, 0]); source.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 128, 0, 0, 0, 0]);
  for (const angle of [0, 37, 90]) {
    const out = affineRaster(source, { scaleX: 400, scaleY: 400, angle, sampling: 'nearest' });
    const colors = new Set(Array.from({ length: out.width * out.height }, (_, p) => [...out.data.slice(p * 4, p * 4 + 4)].join(',')));
    assert.deepEqual([...colors].sort(), ['0,0,0,0', '0,0,255,128', '0,255,0,255', '255,0,0,255'].sort());
  }
  const smooth = affineRaster(source, { scaleX: 200, scaleY: 200, angle: 0 });
  assert.ok(Array.from({ length: smooth.width * smooth.height }, (_, p) => smooth.data[p * 4 + 3]).some(v => v! > 0 && v! < 128));
  assert.throws(() => affineRaster(source, { scaleX: 100, scaleY: 100, angle: 0, sampling: 'bad' as any }), RangeError);
});
