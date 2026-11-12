/**
 * PURPOSE    Composite image layers with blend modes and apply selection masks.
 * KIND       CORE
 * CONTRACT   compositeLayers({width,height,layers,rect}) writes the visible layers bottom→top into an
 *            RGBA output for the rectangle (straight alpha, source-over with the layer's blend mode
 *            and opacity). maskedMerge({target,base,mask,rect}) keeps edited target pixels only where the
 *            selection mask allows, restoring base elsewhere (soft masks interpolate).
 *            RAISES: RangeError for mismatched sizes or unknown blend modes.
 * GUARANTEES Pure per call; deterministic integer rounding; inputs other than the output are not mutated.
 * TUNING     BLEND_MODES lists the supported modes (W3C compositing formulas).
 * DECISIONS  D1: Separable blend formulas on straight-alpha bytes with the W3C source-over model so the
 *            result matches browsers and image editors for normal, multiply, screen, overlay, darken,
 *            lighten and difference. Revisit if: non-separable modes (hue, colour) are required.
 * LIMITS     8-bit sRGB; no layer masks or groups.
 * TESTBENCH  src/image/image-composite.test.ts -- run with: node --import tsx --test src/image/image-composite.test.ts
 */
import type { Raster, Rect } from './raster-ops.ts';

export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference'] as const;
export type BlendMode = typeof BLEND_MODES[number];
export type CompositeLayer = { raster: Raster; visible: boolean; opacity: number; blend: BlendMode };

const blendFns: Record<BlendMode, (b: number, s: number) => number> = {
  normal: (_b, s) => s, multiply: (b, s) => b * s, screen: (b, s) => b + s - b * s,
  overlay: (b, s) => b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s), darken: Math.min, lighten: Math.max, difference: (b, s) => Math.abs(b - s),
};

/** Writes the composite of the rectangle into `out` (RGBA, image-sized). */
export function compositeLayers({ width, height, layers, rect, out }: { width: number; height: number; layers: readonly CompositeLayer[]; rect: Rect; out: Uint8ClampedArray }) {
  if (out.length !== width * height * 4 || layers.some(l => l.raster.width !== width || l.raster.height !== height)) throw new RangeError('Layer sizes must match the image.');
  for (const l of layers) if (!(l.blend in blendFns) || !(l.opacity >= 0 && l.opacity <= 1)) throw new RangeError('Invalid layer blend or opacity.');
  const visible = layers.filter(l => l.visible && l.opacity > 0), x1 = Math.min(width, rect.x + rect.width), y1 = Math.min(height, rect.y + rect.height);
  for (let y = Math.max(0, rect.y); y < y1; y++) for (let x = Math.max(0, rect.x); x < x1; x++) {
    const i = (y * width + x) * 4; let r = 0, g = 0, b = 0, a = 0;
    for (const layer of visible) {
      const d = layer.raster.data, sa = d[i + 3]! / 255 * layer.opacity; if (sa <= 0) continue;
      const sr = d[i]! / 255, sg = d[i + 1]! / 255, sb = d[i + 2]! / 255, f = blendFns[layer.blend];
      // W3C: Cs' = (1 − ab)·Cs + ab·B(Cb, Cs); then source-over.
      const mr = a ? (1 - a) * sr + a * f(r, sr) : sr, mg = a ? (1 - a) * sg + a * f(g, sg) : sg, mb = a ? (1 - a) * sb + a * f(b, sb) : sb;
      const ao = sa + a * (1 - sa);
      r = (mr * sa + r * a * (1 - sa)) / ao; g = (mg * sa + g * a * (1 - sa)) / ao; b = (mb * sa + b * a * (1 - sa)) / ao; a = ao;
    }
    out[i] = Math.round(r * 255); out[i + 1] = Math.round(g * 255); out[i + 2] = Math.round(b * 255); out[i + 3] = Math.round(a * 255);
  }
}

/** Restores `base` wherever the mask (0…255 per pixel, image-sized) excludes an edited pixel of `target`. */
export function maskedMerge({ target, base, mask, rect }: { target: Raster; base: Uint8ClampedArray; mask: Uint8Array; rect: Rect }) {
  if (base.length !== target.data.length || mask.length !== target.width * target.height) throw new RangeError('Mask and base must match the layer.');
  const d = target.data, x1 = Math.min(target.width, rect.x + rect.width), y1 = Math.min(target.height, rect.y + rect.height);
  for (let y = Math.max(0, rect.y); y < y1; y++) for (let x = Math.max(0, rect.x); x < x1; x++) {
    const p = y * target.width + x, m = mask[p]!; if (m === 255) continue;
    const i = p * 4;
    if (m === 0) { d[i] = base[i]!; d[i + 1] = base[i + 1]!; d[i + 2] = base[i + 2]!; d[i + 3] = base[i + 3]!; continue; }
    const t = m / 255; for (let c = 0; c < 4; c++) d[i + c] = Math.round(base[i + c]! + (d[i + c]! - base[i + c]!) * t);
  }
}
