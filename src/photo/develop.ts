/**
 * PURPOSE    Render a photo from scene-linear RGB through the non-destructive develop settings.
 * KIND       CORE
 * CONTRACT   IN: {image:{width,height,data:Float32Array linear sRGB, 3 channels}, settings, kind, ignoreCrop?}.
 *            kind 'raw' applies the filmic base curve to scene-referred data; 'display' (JPEG/PNG) keeps
 *            the encoded look as its base. Radii scale with image size, so a preview proxy and the
 *            full-resolution export look the same.
 *            OUT: {width,height,rgba:Uint8ClampedArray, histogram:Uint32Array(4*256) r,g,b,luma}.
 *            RAISES: RangeError for malformed images; settings must already be validated (C develop-settings).
 * GUARANTEES Pure and deterministic (grain uses a coordinate hash); never mutates the input unless
 *            consume=true (full-resolution export reuses the buffer to halve peak memory).
 * TUNING     Stage constants are named below; MID_GREY=0.18 is the exposure pivot.
 * DECISIONS  D1: Tone sliders act on log2 luminance relative to mid-grey with smooth masks blended
 *            50/50 with a large-radius blur (local tone mapping without strong halos). Alternative:
 *            a single global curve; rejected because highlight/shadow recovery then flattens contrast.
 *            D2: Colour work happens in an opponent space (luma, a, b) so hue rotation, saturation and
 *            colour noise reduction never shift brightness. Revisit if: a wide-gamut working space is required.
 * LIMITS     sRGB working gamut; global adjustments only; bilinear resampling for straighten/crop.
 * TESTBENCH  src/photo/develop.test.ts -- run with: node --import tsx --test src/photo/develop.test.ts
 */
import type { DevelopSettings } from './develop-settings.ts';

export type LinearImage = { width: number; height: number; data: Float32Array };
export type DevelopRequest = { image: LinearImage; settings: DevelopSettings; kind: 'raw' | 'display'; ignoreCrop?: boolean; consume?: boolean };
export type DevelopResult = { width: number; height: number; rgba: Uint8ClampedArray; histogram: Uint32Array };

const MID_GREY = 0.18;
const TABLE = 8192;
const LUMA = [0.2126, 0.7152, 0.0722] as const;
const BAND_CENTERS = [0, 30, 60, 120, 180, 240, 270, 300];
const BAND_OF = Uint8Array.from({ length: 360 }, (_, h) => { let k = 7; for (let j = 0; j < 8; j++) if (h >= BAND_CENTERS[j]!) k = j; return k; });
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const toLinear = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
export const toDisplay = (v: number) => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
const aces = (x: number) => Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
// Scene exposure into the filmic curve so mid-grey 0.18 renders at display-linear 0.2 (sRGB ≈ 0.48).
const FILMIC_SCALE = (() => { let lo = 0.1, hi = 10; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (aces(MID_GREY * m) < 0.2) lo = m; else hi = m; } return (lo + hi) / 2; })();
// Opponent space: y = luma, a = r − (g+b)/2, b = (g − b)·√3/2, and its inverse.
const OPP = [[LUMA[0], LUMA[1], LUMA[2]], [1, -0.5, -0.5], [0, Math.sqrt(3) / 2, -Math.sqrt(3) / 2]];
const INV = (() => {
  const m = OPP, det = m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const c = (r: number, k: number) => { const rows = [0, 1, 2].filter(i => i !== k), cols = [0, 1, 2].filter(i => i !== r); const v = m[rows[0]!]![cols[0]!]! * m[rows[1]!]![cols[1]!]! - m[rows[0]!]![cols[1]!]! * m[rows[1]!]![cols[0]!]!; return ((r + k) % 2 ? -v : v) / det; };
  return [0, 1, 2].map(r => [0, 1, 2].map(k => c(r, k)));
})();

/** Three-pass separable box blur ≈ Gaussian; returns a new plane. Radii above 6 px run on a downsampled copy. */
export function blur(plane: Float32Array, width: number, height: number, radius: number): Float32Array {
  const r = Math.round(radius);
  if (r < 1) return plane.slice();
  const f = r > 6 ? Math.min(Math.floor(r / 3), Math.floor(Math.min(width, height) / 4)) : 1;
  if (f >= 2) {
    const w = Math.ceil(width / f), h = Math.ceil(height / f), small = new Float32Array(w * h), count = new Float32Array(w * h);
    for (let y = 0; y < height; y++) { const row = Math.floor(y / f) * w; for (let x = 0; x < width; x++) { const k = row + Math.floor(x / f); small[k] = small[k]! + plane[y * width + x]!; count[k] = count[k]! + 1; } }
    for (let k = 0; k < small.length; k++) small[k] = small[k]! / count[k]!;
    const blurred = boxBlur(small, w, h, Math.max(1, Math.round(r / f))), out = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / f - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < width; x++) {
        const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
        out[y * width + x] = (blurred[y0 * w + x0]! * (1 - tx) + blurred[y0 * w + x1]! * tx) * (1 - ty) + (blurred[y1 * w + x0]! * (1 - tx) + blurred[y1 * w + x1]! * tx) * ty;
      }
    }
    return out;
  }
  return boxBlur(plane, width, height, r);
}
function boxBlur(plane: Float32Array, width: number, height: number, r: number): Float32Array {
  const src = plane.slice(), tmp = new Float32Array(plane.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const lines = horizontal ? height : width, length = horizontal ? width : height, stride = horizontal ? 1 : width, norm = 1 / (2 * r + 1), last = length - 1;
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * width : line, first = from[base]!, end = from[base + last * stride]!;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += from[base + (k < 0 ? 0 : k > last ? last : k) * stride]!;
      for (let i = 0; i < length; i++) {
        to[base + i * stride] = sum * norm;
        const add = i + r + 1, remove = i - r;
        sum += (add > last ? end : from[base + add * stride]!) - (remove < 0 ? first : from[base + remove * stride]!);
      }
    }
  };
  for (let n = 0; n < 3; n++) { pass(src, tmp, true); pass(tmp, src, false); }
  return src;
}

/** Orientation, straighten (auto-zoomed so no empty corners) and crop, bilinear. */
function geometry(image: LinearImage, s: DevelopSettings, ignoreCrop: boolean, consume: boolean): LinearImage {
  const { width: w, height: h, data } = image, swap = s.quarterTurns % 2 === 1;
  const W0 = swap ? h : w, H0 = swap ? w : h;
  const crop = ignoreCrop ? { x: 0, y: 0, width: 1, height: 1 } : s.crop;
  const W = Math.max(1, Math.round(crop.width * W0)), H = Math.max(1, Math.round(crop.height * H0));
  const theta = s.straighten * Math.PI / 180, cos = Math.cos(theta), sin = Math.sin(theta);
  const zoom = theta ? Math.max(Math.abs(cos) + Math.abs(sin) * H0 / W0, Math.abs(cos) + Math.abs(sin) * W0 / H0) : 1;
  if (!theta && !s.flip && !s.quarterTurns && W === w && H === h) return consume ? image : { width: w, height: h, data: data.slice() };
  const out = new Float32Array(W * H * 3), cx = W0 / 2, cy = H0 / 2;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    // Oriented-frame position, then undo straighten around the frame centre.
    const px = crop.x * W0 + u + 0.5 - cx, py = crop.y * H0 + v + 0.5 - cy;
    let ox = (cos * px + sin * py) / zoom + cx, oy = (-sin * px + cos * py) / zoom + cy;
    if (s.flip) ox = W0 - ox;
    // Oriented → source coordinates for the quarter turn (clockwise turns).
    let sx = ox, sy = oy;
    if (s.quarterTurns === 1) { sx = oy; sy = h - ox; } else if (s.quarterTurns === 2) { sx = w - ox; sy = h - oy; } else if (s.quarterTurns === 3) { sx = w - oy; sy = ox; }
    const fx = Math.min(w - 1, Math.max(0, sx - 0.5)), fy = Math.min(h - 1, Math.max(0, sy - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    for (let c = 0; c < 3; c++) {
      const a = data[(y0 * w + x0) * 3 + c]!, b = data[(y0 * w + x1) * 3 + c]!, d = data[(y1 * w + x0) * 3 + c]!, e = data[(y1 * w + x1) * 3 + c]!;
      out[(v * W + u) * 3 + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
    }
  }
  return { width: W, height: H, data: out };
}

function curveLut(s: DevelopSettings): Float32Array {
  const lut = new Float32Array(1025), bump = (x: number, c: number) => Math.max(0, 1 - Math.abs(x - c) / 0.25);
  let previous = 0;
  for (let i = 0; i <= 1024; i++) {
    const x = i / 1024, y = x + 0.12 * (s.curveShadows / 100 * bump(x, 0.125) + s.curveDarks / 100 * bump(x, 0.375) + s.curveLights / 100 * bump(x, 0.625) + s.curveHighlights / 100 * bump(x, 0.875)) * Math.sin(Math.PI * x) ** 0.5;
    previous = Math.max(previous, Math.min(1, Math.max(0, y))); lut[i] = previous;
  }
  return lut;
}
const hash = (x: number, y: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

export function develop({ image, settings: s, kind, ignoreCrop = false, consume = false }: DevelopRequest): DevelopResult {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || !(image.data instanceof Float32Array) || image.data.length !== image.width * image.height * 3) throw new RangeError('Develop needs a linear RGB Float32 image.');
  const { width: W, height: H, data: rgb } = geometry(image, s, ignoreCrop, consume), N = W * H, minDim = Math.min(W, H);
  // Stage 1 — scene-linear: white balance, exposure, dehaze, local tone.
  const t = s.temperature / 100, g = s.tint / 100;
  let gr = Math.exp(0.32 * t), gg = Math.exp(-0.22 * g), gb = Math.exp(-0.32 * t);
  const wbNorm = LUMA[0] * gr + LUMA[1] * gg + LUMA[2] * gb, ev = 2 ** s.exposure;
  gr *= ev / wbNorm; gg *= ev / wbNorm; gb *= ev / wbNorm;
  for (let i = 0; i < N; i++) { rgb[i * 3] = Math.max(0, rgb[i * 3]! * gr); rgb[i * 3 + 1] = Math.max(0, rgb[i * 3 + 1]! * gg); rgb[i * 3 + 2] = Math.max(0, rgb[i * 3 + 2]! * gb); }
  if (s.dehaze) {
    const d = s.dehaze / 100, dark = new Float32Array(N);
    for (let i = 0; i < N; i++) dark[i] = Math.min(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
    const haze = blur(dark, W, H, minDim * 0.03);
    for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
      const v = rgb[i * 3 + c]!;
      rgb[i * 3 + c] = d > 0 ? Math.max(0, (v - 0.85 * d * haze[i]!) / Math.max(0.25, 1 - 0.85 * d * Math.min(1, haze[i]!))) : v * (1 + 0.35 * d) - 0.35 * d * 0.25;
    }
  }
  const tonal = s.highlights || s.shadows || s.whites || s.blacks || s.contrast || s.clarity || s.texture;
  if (tonal) {
    const logL = new Float32Array(N);
    for (let i = 0; i < N; i++) logL[i] = Math.log2(Math.max(1e-6, LUMA[0] * rgb[i * 3]! + LUMA[1] * rgb[i * 3 + 1]! + LUMA[2] * rgb[i * 3 + 2]!) / MID_GREY);
    const large = s.highlights || s.shadows ? blur(logL, W, H, minDim * 0.03) : null;
    const mid = s.clarity ? blur(logL, W, H, minDim * 0.012) : null, fine = s.texture ? blur(logL, W, H, Math.max(1, minDim * 0.003)) : null;
    for (let i = 0; i < N; i++) {
      const L = logL[i]!, base = large ? 0.5 * large[i]! + 0.5 * L : L; let delta = 0;
      if (s.shadows) delta += s.shadows / 100 * 1.6 * smooth(0.5, -3.5, base);
      if (s.highlights) delta += s.highlights / 100 * 1.6 * smooth(-0.5, 2.5, base);
      if (s.whites) delta += s.whites / 100 * 1.0 * smooth(0.8, 3.2, L);
      if (s.blacks) delta += s.blacks / 100 * 1.2 * smooth(-2, -6, L);
      if (s.contrast) delta += s.contrast / 100 * 0.45 * 3 * Math.tanh(L / 3);
      if (mid) delta += s.clarity / 100 * 0.8 * (L - mid[i]!) * Math.exp(-((L / 2.5) ** 2));
      if (fine) delta += s.texture / 100 * 1.0 * (L - fine[i]!);
      const ratio = 2 ** delta; rgb[i * 3] = rgb[i * 3]! * ratio; rgb[i * 3 + 1] = rgb[i * 3 + 1]! * ratio; rgb[i * 3 + 2] = rgb[i * 3 + 2]! * ratio;
    }
  }
  // Stage 2 — display-referred: base curve, encode, parametric curve, colour, detail, effects.
  // One fused table: (filmic base curve) → sRGB encode → parametric curve, indexed on √(x / range).
  const lut = curveLut(s), Y = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
  const range = kind === 'raw' ? 64 : 1, fused = new Float32Array(TABLE + 2);
  for (let k = 0; k <= TABLE + 1; k++) {
    const x = (Math.min(k, TABLE) / TABLE) ** 2 * range, v = Math.min(1, kind === 'raw' ? aces(x * FILMIC_SCALE) : x), e = toDisplay(v) * 1024, j = Math.min(1023, Math.floor(e));
    fused[k] = lut[j]! + (lut[j + 1]! - lut[j]!) * (e - j);
  }
  const tone = (v: number) => { const x = Math.sqrt(Math.min(range, v) / range) * TABLE, j = x | 0; return fused[j]! + (fused[j + 1]! - fused[j]!) * (x - j); };
  for (let i = 0; i < N; i++) {
    const r = tone(rgb[i * 3]!), gg2 = tone(rgb[i * 3 + 1]!), b = tone(rgb[i * 3 + 2]!);
    Y[i] = OPP[0]![0]! * r + OPP[0]![1]! * gg2 + OPP[0]![2]! * b; A[i] = r - 0.5 * (gg2 + b); B[i] = OPP[2]![1]! * (gg2 - b);
  }
  const mixer = s.hue.some(Boolean) || s.sat.some(Boolean) || s.lum.some(Boolean);
  if (mixer || s.vibrance || s.saturation || s.profile === 'mono') {
    const satF = 1 + s.saturation / 100, vib = s.vibrance / 100;
    for (let i = 0; i < N; i++) {
      const a = A[i]!, b = B[i]!, chroma = Math.sqrt(a * a + b * b); let hueDeg = mixer || vib > 0 ? (Math.atan2(b, a) * 57.29577951308232 + 360) % 360 : 0;
      let shift = 0, satMul = 1, lumAdd = 0;
      if (mixer && chroma > 1e-5) {
        const k = BAND_OF[Math.min(359, Math.floor(hueDeg))]!, c0 = BAND_CENTERS[k]!, c1 = BAND_CENTERS[(k + 1) % 8]! + (k === 7 ? 360 : 0), w1 = (hueDeg - c0) / (c1 - c0), w0 = 1 - w1, k1 = (k + 1) % 8;
        shift = (w0 * s.hue[k]! + w1 * s.hue[k1]!) / 100 * 30; satMul = 1 + (w0 * s.sat[k]! + w1 * s.sat[k1]!) / 100;
        lumAdd = (w0 * s.lum[k]! + w1 * s.lum[k1]!) / 100 * 0.25 * Math.min(1, chroma * 3);
      }
      const sn = Math.min(1, chroma / 0.6), skin = hueDeg > 5 && hueDeg < 55 ? 0.5 : 1;
      const vf = vib >= 0 ? 1 + vib * (1 - sn) ** 2 * skin : 1 + vib * (1 - 0.5 * sn);
      Y[i] = Y[i]! + lumAdd;
      if (s.profile === 'mono') { A[i] = 0; B[i] = 0; continue; }
      const m = Math.max(0, satMul * vf * satF);
      if (shift) { const rad = shift * 0.017453292519943295, cs = Math.cos(rad), sn2 = Math.sin(rad); A[i] = (a * cs - b * sn2) * m; B[i] = (a * sn2 + b * cs) * m; }
      else { A[i] = a * m; B[i] = b * m; }
    }
  }
  if (s.noiseColor && s.profile !== 'mono') {
    const r = Math.max(1, minDim * 0.004) * s.noiseColor / 50, ba = blur(A, W, H, r), bb = blur(B, W, H, r), k = Math.min(1, s.noiseColor / 60);
    for (let i = 0; i < N; i++) { A[i] = A[i]! + (ba[i]! - A[i]!) * k; B[i] = B[i]! + (bb[i]! - B[i]!) * k; }
  }
  if (s.noiseLuminance) {
    const yb = blur(Y, W, H, Math.max(1, minDim * 0.0015)), k = s.noiseLuminance / 100, threshold = 0.02 + 0.08 * k;
    for (let i = 0; i < N; i++) { const diff = Math.abs(Y[i]! - yb[i]!); Y[i] = Y[i]! + (yb[i]! - Y[i]!) * k * Math.exp(-diff / threshold); }
  }
  if (s.sharpenAmount) {
    const yb = blur(Y, W, H, Math.max(0.5, s.sharpenRadius * minDim / 2000)), amount = s.sharpenAmount / 100 * 1.4, threshold = s.sharpenMasking / 100 * 0.08;
    for (let i = 0; i < N; i++) { const detail = Y[i]! - yb[i]!, mask = threshold ? smooth(threshold * 0.5, threshold * 1.5, Math.abs(detail)) : 1; Y[i] = Y[i]! + amount * detail * mask; }
  }
  const histogram = new Uint32Array(1024), rgba = new Uint8ClampedArray(N * 4), vignette = s.vignette / 100, midpoint = s.vignetteMidpoint / 100, grain = s.grain / 100;
  const scale = Math.max(1, minDim / 1500);
  for (let v = 0, i = 0; v < H; v++) for (let u = 0; u < W; u++, i++) {
    let y = Y[i]!, a = A[i]!, b = B[i]!;
    if (vignette) {
      const dx = (u + 0.5) / W * 2 - 1, dy = (v + 0.5) / H * 2 - 1, d = Math.hypot(dx, dy) / Math.SQRT2;
      const f = 1 + vignette * 0.85 * smooth(midpoint * 0.9, Math.min(1.4, midpoint * 0.9 + 0.7), d); y *= f; a *= f; b *= f;
    }
    if (grain) y += grain * 0.09 * (hash(Math.floor(u / scale), Math.floor(v / scale)) - 0.5) * (1 - Math.abs(2 * y - 1) * 0.6);
    for (let c = 0; c < 3; c++) {
      const value = INV[c]![0]! * y + INV[c]![1]! * a + INV[c]![2]! * b, byte = Math.round(Math.min(1, Math.max(0, value)) * 255);
      rgba[i * 4 + c] = byte; histogram[c * 256 + byte]!++;
    }
    rgba[i * 4 + 3] = 255;
    histogram[768 + Math.round(LUMA[0] * rgba[i * 4]! + LUMA[1] * rgba[i * 4 + 1]! + LUMA[2] * rgba[i * 4 + 2]!)]!++;
  }
  return { width: W, height: H, rgba, histogram };
}
