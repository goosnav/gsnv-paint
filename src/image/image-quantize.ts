/**
 * PURPOSE    Produce strict palette raster output.
 * KIND       CORE
 * CONTRACT   quantizeImage(raster,palette) returns owned pixels: each is either
 *            one exact opaque RGB swatch or canonical transparent zero RGBA.
 *            Palette is PixelPolicy.palette excluding null; nearest squared RGB
 *            chooses the earliest swatch on ties. RAISES: RangeError on bad input.
 * GUARANTEES Deterministic; source unchanged; no DOM/I/O. Fully transparent source
 *            stays clear. No-dither alpha threshold >=128; no generated colours.
 * TUNING     Bayer 4x4; Floyd–Steinberg left-to-right/top-to-bottom with weights
 *            7/16 right, 3/16 down-left, 5/16 down, 1/16 down-right.
 *            RGB_CACHE_LIMIT=65536 exact integer colours; LINEAR_LIMIT=16 swatches.
 * DECISIONS  D1: Bayer interpolates nearest two swatches using colour projection;
 *            retained alpha samples remap the threshold to avoid correlated
 *            alpha/colour bias. FS diffuses premultiplied RGB plus alpha using
 *            two bounded error rows; clear source pixels discard incoming error.
 *            Alternative: separately dither straight RGB/alpha, rejected because
 *            correlated coverage biases colour. Revisit if: tiled replay requires
 *            an explicit error-row continuation protocol.
 *            D2: Flat typed swatches and allocation-free matching avoid frozen-array
 *            writes and closures per pixel. Integer colours use a bounded cache;
 *            fractional FS colours never do. Alternative: rounded colour lookup;
 *            rejected because it changes pixels. Revisit if: a GPU exact path exists.
 * LIMITS     Strict output cannot retain numeric fractional alpha; dithering
 *            approximates it spatially. Errors outside image bounds are lost.
 * TESTBENCH  node --import tsx --test src/image/image-quantize.test.ts
 * DEMO       node --import tsx src/image/image-quantize.demo.ts
 */
import { isRasterSize, type Raster } from './raster-ops.ts';
import { pixelPolicy, type PixelPolicy } from './image-pixel-policy.ts';

type Palette = NonNullable<PixelPolicy['palette']>;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const RGB_CACHE_LIMIT = 65536, LINEAR_LIMIT = 16;
const clamp = (n: number) => Math.max(0, Math.min(255, n));

/** Packed first/second IDs avoid allocating a result tuple for each pixel. */
function matcher(flat: Uint8Array, two: boolean, cacheable: boolean) {
  const count = flat.length / 3, axes = new Uint8Array(count), left = new Int16Array(count).fill(-1), right = new Int16Array(count).fill(-1);
  const nodes = new Int16Array(count), bounds = new Float64Array(count), cache = cacheable ? new Map<number, number>() : null;
  function build(ids: number[], depth = 0): number {
    if (!ids.length) return -1;
    const axis = depth % 3, sorted = ids.sort((a, b) => flat[a * 3 + axis]! - flat[b * 3 + axis]! || a - b), mid = Math.floor(sorted.length / 2), id = sorted[mid]!;
    axes[id] = axis; left[id] = build(sorted.slice(0, mid), depth + 1); right[id] = build(sorted.slice(mid + 1), depth + 1); return id;
  }
  const root = count > LINEAR_LIMIT ? build(Array.from({ length: count }, (_, i) => i)) : -1;
  return (r: number, g: number, b: number): number => {
    const key = cache ? r << 16 | g << 8 | b : 0, cached = cache?.get(key); if (cached !== undefined) return cached;
    let first = -1, second = -1, d0 = Infinity, d1 = Infinity;
    if (root === -1) {
      for (let id = 0; id < count; id++) {
        const i = id * 3, dr = r - flat[i]!, dg = g - flat[i + 1]!, db = b - flat[i + 2]!, distance = dr * dr + dg * dg + db * db;
        if (distance < d0) { second = first; d1 = d0; first = id; d0 = distance; }
        else if (two && distance < d1) { second = id; d1 = distance; }
      }
    } else {
      let length = 1; nodes[0] = root; bounds[0] = 0;
      while (length) {
        const at = --length, id = nodes[at]!, bound = bounds[at]!; if (bound > (two ? d1 : d0)) continue;
        const i = id * 3, dr = r - flat[i]!, dg = g - flat[i + 1]!, db = b - flat[i + 2]!, distance = dr * dr + dg * dg + db * db;
        if (distance < d0 || (distance === d0 && id < first)) { second = first; d1 = d0; first = id; d0 = distance; }
        else if (two && (distance < d1 || (distance === d1 && id < second))) { second = id; d1 = distance; }
        const delta = axes[id] === 0 ? dr : axes[id] === 1 ? dg : db, near = delta < 0 ? left[id]! : right[id]!, far = delta < 0 ? right[id]! : left[id]!;
        if (far !== -1 && delta * delta <= (two ? d1 : d0)) { nodes[length] = far; bounds[length++] = Math.max(bound, delta * delta); }
        if (near !== -1) { nodes[length] = near; bounds[length++] = bound; }
      }
    }
    const result = first | (second + 1) << 8;
    if (cache && cache.size < RGB_CACHE_LIMIT) cache.set(key, result);
    return result;
  };
}

export function quantizeImage(raster: Raster, palette: Palette): Raster {
  if (!palette) throw new RangeError('Quantization needs a palette.');
  const { colours, dither } = pixelPolicy({ mode: 'pixel-art', palette }).palette!;
  if (!raster || !isRasterSize(raster.width, raster.height) || !(raster.data instanceof Uint8ClampedArray) || raster.data.length !== raster.width * raster.height * 4) throw new RangeError('Invalid quantization source raster.');
  const { width, height, data: source } = raster, data = new Uint8ClampedArray(source.length), flat = Uint8Array.from(colours.flat()), nearest = matcher(flat, dither === 'bayer', dither !== 'floyd-steinberg');
  const put = (offset: number, id: number) => { const i = id * 3; data[offset] = flat[i]!; data[offset + 1] = flat[i + 1]!; data[offset + 2] = flat[i + 2]!; data[offset + 3] = 255; };
  if (dither === 'floyd-steinberg') {
    let current = new Float64Array((width + 2) * 4), next = new Float64Array(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4, e = (x + 1) * 4, alpha = source[i + 3]!; if (!alpha) continue;
        const r = clamp(source[i]! * alpha / 255 + current[e]!), g = clamp(source[i + 1]! * alpha / 255 + current[e + 1]!), b = clamp(source[i + 2]! * alpha / 255 + current[e + 2]!), a = clamp(alpha + current[e + 3]!);
        if (a >= 128) put(i, nearest(r, g, b) & 255);
        for (let c = 0; c < 4; c++) {
          const error = (c === 0 ? r : c === 1 ? g : c === 2 ? b : a) - data[i + c]!;
          current[e + 4 + c]! += error * 7 / 16;
          next[e - 4 + c]! += error * 3 / 16; next[e + c]! += error * 5 / 16; next[e + 4 + c]! += error / 16;
        }
      }
      [current, next] = [next, current]; next.fill(0);
    }
    return { width, height, data };
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, a = source[i + 3]!; if (!a) continue;
    const threshold = (BAYER[(y % 4) * 4 + x % 4]! + .5) / 16;
    if (dither === 'none' ? a < 128 : threshold >= a / 255) continue;
    const r = source[i]!, g = source[i + 1]!, b = source[i + 2]!, matched = nearest(r, g, b), first = matched & 255, second = (matched >> 8) - 1;
    let id = first;
    if (dither === 'bayer' && second >= 0) {
      const c0 = first * 3, c1 = second * 3, dr = flat[c1]! - flat[c0]!, dg = flat[c1 + 1]! - flat[c0 + 1]!, db = flat[c1 + 2]! - flat[c0 + 2]!;
      const mix = Math.max(0, Math.min(1, ((r - flat[c0]!) * dr + (g - flat[c0 + 1]!) * dg + (b - flat[c0 + 2]!) * db) / (dr * dr + dg * dg + db * db)));
      if (threshold / (a / 255) < mix) id = second;
    }
    put(i, id);
  }
  return { width, height, data };
}
