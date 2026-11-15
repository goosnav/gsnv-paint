/**
 * PURPOSE    Replay semantic pixel selections.
 * KIND       CORE
 * CONTRACT   Validated selection operation is evaluated on the current image.
 *            Returns a new canonical selection snapshot without changing pixels.
 * GUARANTEES Wand selection follows current input colours, never a recorded mask.
 * TUNING     Existing mask algorithms and tolerance ranges apply.
 * DECISIONS  D1: Reuse canonical shape/wand combination order from Paint.
 *            Alternative: saved masks. Revisit if feather/grow tools are introduced.
 * LIMITS     No feather/grow operations until the interactive tools support them.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { imageContent, type ImageContent } from './image-content.ts';
import { combineMasks, magicWand, shapeMask } from './image-brush.ts';
import { readLayer, mergedImage } from './image-operations-pixels.ts';
import type { ImageOperation } from './image-operation-types.ts';
export function replaySelection(image: ImageContent, op: Extract<ImageOperation, { kind: 'selection' }>): ImageContent {
  let mask: Uint8Array | null;
  if (op.action === 'all') mask = new Uint8Array(image.width * image.height).fill(255);
  else if (op.action === 'none') mask = null;
  else if (op.action === 'invert') mask = image.selection ? Uint8Array.from(image.selection.mask, m => 255 - m) : new Uint8Array(image.width * image.height).fill(255);
  else if (op.action === 'shape' || op.action === 'wand') {
    const next = op.action === 'shape' ? shapeMask(image.width, image.height, op.shape) : magicWand(op.sample === 'merged' ? mergedImage(image) : readLayer(image), op.point[0], op.point[1], op.tolerance, op.contiguous);
    mask = combineMasks(image.selection?.mask ?? null, next, op.mode);
  } else throw new RangeError('Unknown selection action.');
  return imageContent({ operation: 'selection', previous: image, mask });
}
