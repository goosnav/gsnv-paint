/**
 * PURPOSE    Cache small pixel tiles for animated selection outlines.
 * KIND       CORE
 * CONTRACT   IN: valid raster dimensions and owned Int32 edge indices; update phase 0–7.
 *            OUT: stable RGBA tiles positioned in document pixels, initially at phase 0.
 *            RAISES: RangeError for invalid dimensions, edge buffers/indices or phase.
 * GUARANTEES Exact black/white marching-ant pixels; all other tile pixels transparent.
 *            Input edges are never modified or retained. No DOM or full-image allocation.
 * TUNING     Tiles are at most 64×64 pixels and exist only where an edge occurs.
 * DECISIONS  D1: Reuse edge tiles and buffers across animation frames. Alternative:
 *            a full-canvas ImageData per frame wastes memory on large sparse outlines.
 *            Revisit if the overlay becomes a viewport-sized vector renderer.
 * LIMITS     Caller clears the previous overlay and blits these tiles; not a selection mask.
 *            Returned pixel buffers are mutable cache storage, not history snapshots.
 * TESTBENCH  node --import tsx --test src/image/image-selection-outline.test.ts
 */
import { isRasterSize } from './raster-ops.ts';

export type SelectionOutlineTile = Readonly<{
  x: number; y: number; width: number; height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}>;
export type SelectionOutline = Readonly<{
  tiles: readonly SelectionOutlineTile[];
  update(phase: number): readonly SelectionOutlineTile[];
}>;
const TILE_SIZE = 64;

export function createSelectionOutline({ width, height, edges }: {
  width: number; height: number; edges: Int32Array;
}): SelectionOutline {
  if (!isRasterSize(width, height)) throw new RangeError('Selection outline dimensions must match a valid Image document.');
  if (!(edges instanceof Int32Array) || !(edges.buffer instanceof ArrayBuffer)) throw new RangeError('Selection edges must be ordinary Int32 pixel indices.');
  try { new Uint8Array(edges.buffer, 0, 0); } catch { throw new RangeError('Selection edges must not be detached.'); }
  const groups = new Map<number, { x: number; y: number; width: number; height: number; count: number }>();
  const columns = Math.ceil(width / TILE_SIZE);
  for (const p of edges) {
    if (p < 0 || p >= width * height) throw new RangeError('A selection edge is outside the Image document.');
    const x = p % width, y = (p - x) / width, column = Math.floor(x / TILE_SIZE), row = Math.floor(y / TILE_SIZE), key = row * columns + column;
    let group = groups.get(key);
    if (!group) {
      const left = column * TILE_SIZE, top = row * TILE_SIZE;
      group = { x: left, y: top, width: Math.min(TILE_SIZE, width - left), height: Math.min(TILE_SIZE, height - top), count: 0 };
      groups.set(key, group);
    }
    group.count++;
  }
  const entries = [...groups.values()].sort((a, b) => a.y - b.y || a.x - b.x).map(({ count, ...bounds }) => {
    const data = new Uint8ClampedArray(bounds.width * bounds.height * 4);
    return { tile: Object.freeze({ ...bounds, data }), positions: new Uint16Array(count), next: 0 };
  });
  const byPosition = new Map(entries.map(entry => [entry.tile.y / TILE_SIZE * columns + entry.tile.x / TILE_SIZE, entry]));
  // Two passes avoid a temporary JavaScript number array for every edge pixel.
  for (const p of edges) {
    const x = p % width, y = (p - x) / width;
    const entry = byPosition.get(Math.floor(y / TILE_SIZE) * columns + Math.floor(x / TILE_SIZE))!;
    entry.positions[entry.next++] = (y - entry.tile.y) * entry.tile.width + x - entry.tile.x;
  }
  const tiles = Object.freeze(entries.map(entry => entry.tile));
  function update(phase: number): readonly SelectionOutlineTile[] {
    if (!Number.isInteger(phase) || phase < 0 || phase > 7) throw new RangeError('Selection outline phase must be an integer from 0 to 7.');
    for (const { tile, positions } of entries) for (const p of positions) {
      const x = p % tile.width, y = (p - x) / tile.width, value = (((tile.x + x + tile.y + y + phase) >> 2) & 1) ? 255 : 0, i = p * 4;
      tile.data[i] = tile.data[i + 1] = tile.data[i + 2] = value; tile.data[i + 3] = 255;
    }
    return tiles;
  }
  update(0);
  return Object.freeze({ tiles, update });
}
