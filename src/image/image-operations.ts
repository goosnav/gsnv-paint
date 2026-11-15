/**
 * PURPOSE    Execute semantic Image editing transactions.
 * KIND       CORE
 * CONTRACT   Assembly: composes validated drawing, selection, stack, transfer and effects.
 *            applyImageOperation(state,operation,assets=[]) returns immutable state;
 *            operation may originate from interactive UI, recipe or isolated script.
 *            RAISES: actionable RangeError for invalid operations or absent inputs.
 * GUARANTEES No DOM, clock, random generation, I/O or input snapshot mutation.
 * TUNING     Existing document/raster limits and operation validation apply.
 * DECISIONS  D1: One operation seam for interactive commits and replay, preserving
 *            current raster semantics. Alternatives: UI event replay or source diffs.
 *            Revisit if editable vector objects become part of ImageContent.
 * LIMITS     Caller owns returned typed arrays as immutable; each call is synchronous.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { imageContent } from './image-content.ts';
import { adjustRaster } from './image-adjust.ts';
import { maskedMerge } from './image-composite.ts';
import { transformRaster } from './raster-transform.ts';
import { downpixelImage } from './image-downpixel.ts';
import { resizePolicyRaster } from './image-policy-drawing.ts';
import { validateImageOperation } from './image-operations-validate.ts';
import { readLayer, mergedImage, writeLayer } from './image-operations-pixels.ts';
import { replayStroke } from './image-operations-stroke.ts';
import { replayDrawing } from './image-operations-draw.ts';
import { replaySelection } from './image-operations-selection.ts';
import { replayLayer } from './image-operations-layers.ts';
import { replayTransfer } from './image-operations-transfer.ts';
import type { ImageOperation, ImageOperationState, ImageRecipeAsset } from './image-operation-types.ts';
export function applyImageOperation(state: ImageOperationState, operation: ImageOperation, assets: readonly ImageRecipeAsset[] = []): ImageOperationState {
  const op = validateImageOperation(operation), { image, clipboard } = state;
  if (op.kind === 'selection') return Object.freeze({ image: replaySelection(image, op), clipboard });
  if (op.kind === 'layer') return Object.freeze({ image: replayLayer(image, op), clipboard });
  if (op.kind === 'clipboard' || op.kind === 'delete' || op.kind === 'paste' || op.kind === 'move' || op.kind === 'affine') return replayTransfer(state, op, assets);
  if (op.kind === 'policy') return Object.freeze({ image: imageContent({ operation: 'policy', previous: image, policy: op.policy }), clipboard });
  if (op.kind === 'transform' || op.kind === 'downpixel') {
    const layers = image.layers.map(({ tiles: _tiles, ...meta }, i) => {
      const raster = readLayer(image, i);
      const result = op.kind === 'downpixel' ? downpixelImage(raster, op) : op.transform.kind === 'resize'
        ? resizePolicyRaster(raster, op.transform.width, op.transform.height, image.policy.mode)
        : transformRaster(raster, op.transform.kind === 'canvas' && i > 0 ? { ...op.transform, fill: [0, 0, 0, 0] } : op.transform);
      return { meta, raster: result };
    });
    const result = imageContent({ operation: 'layers', previous: image, width: layers[0]!.raster.width, height: layers[0]!.raster.height, layers, activeLayerId: image.activeLayerId });
    return Object.freeze({ image: imageContent({ operation: 'selection', previous: result, mask: null }), clipboard });
  }
  const raster = readLayer(image), mask = image.selection?.mask ?? null;
  if (op.kind === 'stroke') replayStroke(raster, mask, op, image.layers[0]!.id === image.activeLayerId);
  else if (op.kind === 'shape' || op.kind === 'fill' || op.kind === 'gradient') replayDrawing(raster, mask, op, op.kind === 'fill' && op.sample === 'merged' ? mergedImage(image) : undefined, image.policy.mode);
  else if (op.kind === 'adjust') { const base = raster.data.slice(), rect = image.selection?.bounds ?? { x: 0, y: 0, width: image.width, height: image.height }; adjustRaster(raster, op.adjustment, rect); if (mask) maskedMerge({ target: raster, base, mask, rect }); }
  return Object.freeze({ image: writeLayer(image, raster), clipboard });
}
