import assert from 'node:assert/strict';
import test from 'node:test';
import { imageContent } from './image-content.ts';
import { applyImageOperation } from './image-operations.ts';
import { createRaster } from './raster-ops.ts';
import type { ImageOperation, ImageOperationState } from './image-operation-types.ts';

const options = { size: 1, pixelSize: 1, edge: 'pixel' as const, hardness: 1, opacity: 1, flow: 1, strength: 1, density: 20 };
const stroke = (tool: Extract<ImageOperation, { kind: 'stroke' }>['tool']): Extract<ImageOperation, { kind: 'stroke' }> => ({ kind: 'stroke', tool, segments: [{ points: [[2, 2], [3, 2], [4, 2]], seed: 0 }], options, color: [255, 0, 0, 255], background: [0, 255, 0, 255], cloneOffset: null });
const read = (s: ImageOperationState) => imageContent({ operation: 'raster', value: s.image, layerId: s.image.activeLayerId });
const state = (): ImageOperationState => {
  const raster = createRaster(8, 6, [255, 255, 255, 255]);
  raster.data.set([10, 20, 30, 255], (2 * 8 + 1) * 4);
  return { image: imageContent({ operation: 'layers', previous: null, width: 8, height: 6, layers: [{ meta: { id: 'base', name: 'Base', opacity: 1, visible: true, blend: 'normal' }, raster }], activeLayerId: 'base' }), clipboard: null };
};

test('PU-10 clone reads the original stroke snapshot instead of cascading copied pixels', () => {
  const s = state(), op = { ...stroke('clone'), cloneOffset: [-1, 0] as const };
  const result = read(applyImageOperation(s, op));
  assert.ok(result.data[(2 * 8 + 2) * 4]! < 255, 'the source colour reaches the first painted pixel');
  assert.deepEqual(Array.from(result.data.slice((2 * 8 + 3) * 4, (2 * 8 + 3) * 4 + 4)), [255, 255, 255, 255]);
});

test('PU-10 hard eraser uses background on bottom and transparency on upper layers', () => {
  const bottom = state(), erase = stroke('eraser');
  assert.deepEqual(Array.from(read(applyImageOperation(bottom, erase)).data.slice((2 * 8 + 2) * 4, (2 * 8 + 2) * 4 + 4)), [0, 255, 0, 255]);
  const top = applyImageOperation(bottom, { kind: 'layer', action: 'duplicate', index: 0 });
  assert.equal(read(applyImageOperation(top, erase)).data[(2 * 8 + 2) * 4 + 3], 0);
  assert.equal(read(top).data[(2 * 8 + 2) * 4 + 3], 255);
});

test('PU-10 smudge and blur deterministically reuse current input and respect selection', () => {
  const s = applyImageOperation(state(), { kind: 'selection', action: 'shape', shape: { kind: 'rectangle', a: [2, 1], b: [4, 3] }, mode: 'replace' });
  for (const tool of ['smudge', 'blur'] as const) {
    const op = { ...stroke(tool), options: { ...options, size: 4, strength: .5, edge: 'smooth' as const }, segments: [{ points: [[1, 2]] as const, seed: 0 }, { points: [[1, 2], [5, 2]] as const, seed: 0 }] };
    const out = applyImageOperation(s, op);
    assert.deepEqual(out, applyImageOperation(s, op));
    assert.notDeepEqual(read(out), read(s));
    const before = read(s), after = read(out);
    for (let p = 0; p < s.image.selection!.mask.length; p++) if (!s.image.selection!.mask[p]) assert.deepEqual(after.data.slice(p * 4, p * 4 + 4), before.data.slice(p * 4, p * 4 + 4));
  }
});
