import assert from 'node:assert/strict';
import test from 'node:test';
import { createBatchZip } from './image-batch-zip.ts';

test('BATCH-ZIP stores UTF-8 names, exact bytes, CRC32 and a consistent central directory', async () => {
  const zip = createBatchZip({ now: Date.parse('2026-11-15T23:04:06Z') });
  await zip.add('絵.png', new Blob(['123456789'])); await zip.add('empty.png', new Blob());
  const blob = zip.finish(), bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer), nameLength = new TextEncoder().encode('絵.png').length;
  assert.equal(blob.type, 'application/zip'); assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x800); assert.equal(view.getUint16(8, true), 0); assert.equal(view.getUint32(14, true), 0xcbf43926);
  assert.equal(view.getUint32(18, true), 9); assert.equal(view.getUint32(22, true), 9); assert.equal(view.getUint16(26, true), nameLength);
  assert.equal(new TextDecoder().decode(bytes.slice(30, 30 + nameLength)), '絵.png');
  assert.equal(new TextDecoder().decode(bytes.slice(30 + nameLength, 39 + nameLength)), '123456789');
  const end = bytes.length - 22; assert.equal(view.getUint32(end, true), 0x06054b50); assert.equal(view.getUint16(end + 10, true), 2);
  const central = view.getUint32(end + 16, true); assert.equal(view.getUint32(central, true), 0x02014b50); assert.equal(view.getUint32(central + 16, true), 0xcbf43926);
  assert.equal(central + view.getUint32(end + 12, true), end); assert.equal(zip.bytes, bytes.length); assert.equal(zip.finish(), blob);
});

test('BATCH-ZIP enforces total encoded size before reading and rejects duplicates/path traversal', async () => {
  const zip = createBatchZip({ maxBytes: 120 }); await zip.add('a.png', new Blob(['x']));
  await assert.rejects(zip.add('A.PNG', new Blob(['x'])), /already|duplicate/i);
  await assert.rejects(zip.add('../b.png', new Blob()), /name|path/i);
  await assert.rejects(zip.add('b.png', new Blob(['x'])), /limit|large|bytes/i);
  assert.equal(zip.finish().size, 109);
  assert.throws(() => createBatchZip({ maxBytes: 128 * 1024 * 1024 + 1 }), RangeError);
});

test('BATCH-ZIP cancel discards pending bytes and blocks late asynchronous writes', async () => {
  const zip = createBatchZip(); let release!: (value: ArrayBuffer) => void;
  const blob = new Blob(['x']); Object.defineProperty(blob, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => { release = resolve; }) });
  const writing = zip.add('a.png', blob); assert.throws(() => zip.finish(), /pending|writing/i); zip.cancel(); release(new Uint8Array([120]).buffer);
  await assert.rejects(writing, /cancel/i); assert.throws(() => zip.finish(), /cancel/i); await assert.rejects(zip.add('b.png', new Blob()), /cancel/i); assert.equal(zip.bytes, 0);
});
