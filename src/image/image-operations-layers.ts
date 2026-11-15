/**
 * PURPOSE    Replay portable layer-stack edits.
 * KIND       CORE
 * CONTRACT   Assembly: composes stack storage, raster allocation and compositing.
 *            Validated layer operation and immutable ImageContent yield a new
 *            snapshot; indices are bottom-to-top. Invalid targets raise RangeError.
 * GUARANTEES Existing IDs/tiles are shared; generated IDs are deterministic and unique.
 * TUNING     Existing ImageContent 100-layer limit applies.
 * DECISIONS  D1: Record indices, so a recording never depends on source document IDs.
 *            Alternative: source IDs. Revisit if recipes acquire stable role names.
 * LIMITS     A recipe must establish any extra layers before referring to them.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { imageContent, type ImageContent, type LayerMeta } from './image-content.ts';
import { compositeLayers } from './image-composite.ts';
import { createRaster } from './raster-ops.ts';
import { readLayer, mergedImage } from './image-operations-pixels.ts';
import type { ImageOperation } from './image-operation-types.ts';
export function replayLayer(image: ImageContent, op: Extract<ImageOperation, { kind: 'layer' }>): ImageContent {
  const stack: { meta: LayerMeta; from?: string; raster?: ReturnType<typeof createRaster> }[] = image.layers.map(({ tiles: _tiles, ...meta }) => ({ meta }));
  let activeLayerId = image.activeLayerId;
  const id = () => { let n = 1; while (image.layers.some(l => l.id === `recipe-layer-${n}`)) n++; return `recipe-layer-${n}`; };
  const index = 'index' in op ? op.index : image.layers.findIndex(l => l.id === activeLayerId), target = image.layers[index];
  if (!target) throw new RangeError('The requested layer does not exist.');
  if (op.action === 'select') activeLayerId = target.id;
  else if (op.action === 'new') { activeLayerId = id(); stack.splice(index + 1, 0, { meta: { id: activeLayerId, name: op.name, visible: true, opacity: 1, blend: 'normal' }, raster: createRaster(image.width, image.height, [0, 0, 0, 0]) }); }
  else if (op.action === 'duplicate') { activeLayerId = id(); stack.splice(index + 1, 0, { meta: { ...stack[index]!.meta, id: activeLayerId, name: `${target.name} copy` }, from: target.id }); }
  else if (op.action === 'delete') { if (stack.length === 1) throw new RangeError('The last layer cannot be deleted.'); stack.splice(index, 1); activeLayerId = stack[Math.max(0, index - 1)]!.meta.id; }
  else if (op.action === 'reorder') { if (!stack[op.to]) throw new RangeError('The destination layer does not exist.'); stack.splice(op.to, 0, ...stack.splice(index, 1)); }
  else if (op.action === 'rename') stack[index]!.meta.name = op.name;
  else if (op.action === 'visibility') stack[index]!.meta.visible = op.visible;
  else if (op.action === 'opacity') stack[index]!.meta.opacity = op.opacity;
  else if (op.action === 'blend') stack[index]!.meta.blend = op.blend;
  else if (op.action === 'flatten') { const raster = mergedImage(image); stack.splice(0, stack.length, { meta: { id: 'background', name: 'Background', visible: true, opacity: 1, blend: 'normal' }, raster }); activeLayerId = 'background'; }
  else if (op.action === 'mergeDown') {
    if (index === 0) throw new RangeError('The bottom layer has no layer below it.');
    const below = image.layers[index - 1]!, out = createRaster(image.width, image.height, [0, 0, 0, 0]);
    compositeLayers({ width: out.width, height: out.height, out: out.data, rect: { x: 0, y: 0, width: out.width, height: out.height }, layers: [{ raster: readLayer(image, index - 1), visible: true, opacity: below.opacity, blend: 'normal' }, { raster: readLayer(image, index), visible: target.visible, opacity: target.opacity, blend: target.blend }] });
    stack.splice(index - 1, 2, { meta: { ...stack[index - 1]!.meta, opacity: 1 }, raster: out }); activeLayerId = below.id;
  }
  return imageContent({ operation: 'layers', previous: image, width: image.width, height: image.height, layers: stack, activeLayerId });
}
