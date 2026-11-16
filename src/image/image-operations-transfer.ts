/**
 * PURPOSE    Replay pixel transfer within an Image document.
 * KIND       CORE
 * CONTRACT   Assembly: composes immutable storage, masks, sampling and layer insertion.
 *            Clipboard/delete/paste/move/affine edits return owned snapshot changes.
 *            Assets are supplied bytes, never paths. Missing clipboard/assets fail.
 * GUARANTEES Input tiles and clipboard pixels remain unchanged; no I/O or clock.
 * TUNING     Existing raster and 100-layer limits apply.
 * DECISIONS  D1: Internal clipboard samples each batch input; external/text pixels
 *            are explicit assets. Revisit when editable text objects are introduced.
 *            Alternative: system clipboard reads. Revisit if editable text arrives.
 * LIMITS     Transforms lift current selection, unless an asset or clipboard:true
 *            explicitly supplies original pixels; those sources are mutually exclusive.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { imageContent, type ImageContent } from './image-content.ts';
import { createRaster, paintRaster, isRasterSize, type Raster } from './raster-ops.ts';
import { affineRaster } from './raster-transform.ts';
import { maskedMerge } from './image-composite.ts';
import { readLayer, mergedImage, writeLayer } from './image-operations-pixels.ts';
import { imageOutput } from './image-output.ts';
import type { ImageOperation, ImageOperationState, ImageRecipeAsset } from './image-operation-types.ts';
type Transfer = Extract<ImageOperation, { kind: 'clipboard' | 'delete' | 'paste' | 'move' | 'affine' }>;
function extract(image: ImageContent, raster: Raster): Raster {
  const b = image.selection?.bounds ?? { x: 0, y: 0, width: image.width, height: image.height }, mask = image.selection?.mask;
  const out = createRaster(b.width, b.height, [0, 0, 0, 0]);
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) { const p = (y + b.y) * image.width + x + b.x, i = p * 4, o = (y * b.width + x) * 4, m = mask?.[p] ?? 255; if (!m) continue; out.data.set(raster.data.subarray(i, i + 3), o); out.data[o + 3] = Math.round(raster.data[i + 3]! * m / 255); }
  return out;
}
function selectPixels(image: ImageContent, raster: Raster, x: number, y: number): ImageContent {
  const mask = new Uint8Array(image.width * image.height);
  for (let sy = 0; sy < raster.height; sy++) for (let sx = 0; sx < raster.width; sx++) { const px = x + sx, py = y + sy; if (px >= 0 && py >= 0 && px < image.width && py < image.height && raster.data[(sy * raster.width + sx) * 4 + 3]) mask[py * image.width + px] = 255; }
  return imageContent({ operation: 'selection', previous: image, mask });
}
export function replayTransfer(state: ImageOperationState, op: Transfer, assets: readonly ImageRecipeAsset[]): ImageOperationState {
  const { image } = state;
  let clipboard = state.clipboard;
  if (op.kind === 'paste') {
    const source = op.source.kind === 'clipboard' ? clipboard : assets.find(a => a.id === (op.source as { id: string }).id);
    if (!source) throw new RangeError('The clipboard or requested asset is unavailable.');
    if (!isRasterSize(source.width, source.height) || !(source.data instanceof Uint8ClampedArray) || source.data.length !== source.width * source.height * 4) throw new RangeError('Invalid image asset pixels.');
    const placed = op.sampling === 'nearest' && op.box.width === source.width && op.box.height === source.height ? source : affineRaster(source, { scaleX: op.box.width / source.width * 100, scaleY: op.box.height / source.height * 100, angle: 0, sampling: op.sampling });
    const layer = createRaster(image.width, image.height, [0, 0, 0, 0]), x = Math.round(op.box.x), y = Math.round(op.box.y);
    paintRaster(layer, { kind: 'blit', source: placed, x, y, mode: 'replace' });
    let n = 1; while (image.layers.some(l => l.id === `recipe-layer-${n}`)) n++; const id = `recipe-layer-${n}`;
    const stack = image.layers.map(({ tiles: _tiles, ...meta }) => ({ meta, raster: undefined as Raster | undefined }));
    stack.splice(image.layers.findIndex(l => l.id === image.activeLayerId) + 1, 0, { meta: { id, name: op.name, visible: true, opacity: 1, blend: 'normal' }, raster: layer });
    let result = imageContent({ operation: 'layers', previous: image, width: image.width, height: image.height, layers: stack.map(s => s.raster ? { meta: s.meta, raster: s.raster } : { meta: s.meta }), activeLayerId: id });
    if (op.select) result = selectPixels(result, placed, x, y);
    return Object.freeze({ image: result, clipboard });
  }
  const raster = readLayer(image), bottom = image.activeLayerId === image.layers[0]!.id;
  if (op.kind === 'clipboard') {
    if (op.source === 'selection' && !image.selection) return state;
    clipboard = imageOutput(op.source === 'canvas' ? mergedImage(image) : extract(image, raster), image.policy);
    if (op.action === 'copy') return Object.freeze({ image, clipboard });
  }
  if (op.kind === 'clipboard' || op.kind === 'delete') {
    if (!image.selection) return state;
    const base = raster.data.slice(), rect = image.selection.bounds;
    paintRaster(raster, { kind: 'clear', rect, color: bottom ? op.background : [0, 0, 0, 0] });
    maskedMerge({ target: raster, base, mask: image.selection.mask, rect });
    return Object.freeze({ image: writeLayer(image, raster), clipboard });
  }
  const selected = op.kind === 'affine' && op.clipboard ? clipboard : op.kind==='affine' && op.asset ? assets.find(a=>a.id===op.asset) : extract(image, raster); if(!selected)throw new RangeError(op.kind === 'affine' && op.clipboard ? 'The original transform clipboard is unavailable.' : 'The original transform asset is unavailable.'); const b = image.selection?.bounds ?? { x: 0, y: 0, width: image.width, height: image.height }, mask = image.selection?.mask;
  for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) { const p = y * image.width + x; if (mask && !mask[p]) continue; if (bottom) raster.data.set(op.background, p * 4); else raster.data[p * 4 + 3] = 0; }
  const placed = op.kind === 'move' ? selected : affineRaster(selected, { scaleX: op.box.width / selected.width * 100, scaleY: op.box.height / selected.height * 100, angle: op.box.angle, sampling: op.sampling });
  const x = Math.round(op.kind === 'move' ? b.x + op.dx : op.box.x + op.box.width / 2 - placed.width / 2), y = Math.round(op.kind === 'move' ? b.y + op.dy : op.box.y + op.box.height / 2 - placed.height / 2);
  paintRaster(raster, { kind: 'blit', source: placed, x, y, mode: 'over' });
  return Object.freeze({ image: selectPixels(writeLayer(image, raster), placed, x, y), clipboard });
}
