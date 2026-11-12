/**
 * PURPOSE    Apply Photoshop/GIMP-style adjustments and filters to an RGBA raster region.
 * KIND       CORE
 * CONTRACT   IN: Raster, AdjustOp and a rectangle (whole image when omitted). Mutates the raster inside the
 *            rectangle only; neighbourhood filters read from an unmodified copy. Alpha is preserved except
 *            by blur/pixelate, which average premultiplied colour so transparent edges do not darken.
 *            RAISES: RangeError for unknown operations or out-of-range parameters.
 * GUARANTEES Deterministic (noise uses a seeded hash); no DOM.
 * TUNING     Parameter ranges are documented on each operation; contrast and curves use LUTs.
 * DECISIONS  D1: Curves takes outputs at 64/128/192 and fits a monotone cubic (Fritsch–Carlson), so a
 *            numeric dialog gives smooth, non-inverting curves. Revisit if: a draggable curve editor lands.
 * LIMITS     8-bit straight alpha; selection feathering is applied afterwards by maskedMerge.
 * TESTBENCH  src/image/image-adjust.test.ts -- run with: node --import tsx --test src/image/image-adjust.test.ts
 */
import { clip, type Raster, type Rect } from './raster-ops.ts';

export type AdjustOp =
  | { kind: 'brightnessContrast'; brightness: number; contrast: number }
  | { kind: 'hueSaturation'; hue: number; saturation: number; lightness: number }
  | { kind: 'levels'; inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }
  | { kind: 'curves'; shadows: number; midtones: number; highlights: number }
  | { kind: 'colorBalance'; cyanRed: number; magentaGreen: number; yellowBlue: number }
  | { kind: 'desaturate' } | { kind: 'invert' } | { kind: 'sepia' }
  | { kind: 'posterize'; levels: number } | { kind: 'threshold'; level: number }
  | { kind: 'gaussianBlur'; radius: number } | { kind: 'unsharpMask'; amount: number; radius: number; threshold: number }
  | { kind: 'addNoise'; amount: number; monochrome: boolean; seed: number } | { kind: 'pixelate'; size: number }
  | { kind: 'findEdges' } | { kind: 'emboss' };

const range = (v: number, lo: number, hi: number, name: string) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new RangeError(`${name} must be between ${lo} and ${hi}.`); };
const lumaOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Monotone cubic through (x, y) knots, sampled to a 256-entry table. */
export function monotoneLut(points: readonly [number, number][]): Uint8ClampedArray {
  const n = points.length, xs = points.map(p => p[0]), ys = points.map(p => p[1]), d = xs.slice(1).map((x, i) => (ys[i + 1]! - ys[i]!) / (x - xs[i]!));
  const m = xs.map((_, i) => i === 0 ? d[0]! : i === n - 1 ? d[n - 2]! : d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2);
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; } const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]!; m[i + 1] = t * b * d[i]!; } }
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let k = 0; while (k < n - 2 && v > xs[k + 1]!) k++;
    const h = xs[k + 1]! - xs[k]!, t = (v - xs[k]!) / h, t2 = t * t, t3 = t2 * t;
    lut[v] = Math.round((2 * t3 - 3 * t2 + 1) * ys[k]! + (t3 - 2 * t2 + t) * h * m[k]! + (-2 * t3 + 3 * t2) * ys[k + 1]! + (t3 - t2) * h * m[k + 1]!);
  }
  return lut;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2; if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const hash = (x: number, y: number, seed: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/** Premultiplied box blur (three passes ≈ Gaussian) of the whole raster into a new RGBA array. */
export function blurRaster(raster: Raster, radius: number): Float32Array {
  const { width: w, height: h, data } = raster, n = w * h, planes = [0, 1, 2, 3].map(c => { const p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = c === 3 ? data[i * 4 + 3]! : data[i * 4 + c]! * data[i * 4 + 3]! / 255; return p; });
  const r = Math.max(1, Math.round(radius / 1.7)), tmp = new Float32Array(n);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const lines = horizontal ? h : w, length = horizontal ? w : h, stride = horizontal ? 1 : w, last = length - 1, norm = 1 / (2 * r + 1);
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * w : line; let sum = 0;
      for (let k = -r; k <= r; k++) sum += from[base + Math.min(last, Math.max(0, k)) * stride]!;
      for (let i = 0; i < length; i++) { to[base + i * stride] = sum * norm; sum += from[base + Math.min(last, i + r + 1) * stride]! - from[base + Math.max(0, i - r) * stride]!; }
    }
  };
  for (const p of planes) for (let k = 0; k < 3; k++) { pass(p, tmp, true); pass(tmp, p, false); }
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const a = planes[3]![i]!; out[i * 4 + 3] = a; for (let c = 0; c < 3; c++) out[i * 4 + c] = a > 0 ? planes[c]![i]! * 255 / a : 0; }
  return out;
}

export function adjustRaster(raster: Raster, op: AdjustOp, area?: Rect): void {
  const rect = clip(area ?? { x: 0, y: 0, width: raster.width, height: raster.height }, raster), { width: w, data } = raster;
  const each = (fn: (i: number, x: number, y: number) => void) => { for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) fn((y * w + x) * 4, x, y); };
  const lut = (table: Uint8ClampedArray | ((v: number, c: number) => number)) => each(i => { for (let c = 0; c < 3; c++) data[i + c] = typeof table === 'function' ? table(data[i + c]!, c) : table[data[i + c]!]!; });
  switch (op.kind) {
    case 'brightnessContrast': {
      range(op.brightness, -100, 100, 'Brightness'); range(op.contrast, -100, 100, 'Contrast');
      const f = op.contrast >= 0 ? 1 / Math.max(0.01, 1 - op.contrast / 100 * 0.99) : 1 + op.contrast / 100;
      return lut(Uint8ClampedArray.from({ length: 256 }, (_, v) => Math.round((v - 127.5) * f + 127.5 + op.brightness * 1.275)));
    }
    case 'hueSaturation': {
      range(op.hue, -180, 180, 'Hue'); range(op.saturation, -100, 100, 'Saturation'); range(op.lightness, -100, 100, 'Lightness');
      return each(i => {
        let [h, s, l] = rgbToHsl(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255);
        h = (h + op.hue / 360 + 1) % 1; s = Math.min(1, s * (1 + op.saturation / 100)); l = op.lightness >= 0 ? l + (1 - l) * op.lightness / 100 : l * (1 + op.lightness / 100);
        const rgb = hslToRgb(h, s, l); for (let c = 0; c < 3; c++) data[i + c] = Math.round(rgb[c]! * 255);
      });
    }
    case 'levels': {
      range(op.inBlack, 0, 254, 'Input black'); range(op.inWhite, op.inBlack + 1, 255, 'Input white'); range(op.gamma, 0.1, 10, 'Gamma'); range(op.outBlack, 0, 255, 'Output black'); range(op.outWhite, 0, 255, 'Output white');
      return lut(Uint8ClampedArray.from({ length: 256 }, (_, v) => Math.round(op.outBlack + (op.outWhite - op.outBlack) * Math.min(1, Math.max(0, (v - op.inBlack) / (op.inWhite - op.inBlack))) ** (1 / op.gamma))));
    }
    case 'curves': for (const [v, n] of [[op.shadows, 'Shadows'], [op.midtones, 'Midtones'], [op.highlights, 'Highlights']] as const) range(v, 0, 255, n);
      return lut(monotoneLut([[0, 0], [64, op.shadows], [128, op.midtones], [192, op.highlights], [255, 255]]));
    case 'colorBalance': for (const v of [op.cyanRed, op.magentaGreen, op.yellowBlue]) range(v, -100, 100, 'Colour balance');
      return each(i => { const l = lumaOf(data[i]!, data[i + 1]!, data[i + 2]!) / 255, wgt = 1 - Math.abs(2 * l - 1) ** 2, shifts = [op.cyanRed, op.magentaGreen, op.yellowBlue]; for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c]! + shifts[c]! * 0.6 * wgt); });
    case 'desaturate': return each(i => { const l = Math.round(lumaOf(data[i]!, data[i + 1]!, data[i + 2]!)); data[i] = data[i + 1] = data[i + 2] = l; });
    case 'invert': return lut((v: number) => 255 - v);
    case 'sepia': return each(i => { const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!; data[i] = Math.round(0.393 * r + 0.769 * g + 0.189 * b); data[i + 1] = Math.round(0.349 * r + 0.686 * g + 0.168 * b); data[i + 2] = Math.round(0.272 * r + 0.534 * g + 0.131 * b); });
    case 'posterize': { range(op.levels, 2, 64, 'Levels'); const k = op.levels - 1; return lut((v: number) => Math.round(Math.round(v / 255 * k) / k * 255)); }
    case 'threshold': range(op.level, 0, 255, 'Threshold'); return each(i => { const v = Math.round(lumaOf(data[i]!, data[i + 1]!, data[i + 2]!)) >= op.level ? 255 : 0; data[i] = data[i + 1] = data[i + 2] = v; });
    case 'addNoise': range(op.amount, 0, 100, 'Amount');
      return each((i, x, y) => { const mono = (hash(x, y, op.seed) - 0.5) * op.amount * 2.55; for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c]! + (op.monochrome ? mono : (hash(x, y, op.seed + c + 1) - 0.5) * op.amount * 2.55)); });
    case 'pixelate': {
      range(op.size, 2, 256, 'Cell size'); const s = Math.round(op.size), source = data.slice();
      for (let cy = rect.y; cy < rect.y + rect.height; cy += s) for (let cx = rect.x; cx < rect.x + rect.width; cx += s) {
        const x1 = Math.min(rect.x + rect.width, cx + s), y1 = Math.min(rect.y + rect.height, cy + s), sum = [0, 0, 0, 0]; let n = 0;
        for (let y = cy; y < y1; y++) for (let x = cx; x < x1; x++) { const i = (y * w + x) * 4, a = source[i + 3]!; sum[0]! += source[i]! * a; sum[1]! += source[i + 1]! * a; sum[2]! += source[i + 2]! * a; sum[3]! += a; n++; }
        const px = sum[3] ? [sum[0]! / sum[3]!, sum[1]! / sum[3]!, sum[2]! / sum[3]!, sum[3]! / n] : [0, 0, 0, 0];
        for (let y = cy; y < y1; y++) for (let x = cx; x < x1; x++) { const i = (y * w + x) * 4; for (let c = 0; c < 4; c++) data[i + c] = Math.round(px[c]!); }
      }
      return;
    }
    case 'gaussianBlur': { range(op.radius, 0.5, 100, 'Radius'); const blurred = blurRaster(raster, op.radius); return each(i => { for (let c = 0; c < 4; c++) data[i + c] = Math.round(blurred[i + c]!); }); }
    case 'unsharpMask': {
      range(op.amount, 0, 500, 'Amount'); range(op.radius, 0.5, 50, 'Radius'); range(op.threshold, 0, 255, 'Threshold');
      const blurred = blurRaster(raster, op.radius), k = op.amount / 100;
      return each(i => { for (let c = 0; c < 3; c++) { const diff = data[i + c]! - blurred[i + c]!; if (Math.abs(diff) * 2 >= op.threshold) data[i + c] = Math.round(data[i + c]! + diff * k); } });
    }
    case 'findEdges': case 'emboss': {
      const source = data.slice(), h = raster.height, at = (x: number, y: number, c: number) => source[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4 + c]!;
      return each((i, x, y) => {
        for (let c = 0; c < 3; c++) {
          if (op.kind === 'emboss') { data[i + c] = Math.round(128 + at(x + 1, y + 1, c) - at(x - 1, y - 1, c)); continue; }
          const gx = at(x + 1, y - 1, c) + 2 * at(x + 1, y, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x - 1, y, c) - at(x - 1, y + 1, c);
          const gy = at(x - 1, y + 1, c) + 2 * at(x, y + 1, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x, y - 1, c) - at(x + 1, y - 1, c);
          data[i + c] = Math.round(255 - Math.min(255, Math.hypot(gx, gy) / 4));
        }
        if (op.kind === 'emboss') { const l = Math.round(lumaOf(data[i]!, data[i + 1]!, data[i + 2]!)); data[i] = data[i + 1] = data[i + 2] = l; }
      });
    }
    default: throw new RangeError('Unknown adjustment.');
  }
}
