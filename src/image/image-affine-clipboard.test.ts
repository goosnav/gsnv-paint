import assert from 'node:assert/strict';
import test from 'node:test';
import { imageContent } from './image-content.ts';
import { imageRecipe } from './image-recipe.ts';
import { applyImageOperation } from './image-operations.ts';
import { validateImageOperation } from './image-operations-validate.ts';
import { scaleImageOperation } from './image-operations-scale.ts';
import { createRaster } from './raster-ops.ts';
import type { ImageOperation, ImageRecipe } from './image-operation-types.ts';

const affine = { kind: 'affine', clipboard: true, box: { x: 0, y: 0, width: 8, height: 8, angle: 0 }, sampling: 'nearest', background: [255, 255, 255, 255] } as const;
const operations: readonly ImageOperation[] = [
  { kind: 'selection', action: 'all' },
  { kind: 'clipboard', action: 'copy', source: 'selection', background: [255, 255, 255, 255] },
  { kind: 'paste', source: { kind: 'clipboard' }, name: 'Copied input', box: { x: 2, y: 2, width: 2, height: 2 }, sampling: 'nearest', select: true },
  affine,
];
const recipe: ImageRecipe = { format: 'gsnv-actions', version: 1, name: 'Copy and enlarge', output: 'png', assets: [], steps: operations.map((operation, index) => ({ id: `step-${index}`, label: `Step ${index}`, enabled: true, reference: { width: 8, height: 8 }, operation })) };

test('PU-10/11 clipboard affine replays original current-input pixels after a fitted paste', () => {
  const decoded = imageRecipe({ operation: 'decode', bytes: imageRecipe({ operation: 'encode', value: recipe }) });
  assert.deepEqual(decoded.steps[3]!.operation, affine);
  for (const channel of [0, 2]) {
    const raster = createRaster(8, 8, [0, 0, 0, 255]);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) raster.data[(y * 8 + x) * 4 + channel] = 16 + 24 * x;
    const image = imageContent({ operation: 'layers', previous: null, width: 8, height: 8, layers: [{ meta: { id: 'input', name: 'Input', visible: true, opacity: 1, blend: 'normal' }, raster }], activeLayerId: 'input' });
    const result = imageRecipe({ operation: 'replay', value: decoded, state: { image, clipboard: null } });
    assert.equal(result.image.layers.length, 2);
    assert.deepEqual(imageContent({ operation: 'raster', value: result.image, layerId: result.image.activeLayerId }), raster);
    assert.deepEqual(imageContent({ operation: 'raster', value: image, layerId: 'input' }), raster);
    assert.deepEqual(result.clipboard, raster);
  }
});

test('PU-10 clipboard transform accepts only true, excludes asset and fails without clipboard atomically', () => {
  assert.deepEqual(validateImageOperation(affine), affine);
  for (const value of [false, null, undefined, 1, 'true']) assert.throws(() => validateImageOperation({ ...affine, clipboard: value }));
  assert.throws(() => validateImageOperation({ ...affine, asset: 'external' }), /clipboard|asset/i);
  const image = imageContent({ operation: 'new', width: 8, height: 8, fill: [20, 40, 60, 255] });
  const before = imageContent({ operation: 'raster', value: image, layerId: image.activeLayerId });
  assert.throws(() => applyImageOperation({ image, clipboard: null }, affine), /clipboard/i);
  assert.deepEqual(imageContent({ operation: 'raster', value: image, layerId: image.activeLayerId }), before);
  const scaled = scaleImageOperation(affine, { width: 8, height: 8 }, { width: 16, height: 24 });
  assert.deepEqual(scaled, { ...affine, box: { ...affine.box, width: 16, height: 24 } });
});
