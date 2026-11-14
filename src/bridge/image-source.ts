/**
 * PURPOSE    Copy the committed layered Image composite to the Video bin (D02).
 * KIND       CORE
 * CONTRACT   IN: validated ImageContent, Image source stamp and label. OUT: D01
 *            owned full-size straight-alpha sRGB raster, with visibility/blends.
 *            RAISES: BridgeCompositeError; D01 validation errors.
 * GUARANTEES Source tiles, metadata and history are never modified or flattened.
 * TUNING     Composite one 256-pixel tile at a time, retaining full layer precision.
 * DECISIONS  D1: Read committed tiles. Alternative: editor rasters can contain live
 *            previews. Revisit if: Image gains structured text or masks that must
 *            resolve before composition.
 * LIMITS     Current Image layer model only; source readiness belongs to assembly.
 * TESTBENCH  src/bridge/image-source.test.ts
 */
import { TILE, type ImageContent } from '../image/image-content.ts';
import { compositeLayers } from '../image/image-composite.ts';
import { transferRaster, type TransferRaster } from './transfer-contract.ts';
type ImageTransfer = Extract<TransferRaster, { route: 'image-to-video-bin' }>;
export function imageSource({ value, source, label }: { value: ImageContent; source: ImageTransfer['source']; label: string }): ImageTransfer {
  const { width, height } = value;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 16_777_216) throw Object.assign(new Error('Invalid Image dimensions.'), { name: 'BridgeCompositeError' });
  const rgba = new Uint8ClampedArray(width * height * 4), columns = Math.ceil(width / TILE);
  for (let y = 0; y < height; y += TILE) for (let x = 0; x < width; x += TILE) {
    const w = Math.min(TILE, width - x), h = Math.min(TILE, height - y), index = y / TILE * columns + x / TILE, out = new Uint8ClampedArray(w * h * 4);
    const layers = value.layers.map(layer => {
      const data = layer.tiles[index];
      if (!data || data.length !== out.length) throw Object.assign(new Error('An Image layer tile is incomplete.'), { name: 'BridgeCompositeError' });
      return { raster: { width: w, height: h, data }, visible: layer.visible, opacity: layer.opacity, blend: layer.blend };
    });
    compositeLayers({ width: w, height: h, layers, rect: { x: 0, y: 0, width: w, height: h }, out });
    for (let row = 0; row < h; row++) rgba.set(out.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * width + x) * 4);
  }
  return transferRaster({ version: 1, route: 'image-to-video-bin', source, label, pixels: { width, height, rgba, colorSpace: 'srgb', alpha: 'straight' } }) as ImageTransfer;
}
