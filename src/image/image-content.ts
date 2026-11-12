/**
 * PURPOSE    Hold immutable Image documents as shared pixel tiles and map them to native files.
 * KIND       CORE
 * CONTRACT   IN: ImageContentRequest. 'new' {width,height,fill}; 'raster' copies a document into a
 *            caller-owned working raster; 'update' {previous,raster} returns a document that reuses
 *            every unchanged previous tile; 'encode' returns {content Json, bytes}; 'decode' rebuilds a
 *            document from that pair and validates it.
 *            OUT: ImageContent {width,height,tiles} where tiles are row-major TILE×TILE RGBA blocks
 *            (edge tiles are clipped to the image). Callers never mutate a returned tile.
 *            RAISES: RangeError for invalid size/raster/content; ImageContentError for malformed files.
 * GUARANTEES Byte-exact round trip; undo snapshots share untouched tiles, so history memory grows
 *            with the edited area rather than the image size. No DOM, codecs or I/O.
 * TUNING     TILE=256 pixels. Native pixel encoding is uncompressed rgba8 rows in one asset.
 * DECISIONS  D1: Raw rgba8 instead of PNG inside the project: the adapter encode seam is synchronous
 *            and browser PNG encoding is not. Revisit if: the shell gains asynchronous encode.
 * LIMITS     One raster layer per document; MAX_PIXELS from raster-ops bounds the image.
 * TESTBENCH  src/image/image-content.test.ts -- run with: node --import tsx --test src/image/image-content.test.ts
 */
import { createRaster, MAX_PIXELS, type Raster, type RGBA } from './raster-ops.ts';

export type ImageContent = { readonly width: number; readonly height: number; readonly tiles: readonly Uint8ClampedArray[] };
type Encoded = { content: { width: number; height: number; encoding: 'rgba8'; asset: 'pixels' }; bytes: Uint8Array };
type Request =
  | { operation: 'new'; width: number; height: number; fill: RGBA }
  | { operation: 'raster'; value: ImageContent }
  | { operation: 'update'; previous: ImageContent | null; raster: Raster }
  | { operation: 'encode'; value: ImageContent }
  | { operation: 'decode'; content: unknown; bytes: Uint8Array };
type Output<T extends Request> = T['operation'] extends 'raster' ? Raster : T['operation'] extends 'encode' ? Encoded : ImageContent;

export class ImageContentError extends Error { override name = 'ImageContentError'; }
export const TILE = 256;
export const ASSET_ID = 'pixels';

function layout(width: number, height: number) {
  const columns = Math.ceil(width / TILE), rows = Math.ceil(height / TILE);
  return { columns, rows, tile: (index: number) => { const tx = index % columns, ty = Math.floor(index / columns); return { x: tx * TILE, y: ty * TILE, w: Math.min(TILE, width - tx * TILE), h: Math.min(TILE, height - ty * TILE) }; } };
}
function check(value: ImageContent) {
  if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width * value.height > MAX_PIXELS || !Array.isArray(value.tiles)) throw new RangeError('Invalid image document.');
  const { columns, rows, tile } = layout(value.width, value.height);
  if (value.tiles.length !== columns * rows || value.tiles.some((t, i) => !(t instanceof Uint8ClampedArray) || t.length !== tile(i).w * tile(i).h * 4)) throw new RangeError('Image tiles do not match the image size.');
}
function slice(raster: Raster, rect: { x: number; y: number; w: number; h: number }) {
  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let row = 0; row < rect.h; row++) out.set(raster.data.subarray(((rect.y + row) * raster.width + rect.x) * 4, ((rect.y + row) * raster.width + rect.x + rect.w) * 4), row * rect.w * 4);
  return out;
}
function same(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function toRaster(value: ImageContent): Raster {
  const raster = createRaster(value.width, value.height, [0, 0, 0, 0]), { tile } = layout(value.width, value.height);
  value.tiles.forEach((data, index) => { const r = tile(index); for (let row = 0; row < r.h; row++) raster.data.set(data.subarray(row * r.w * 4, (row + 1) * r.w * 4), ((r.y + row) * value.width + r.x) * 4); });
  return raster;
}
function fromRaster(previous: ImageContent | null, raster: Raster): ImageContent {
  if (!raster || !Number.isInteger(raster.width) || !Number.isInteger(raster.height) || raster.width < 1 || raster.height < 1 || raster.width * raster.height > MAX_PIXELS ||
      !(raster.data instanceof Uint8ClampedArray) || raster.data.length !== raster.width * raster.height * 4) throw new RangeError('Invalid raster.');
  const reuse = previous && previous.width === raster.width && previous.height === raster.height;
  const { columns, rows, tile } = layout(raster.width, raster.height), tiles: Uint8ClampedArray[] = [];
  for (let i = 0; i < columns * rows; i++) { const next = slice(raster, tile(i)), old = reuse ? previous.tiles[i] : undefined; tiles.push(old && same(old, next) ? old : next); }
  return Object.freeze({ width: raster.width, height: raster.height, tiles: Object.freeze(tiles) });
}

export function imageContent<T extends Request>(request: T): Output<T> {
  const r = request as Request;
  if (r.operation === 'new') return fromRaster(null, createRaster(r.width, r.height, r.fill)) as Output<T>;
  if (r.operation === 'raster') { check(r.value); return toRaster(r.value) as Output<T>; }
  if (r.operation === 'update') { if (r.previous) check(r.previous); return fromRaster(r.previous, r.raster) as Output<T>; }
  if (r.operation === 'encode') {
    check(r.value); const raster = toRaster(r.value);
    return { content: { width: r.value.width, height: r.value.height, encoding: 'rgba8', asset: ASSET_ID }, bytes: new Uint8Array(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength) } as Output<T>;
  }
  if (r.operation === 'decode') {
    const c = r.content as Record<string, unknown> | null;
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).sort().join() !== 'asset,encoding,height,width' || c.encoding !== 'rgba8' || c.asset !== ASSET_ID) throw new ImageContentError('This image project uses an unsupported layout.');
    const width = c.width as number, height = c.height as number;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new ImageContentError('The image size in this project is invalid.');
    if (!(r.bytes instanceof Uint8Array) || r.bytes.length !== width * height * 4) throw new ImageContentError('The image pixel data is incomplete.');
    return fromRaster(null, { width, height, data: new Uint8ClampedArray(r.bytes) }) as Output<T>;
  }
  throw new RangeError('Unknown image content operation.');
}
