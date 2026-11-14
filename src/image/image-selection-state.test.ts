import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSelectionState } from './image-selection-state.ts';

test('I58 literal partial-coverage snapshot, minimal bounds and owned immutable record', () => {
  const mask = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 128, 0, 0, 0, 255, 0, 0]);
  const result = imageSelectionState({ width: 5, height: 3, mask });
  assert.deepEqual(result, { mask: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 128, 0, 0, 0, 255, 0, 0]), bounds: { x: 2, y: 1, width: 2, height: 2 } });
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result!.bounds));
  mask.fill(255); assert.equal(result!.mask[0], 0);
  const again = imageSelectionState({ width: 5, height: 3, mask: result!.mask });
  assert.deepEqual(again, result); assert.notEqual(again!.mask, result!.mask);
});

test('I58 empty, single pixel, all edges and maximum coverage dimensions', () => {
  assert.equal(imageSelectionState({ width: 1, height: 1, mask: null }), null);
  assert.equal(imageSelectionState({ width: 2, height: 3, mask: new Uint8Array(6) }), null);
  assert.deepEqual(imageSelectionState({ width: 1, height: 1, mask: new Uint8Array([255]) }), { mask: new Uint8Array([255]), bounds: { x: 0, y: 0, width: 1, height: 1 } });
  const edges = new Uint8Array([1, 0, 0, 0, 0, 1]);
  assert.deepEqual(imageSelectionState({ width: 3, height: 2, mask: edges })!.bounds, { x: 0, y: 0, width: 3, height: 2 });
  const max = new Uint8Array(16777216); max[max.length - 1] = 2;
  assert.deepEqual(imageSelectionState({ width: 4096, height: 4096, mask: max })!.bounds, { x: 4095, y: 4095, width: 1, height: 1 });
});

test('I58 rejects invalid dimensions, mismatched/detached/shared coverage and owns sliced views', () => {
  for (const [width, height] of [[0, 1], [1, 0], [-1, 2], [1.5, 2], [NaN, 1], [Infinity, 1], [4096, 4097], [Number.MAX_SAFE_INTEGER, 2]])
    assert.throws(() => imageSelectionState({ width: width!, height: height!, mask: null }), RangeError);
  const detached = new Uint8Array(1); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  for (const mask of [[], new Uint8ClampedArray(1), new Uint8Array(2), detached, new Uint8Array(new SharedArrayBuffer(1))])
    assert.throws(() => imageSelectionState({ width: 1, height: 1, mask: mask as Uint8Array }), RangeError);
  const buffer = new Uint8Array([99, 3, 0, 1, 88]);
  const result = imageSelectionState({ width: 3, height: 1, mask: buffer.subarray(1, 4) });
  assert.deepEqual([...result!.mask], [3, 0, 1]); assert.equal(result!.mask.buffer.byteLength, 3);
  assert.deepEqual([...buffer], [99, 3, 0, 1, 88]);
});
