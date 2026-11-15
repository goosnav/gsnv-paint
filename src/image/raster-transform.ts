/**
 * PURPOSE    Resample owned RGBA raster transforms.
 * KIND       CORE
 * CONTRACT   IN: matching straight-alpha raster; TransformOp or positive finite
 *            percent scales, finite clockwise angle and nearest/bilinear sampler.
 *            OUT: new raster, source unchanged. RAISES: RangeError for invalid
 *            input or output beyond the shared raster size limit.
 * GUARANTEES Deterministic, no I/O; nearest copies exact source RGBA. Bilinear
 *            samples premultiplied alpha; outside source pixels are transparent.
 * TUNING     MAX_PIXELS enforced by I50 createRaster; bilinear is the API default.
 * DECISIONS  D1: Keep drawing and resampling in separate bricks. Alternative:
 *            grow the original five-entry raster module, rejected because callers
 *            need independently testable sampling. Revisit if: tiled rasters
 *            require a streaming transform interface.
 * LIMITS     In-memory rasters only; no skew, perspective or layer management.
 * TESTBENCH  src/image/raster-transform.test.ts -- run with: node --import tsx --test src/image/raster-transform.test.ts
 */
import { createRaster, paintRaster, clip, type Raster, type Rect, type RGBA } from './raster-ops.ts';
export type TransformOp =
  | { kind: 'flip'; axis: 'horizontal' | 'vertical' }
  | { kind: 'rotate'; turns: 1 | 2 | 3 }
  | { kind: 'invert' }
  | { kind: 'crop'; rect: Rect }
  | { kind: 'resize'; width: number; height: number }
  | { kind: 'canvas'; width: number; height: number; fill: RGBA };

function checkRaster(r: Raster) {
  if (!r || !Number.isInteger(r.width) || !Number.isInteger(r.height) || r.width < 1 || r.height < 1 || !(r.data instanceof Uint8ClampedArray) || r.data.length !== r.width * r.height * 4) throw new RangeError('Invalid raster.');
}

export function transformRaster(raster: Raster, op: TransformOp): Raster {
  checkRaster(raster);
  const { width: w, height: h, data } = raster;
  const remap = (width: number, height: number, source: (x: number, y: number) => number) => {
    const next = createRaster(width, height, [0, 0, 0, 0]);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = source(x, y) * 4, j = (y * width + x) * 4; next.data[j] = data[i]!; next.data[j + 1] = data[i + 1]!; next.data[j + 2] = data[i + 2]!; next.data[j + 3] = data[i + 3]!; }
    return next;
  };
  if (op.kind === 'flip') return remap(w, h, (x, y) => op.axis === 'horizontal' ? y * w + (w - 1 - x) : (h - 1 - y) * w + x);
  if (op.kind === 'rotate') {
    if (op.turns === 2) return remap(w, h, (x, y) => (h - 1 - y) * w + (w - 1 - x));
    if (op.turns === 1) return remap(h, w, (x, y) => (h - 1 - x) * w + y);
    if (op.turns === 3) return remap(h, w, (x, y) => x * w + (w - 1 - y));
    throw new RangeError('Rotation is a whole number of quarter turns.');
  }
  if (op.kind === 'invert') {
    const next = { width: w, height: h, data: new Uint8ClampedArray(data) };
    for (let i = 0; i < next.data.length; i += 4) { next.data[i] = 255 - data[i]!; next.data[i + 1] = 255 - data[i + 1]!; next.data[i + 2] = 255 - data[i + 2]!; }
    return next;
  }
  if (op.kind === 'crop') {
    const r = clip(op.rect, raster); if (!r.width || !r.height) throw new RangeError('The crop area is outside the image.');
    return remap(r.width, r.height, (x, y) => (y + r.y) * w + x + r.x);
  }
  if (op.kind === 'resize') {
    return remap(op.width, op.height, (x, y) => Math.min(h - 1, Math.floor((y + 0.5) * h / op.height)) * w + Math.min(w - 1, Math.floor((x + 0.5) * w / op.width)));
  }
  if (op.kind === 'canvas') {
    const next = createRaster(op.width, op.height, op.fill);
    paintRaster(next, { kind: 'blit', source: raster, x: 0, y: 0, mode: 'replace' });
    return next;
  }
  throw new RangeError('Unknown image transform.');
}

/** Scales (percent) and rotates (degrees, clockwise) a raster about its centre into a new raster sized to the
 *  rotated bounds. Bilinear (default) samples premultiplied alpha; nearest copies source RGBA exactly. Outside pixels are transparent. */
export function affineRaster(raster: Raster, { scaleX, scaleY, angle, sampling = 'bilinear' }: { scaleX: number; scaleY: number; angle: number; sampling?: 'nearest' | 'bilinear' }): Raster {
  checkRaster(raster);
  if (!['nearest', 'bilinear'].includes(sampling)) throw new RangeError('Unknown affine sampling.');
  if (![scaleX, scaleY, angle].every(Number.isFinite) || scaleX <= 0 || scaleY <= 0) throw new RangeError('Scale must be positive and the angle finite.');
  const sx = scaleX / 100, sy = scaleY / 100, t = angle * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t), w = raster.width * sx, h = raster.height * sy;
  const W = Math.max(1, Math.round(Math.abs(w * cos) + Math.abs(h * sin))), H = Math.max(1, Math.round(Math.abs(w * sin) + Math.abs(h * cos)));
  const out = createRaster(W, H, [0, 0, 0, 0]), src = raster.data, rw = raster.width, rh = raster.height;
  const at = (x: number, y: number, c: number) => { if (x < 0 || y < 0 || x >= rw || y >= rh) return 0; const i = (y * rw + x) * 4; return c === 3 ? src[i + 3]! : src[i + c]! * src[i + 3]! / 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - W / 2, dy = y + 0.5 - H / 2, u = (cos * dx + sin * dy) / sx + rw / 2 - 0.5, v = (-sin * dx + cos * dy) / sy + rh / 2 - 0.5;
    if (u < -1 || v < -1 || u > rw || v > rh) continue;
    if (sampling === 'nearest') { const nx = Math.round(u), ny = Math.round(v); if (nx >= 0 && ny >= 0 && nx < rw && ny < rh) out.data.set(src.subarray((ny * rw + nx) * 4, (ny * rw + nx) * 4 + 4), (y * W + x) * 4); continue; }
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, px: number[] = [];
    for (let c = 0; c < 4; c++) px.push((at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy);
    const o = (y * W + x) * 4, a = px[3]!; if (a <= 0) continue;
    out.data[o] = Math.round(px[0]! * 255 / a); out.data[o + 1] = Math.round(px[1]! * 255 / a); out.data[o + 2] = Math.round(px[2]! * 255 / a); out.data[o + 3] = Math.round(a);
  }
  return out;
}
