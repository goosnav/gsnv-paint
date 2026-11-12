/**
 * PURPOSE    Soft-brush strokes, gradient fills and mask-based selections for the Image workspace.
 * KIND       CORE
 * CONTRACT   Brushes accumulate per-stroke coverage (0…1, image-sized Float32Array) with dab(); applyCoverage()
 *            then writes base→result for the dirty rectangle by mode: paint (source-over colour), erase (to
 *            transparent), clone (from an offset source), filter (towards a pre-filtered copy, used by blur/
 *            sharpen brushes). Stroke opacity caps the total, like Photoshop's opacity vs flow.
 *            Masks are Uint8Array (0 or 255 per pixel): rectangle, ellipse, polygon (lasso), magic wand
 *            (tolerance, contiguous or global), combined by replace/add/subtract/intersect.
 *            RAISES: RangeError for invalid sizes, colours or parameters.
 * GUARANTEES Deterministic (spray uses a seeded generator); only declared outputs are mutated.
 * TUNING     DAB_SPACING=0.15 of brush size; hardness 0…1 sets the solid core radius.
 * DECISIONS  D1: Coverage buffer plus a base copy per stroke rather than painting dabs directly, so
 *            overlapping dabs never exceed the stroke opacity and the selection mask can be applied once.
 * LIMITS     Round brushes only; pressure scales size and flow linearly when supplied.
 * TESTBENCH  src/image/image-brush.test.ts -- run with: node --import tsx --test src/image/image-brush.test.ts
 */
import type { Raster, Rect, RGBA } from './raster-ops.ts';

export const DAB_SPACING = 0.15;
export type Coverage = { width: number; height: number; data: Float32Array };
type P = readonly [number, number];
const union = (a: Rect | null, b: Rect): Rect => !a ? b : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) };

/** Adds one round dab; returns its clipped bounds or null when off-image. */
export function dab(cov: Coverage, x: number, y: number, size: number, hardness: number, flow: number): Rect | null {
  if (!(size > 0) || !(hardness >= 0 && hardness <= 1) || !(flow >= 0 && flow <= 1) || !Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Invalid brush dab.');
  const r = size / 2, x0 = Math.max(0, Math.floor(x - r)), y0 = Math.max(0, Math.floor(y - r)), x1 = Math.min(cov.width - 1, Math.ceil(x + r)), y1 = Math.min(cov.height - 1, Math.ceil(y + r));
  if (x1 < x0 || y1 < y0) return null;
  const core = Math.min(hardness, 0.999), soft = r < 1.5;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = Math.hypot(px + 0.5 - x, py + 0.5 - y) / r;
    // Hard brushes still get a one-pixel antialiased rim; small brushes use area coverage.
    let a = d <= core ? 1 : d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (d - core) / (1 - core));
    if (hardness >= 0.999 || soft) a = Math.min(1, Math.max(0, (r - Math.hypot(px + 0.5 - x, py + 0.5 - y)) + 0.5));
    if (a <= 0) continue;
    const i = py * cov.width + px; cov.data[i] = cov.data[i]! + (1 - cov.data[i]!) * a * flow;
  }
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Dabs evenly spaced from a to b (excluding a), returns the union of dirty rectangles. */
export function dabLine(cov: Coverage, a: P, b: P, size: number, hardness: number, flow: number, carry = 0): { rect: Rect | null; carry: number } {
  const spacing = Math.max(1, size * DAB_SPACING), length = Math.hypot(b[0] - a[0], b[1] - a[1]); let rect: Rect | null = null, t = spacing - carry;
  if (length === 0) { const r = dab(cov, b[0], b[1], size, hardness, flow); return { rect: r, carry: 0 }; }
  for (; t <= length; t += spacing) { const r = dab(cov, a[0] + (b[0] - a[0]) * t / length, a[1] + (b[1] - a[1]) * t / length, size, hardness, flow); if (r) rect = union(rect, r); }
  return { rect, carry: length - (t - spacing) };
}

/** Deterministic spray: `count` single-pixel dots within `radius` of (x, y). */
export function spray(cov: Coverage, x: number, y: number, radius: number, count: number, seed: number): Rect | null {
  let s = seed >>> 0 || 1, rect: Rect | null = null; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let k = 0; k < count; k++) { const angle = rnd() * Math.PI * 2, dist = Math.sqrt(rnd()) * radius, r = dab(cov, x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 1.2, 1, 0.8); if (r) rect = union(rect, r); }
  return rect;
}

export type CoverageMode = { kind: 'paint'; color: RGBA } | { kind: 'erase' } | { kind: 'clone'; source: Uint8ClampedArray; dx: number; dy: number } | { kind: 'filter'; filtered: Float32Array | Uint8ClampedArray };
/** result = base blended by coverage × opacity, for the rectangle only. */
export function applyCoverage({ raster, base, cov, rect, mode, opacity }: { raster: Raster; base: Uint8ClampedArray; cov: Coverage; rect: Rect; mode: CoverageMode; opacity: number }) {
  if (base.length !== raster.data.length || cov.data.length !== raster.width * raster.height || !(opacity >= 0 && opacity <= 1)) throw new RangeError('Coverage, base and raster must match.');
  const { width: w, height: h, data } = raster, x1 = Math.min(w, rect.x + rect.width), y1 = Math.min(h, rect.y + rect.height);
  for (let y = Math.max(0, rect.y); y < y1; y++) for (let x = Math.max(0, rect.x); x < x1; x++) {
    const p = y * w + x, i = p * 4, t = cov.data[p]! * opacity;
    if (t <= 0) { data[i] = base[i]!; data[i + 1] = base[i + 1]!; data[i + 2] = base[i + 2]!; data[i + 3] = base[i + 3]!; continue; }
    if (mode.kind === 'erase') { data[i] = base[i]!; data[i + 1] = base[i + 1]!; data[i + 2] = base[i + 2]!; data[i + 3] = Math.round(base[i + 3]! * (1 - t)); continue; }
    let src: ArrayLike<number> = mode.kind === 'paint' ? mode.color : mode.kind === 'filter' ? [mode.filtered[i]!, mode.filtered[i + 1]!, mode.filtered[i + 2]!, mode.filtered[i + 3]!] : [0, 0, 0, 0];
    if (mode.kind === 'clone') { const sx = x + mode.dx, sy = y + mode.dy; if (sx < 0 || sy < 0 || sx >= w || sy >= h) { data[i] = base[i]!; data[i + 1] = base[i + 1]!; data[i + 2] = base[i + 2]!; data[i + 3] = base[i + 3]!; continue; } const j = (sy * w + sx) * 4; src = [mode.source[j]!, mode.source[j + 1]!, mode.source[j + 2]!, mode.source[j + 3]!]; }
    if (mode.kind === 'filter' || mode.kind === 'clone') { for (let c = 0; c < 4; c++) data[i + c] = Math.round(base[i + c]! + (src[c]! - base[i + c]!) * t); continue; }
    const sa = src[3]! / 255 * t, ba = base[i + 3]! / 255, a = sa + ba * (1 - sa);
    for (let c = 0; c < 3; c++) data[i + c] = a > 0 ? Math.round((src[c]! * sa + base[i + c]! * ba * (1 - sa)) / a) : 0;
    data[i + 3] = Math.round(a * 255);
  }
}

/** Linear or radial gradient from colour a (at p0) to colour b (at p1), source-over onto the raster. */
export function gradientFill(raster: Raster, p0: P, p1: P, shape: 'linear' | 'radial', a: RGBA, b: RGBA): Rect {
  const { width: w, height: h, data } = raster, dx = p1[0] - p0[0], dy = p1[1] - p0[1], len2 = dx * dx + dy * dy || 1, len = Math.sqrt(len2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5 - p0[0], py = y + 0.5 - p0[1], t = Math.min(1, Math.max(0, shape === 'linear' ? (px * dx + py * dy) / len2 : Math.hypot(px, py) / len));
    const src = [0, 1, 2, 3].map(c => a[c]! + (b[c]! - a[c]!) * t), i = (y * w + x) * 4, sa = src[3]! / 255, ba = data[i + 3]! / 255, oa = sa + ba * (1 - sa);
    for (let c = 0; c < 3; c++) data[i + c] = oa > 0 ? Math.round((src[c]! * sa + data[i + c]! * ba * (1 - sa)) / oa) : 0;
    data[i + 3] = Math.round(oa * 255);
  }
  return { x: 0, y: 0, width: w, height: h };
}

export type MaskShape = { kind: 'rectangle' | 'ellipse'; a: P; b: P } | { kind: 'polygon'; points: readonly P[] };
export function shapeMask(width: number, height: number, shape: MaskShape): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (shape.kind === 'polygon') {
    const pts = shape.points; if (pts.length < 3) return mask;
    for (let y = 0; y < height; y++) {
      const cy = y + 0.5, xs: number[] = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [ax, ay] = pts[i]!, [bx, by] = pts[j]!; if ((ay > cy) !== (by > cy)) xs.push(ax + (cy - ay) * (bx - ax) / (by - ay)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k]! - 0.5)); x < Math.min(width, Math.ceil(xs[k + 1]! - 0.5)); x++) mask[y * width + x] = 255;
    }
    return mask;
  }
  const x0 = Math.floor(Math.min(shape.a[0], shape.b[0])), y0 = Math.floor(Math.min(shape.a[1], shape.b[1])), x1 = Math.floor(Math.max(shape.a[0], shape.b[0])), y1 = Math.floor(Math.max(shape.a[1], shape.b[1]));
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
  for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++)
    if (shape.kind === 'rectangle' || ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) mask[y * width + x] = 255;
  return mask;
}

/** Pixels whose RGBA distance to the seed is within tolerance (0…255), contiguous (4-connected) or global. */
export function magicWand(raster: Raster, x: number, y: number, tolerance: number, contiguous: boolean): Uint8Array {
  const { width: w, height: h, data } = raster, mask = new Uint8Array(w * h), sx = Math.floor(x), sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return mask;
  const s = (sy * w + sx) * 4, seed = [data[s]!, data[s + 1]!, data[s + 2]!, data[s + 3]!];
  const near = (p: number) => { const i = p * 4; return Math.max(Math.abs(data[i]! - seed[0]!), Math.abs(data[i + 1]! - seed[1]!), Math.abs(data[i + 2]! - seed[2]!), Math.abs(data[i + 3]! - seed[3]!)) <= tolerance; };
  if (!contiguous) { for (let p = 0; p < w * h; p++) if (near(p)) mask[p] = 255; return mask; }
  const stack = [sy * w + sx]; mask[sy * w + sx] = 255;
  while (stack.length) {
    const p = stack.pop()!, px = p % w, py = (p - px) / w;
    for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, py > 0 ? p - w : -1, py < h - 1 ? p + w : -1]) if (q >= 0 && !mask[q] && near(q)) { mask[q] = 255; stack.push(q); }
  }
  return mask;
}

export function combineMasks(current: Uint8Array | null, next: Uint8Array, mode: 'replace' | 'add' | 'subtract' | 'intersect'): Uint8Array {
  if (mode === 'replace' || !current) return mode === 'subtract' ? new Uint8Array(next.length) : mode === 'intersect' ? new Uint8Array(next.length) : next;
  const out = new Uint8Array(next.length);
  for (let i = 0; i < out.length; i++) out[i] = mode === 'add' ? Math.max(current[i]!, next[i]!) : mode === 'subtract' ? Math.min(current[i]!, 255 - next[i]!) : Math.min(current[i]!, next[i]!);
  return out;
}

export function maskBounds(mask: Uint8Array, width: number): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let p = 0; p < mask.length; p++) if (mask[p]) { const x = p % width, y = (p - x) / width; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
