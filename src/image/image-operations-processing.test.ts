import assert from 'node:assert/strict';
import test from 'node:test';
import { imageContent } from './image-content.ts';
import { applyImageOperation } from './image-operations.ts';
import { downpixelImage } from './image-downpixel.ts';
import { createRaster } from './raster-ops.ts';
import type { ImageOperationState } from './image-operation-types.ts';

const raster = createRaster(4, 4, [120, 120, 120, 255]);
raster.data.set([200, 10, 30, 255], 0);
const image = imageContent({ operation: 'layers', previous: null, width: 4, height: 4, layers: [{ meta: { id: 'a', name: 'Base', visible: true, opacity: 1, blend: 'normal' }, raster }, { meta: { id: 'b', name: 'Top', visible: false, opacity: .7, blend: 'multiply' }, raster }], activeLayerId: 'a' });
const original: ImageOperationState = { image, clipboard: null };
const read = (s: ImageOperationState, layerId = s.image.activeLayerId) => imageContent({ operation: 'raster', value: s.image, layerId });

test('PU-08/10 down-pixel preserves metadata and processes all layers with absolute targets', () => {
  for (const resize of [false, true]) {
    const selected = applyImageOperation(original, { kind: 'selection', action: 'all' });
    const result = applyImageOperation(selected, { kind: 'downpixel', width: 2, height: 2, resize });
    assert.deepEqual(read(result), downpixelImage(raster, { width: 2, height: 2, resize }));
    assert.deepEqual(read(result, 'b'), read(result));
    assert.equal(result.image.layers[1]!.visible, false);
    assert.equal(result.image.layers[1]!.opacity, .7);
    assert.equal(result.image.layers[1]!.blend, 'multiply');
    assert.equal(result.image.selection, null);
    assert.deepEqual(read(original), raster);
  }
  assert.throws(() => applyImageOperation(original, { kind: 'downpixel', width: 5, height: 4, resize: false }), /logical|source/i);
});

test('PU-07/10 clipboard output obeys strict palette while editable pixels stay unchanged', () => {
  let s = applyImageOperation(original, { kind: 'policy', policy: { mode: 'pixel-art', palette: { colours: [[0, 0, 0], [255, 255, 255]], dither: 'none' } } });
  for (const source of ['canvas', 'selection'] as const) {
    s = applyImageOperation(s, { kind: 'selection', action: 'all' });
    const result = applyImageOperation(s, { kind: 'clipboard', action: 'copy', source, background: [255, 255, 255, 255] });
    assert.deepEqual(Array.from(result.clipboard!.data.slice(0, 4)), [0, 0, 0, 255]);
    assert.deepEqual(read(result), raster);
    assert.equal(s.clipboard, null);
  }
});
