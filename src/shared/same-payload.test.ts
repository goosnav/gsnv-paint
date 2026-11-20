import test from 'node:test';
import assert from 'node:assert/strict';
import { samePayload } from './same-payload.ts';

const empty = () => new Uint8Array();
test('Exact payload comparison accepts arbitrary segmentation, empty parts and offset byte views', () => {
  const backing = Uint8Array.from([99, 1, 2, 3, 4, 5, 88]), bytes = backing.subarray(1, 6);
  const variants = [
    [bytes], [bytes.slice()], [empty(), bytes, empty()],
    [bytes.subarray(0, 1), empty(), bytes.subarray(1, 4), bytes.subarray(4)],
    [...bytes].map(byte => Uint8Array.of(byte)),
  ];
  for (const left of variants) for (const right of variants) assert.equal(samePayload(left, right), true);
  assert.equal(samePayload([], [empty(), empty()]), true);
  assert.deepEqual([...backing], [99, 1, 2, 3, 4, 5, 88]);
});

test('Exact payload comparison rejects mismatches at every position and strict length differences', () => {
  const bytes = Uint8Array.from({ length: 513 }, (_, index) => index % 251);
  for (let position = 0; position < bytes.length; position++) {
    const other = bytes.slice(); other[position] = other[position]! ^ 1;
    const left = [empty(), bytes.subarray(0, 256), bytes.subarray(256), empty()];
    const right = [other.subarray(0, position), empty(), other.subarray(position)];
    assert.equal(samePayload(left, right), false);
    assert.equal(samePayload(right, left), false);
  }
  assert.equal(samePayload([bytes], [bytes, Uint8Array.of(0)]), false);
  assert.equal(samePayload([bytes.subarray(0, 512)], [bytes]), false);
  assert.equal(samePayload([], [Uint8Array.of(0)]), false);
});

test('Exact payload comparison handles large cloned and differently segmented byte sequences', () => {
  const bytes = Uint8Array.from({ length: 4 * 1024 * 1024 + 7 }, (_, index) => index % 251), clone = bytes.slice();
  const left = [bytes.subarray(0, 19), empty(), bytes.subarray(19)];
  const right = [empty(), clone.subarray(0, 1024 * 1024), clone.subarray(1024 * 1024), empty()];
  assert.equal(samePayload(left, right), true);
  clone[clone.length - 1] = clone[clone.length - 1]! ^ 1;
  assert.equal(samePayload(left, right), false);
});
