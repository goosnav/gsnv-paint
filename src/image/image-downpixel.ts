/**
 * PURPOSE    Reduce logical image resolution sharply.
 * KIND       CORE
 * CONTRACT   downpixelImage(raster,{width,height,resize}) samples a no-larger
 *            positive whole-pixel logical size. resize returns that smaller
 *            raster; false replicates it to the source canvas dimensions.
 *            RAISES: RangeError for malformed rasters/options or enlargement.
 * GUARANTEES Caller-owned output; exact source RGBA copies, no averaging or I/O.
 * TUNING     Sampling is floor((destination+0.5)*sourceSize/destinationSize).
 * DECISIONS  D1: Centre nearest sampling for both passes; odd edge blocks may
 *            differ by one pixel rather than introducing interpolated colours.
 *            Alternative: averaging cells, rejected because it adds colours.
 *            Revisit if: explicit filtered reduction is requested.
 * LIMITS     Retained-size output is pixelation, not additional image detail.
 * TESTBENCH  node --import tsx --test src/image/image-downpixel.test.ts
 * DEMO       node --import tsx src/image/image-downpixel.demo.ts
 */
import { MAX_PIXELS, type Raster } from './raster-ops.ts';

function sample(source: Raster, width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(source.width - 1, Math.floor((x + .5) * source.width / width)), sy = Math.min(source.height - 1, Math.floor((y + .5) * source.height / height)), i = (sy * source.width + sx) * 4;
    data.set(source.data.subarray(i, i + 4), (y * width + x) * 4);
  }
  return { width, height, data };
}
export function downpixelImage(raster: Raster, options: { width: number; height: number; resize: boolean }): Raster {
  if (!raster || !Number.isInteger(raster.width) || !Number.isInteger(raster.height) || raster.width < 1 || raster.height < 1 || raster.width * raster.height > MAX_PIXELS || !(raster.data instanceof Uint8ClampedArray) || raster.data.length !== raster.width * raster.height * 4) throw new RangeError('Invalid down-pixel source raster.');
  if (!options || !Number.isInteger(options.width) || !Number.isInteger(options.height) || options.width < 1 || options.height < 1 || options.width > raster.width || options.height > raster.height || typeof options.resize !== 'boolean') throw new RangeError('Logical pixel dimensions must be whole numbers within the source image.');
  const reduced = sample(raster, options.width, options.height);
  return options.resize ? reduced : sample(reduced, raster.width, raster.height);
}
