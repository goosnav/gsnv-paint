/**
 * PURPOSE    Validate the three explicit workspace raster-copy directions (D01).
 * KIND       CORE
 * CONTRACT   IN: unknown version-1 transfer. OUT: validated owned straight RGBA8,
 *            top-left sRGB pixels and copied source/view stamp, never editor handles.
 *            RAISES: BridgeDirectionError, BridgeRasterError, CadTransparencyError.
 * GUARANTEES No input mutation or buffer aliases; no DOM, files, execution or I/O.
 * TUNING     At most 16,777,216 pixels; one raster allocation is at most 64 MiB.
 * DECISIONS  D1: Contiguous bytes match working Image rasters. Alternative: a tiled
 *            transfer protocol adds a second consumer API. Revisit if: Image's pixel
 *            ceiling or raster representation changes.
 * LIMITS     Byte order/color/fringe truth require producer goldens; stamps require
 *            shell comparison with current state. Readonly does not freeze bytes.
 * TESTBENCH  src/bridge/transfer-contract.test.ts
 */
type Stamp<W extends 'image' | 'video' | 'cad'> = Readonly<{ workspace: W; documentId: string; identity: string; epoch: number; viewRevision: string }>;
type Pixels = Readonly<{ width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer>; colorSpace: 'srgb'; alpha: 'straight' }>;
export type TransferRaster = Readonly<{ version: 1; label: string; pixels: Pixels }> & (
  | { route: 'image-to-video-bin'; source: Stamp<'image'> }
  | { route: 'video-frame-to-image'; source: Stamp<'video'>; frame: { timelineSeconds: number; fps: number } }
  | { route: 'cad-viewport-to-image'; source: Stamp<'cad'>; background: 'transparent' }
);
export type TransferIntent = { route: 'image-to-video-bin' } | { route: 'video-frame-to-image' } | { route: 'cad-viewport-to-image'; width: number; height: number };
const fail = (name: string, message: string): never => { throw Object.assign(new Error(message), { name }); };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
export function transferRaster(input: unknown): TransferRaster {
  if (!record(input) || input.version !== 1 || !text(input.label)) fail('BridgeDirectionError', 'Unsupported workspace transfer.');
  const v = input as Record<string, unknown>, source = v.source, pixels = v.pixels;
  const workspace = v.route === 'image-to-video-bin' ? 'image' : v.route === 'video-frame-to-image' ? 'video' : v.route === 'cad-viewport-to-image' ? 'cad' : null;
  if (!workspace || !record(source) || source.workspace !== workspace || !text(source.documentId) || !text(source.identity) || !text(source.viewRevision) || !Number.isSafeInteger(source.epoch) || (source.epoch as number) < 0) fail('BridgeDirectionError', 'Transfer source or revision is invalid.');
  if (!record(pixels)) fail('BridgeRasterError', 'Transfer pixels are missing.');
  const p = pixels as Record<string, unknown>, width = p.width as number, height = p.height as number, data = p.rgba;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 16_777_216 || p.colorSpace !== 'srgb' || p.alpha !== 'straight' || !(data instanceof Uint8ClampedArray) || !(data.buffer instanceof ArrayBuffer) || data.length !== width * height * 4) fail('BridgeRasterError', 'Use positive pixel dimensions up to 16,777,216 pixels and owned straight-alpha sRGB RGBA bytes.');
  if (workspace === 'cad' && v.background !== 'transparent') fail('CadTransparencyError', 'CAD capture must use a transparent background.');
  if (workspace === 'video' && (!record(v.frame) || !Number.isFinite(v.frame.timelineSeconds) || (v.frame.timelineSeconds as number) < 0 || !Number.isFinite(v.frame.fps) || (v.frame.fps as number) <= 0)) fail('BridgeDirectionError', 'The captured Video time is invalid.');
  const result = { version: 1, route: v.route, label: v.label, source: Object.freeze({ ...source as object }), pixels: Object.freeze({ width, height, rgba: new Uint8ClampedArray(data as Uint8ClampedArray), colorSpace: 'srgb', alpha: 'straight' }),
    ...(workspace === 'cad' ? { background: 'transparent' } : workspace === 'video' ? { frame: Object.freeze({ ...v.frame as object }) } : {}) };
  return Object.freeze(result) as TransferRaster;
}
