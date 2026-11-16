/**
 * PURPOSE    Draw binary brush coverage on a document-aligned pixel grid.
 * KIND       CORE
 * CONTRACT   IN: matching Coverage, nonempty finite points, integer size 1–500,
 *            pixelSize 1–32 and round/square tip. OUT: writes 1 to covered cells;
 *            returns their clipped dirty bounds or null. RAISES: RangeError for
 *            invalid input before any writes. Size is canvas pixels, rounded to
 *            a whole number of grid cells, minimum one.
 * GUARANTEES No antialiasing, DOM, color decisions, allocation of image buffers
 *            or writes outside the dirty bounds. Distant segments are clipped
 *            before traversal; each logical pixel fills its whole clipped block.
 * TUNING     MAX_SIZE, MAX_PIXEL_SIZE, MAX_COORD bound interaction inputs.
 * DECISIONS  D1: Accumulate binary coverage for the existing opacity/selection
 *            pipeline. Alternative: quantize the entire image, which damages existing art.
 *            Revisit if:
 *            editable resolution-independent strokes become a requirement.
 * LIMITS     Round/square tips only; existing fractional coverage is untouched
 *            outside the stroke. No pressure, softness, flow or pixel colors.
 * TESTBENCH  src/image/pixel-stroke.test.ts — node --import tsx --test src/image/pixel-stroke.test.ts
 */
import { isRasterSize, type Rect } from './raster-ops.ts';
import type { Coverage } from './image-brush.ts';
type Point = readonly [number, number];
const MAX_SIZE = 500, MAX_PIXEL_SIZE = 32, MAX_COORD = 1e9;
export function pixelStroke({ cov, points, size, pixelSize, tip }: { cov: Coverage; points: readonly Point[]; size: number; pixelSize: number; tip: 'round' | 'square' }): Rect | null {
  if (!cov || !isRasterSize(cov.width, cov.height) || !(cov.data instanceof Float32Array) || cov.data.length !== cov.width * cov.height
    || !Number.isInteger(size) || size < 1 || size > MAX_SIZE || !Number.isInteger(pixelSize) || pixelSize < 1 || pixelSize > MAX_PIXEL_SIZE || !['round', 'square'].includes(tip)
    || !Array.isArray(points) || !points.length || !points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && Math.abs(v) <= MAX_COORD))) throw new RangeError('Invalid hard-pixel stroke.');
  const n = Math.max(1, Math.round(size / pixelSize)), start = -Math.floor((n - 1) / 2), center = (n - 1) / 2, radius2 = (n / 2) ** 2;
  const width = Math.ceil(cov.width / pixelSize), height = Math.ceil(cov.height / pixelSize), offsets: Point[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (tip === 'square' || (x - center) ** 2 + (y - center) ** 2 <= radius2) offsets.push([x + start, y + start]);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const stamp = (cx: number, cy: number) => {
    for (const [dx, dy] of offsets) {
      const x = (cx + dx) * pixelSize, y = (cy + dy) * pixelSize, left = Math.max(0, x), top = Math.max(0, y), right = Math.min(cov.width, x + pixelSize), bottom = Math.min(cov.height, y + pixelSize);
      if (left >= right || top >= bottom) continue;
      for (let row = top; row < bottom; row++) cov.data.fill(1, row * cov.width + left, row * cov.width + right);
      x0 = Math.min(x0, left); y0 = Math.min(y0, top); x1 = Math.max(x1, right); y1 = Math.max(y1, bottom);
    }
  };
  const cells = points.map(p => [Math.floor(p[0] / pixelSize), Math.floor(p[1] / pixelSize)] as const);
  stamp(...cells[0]!);
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1]!, b = cells[k]!, dx = b[0] - a[0], dy = b[1] - a[1], steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (!steps) continue;
    let lo = 0, hi = 1;
    for (const [from, delta, limit] of [[a[0], dx, width], [a[1], dy, height]]) {
      if (!delta) { if (from! < -n || from! > limit! + n) hi = -1; }
      else { const t0 = (-n - from!) / delta!, t1 = (limit! + n - from!) / delta!; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
    }
    for (let s = Math.max(1, Math.ceil(lo * steps)); s <= Math.floor(hi * steps); s++) stamp(Math.round(a[0] + dx * s / steps), Math.round(a[1] + dy * s / steps));
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
