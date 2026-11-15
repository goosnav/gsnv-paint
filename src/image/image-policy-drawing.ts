/**
 * PURPOSE    Apply document rendering policy to geometry.
 * KIND       CORE
 * CONTRACT   paintPolicyShape(owned raster, shape operation, mode) mutates pixels
 *            and returns their changed rectangle or null. resizePolicyRaster
 *            returns an owned raster without modifying its source. Modes are
 *            pixel-art (existing exact raster rules) and smooth (coverage/bilinear).
 *            RAISES: RangeError for invalid raster, geometry, colour, mode or size.
 * GUARANTEES Deterministic, no I/O. Smooth work clips to the raster; no temporary
 *            supersampled image. Resize samples premultiplied alpha with edge clamp.
 * TUNING     COVERAGE_GRID=4 uses 16 midpoint samples per smooth shape pixel.
 *            MAX_PIXELS is shared with the image model; tool widths are 1–500.
 * DECISIONS  D1: Sample analytic geometry inside each destination pixel.
 *            Alternative: a 4× larger canvas; rejected for memory and browser
 *            differences. Revisit if: analytic ellipse coverage improves speed.
 *            D2: Clamp resize sampling at image borders. Alternative: transparent
 *            affine borders; rejected because resize must not invent edge fading.
 *            Revisit if: resizing becomes a generic transform with explicit padding.
 * LIMITS     Smooth rectangles/ellipses use inclusive endpoint boxes and inward
 *            strokes. Lines have round caps centred half a pixel from coordinates.
 *            Smooth source-over differs intentionally from legacy pixel replacement.
 * TESTBENCH  node --import tsx --test src/image/image-policy-drawing.test.ts
 * DEMO       node --import tsx src/image/image-policy-drawing.demo.ts
 */
import { createRaster, MAX_PIXELS, paintRaster, type Raster, type Rect, type RGBA } from './raster-ops.ts';
import { transformRaster } from './raster-transform.ts';
import type { ImageOperation } from './image-operation-types.ts';
type Shape = Extract<ImageOperation, { kind: 'shape' }>;
type Mode = 'pixel-art' | 'smooth';
const COVERAGE_GRID = 4;
function modeCheck(mode: Mode) { if (mode !== 'pixel-art' && mode !== 'smooth') throw new RangeError('Unknown image rendering mode.'); }
function sizeCheck(width: number, height: number) { if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new RangeError('Image dimensions exceed the pixel limit.'); }
function rasterCheck(r: Raster) {
  sizeCheck(r?.width, r?.height);
  if (!(r.data instanceof Uint8ClampedArray) || r.data.length !== r.width * r.height * 4) throw new RangeError('Incomplete image pixels.');
}
function shapeCheck(op: Shape) {
  if (op?.kind !== 'shape' || !['line', 'rectangle', 'ellipse'].includes(op.shape)) throw new RangeError('Unknown shape.');
  for (const point of [op.a, op.b]) if (!Array.isArray(point) || point.length !== 2 || !point.every(n => Number.isFinite(n) && Math.abs(n) <= 1e6)) throw new RangeError('Shape points must be finite coordinates within ±1000000.');
  if (!Number.isInteger(op.size) || op.size < 1 || op.size > 500) throw new RangeError('Shape width must be a whole number from 1 to 500.');
  for (const colour of [op.stroke, op.fill]) if (colour !== null && (!Array.isArray(colour) || colour.length !== 4 || !colour.every(n => Number.isInteger(n) && n >= 0 && n <= 255))) throw new RangeError('Shape colours must be four integer bytes.');
  if (op.shape === 'line' && op.stroke === null) throw new RangeError('A line needs a stroke colour.');
}

export function paintPolicyShape(raster: Raster, op: Shape, mode: Mode): Rect | null {
  modeCheck(mode); rasterCheck(raster); shapeCheck(op);
  if (mode === 'pixel-art') return paintRaster(raster, op.shape === 'line'
    ? { kind: 'stroke', points: [op.a, op.b], size: op.size, color: op.stroke!, tip: 'round' }
    : { kind: op.shape, a: op.a, b: op.b, size: op.size, stroke: op.stroke, fill: op.fill });
  const line = op.shape === 'line', radius = op.size / 2;
  const left = Math.min(op.a[0], op.b[0]) + (line ? .5 - radius : 0), top = Math.min(op.a[1], op.b[1]) + (line ? .5 - radius : 0);
  const right = Math.max(op.a[0], op.b[0]) + (line ? .5 + radius : 1), bottom = Math.max(op.a[1], op.b[1]) + (line ? .5 + radius : 1);
  const cx = (left + right) / 2, cy = (top + bottom) / 2, rx = (right - left) / 2, ry = (bottom - top) / 2;
  const dx = op.b[0] - op.a[0], dy = op.b[1] - op.a[1], length2 = dx * dx + dy * dy;
  const ellipse = (x: number, y: number, ex: number, ey: number) => ex > 0 && ey > 0 && ((x - cx) / ex) ** 2 + ((y - cy) / ey) ** 2 <= 1;
  function sample(x: number, y: number): 0 | 1 | 2 {
    if (line) {
      const px = x - op.a[0] - .5, py = y - op.a[1] - .5, t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length2));
      return (px - t * dx) ** 2 + (py - t * dy) ** 2 <= radius * radius ? 1 : 0;
    }
    if (x < left || x >= right || y < top || y >= bottom) return 0;
    const outer = op.shape === 'rectangle' || ellipse(x, y, rx, ry);
    if (!outer) return 0;
    const edge = op.shape === 'rectangle' ? x < left + op.size || x >= right - op.size || y < top + op.size || y >= bottom - op.size : !ellipse(x, y, rx - op.size, ry - op.size);
    return edge && op.stroke ? 1 : op.fill ? 2 : 0;
  }
  const stroke: RGBA = op.stroke ?? [0, 0, 0, 0], fill: RGBA = op.fill ?? [0, 0, 0, 0], samples = COVERAGE_GRID * COVERAGE_GRID;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(raster.height, Math.ceil(bottom)); y++) for (let x = Math.max(0, Math.floor(left)); x < Math.min(raster.width, Math.ceil(right)); x++) {
    let strokes = 0, fills = 0;
    for (let sy = 0; sy < COVERAGE_GRID; sy++) for (let sx = 0; sx < COVERAGE_GRID; sx++) {
      const value = sample(x + (sx + .5) / COVERAGE_GRID, y + (sy + .5) / COVERAGE_GRID);
      if (value === 1) strokes++; else if (value === 2) fills++;
    }
    const sa = strokes * stroke[3] / samples, fa = fills * fill[3] / samples, alpha = sa + fa;
    if (!alpha) continue;
    const i = (y * raster.width + x) * 4, d = raster.data, da = d[i + 3]! * (1 - alpha / 255), a = alpha + da;
    const result = [0, 0, 0, Math.round(a)];
    for (let c = 0; c < 3; c++) result[c] = Math.round((stroke[c]! * sa + fill[c]! * fa + d[i + c]! * da) / a);
    if (result.every((v, c) => v === d[i + c])) continue;
    d.set(result, i); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < x0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export function resizePolicyRaster(raster: Raster, width: number, height: number, mode: Mode): Raster {
  modeCheck(mode); rasterCheck(raster); sizeCheck(width, height);
  if (mode === 'pixel-art') return transformRaster(raster, { kind: 'resize', width, height });
  const out = createRaster(width, height, [0, 0, 0, 0]), src = raster.data;
  for (let y = 0; y < height; y++) {
    const v = Math.max(0, Math.min(raster.height - 1, (y + .5) * raster.height / height - .5)), y0 = Math.floor(v), y1 = Math.min(raster.height - 1, y0 + 1), fy = v - y0;
    for (let x = 0; x < width; x++) {
      const u = Math.max(0, Math.min(raster.width - 1, (x + .5) * raster.width / width - .5)), x0 = Math.floor(u), x1 = Math.min(raster.width - 1, x0 + 1), fx = u - x0;
      const i00 = (y0 * raster.width + x0) * 4, i10 = (y0 * raster.width + x1) * 4, i01 = (y1 * raster.width + x0) * 4, i11 = (y1 * raster.width + x1) * 4;
      const a00 = src[i00 + 3]! * (1 - fx) * (1 - fy), a10 = src[i10 + 3]! * fx * (1 - fy), a01 = src[i01 + 3]! * (1 - fx) * fy, a11 = src[i11 + 3]! * fx * fy, alpha = a00 + a10 + a01 + a11;
      if (!alpha) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) out.data[i + c] = Math.round((src[i00 + c]! * a00 + src[i10 + c]! * a10 + src[i01 + c]! * a01 + src[i11 + c]! * a11) / alpha);
      out.data[i + 3] = Math.round(alpha);
    }
  }
  return out;
}
