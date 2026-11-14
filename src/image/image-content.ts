/**
 * PURPOSE    Represent immutable layered Image documents with exact native serialization.
 * KIND       CORE
 * CONTRACT   IN: ImageContentRequest.
 *            'new' {width,height,fill} → one "Background" layer with the supplied fill;
 *            'raster' {value,layerId} → a caller-owned working raster of that layer;
 *            'update' {previous,layerId,raster} → same document with that layer's changed tiles replaced;
 *            'layers' {previous?,width,height,layers:[{meta, raster?}],activeLayerId} → rebuilds the stack: a
 *            layer without a raster keeps the tiles of its id (or of `from`, for duplicates), so reorder/hide/
 *            rename/duplicate are free;
 *            'selection' {previous,mask} → owned canonical coverage snapshot (null when empty);
 *            raster updates and same-size stack changes retain it; resized stacks clear it.
 *            'encode' → rgba8-layers-v2 metadata and per-layer/optional gray8 selection assets;
 *            'decode' {content,assets} also migrates rgba8/rgba8-layers with null selection.
 *            OUT: ImageContent {width,height,layers:[{id,name,visible,opacity,blend,tiles}],activeLayerId,selection}.
 *            RAISES: RangeError for invalid sizes/rasters/stacks; ImageContentError for malformed files.
 * GUARANTEES Byte-exact round trip including coverage; untouched tiles and selection snapshots are
 *            shared between undo states. Duplicate/missing assets and unknown layouts fail atomically.
 * TUNING     TILE=256; MAX_LAYERS=100.
 * DECISIONS  D1: Raw rgba8 per layer in separate S15 assets. Alternative: compressed images; rejected
 *            because the synchronous CORE seam must preserve RGB below zero alpha. Revisit if the shell
 *            gains a lossless asynchronous encoder or file size becomes a problem.
 *            D2: Explicit v2 domain layout. Alternative: optional selection on the old strict schema;
 *            rejected because old readers must fail visibly. Revisit when another domain migration is needed.
 * LIMITS     No layer masks, groups or editable text layers.
 * TESTBENCH  src/image/image-content.test.ts -- run with: node --import tsx --test src/image/image-content.test.ts
 */
import { createRaster, MAX_PIXELS, type Raster, type RGBA } from './raster-ops.ts';
import { BLEND_MODES, type BlendMode } from './image-composite.ts';
import { imageSelectionState, type ImageSelection } from './image-selection-state.ts';

export type LayerMeta = { id: string; name: string; visible: boolean; opacity: number; blend: BlendMode };
type LayerContent = Readonly<LayerMeta> & { readonly tiles: readonly Uint8ClampedArray[] };
export type ImageContent = { readonly width: number; readonly height: number; readonly layers: readonly LayerContent[]; readonly activeLayerId: string; readonly selection: ImageSelection | null };
type Asset = { id: string; bytes: Uint8Array };
type Encoded = { content: { width: number; height: number; encoding: 'rgba8-layers-v2'; activeLayerId: string; layers: (LayerMeta & { asset: string })[]; selection: { encoding: 'gray8'; asset: 'selection' } | null }; assets: Asset[] };
type Request =
  | { operation: 'new'; width: number; height: number; fill: RGBA }
  | { operation: 'raster'; value: ImageContent; layerId: string }
  | { operation: 'update'; previous: ImageContent; layerId: string; raster: Raster }
  | { operation: 'selection'; previous: ImageContent; mask: Uint8Array | null }
  | { operation: 'layers'; previous: ImageContent | null; width: number; height: number; layers: { meta: LayerMeta; raster?: Raster; from?: string }[]; activeLayerId: string }
  | { operation: 'encode'; value: ImageContent }
  | { operation: 'decode'; content: unknown; assets: readonly Asset[] };

export class ImageContentError extends Error { override name = 'ImageContentError'; }
export const TILE = 256;
const MAX_LAYERS = 100;

function layout(width: number, height: number) {
  const columns = Math.ceil(width / TILE), rows = Math.ceil(height / TILE);
  return { count: columns * rows, tile: (index: number) => { const tx = index % columns, ty = Math.floor(index / columns); return { x: tx * TILE, y: ty * TILE, w: Math.min(TILE, width - tx * TILE), h: Math.min(TILE, height - ty * TILE) }; } };
}
function checkSize(width: number, height: number) { if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new RangeError('Invalid image size.'); }
function checkRaster(r: Raster, width: number, height: number) { if (!r || r.width !== width || r.height !== height || !(r.data instanceof Uint8ClampedArray) || r.data.length !== width * height * 4) throw new RangeError('Layer rasters must match the image size.'); }
function checkMeta(m: LayerMeta) {
  if (!m || typeof m.id !== 'string' || !m.id || typeof m.name !== 'string' || typeof m.visible !== 'boolean' || typeof m.opacity !== 'number' || !(m.opacity >= 0 && m.opacity <= 1) || !BLEND_MODES.includes(m.blend)) throw new RangeError('Invalid layer properties.');
}
function tilesOf(raster: Raster, previous?: readonly Uint8ClampedArray[]): Uint8ClampedArray[] {
  const { count, tile } = layout(raster.width, raster.height), tiles: Uint8ClampedArray[] = [];
  for (let i = 0; i < count; i++) {
    const r = tile(i), next = new Uint8ClampedArray(r.w * r.h * 4);
    for (let row = 0; row < r.h; row++) next.set(raster.data.subarray(((r.y + row) * raster.width + r.x) * 4, ((r.y + row) * raster.width + r.x + r.w) * 4), row * r.w * 4);
    const old = previous?.[i]; let same = !!old && old.length === next.length;
    for (let k = 0; same && k < next.length; k++) if (old![k] !== next[k]) same = false;
    tiles.push(same ? old! : next);
  }
  return tiles;
}
function rasterOf(width: number, height: number, tiles: readonly Uint8ClampedArray[]): Raster {
  const raster = createRaster(width, height, [0, 0, 0, 0]), { tile } = layout(width, height);
  tiles.forEach((data, index) => { const r = tile(index); for (let row = 0; row < r.h; row++) raster.data.set(data.subarray(row * r.w * 4, (row + 1) * r.w * 4), ((r.y + row) * width + r.x) * 4); });
  return raster;
}
function freeze(width: number, height: number, layers: readonly LayerContent[], activeLayerId: string, selection: ImageSelection | null = null): ImageContent {
  if (!layers.length || layers.length > MAX_LAYERS) throw new RangeError(`An image has 1 to ${MAX_LAYERS} layers.`);
  if (new Set(layers.map(l => l.id)).size !== layers.length || !layers.some(l => l.id === activeLayerId)) throw new RangeError('Layer IDs must be unique and the active layer must exist.');
  return Object.freeze({ width, height, layers: Object.freeze(layers.map(l => Object.freeze({ ...l, tiles: Object.freeze([...l.tiles]) }))), activeLayerId, selection });
}
const layer = (value: ImageContent, id: string) => value.layers.find(l => l.id === id) ?? (() => { throw new RangeError('Unknown layer.'); })();

type ContentOutput<T extends Request> = T extends { operation: 'raster' } ? Raster : T extends { operation: 'encode' } ? Encoded : ImageContent;
export function imageContent<T extends Request>(request: T): ContentOutput<T> {
  return applyContent(request) as ContentOutput<T>;
}
function applyContent(request: Request): ImageContent | Raster | Encoded {
  const r = request;
  if (r.operation === 'new') { checkSize(r.width, r.height); return freeze(r.width, r.height, [{ id: 'background', name: 'Background', visible: true, opacity: 1, blend: 'normal', tiles: tilesOf(createRaster(r.width, r.height, r.fill)) }], 'background'); }
  if (r.operation === 'raster') return rasterOf(r.value.width, r.value.height, layer(r.value, r.layerId).tiles);
  if (r.operation === 'selection') {
    const v = r.previous, selection = imageSelectionState({ width: v.width, height: v.height, mask: r.mask });
    if (v.selection === selection || (v.selection && selection && v.selection.mask.every((n, i) => n === selection.mask[i]))) return v;
    return freeze(v.width, v.height, v.layers, v.activeLayerId, selection);
  }
  if (r.operation === 'update') {
    checkRaster(r.raster, r.previous.width, r.previous.height); const target = layer(r.previous, r.layerId);
    return freeze(r.previous.width, r.previous.height, r.previous.layers.map(l => l === target ? { ...l, tiles: tilesOf(r.raster, l.tiles) } : l), r.previous.activeLayerId, r.previous.selection);
  }
  if (r.operation === 'layers') {
    checkSize(r.width, r.height); const sameSize = r.previous && r.previous.width === r.width && r.previous.height === r.height;
    return freeze(r.width, r.height, r.layers.map(({ meta, raster, from }) => {
      checkMeta(meta); const old = r.previous?.layers.find(l => l.id === (from ?? meta.id));
      if (raster) { checkRaster(raster, r.width, r.height); return { ...meta, tiles: tilesOf(raster, sameSize ? old?.tiles : undefined) }; }
      if (!sameSize || !old) throw new RangeError('A new or resized layer needs pixels.');
      return { ...meta, tiles: old.tiles };
    }), r.activeLayerId, sameSize ? r.previous!.selection : null);
  }
  if (r.operation === 'encode') {
    const v = r.value;
    return { content: { width: v.width, height: v.height, encoding: 'rgba8-layers-v2', activeLayerId: v.activeLayerId, layers: v.layers.map((l, i) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, asset: `pixels-${i}` })), selection: v.selection ? { encoding: 'gray8', asset: 'selection' } : null },
      assets: [...v.layers.map((l, i) => { const raster = rasterOf(v.width, v.height, l.tiles); return { id: `pixels-${i}`, bytes: new Uint8Array(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength) }; }),
        ...(v.selection ? [{ id: 'selection', bytes: new Uint8Array(v.selection.mask) }] : [])] };
  }
  if (r.operation === 'decode') {
    const c = r.content as Record<string, unknown> | null, bad = (message: string): never => { throw new ImageContentError(message); };
    if (!c || typeof c !== 'object' || Array.isArray(c)) bad('This image project uses an unsupported layout.');
    const width = c!.width as number, height = c!.height as number;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) bad('The image size in this project is invalid.');
    if (!Array.isArray(r.assets) || r.assets.some(a => !a || typeof a.id !== 'string' || !a.id) || new Set(r.assets.map(a => a.id)).size !== r.assets.length) bad('Image assets must have unique identifiers.');
    const bytes = (id: unknown) => { const asset = r.assets.find(a => a.id === id); if (!asset || !(asset.bytes instanceof Uint8Array) || asset.bytes.length !== width * height * 4) bad('The image pixel data is incomplete.'); return { width, height, data: new Uint8ClampedArray(asset!.bytes) }; };
    // Original single-layer layout (before layers existed).
    if (Object.keys(c!).sort().join() === 'asset,encoding,height,width' && c!.encoding === 'rgba8' && c!.asset === 'pixels')
      return freeze(width, height, [{ id: 'background', name: 'Background', visible: true, opacity: 1, blend: 'normal', tiles: tilesOf(bytes('pixels')) }], 'background');
    const v2 = c!.encoding === 'rgba8-layers-v2';
    if (Object.keys(c!).sort().join() !== (v2 ? 'activeLayerId,encoding,height,layers,selection,width' : 'activeLayerId,encoding,height,layers,width') || (!v2 && c!.encoding !== 'rgba8-layers') || !Array.isArray(c!.layers) || typeof c!.activeLayerId !== 'string') bad('This image project uses an unsupported layout.');
    try {
      let selection: ImageSelection | null = null;
      if (v2 && c!.selection !== null) {
        const s = c!.selection as { encoding?: unknown; asset?: unknown } | null;
        if (!s || typeof s !== 'object' || Object.keys(s).sort().join() !== 'asset,encoding' || s.encoding !== 'gray8' || s.asset !== 'selection') bad('The image selection record is malformed.');
        const asset = r.assets.find(a => a.id === 'selection');
        if (!asset) bad('The image selection coverage is missing.');
        selection = imageSelectionState({ width, height, mask: asset!.bytes });
      }
      return freeze(width, height, (c!.layers as (LayerMeta & { asset: string })[]).map(l => {
        if (!l || Object.keys(l).sort().join() !== 'asset,blend,id,name,opacity,visible') bad('A layer record is malformed.');
        const meta = { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend }; checkMeta(meta); return { ...meta, tiles: tilesOf(bytes(l.asset)) };
      }), c!.activeLayerId as string, selection);
    } catch (cause) { if (cause instanceof ImageContentError) throw cause; bad(cause instanceof Error ? cause.message : String(cause)); }
  }
  throw new RangeError('Unknown image content operation.');
}
