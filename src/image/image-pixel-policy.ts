/**
 * PURPOSE    Define document pixel policy.
 * KIND       CORE
 * CONTRACT   pixelPolicy(unknown?) validates, copies and freezes mode plus optional
 *            strict palette; omitted input defaults to pixel-art/full colour.
 *            pixelCoverage(raster,mode) returns owned RGBA with binary generated
 *            coverage in pixel-art mode or an exact byte copy in smooth mode.
 *            RAISES: RangeError for malformed metadata, rasters or unknown modes.
 * GUARANTEES No I/O or input mutation. RGB swatches are unique integer triples;
 *            transparent hardened pixels are canonical zero RGBA.
 * TUNING     1–256 palette swatches; generated-coverage threshold is alpha >=128.
 * DECISIONS  D1: Coverage hardening precedes intentional opacity. Applying this
 *            function to a finished composite would destroy authored transparency.
 *            Alternative: viewport-only CSS, rejected because it cannot remove
 *            stored antialiasing. Revisit if: vector text remains editable.
 * LIMITS     Does not quantize colour or alter imported/legacy pixels itself.
 * TESTBENCH  src/image/image-pixel-policy.test.ts
 *            node --import tsx --test src/image/image-pixel-policy.test.ts
 * DEMO       node --import tsx src/image/image-pixel-policy.demo.ts
 */
import { MAX_PIXELS, type Raster } from './raster-ops.ts';

export type RGB = readonly [number, number, number];
export type PixelPolicy = {
  readonly mode: 'pixel-art' | 'smooth';
  readonly palette: null | { readonly colours: readonly RGB[]; readonly dither: 'none' | 'bayer' | 'floyd-steinberg' };
};

const record = (v: unknown, keys: string): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === keys;
export function pixelPolicy(value: unknown = { mode: 'pixel-art', palette: null }): PixelPolicy {
  if (!record(value, 'mode,palette') || !['pixel-art', 'smooth'].includes(value.mode as string)) throw new RangeError('Unknown image pixel policy.');
  const mode = value.mode as PixelPolicy['mode'];
  if (value.palette === null) return Object.freeze({ mode, palette: null });
  const p = value.palette;
  if (!record(p, 'colours,dither') || !Array.isArray(p.colours) || p.colours.length < 1 || p.colours.length > 256 || !['none', 'bayer', 'floyd-steinberg'].includes(p.dither as string)) throw new RangeError('Use 1–256 palette colours and a supported dither method.');
  const colours: RGB[] = p.colours.map((c: unknown) => {
    if (!Array.isArray(c) || c.length !== 3 || !c.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new RangeError('Palette colours are three integer RGB bytes.');
    return Object.freeze([c[0], c[1], c[2]]) as RGB;
  });
  if (new Set(colours.map(c => c.join(','))).size !== colours.length) throw new RangeError('Palette colours must be distinct.');
  return Object.freeze({ mode, palette: Object.freeze({ colours: Object.freeze(colours), dither: p.dither as NonNullable<PixelPolicy['palette']>['dither'] }) });
}

export function pixelCoverage(raster: Raster, mode: PixelPolicy['mode']): Raster {
  if (!['pixel-art', 'smooth'].includes(mode)) throw new RangeError('Unknown coverage mode.');
  if (!raster || !Number.isInteger(raster.width) || !Number.isInteger(raster.height) || raster.width < 1 || raster.height < 1 || raster.width * raster.height > MAX_PIXELS || !(raster.data instanceof Uint8ClampedArray) || raster.data.length !== raster.width * raster.height * 4) throw new RangeError('Invalid coverage raster.');
  const data = new Uint8ClampedArray(raster.data);
  if (mode === 'pixel-art') for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) data.fill(0, i, i + 4);
    else data[i + 3] = 255;
  }
  return { width: raster.width, height: raster.height, data };
}
