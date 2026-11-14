import test from 'node:test';
import assert from 'node:assert/strict';
import { codeFiles } from './code-files.ts';
import type { FilePorts } from '../shared/file-access.ts';
function ports(): FilePorts {
  return { document: { createElement() { throw Error('Unexpected fallback'); }, body: {} } as unknown as FilePorts['document'], URL: { createObjectURL() { throw Error('Unexpected download'); }, revokeObjectURL() {} }, setTimeout() {} };
}
test('K04 source-file transfers preserve UTF-8, basename and inferred language', async () => {
  const io = ports(), bytes = new TextEncoder().encode('print("雪")\r\n'), writes: Uint8Array[] = [];
  io.showOpenFilePicker = async options => { assert.ok(options.types[0]!.accept['text/plain']!.includes('.py')); return [{ getFile: async () => new File([bytes], 'SOURCE.PY') } as FileSystemFileHandle]; };
  assert.deepEqual(await codeFiles({ operation: 'read' }, io), { kind: 'opened', path: 'SOURCE.PY', language: 'python', bytes });
  let closed = false;
  io.showSaveFilePicker = async options => { assert.equal(options.suggestedName, 'source.py'); return { name: 'source.py', createWritable: async () => ({ write: async (bytes: Uint8Array) => { writes.push(bytes); }, close: async () => { closed = true; }, abort: async () => {} }) } as unknown as FileSystemFileHandle; };
  assert.deepEqual(await codeFiles({ operation: 'write', file: { path: 'lib/source.py', language: 'python', text: 'print("雪")\r\n' } }, io), { kind: 'saved' }); assert.equal(closed, true); assert.deepEqual(writes, [bytes]);
});
test('K04 cancelled and denied source transfers never claim success or silently download', async () => {
  const io = ports(); io.showOpenFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); }; io.showSaveFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); };
  const save = { operation: 'write' as const, file: { path: 'a.js', language: 'javascript' as const, text: '' } };
  assert.deepEqual(await codeFiles({ operation: 'read' }, io), { kind: 'cancelled' }); assert.deepEqual(await codeFiles(save, io), { kind: 'cancelled' });
  io.showSaveFilePicker = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; await assert.rejects(codeFiles(save, io), /Permission denied/);
  io.showOpenFilePicker = async () => [{ getFile: async () => { throw Error('Unreadable source'); } } as unknown as FileSystemFileHandle]; await assert.rejects(codeFiles({ operation: 'read' }, io), /Unreadable source/);
});
test('K04 oversized source is rejected before allocating or reading its payload', async () => {
  const io = ports(); let slices = 0;
  io.showOpenFilePicker = async () => [{ getFile: async () => ({ name: 'large.py', size: 1024 * 1024 + 1, slice() { slices++; throw Error('Payload must not be read'); } }) } as unknown as FileSystemFileHandle];
  await assert.rejects(codeFiles({ operation: 'read' }, io), /limit|1 MiB/); assert.equal(slices, 0);
});
