import { test } from 'node:test'; import assert from 'node:assert/strict';
import { createRaster, paintRaster, clip, MAX_PIXELS, MAX_DIMENSION, isRasterSize, type Raster, type RGBA } from './raster-ops.ts';

const K: RGBA = [0, 0, 0, 255], W: RGBA = [255, 255, 255, 255], R: RGBA = [255, 0, 0, 255];
/** Renders one channel as a picture: '#' for black, '.' for white, 'r' for red, '?' otherwise. */
const picture = (r: Raster) => Array.from({ length: r.height }, (_, y) => Array.from({ length: r.width }, (_, x) => {
  const i = (y * r.width + x) * 4, p = [...r.data.slice(i, i + 4)].join();
  return p === K.join() ? '#' : p === W.join() ? '.' : p === R.join() ? 'r' : '?';
}).join(''));

test('I-RASTER new rasters are filled and bounded', () => {
  const r = createRaster(3, 2, W); assert.deepEqual(picture(r), ['...', '...']);
  assert.throws(() => createRaster(0, 2, W), RangeError); assert.throws(() => createRaster(8193, 8192, W), RangeError);
  assert.throws(() => createRaster(2, 2, [256, 0, 0, 0]), RangeError);
});

test('I-RASTER bulk fill retains exact RGBA order, partial alpha and invisible RGB', () => {
  for (const fill of [[0, 0, 0, 0], [255, 255, 255, 255], [1, 127, 253, 0], [254, 17, 3, 128], [0, 0, 0, 255]] as const) {
    const raster = createRaster(257, 3, fill);
    assert.ok(raster.data instanceof Uint8ClampedArray);
    for (let i = 0; i < raster.data.length; i++) assert.equal(raster.data[i], fill[i % 4]);
  }
  for (const fill of [[-1, 2, 3, 4], [1.5, 2, 3, 4], [1, 2, 3, Infinity], [1, 2, 3, 256]] as const)
    assert.throws(() => createRaster(1, 1, fill), RangeError);
});

test('I-RASTER accepts high-resolution scans and rejects area or axis overflow before allocation', () => {
  assert.equal(MAX_PIXELS, 67_108_864);
  assert.equal(MAX_DIMENSION, 16_384);
  for (const size of [[5100, 6600], [8192, 8192], [16384, 4096], [4096, 16384]])
    assert.equal(isRasterSize(size[0], size[1]), true, String(size));
  for (const [width, height] of [[8193, 8192], [16385, 1], [1, 16385], [0, 1], [1.5, 2], [Infinity, 1], [Number.MAX_SAFE_INTEGER, 1]]) {
    assert.equal(isRasterSize(width, height), false);
    assert.throws(() => createRaster(width!, height!, [0, 0, 0, 0]), RangeError);
  }
  for (const width of [undefined, null, '5100', 5100n]) assert.equal(isRasterSize(width, 6600), false);
});

test('I-RASTER pencil stroke is a connected aliased line and reports its dirty rectangle', () => {
  const r = createRaster(6, 4, W);
  const dirty = paintRaster(r, { kind: 'stroke', points: [[0, 0], [5, 3]], size: 1, color: K, tip: 'square' });
  assert.deepEqual(dirty, { x: 0, y: 0, width: 6, height: 4 });
  assert.deepEqual(picture(r), ['#.....', '.##...', '...##.', '.....#']);
  assert.equal(paintRaster(r, { kind: 'stroke', points: [[0, 0]], size: 1, color: K, tip: 'square' }), null, 'unchanged pixels are not dirty');
});

test('I-RASTER round brush stamps are symmetric and clip at edges', () => {
  const r = createRaster(5, 5, W); paintRaster(r, { kind: 'stroke', points: [[2, 2]], size: 4, color: K, tip: 'round' });
  assert.deepEqual(picture(r), ['.....', '..##.', '.####', '.####', '..##.']);
  const c = createRaster(5, 5, W); paintRaster(c, { kind: 'stroke', points: [[2, 2]], size: 5, color: K, tip: 'round' });
  assert.deepEqual(picture(c), ['.###.', '#####', '#####', '#####', '.###.']);
  const edge = createRaster(3, 3, W); assert.deepEqual(paintRaster(edge, { kind: 'stroke', points: [[-1, -1]], size: 3, color: K, tip: 'square' }), { x: 0, y: 0, width: 1, height: 1 });
});

test('I-RASTER rectangle outline, fill and inverted drag direction', () => {
  const r = createRaster(5, 4, W);
  paintRaster(r, { kind: 'rectangle', a: [4, 3], b: [0, 0], size: 1, stroke: K, fill: R });
  assert.deepEqual(picture(r), ['#####', '#rrr#', '#rrr#', '#####']);
  const o = createRaster(5, 5, W); paintRaster(o, { kind: 'rectangle', a: [0, 0], b: [4, 4], size: 2, stroke: K, fill: null });
  assert.deepEqual(picture(o), ['#####', '#####', '##.##', '#####', '#####']);
});

test('I-RASTER ellipse fill is inside its bounding box and outline leaves the centre', () => {
  const r = createRaster(7, 5, W); paintRaster(r, { kind: 'ellipse', a: [0, 0], b: [6, 4], size: 1, stroke: K, fill: null });
  const rows = picture(r); assert.equal(rows[2], '#.....#'); assert.equal(rows[0]![0], '.'); assert.match(rows[0]!, /#/);
  const f = createRaster(7, 5, W); paintRaster(f, { kind: 'ellipse', a: [0, 0], b: [6, 4], size: 1, stroke: null, fill: K });
  assert.equal(picture(f)[2], '#######'); assert.equal(picture(f)[0]![0], '.');
});

test('I-RASTER flood fill stays within a closed boundary and is a no-op on its own colour', () => {
  const r = createRaster(5, 5, W);
  paintRaster(r, { kind: 'rectangle', a: [0, 0], b: [3, 3], size: 1, stroke: K, fill: null });
  assert.deepEqual(paintRaster(r, { kind: 'fill', point: [1, 1], color: R }), { x: 1, y: 1, width: 2, height: 2 });
  assert.deepEqual(picture(r), ['####.', '#rr#.', '#rr#.', '####.', '.....']);
  assert.equal(paintRaster(r, { kind: 'fill', point: [1, 1], color: R }), null);
  paintRaster(r, { kind: 'fill', point: [4, 4], color: R }); assert.deepEqual(picture(r), ['####r', '#rr#r', '#rr#r', '####r', 'rrrrr']);
  assert.equal(paintRaster(r, { kind: 'fill', point: [9, 9], color: K }), null);
});

test('I-RASTER flood fill handles a large concave region without recursion', () => {
  const r = createRaster(400, 400, W);
  for (let x = 20; x < 380; x += 40) paintRaster(r, { kind: 'stroke', points: [[x, x % 80 ? 0 : 20], [x, x % 80 ? 379 : 399]], size: 1, color: K, tip: 'square' });
  paintRaster(r, { kind: 'fill', point: [0, 0], color: R });
  assert.deepEqual([...r.data.slice((399 * 400 + 399) * 4, (399 * 400 + 400) * 4)], [...R]);
});

test('I-RASTER clear, replace blit and source-over blit', () => {
  const r = createRaster(4, 2, W);
  paintRaster(r, { kind: 'clear', rect: { x: 1, y: 0, width: 9, height: 1 }, color: K }); assert.deepEqual(picture(r), ['.###', '....']);
  const half = createRaster(1, 1, [255, 0, 0, 128]);
  paintRaster(r, { kind: 'blit', source: half, x: 0, y: 1, mode: 'over' });
  assert.deepEqual([...r.data.slice(16, 20)], [255, 127, 127, 255]);
  paintRaster(r, { kind: 'blit', source: half, x: 3, y: 1, mode: 'replace' }); assert.deepEqual([...r.data.slice(28, 32)], [255, 0, 0, 128]);
  assert.equal(paintRaster(r, { kind: 'blit', source: half, x: 10, y: 10, mode: 'over' }), null);
  assert.deepEqual(clip({ x: -2, y: 1, width: 4, height: 5 }, r), { x: 0, y: 1, width: 2, height: 1 });
  assert.throws(() => clip({ x: 0.5, y: 0, width: 1, height: 1 }, r), RangeError);
});
