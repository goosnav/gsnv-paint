import assert from 'node:assert/strict';
import test from 'node:test';
import { batchFolderName, batchOutputName, validateBatchName } from './image-batch-paths.ts';

test('BATCH-PATH creates a UTC timestamp/run-id child with deterministic collision suffixes', () => {
  const args = { now: Date.parse('2026-11-15T23:04:05.678Z'), runId: 'abcd-1234' };
  assert.equal(batchFolderName(args), 'gsnv-paint-batch-2026-11-15_23-04-05Z-abcd-1234');
  assert.equal(batchFolderName({ ...args, attempt: 1 }), 'gsnv-paint-batch-2026-11-15_23-04-05Z-abcd-1234-2');
  for (const patch of [{ now: NaN }, { runId: '../bad' }, { runId: '' }, { attempt: -1 }, { attempt: 1.5 }]) assert.throws(() => batchFolderName({ ...args, ...patch }), RangeError);
});

test('BATCH-PATH sanitizes source names and resolves case-insensitive output collisions', () => {
  assert.equal(batchOutputName({ inputName: 'Photo.JPEG', extension: 'png', used: [] }), 'Photo.png');
  assert.equal(batchOutputName({ inputName: '../CON.jpg', extension: 'webp', used: [] }), '_CON.webp');
  assert.equal(batchOutputName({ inputName: 'a:b?.jpg', extension: 'jpg', used: [] }), 'a_b_.jpg');
  assert.equal(batchOutputName({ inputName: 'Photo.jpeg', extension: 'png', used: ['photo.PNG', 'Photo-2.png'] }), 'Photo-3.png');
  const unicode = batchOutputName({ inputName: '😀'.repeat(200) + '.jpg', extension: 'gsnv-image', used: [] });
  assert.ok(new TextEncoder().encode(unicode).length <= 200); assert.equal(validateBatchName(unicode), unicode);
});

test('BATCH-PATH rejects unsafe write names instead of interpreting paths', () => {
  for (const name of ['../x.png', 'a/b.png', 'a\\b.png', '.', '..', '', 'x\0.png', 'name.', 'name ', 'CON', 'con.txt', 'LPT9.png', 'x:y.png', 'x'.repeat(256)]) assert.throws(() => validateBatchName(name), RangeError, name);
  assert.equal(validateBatchName('絵 final.png'), '絵 final.png');
});
