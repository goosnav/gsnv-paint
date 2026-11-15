/**
 * PURPOSE    Replay semantic drawing edits.
 * KIND       CORE
 * CONTRACT   Owned raster, selection coverage and validated draw operation; mutates
 *            only selected pixels. Merged sample is required for merged flood fill.
 *            Optional mode selects policy-aware shapes; default remains pixel-art.
 * GUARANTEES Reuses interactive integer blending and mask application order.
 * TUNING     Existing raster size/colour limits apply.
 * DECISIONS  D1: Evaluate semantic fill on each input, never record a source mask.
 *            Alternative: source pixel patches. Revisit if vector shape layers arrive.
 * LIMITS     Fill/gradient semantics are independent of shape edge policy.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { applyCoverage, gradientFill, magicWand, maskBounds } from './image-brush.ts';
import { maskedMerge } from './image-composite.ts';
import { paintPolicyShape } from './image-policy-drawing.ts';
import type { Raster, Rect } from './raster-ops.ts';
import type { ImageOperation } from './image-operation-types.ts';
export function replayDrawing(raster: Raster, selection: Uint8Array | null, op: Extract<ImageOperation, { kind: 'shape' | 'gradient' | 'fill' }>, merged?: Raster, mode: 'pixel-art' | 'smooth' = 'pixel-art'): void {
  const base = raster.data.slice(); let rect: Rect | null;
  if (op.kind === 'fill') {
    const mask = magicWand(op.sample === 'merged' ? merged! : raster, op.point[0], op.point[1], op.tolerance, op.contiguous);
    if (selection) for (let i = 0; i < mask.length; i++) mask[i] = Math.min(mask[i]!, selection[i]!);
    rect = maskBounds(mask, raster.width); if (!rect) return;
    applyCoverage({ raster, base, cov: { width: raster.width, height: raster.height, data: Float32Array.from(mask, m => m / 255) }, rect, mode: { kind: 'paint', color: op.color }, opacity: op.opacity }); return;
  }
  if (op.kind === 'gradient') rect = gradientFill(raster, op.a, op.b, op.shape, op.start, op.end);
  else rect = paintPolicyShape(raster, op, mode);
  if (selection && rect) maskedMerge({ target: raster, base, mask: selection, rect });
}
