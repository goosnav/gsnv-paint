/**
 * PURPOSE    Resolve document pixels for external consumers.
 * KIND       CORE
 * CONTRACT   IN: composited Raster and validated PixelPolicy; OUT: owned output
 *            matching the document palette, or exact full-colour bytes.
 *            RAISES: RangeError for malformed palette or raster in quantization.
 * GUARANTEES No mutation, I/O, CSS effects or destruction of editable layers.
 * TUNING     Policy belongs to the document; no environment-dependent defaults.
 * DECISIONS  D1: One final-output seam prevents exports from bypassing display policy.
 *            Alternative: quantize layer storage; rejected to preserve editability.
 *            Revisit if: the product adopts indexed layer storage.
 * LIMITS     Caller composes layers first; large requests should execute in worker.
 * TESTBENCH  node --import tsx --test src/image/image-output.test.ts
 * DEMO       node --import tsx src/image/image-output.demo.ts
 */
import type {Raster} from './raster-ops.ts';
import type {PixelPolicy} from './image-pixel-policy.ts';
import {quantizeImage} from './image-quantize.ts';
export function imageOutput(raster:Raster,policy:PixelPolicy):Raster{
 return policy.palette?quantizeImage(raster,policy.palette):{width:raster.width,height:raster.height,data:new Uint8ClampedArray(raster.data)};
}
