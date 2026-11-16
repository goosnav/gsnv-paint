/**
 * PURPOSE    Generate bounded RGB palettes.
 * KIND       CORE
 * CONTRACT   generatePalette(raster,count) produces exactly count deterministic
 *            median-cut swatches; presetPalette(count) supplies fixed swatches.
 *            Counts: 2,4,8,16,32,64,128,256. Returns frozen RGB arrays.
 *            RAISES: RangeError for unsupported counts or malformed rasters.
 * GUARANTEES No I/O/input mutation; transparent RGB is ignored. Few source colours
 *            remain exact. Input order cannot affect output or tie resolution.
 * TUNING     At most 32,768 histogram bins (5 bits/channel), weighted by alpha.
 * DECISIONS  D1: Fixed bins bound memory even for large photographic inputs.
 *            Split greatest channel range, then greatest population, then first
 *            box; channels tie R/G/B. Split at weighted median, nonempty sides.
 *            Centroids round half up. Missing slots use distinct preset colours.
 *            Alternative: unbounded exact histogram, rejected for photo memory.
 *            Revisit if: perceptual clustering is explicitly required.
 * LIMITS     Lossy palette optimisation once source exceeds requested count;
 *            it is deterministic median cut, not perceptual colour clustering.
 * TESTBENCH  node --import tsx --test src/image/image-palette-core.test.ts
 * DEMO       node --import tsx src/image/image-palette-core.demo.ts
 */
import { isRasterSize, type Raster } from './raster-ops.ts';
import type { RGB } from './image-pixel-policy.ts';

const COUNTS = [2, 4, 8, 16, 32, 64, 128, 256];
const key = (c: RGB) => c[0] * 65536 + c[1] * 256 + c[2];
const own = (colours: readonly RGB[]): readonly RGB[] => Object.freeze(colours.map(c => Object.freeze([...c]) as RGB));
function countOK(count: number) { if (!COUNTS.includes(count)) throw new RangeError('Choose 2, 4, 8, 16, 32, 64, 128 or 256 colours.'); }
export function presetPalette(count: number): readonly RGB[] {
  countOK(count);
  if (count === 2) return own([[0, 0, 0], [255, 255, 255]]);
  if (count === 4) return own([[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]]);
  if (count === 16) return own([[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192], [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]]);
  const bits = Math.log2(count), nr = 2 ** Math.ceil(bits / 3), ng = 2 ** Math.ceil((bits - 1) / 3), nb = 2 ** Math.floor(bits / 3), colours: RGB[] = [];
  for (let r = 0; r < nr; r++) for (let g = 0; g < ng; g++) for (let b = 0; b < nb; b++) colours.push([Math.round(r * 255 / (nr - 1)), Math.round(g * 255 / (ng - 1)), Math.round(b * 255 / (nb - 1))]);
  return own(colours);
}

type Bin = { rgb: RGB; weight: number; id: number };
type Box = { bins: Bin[]; channel: number; spread: number; weight: number };
function box(bins: Bin[]): Box {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; let weight = 0;
  for (const b of bins) { weight += b.weight; for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c]!, b.rgb[c]!); max[c] = Math.max(max[c]!, b.rgb[c]!); } }
  const spread = max.map((v, i) => v - min[i]!); let channel = 0;
  for (let i = 1; i < 3; i++) if (spread[i]! > spread[channel]!) channel = i;
  return { bins, channel, spread: spread[channel]!, weight };
}
function complete(colours: readonly RGB[], count: number): readonly RGB[] {
  const result: RGB[] = [], seen = new Set<number>();
  for (const c of [...colours, ...presetPalette(count), ...presetPalette(256)]) {
    const k = key(c); if (seen.has(k)) continue; seen.add(k); result.push(c); if (result.length === count) break;
  }
  return own(result);
}
export function generatePalette(raster: Raster, count: number): readonly RGB[] {
  countOK(count);
  if (!raster || !isRasterSize(raster.width, raster.height) || !(raster.data instanceof Uint8ClampedArray) || raster.data.length !== raster.width * raster.height * 4) throw new RangeError('Invalid palette source raster.');
  const weights = new Float64Array(32768), sums = [new Float64Array(32768), new Float64Array(32768), new Float64Array(32768)], d = raster.data;
  let exact: Map<number, RGB> | null = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!; if (!a) continue;
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!, bin = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3);
    weights[bin]! += a; sums[0]![bin]! += r * a; sums[1]![bin]! += g * a; sums[2]![bin]! += b * a;
    if (exact) { exact.set(r * 65536 + g * 256 + b, [r, g, b]); if (exact.size > count) exact = null; }
  }
  if (exact) return exact.size ? complete([...exact.values()].sort((a, b) => key(a) - key(b)), count) : presetPalette(count);
  const bins: Bin[] = [];
  for (let i = 0; i < weights.length; i++) if (weights[i]) bins.push({ id: i, weight: weights[i]!, rgb: [sums[0]![i]! / weights[i]!, sums[1]![i]! / weights[i]!, sums[2]![i]! / weights[i]!] });
  const boxes = [box(bins)];
  while (boxes.length < count) {
    let chosen = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!; if (b.bins.length < 2) continue;
      if (chosen < 0 || b.spread > boxes[chosen]!.spread || (b.spread === boxes[chosen]!.spread && b.weight > boxes[chosen]!.weight)) chosen = i;
    }
    if (chosen < 0) break;
    const b = boxes[chosen]!, sorted = [...b.bins].sort((a, z) => a.rgb[b.channel]! - z.rgb[b.channel]! || a.id - z.id);
    let weight = 0, split = 0;
    do { weight += sorted[split++]!.weight; } while (split < sorted.length - 1 && weight < b.weight / 2);
    boxes.splice(chosen, 1, box(sorted.slice(0, split)), box(sorted.slice(split)));
  }
  const colours = boxes.map(b => {
    const sum = [0, 0, 0]; for (const bin of b.bins) for (let c = 0; c < 3; c++) sum[c]! += bin.rgb[c]! * bin.weight;
    return sum.map(n => Math.round(n / b.weight)) as unknown as RGB;
  }).sort((a, b) => key(a) - key(b));
  return complete(colours, count);
}
