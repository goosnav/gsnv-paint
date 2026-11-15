import assert from 'node:assert/strict';
import test from 'node:test';
import { imageContent } from './image-content.ts';
import { createRaster, paintRaster, type RGBA } from './raster-ops.ts';
import { applyCoverage, dab, dabLine, spray } from './image-brush.ts';
import { applyImageOperation } from './image-operations.ts';
import { validateImageOperation } from './image-operations-validate.ts';
import { scaleImageOperation } from './image-operations-scale.ts';
import type { ImageOperation, ImageOperationState } from './image-operation-types.ts';

const red: RGBA = [255, 0, 0, 255], white: RGBA = [255, 255, 255, 255];
const state = (width = 16, height = 12): ImageOperationState => ({ image: imageContent({ operation: 'new', width, height, fill: white }), clipboard: null });
const active = (s: ImageOperationState) => imageContent({ operation: 'raster', value: s.image, layerId: s.image.activeLayerId });
const options = { size: 4, pixelSize: 1, edge: 'smooth' as const, hardness: .8, opacity: .6, flow: .3, strength: .5, density: 40 };
const stroke = (tool: 'brush' | 'airbrush'): ImageOperation => ({ kind: 'stroke', tool, segments: [{ points: [[2, 3]], seed: 7 }, { points: [[2, 3], [9, 6]], seed: 8 }], options, color: red, background: white, cloneOffset: null });

test('PU-10 stroke replay matches interactive segmented brush coverage exactly without mutating inputs', () => {
  const initial = state(), before = active(initial), expected = active(initial), base = expected.data.slice();
  const cov = { width: expected.width, height: expected.height, data: new Float32Array(expected.width * expected.height) };
  let rect = dab(cov, 2, 3, 4, .8, .3)!;
  applyCoverage({ raster: expected, base, cov, rect, mode: { kind: 'paint', color: red }, opacity: .6 });
  rect = dabLine(cov, [2, 3], [9, 6], 4, .8, .3, 0).rect!;
  applyCoverage({ raster: expected, base, cov, rect, mode: { kind: 'paint', color: red }, opacity: .6 });
  const result = applyImageOperation(initial, stroke('brush'));
  assert.deepEqual(active(result), expected);
  assert.deepEqual(active(initial), before);
  assert.notEqual(result.image, initial.image);
});

test('PU-10 spray records every actual seed, including stationary timer events', () => {
  const initial = state(), expected = active(initial), base = expected.data.slice(), cov = { width: 16, height: 12, data: new Float32Array(192) };
  for (const [x, y, seed] of [[2, 3, 7], [9, 6, 8]]) { const rect = spray(cov, x!, y!, 2, 10, seed!)!; applyCoverage({ raster: expected, base, cov, rect, mode: { kind: 'paint', color: red }, opacity: .6 }); }
  assert.deepEqual(active(applyImageOperation(initial, stroke('airbrush'))), expected);
});

test('PU-10 selection, edits and internal clipboard operate on current input pixels', () => {
  let s = state(8, 8);
  s = applyImageOperation(s, { kind: 'shape', shape: 'rectangle', a: [1, 1], b: [2, 2], size: 1, stroke: null, fill: red });
  s = applyImageOperation(s, { kind: 'selection', action: 'shape', shape: { kind: 'rectangle', a: [1, 1], b: [2, 2] }, mode: 'replace' });
  s = applyImageOperation(s, { kind: 'clipboard', action: 'cut', source: 'selection', background: white });
  assert.deepEqual(Array.from(active(s).data.slice(36, 40)), white);
  assert.deepEqual(Array.from(s.clipboard!.data.slice(0, 4)), red);
  s = applyImageOperation(s, { kind: 'paste', source: { kind: 'clipboard' }, name: 'Copied', box: { x: 4, y: 4, width: 2, height: 2 }, sampling: 'nearest', select: true });
  assert.equal(s.image.layers.length, 2);
  assert.deepEqual(s.image.selection!.bounds, { x: 4, y: 4, width: 2, height: 2 });
  assert.deepEqual(Array.from(active(s).data.slice((4 * 8 + 4) * 4, (4 * 8 + 4) * 4 + 4)), red);
});

test('PU-10 layer operations use portable indices, reject unavailable layers atomically', () => {
  const initial = state();
  let s = applyImageOperation(initial, { kind: 'layer', action: 'new', name: 'Ink' });
  s = applyImageOperation(s, { kind: 'layer', action: 'duplicate', index: 1 });
  s = applyImageOperation(s, { kind: 'layer', action: 'reorder', index: 2, to: 0 });
  assert.equal(s.image.layers[0]!.name, 'Ink copy');
  assert.equal(initial.image.layers.length, 1);
  assert.throws(() => applyImageOperation(s, { kind: 'layer', action: 'delete', index: 99 }), /layer/i);
  assert.throws(() => applyImageOperation(initial, { kind: 'layer', action: 'delete', index: 0 }), /last|one layer/i);
});

test('PU-10 validation rejects unknown keys, resource requests and prototype names', () => {
  for (const value of [{ kind: 'fetch', url: 'https://example.com' }, { kind: 'delete', background: white, path: '../original.png' }, { kind: 'layer', action: 'select', index: -1 }, { kind: 'shape', shape: 'line', a: [Infinity, 0], b: [0, 0], size: 1, stroke: red, fill: null }, { kind: 'transform', transform: { kind: 'resize', width: 50000, height: 50000 } }]) assert.throws(() => validateImageOperation(value));
  const value = validateImageOperation(stroke('brush'));
  assert.ok(Object.isFrozen(value));
  assert.notEqual(value, stroke('brush'));
  assert.throws(() => applyImageOperation(state(), { kind: 'paste', source: { kind: 'asset', id: '__proto__' }, name: 'Missing', box: { x: 0, y: 0, width: 2, height: 2 }, sampling: 'nearest', select: true }), /asset/i);
});

test('PU-14 coordinates scale independently, radii use min factor and explicit output size stays absolute', () => {
  const scaled = scaleImageOperation({ kind: 'shape', shape: 'ellipse', a: [2, 3], b: [8, 9], size: 4, stroke: red, fill: null }, { width: 10, height: 10 }, { width: 20, height: 30 });
  assert.deepEqual(scaled, { kind: 'shape', shape: 'ellipse', a: [4, 9], b: [16, 27], size: 8, stroke: red, fill: null });
  const resize: ImageOperation = { kind: 'transform', transform: { kind: 'resize', width: 32, height: 32 } };
  assert.deepEqual(scaleImageOperation(resize, { width: 10, height: 10 }, { width: 20, height: 30 }), resize);
});

test('PU-10 shape pixels match existing aliased raster drawing', () => {
  const expected = createRaster(16, 12, white);
  paintRaster(expected, { kind: 'ellipse', a: [1, 2], b: [10, 8], size: 2, stroke: red, fill: null });
  assert.deepEqual(active(applyImageOperation(state(), { kind: 'shape', shape: 'ellipse', a: [1, 2], b: [10, 8], size: 2, stroke: red, fill: null })), expected);
});
