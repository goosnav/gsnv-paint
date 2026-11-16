import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionOutline, type SelectionOutlineTile } from './image-selection-outline.ts';

function flatten(width: number, height: number, tiles: readonly SelectionOutlineTile[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const tile of tiles) for (let y = 0; y < tile.height; y++)
    data.set(tile.data.subarray(y * tile.width * 4, (y + 1) * tile.width * 4), ((tile.y + y) * width + tile.x) * 4);
  return data;
}

test('selection outline preserves exact phase pixels across tile boundaries and clipped image edges', () => {
  const width = 70, height = 67, points = [[1, 0], [4, 1], [63, 2], [64, 2], [69, 66]] as const;
  const edges = Int32Array.from(points.map(([x, y]) => y * width + x)), before = edges.slice();
  const outline = createSelectionOutline({ width, height, edges });
  assert.deepEqual(outline.tiles.map(({ x, y, width, height }) => ({ x, y, width, height })), [
    { x: 0, y: 0, width: 64, height: 64 }, { x: 64, y: 0, width: 6, height: 64 }, { x: 64, y: 64, width: 6, height: 3 },
  ]);
  function expected(values: readonly number[]) {
    const data = new Uint8ClampedArray(width * height * 4);
    points.forEach(([x, y], i) => data.set([values[i]!, values[i]!, values[i]!, 255], (y * width + x) * 4));
    return data;
  }
  assert.deepEqual(flatten(width, height, outline.tiles), expected([0, 255, 0, 0, 255]));
  const buffers = outline.tiles.map(tile => tile.data);
  assert.equal(outline.update(3), outline.tiles);
  assert.deepEqual(flatten(width, height, outline.tiles), expected([255, 0, 255, 255, 0]));
  assert.deepEqual(edges, before);
  edges.fill(0);
  outline.update(0);
  assert.deepEqual(flatten(width, height, outline.tiles), expected([0, 255, 0, 0, 255]), 'cache owns edge positions');
  outline.tiles.forEach((tile, i) => assert.equal(tile.data, buffers[i], 'animation reuses pixel buffers'));
});

test('600 dpi Letter outline allocates only touched tiles and keeps those buffers for every animation phase', () => {
  const width = 5100, height = 6600;
  const outline = createSelectionOutline({ width, height, edges: new Int32Array([0, width - 1, (height - 1) * width, width * height - 1]) });
  assert.equal(outline.tiles.length, 4);
  const bytes = outline.tiles.reduce((sum, tile) => sum + tile.data.byteLength, 0);
  assert.ok(bytes <= 4 * 64 * 64 * 4, `${bytes} bytes for four edge tiles, independent of full canvas area`);
  assert.ok(bytes < width * height * 4 / 1000);
  const buffers = outline.tiles.map(tile => tile.data.buffer);
  for (let phase = 0; phase < 8; phase++) {
    outline.update(phase);
    outline.tiles.forEach((tile, i) => assert.equal(tile.data.buffer, buffers[i]));
  }
});

test('empty and duplicate edge lists remain transparent except for unique edge pixels', () => {
  const empty = createSelectionOutline({ width: 8192, height: 8192, edges: new Int32Array() });
  assert.deepEqual(empty.tiles, []); assert.equal(empty.update(7), empty.tiles);
  const one = createSelectionOutline({ width: 3, height: 1, edges: new Int32Array([2, 2]) });
  assert.deepEqual([...one.tiles[0]!.data], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255]);
});

test('selection outline rejects invalid dimensions, edges and phases before rendering', () => {
  for (const [width, height] of [[0, 1], [1.5, 2], [NaN, 1], [8192, 8193], [16385, 1]])
    assert.throws(() => createSelectionOutline({ width: width!, height: height!, edges: new Int32Array() }), RangeError);
  const detached = new Int32Array(1); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  for (const edges of [[0], new Float32Array([0]), new Int32Array([-1]), new Int32Array([6]), new Int32Array(new SharedArrayBuffer(4)), detached])
    assert.throws(() => createSelectionOutline({ width: 3, height: 2, edges: edges as Int32Array }), RangeError);
  const outline = createSelectionOutline({ width: 1, height: 1, edges: new Int32Array([0]) });
  const before = outline.tiles[0]!.data.slice();
  for (const phase of [-1, 8, .5, NaN, Infinity]) assert.throws(() => outline.update(phase), RangeError);
  assert.deepEqual(outline.tiles[0]!.data, before);
});
