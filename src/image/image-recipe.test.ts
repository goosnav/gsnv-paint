import assert from 'node:assert/strict';
import test from 'node:test';
import { imageContent } from './image-content.ts';
import { imageRecipe } from './image-recipe.ts';
import { recipeSize } from './image-recipe-data.ts';
import { applyImageOperation } from './image-operations.ts';
import { createRaster } from './raster-ops.ts';
import type { ImageRecipe, ImageOperationState, ImageOperation } from './image-operation-types.ts';

const state = (size = 8): ImageOperationState => ({ image: imageContent({ operation: 'new', width: size, height: size, fill: [255, 255, 255, 255] }), clipboard: null });
const recipe = (operations: ImageOperation[]): ImageRecipe => ({ format: 'gsnv-actions', version: 1, name: 'Test action', output: 'png', assets: [], steps: operations.map((operation, i) => ({ id: `s${i}`, label: `Step ${i}`, enabled: true, reference: { width: 8, height: 8 }, operation })) });
const shape: ImageOperation = { kind: 'shape', shape: 'rectangle', a: [1, 1], b: [2, 2], size: 1, stroke: null, fill: [255, 0, 0, 255] };

test('PU-12 recipe dimensions accept high-resolution scans while enforcing both raster bounds', () => {
  assert.deepEqual(recipeSize(5100, 6600), { width: 5100, height: 6600 });
  assert.deepEqual(recipeSize(8192, 8192), { width: 8192, height: 8192 });
  for (const [width, height] of [[8192, 8193], [16385, 1], [1, 16385]])
    assert.throws(() => recipeSize(width, height), /limit/);
  const base = recipe([{ kind: 'transform', transform: { kind: 'resize', width: 5100, height: 6600 } }]);
  const large = { ...base, steps: base.steps.map(step => ({ ...step, reference: { width: 5100, height: 6600 } })) };
  const reopened = imageRecipe({ operation: 'decode', bytes: imageRecipe({ operation: 'encode', value: large }) });
  assert.deepEqual(reopened, large);
});

test('PU-10/12 complete recipe roundtrip preserves assets including RGB below transparent alpha', () => {
  const asset = createRaster(2, 2, [10, 20, 30, 0]); asset.data.set([45, 67, 89, 255], 4);
  const r: ImageRecipe = { ...recipe([{ kind: 'paste', source: { kind: 'asset', id: 'text' }, name: 'Custom font text', box: { x: 1, y: 1, width: 2, height: 2 }, sampling: 'nearest', select: true }]), assets: [{ id: 'text', ...asset }] };
  const bytes = imageRecipe({ operation: 'encode', value: r });
  const decoded = imageRecipe({ operation: 'decode', bytes });
  assert.deepEqual(decoded, r);
  assert.deepEqual(imageRecipe({ operation: 'encode', value: decoded }), bytes);
  assert.notEqual(decoded.assets[0]!.data, r.assets[0]!.data);
  assert.ok(Object.isFrozen(decoded));
});

test('PU-10/14 full recipe equals semantic interactive edits and scales each step independently', () => {
  const ops: ImageOperation[] = [shape, { kind: 'selection', action: 'shape', shape: { kind: 'rectangle', a: [1, 1], b: [2, 2] }, mode: 'replace' }, { kind: 'clipboard', action: 'copy', source: 'selection', background: [255, 255, 255, 255] }, { kind: 'paste', source: { kind: 'clipboard' }, name: 'Pasted', box: { x: 4, y: 4, width: 2, height: 2 }, sampling: 'nearest', select: true }, { kind: 'adjust', adjustment: { kind: 'invert' } }, { kind: 'selection', action: 'none' }, { kind: 'layer', action: 'flatten' }];
  const r = recipe(ops), original = state();
  assert.deepEqual(imageRecipe({ operation: 'replay', value: r, state: original }), ops.reduce((s, op) => applyImageOperation(s, op), original));
  const resized = imageRecipe({ operation: 'replay', value: recipe([shape]), state: state(16) });
  const pixels = imageContent({ operation: 'raster', value: resized.image, layerId: resized.image.activeLayerId });
  assert.deepEqual(Array.from(pixels.data.slice((2 * 16 + 2) * 4, (2 * 16 + 2) * 4 + 4)), [255, 0, 0, 255]);
  assert.deepEqual(Array.from(pixels.data.slice((1 * 16 + 1) * 4, (1 * 16 + 1) * 4 + 4)), [255, 255, 255, 255]);
});

test('PU-12 disabled operations do not execute; explicit resize resets subsequent step reference', () => {
  const r = recipe([{ kind: 'transform', transform: { kind: 'resize', width: 4, height: 4 } }, shape]);
  const adjusted = { ...r, steps: r.steps.map((step, i) => i === 1 ? { ...step, reference: { width: 4, height: 4 } } : step) };
  const out = imageRecipe({ operation: 'replay', value: adjusted, state: state(16) });
  assert.equal(out.image.width, 4);
  assert.equal(out.image.height, 4);
  const disabled = { ...r, steps: r.steps.map(step => ({ ...step, enabled: false })) };
  assert.equal(imageRecipe({ operation: 'replay', value: disabled, state: state() }).image.width, 8);
});

test('PU-10 malformed formats, missing assets and resource requests fail before replay', () => {
  const good = recipe([shape]);
  for (const bad of [{ ...good, version: 2 }, { ...good, unknown: true }, { ...good, steps: [...good.steps, good.steps[0]] }, { ...good, steps: Array.from({ length: 1001 }, (_, i) => ({ ...good.steps[0], id: String(i) })) }, { ...good, steps: [{ ...good.steps[0], reference: { width: 0, height: 8 } }] }, { ...good, assets: [{ id: 'broken', width: 1, height: 1, data: new Uint8ClampedArray(3) }] }]) assert.throws(() => imageRecipe({ operation: 'validate', value: bad }));
  assert.throws(() => imageRecipe({ operation: 'decode', bytes: new Uint8Array([0xff]) }), /UTF|encoded|encoding/i);
  const missing = recipe([{ kind: 'paste', source: { kind: 'asset', id: 'missing' }, name: 'Missing', box: { x: 0, y: 0, width: 1, height: 1 }, sampling: 'nearest', select: false }]);
  assert.throws(() => imageRecipe({ operation: 'validate', value: missing }), /asset/i);
});

test('PU-12 a failing step identifies its label and leaves the input unchanged', () => {
  const input = state(), before = imageContent({ operation: 'raster', value: input.image, layerId: input.image.activeLayerId });
  const r = recipe([shape, { kind: 'layer', action: 'select', index: 9 }]);
  assert.throws(() => imageRecipe({ operation: 'replay', value: r, state: input }), /Step 2 \(Step 1\).*layer/i);
  assert.deepEqual(imageContent({ operation: 'raster', value: input.image, layerId: input.image.activeLayerId }), before);
});

test('PU-12 file decoding rejects malformed asset encodings and unbounded dimensions before replay', () => {
  const serialized = { ...recipe([]), assets: [{ id: 'asset', width: 1, height: 1, encoding: 'rgba8-base64', data: 'AQIDBA==' }] };
  for (const changes of [{ encoding: 'png' }, { data: '!!!!!!!!' }, { data: 'AQID' }, { width: 16777217 }, { width: 1.5 }, { extra: true }]) {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...serialized, assets: [{ ...serialized.assets[0], ...changes }] }));
    assert.throws(() => imageRecipe({ operation: 'decode', bytes }));
  }
});
