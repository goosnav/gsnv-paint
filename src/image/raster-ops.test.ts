import { test } from 'node:test'; import assert from 'node:assert/strict';
import { createRaster, paintRaster, transformRaster, clip, type Raster, type RGBA } from './raster-ops.ts';

const K: RGBA = [0, 0, 0, 255], W: RGBA = [255, 255, 255, 255], R: RGBA = [255, 0, 0, 255];
/** Renders one channel as a picture: '#' for black, '.' for white, 'r' for red, '?' otherwise. */
const picture = (r: Raster) => Array.from({ length: r.height }, (_, y) => Array.from({ length: r.width }, (_, x) => {
  const i = (y * r.width + x) * 4, p = [...r.data.slice(i, i + 4)].join();
  return p === K.join() ? '#' : p === W.join() ? '.' : p === R.join() ? 'r' : '?';
}).join(''));

test('I-RASTER new rasters are filled and bounded', () => {
  const r = createRaster(3, 2, W); assert.deepEqual(picture(r), ['...', '...']);
  assert.throws(() => createRaster(0, 2, W), RangeError); assert.throws(() => createRaster(5000, 5000, W), RangeError);
  assert.throws(() => createRaster(2, 2, [256, 0, 0, 0]), RangeError);
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
