import assert from 'node:assert/strict';
import test from 'node:test';
import { imageContent } from './image-content.ts';
import { applyImageOperation } from './image-operations.ts';
import { createRaster, paintRaster } from './raster-ops.ts';
import { affineRaster } from './raster-transform.ts';
import type { ImageOperationState } from './image-operation-types.ts';

const initial = (): ImageOperationState => ({ image: imageContent({ operation: 'new', width: 8, height: 8, fill: [255, 255, 255, 255] }), clipboard: null });
const read = (s: ImageOperationState) => imageContent({ operation: 'raster', value: s.image, layerId: s.image.activeLayerId });
const pixels = createRaster(2, 2, [200, 30, 40, 255]); pixels.data.set([1, 2, 3, 0], 0); pixels.data.set([40, 60, 80, 128], 4);
const paste = { kind: 'paste', source: { kind: 'asset', id: 'text-raster' }, name: 'Text', box: { x: 1, y: 2, width: 2, height: 2 }, sampling: 'nearest', select: true } as const;

test('PU-10 raster text assets preserve exact pixel bytes and graphical transform sampling', () => {
  const s = applyImageOperation(initial(), paste, [{ id: 'text-raster', ...pixels }]);
  const expected = createRaster(8, 8, [0, 0, 0, 0]);
  paintRaster(expected, { kind: 'blit', source: pixels, x: 1, y: 2, mode: 'replace' });
  assert.deepEqual(read(s), expected);
  assert.deepEqual(Array.from(pixels.data.slice(0, 4)), [1, 2, 3, 0]);
  for (const sampling of ['nearest', 'bilinear'] as const) {
    const selection = s.image.selection!, lifted = { ...pixels, data: pixels.data.slice() };
    lifted.data.fill(0, 0, 4); // transparent pixels are outside the alpha-based selection
    const out = applyImageOperation(s, { kind: 'affine', box: { x: 2, y: 1, width: 4, height: 3, angle: 90 }, sampling, background: [255, 255, 255, 255] });
    const r = affineRaster(lifted, { scaleX: 200, scaleY: 150, angle: 90, sampling });
    const target = read(s);
    for (let p = 0; p < selection.mask.length; p++) if (selection.mask[p]) target.data[p * 4 + 3] = 0;
    paintRaster(target, { kind: 'blit', source: r, x: Math.round(2 + 4 / 2 - r.width / 2), y: Math.round(1 + 3 / 2 - r.height / 2), mode: 'over' });
    assert.deepEqual(read(out), target);
    assert.deepEqual(read(s), expected);
  }
});

test('PU-10 move clears only selected source pixels and copy/cut re-evaluates each input', () => {
  let s = applyImageOperation(initial(), { kind: 'shape', shape: 'rectangle', a: [1, 1], b: [2, 2], size: 1, fill: [255, 0, 0, 255], stroke: null });
  s = applyImageOperation(s, { kind: 'selection', action: 'shape', shape: { kind: 'rectangle', a: [1, 1], b: [2, 2] }, mode: 'replace' });
  const moved = applyImageOperation(s, { kind: 'move', dx: 3, dy: 2, background: [255, 255, 255, 255] });
  assert.deepEqual(moved.image.selection!.bounds, { x: 4, y: 3, width: 2, height: 2 });
  const expected = createRaster(8, 8, [255, 255, 255, 255]);
  paintRaster(expected, { kind: 'rectangle', a: [4, 3], b: [5, 4], size: 1, stroke: null, fill: [255, 0, 0, 255] });
  assert.deepEqual(read(moved), expected);
  const cut = applyImageOperation(moved, { kind: 'clipboard', action: 'cut', source: 'selection', background: [0, 0, 255, 255] });
  assert.deepEqual(Array.from(cut.clipboard!.data.slice(0, 4)), [255, 0, 0, 255]);
  assert.deepEqual(Array.from(read(cut).data.slice((3 * 8 + 4) * 4, (3 * 8 + 4) * 4 + 4)), [0, 0, 255, 255]);
  assert.deepEqual(read(moved), expected);
});

test('PU-10 missing assets or clipboard do not alter image snapshots', () => {
  const s = initial(), before = read(s);
  assert.throws(() => applyImageOperation(s, paste), /asset|clipboard/i);
  assert.throws(() => applyImageOperation(s, { ...paste, source: { kind: 'clipboard' } }), /clipboard/i);
  assert.deepEqual(read(s), before);
});
