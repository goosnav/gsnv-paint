/**
 * PURPOSE    Adapt immutable Image snapshots to owned working rasters.
 * KIND       CORE
 * CONTRACT   readLayer/mergedImage return owned pixels; writeLayer returns a new
 *            tiled snapshot for the current layer. RAISES: RangeError for bad layers.
 * GUARANTEES No mutation of snapshot tiles, I/O or external layer identifiers.
 * TUNING     ImageContent retains its existing limits and tile sharing.
 * DECISIONS  D1: Reuse canonical storage/compositing rather than a second image model.
 *            Alternative: flat-only storage. Revisit if tiled direct editing is added.
 * LIMITS     Callers own returned raster bytes.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { imageContent, type ImageContent } from './image-content.ts';
import { compositeLayers } from './image-composite.ts';
import { createRaster, type Raster } from './raster-ops.ts';
export function readLayer(image: ImageContent, index = image.layers.findIndex(l => l.id === image.activeLayerId)): Raster {
  const layer = image.layers[index]; if (!layer) throw new RangeError('The requested layer does not exist.');
  return imageContent({ operation: 'raster', value: image, layerId: layer.id });
}
export function mergedImage(image: ImageContent): Raster {
  const out = createRaster(image.width, image.height, [0, 0, 0, 0]);
  compositeLayers({ ...out, out: out.data, rect: { x: 0, y: 0, width: out.width, height: out.height }, layers: image.layers.map((l, i) => ({ raster: readLayer(image, i), visible: l.visible, opacity: l.opacity, blend: l.blend })) });
  return out;
}
export function writeLayer(image: ImageContent, raster: Raster): ImageContent { return imageContent({ operation: 'update', previous: image, layerId: image.activeLayerId, raster }); }
