/**
 * PURPOSE    Hold a non-destructive Photo document (original file + develop settings) and map it to native files.
 * KIND       CORE
 * CONTRACT   IN: 'new' {name,mime,bytes}; 'encode' {value}; 'decode' {content,bytes}.
 *            OUT: PhotoContent {source:{name,mime,kind,bytes}, settings}; encode yields
 *            {content:{name,mime,kind,asset:'source',settings}, bytes} for one S15 asset holding the original file.
 *            kind is 'raw' for camera RAW extensions/MIME types, otherwise 'display'.
 *            RAISES: PhotoContentError for unsupported or malformed content; DevelopSettingsError via settings.
 * GUARANTEES The original bytes are never modified; settings are validated on every decode.
 * TUNING     RAW_EXTENSIONS lists the camera formats routed to LibRaw.
 * DECISIONS  D1: Keep the original file inside the project so edits stay re-renderable at full quality.
 *            Alternative: store a rendered image; rejected because it is destructive.
 * LIMITS     One photo per document; no sidecar XMP interchange.
 * TESTBENCH  src/photo/photo-content.test.ts -- run with: node --import tsx --test src/photo/photo-content.test.ts
 */
import { defaultSettings, readSettings, type DevelopSettings } from './develop-settings.ts';

export type PhotoSource = { name: string; mime: string; kind: 'raw' | 'display'; bytes: Uint8Array };
export type PhotoContent = { readonly source: PhotoSource; readonly settings: DevelopSettings };
export const RAW_EXTENSIONS = ['.dng', '.cr2', '.cr3', '.crw', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.orf', '.rw2', '.pef', '.srw', '.x3f', '.3fr', '.iiq', '.erf', '.kdc', '.mrw', '.raw', '.rwl'];
export const DISPLAY_TYPES: Record<string, string[]> = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'image/avif': ['.avif'], 'image/heic': ['.heic', '.heif'], 'image/tiff': ['.tif', '.tiff'] };
export const ASSET_ID = 'source';
const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'PhotoContentError' }); };
export const kindOf = (name: string, mime: string): 'raw' | 'display' => RAW_EXTENSIONS.some(e => name.toLowerCase().endsWith(e)) || /^image\/(x-)?(dcraw|adobe-dng|canon|nikon|sony|fuji|olympus|panasonic|pentax)/.test(mime) ? 'raw' : 'display';

type Request = { operation: 'new'; name: string; mime: string; bytes: Uint8Array } | { operation: 'encode'; value: PhotoContent } | { operation: 'decode'; content: unknown; bytes: Uint8Array };
type Encoded = { content: { name: string; mime: string; kind: 'raw' | 'display'; asset: 'source'; settings: DevelopSettings }; bytes: Uint8Array };
export function photoContent(request: Extract<Request, { operation: 'encode' }>): Encoded;
export function photoContent(request: Exclude<Request, { operation: 'encode' }>): PhotoContent;
export function photoContent(request: Request): PhotoContent | Encoded {
  if (request.operation === 'new') {
    if (typeof request.name !== 'string' || !request.name.trim() || !(request.bytes instanceof Uint8Array) || !request.bytes.length) fail('Choose a non-empty photo file.');
    return Object.freeze({ source: Object.freeze({ name: request.name, mime: request.mime || 'application/octet-stream', kind: kindOf(request.name, request.mime), bytes: request.bytes }), settings: defaultSettings() });
  }
  if (request.operation === 'encode') {
    const { source, settings } = request.value;
    return { content: { name: source.name, mime: source.mime, kind: source.kind, asset: ASSET_ID, settings: readSettings(settings) }, bytes: source.bytes };
  }
  const c = request.content as Encoded['content'] | null;
  if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).sort().join() !== 'asset,kind,mime,name,settings' || c.asset !== ASSET_ID || !['raw', 'display'].includes(c.kind) || typeof c.name !== 'string' || !c.name || typeof c.mime !== 'string') fail('This photo project uses an unsupported layout.');
  if (!(request.bytes instanceof Uint8Array) || !request.bytes.length) fail('The original photo is missing from this project.');
  return Object.freeze({ source: Object.freeze({ name: c!.name, mime: c!.mime, kind: c!.kind, bytes: request.bytes }), settings: readSettings(c!.settings) });
}
