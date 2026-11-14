import test from 'node:test';
import assert from 'node:assert/strict';
import { codeDocument, CodeContentError, type CodeDocument } from './code-document.ts';
const golden: CodeDocument = { files: [{ path: 'main.py', language: 'python', text: 'print("Hello, world!")\n' }], entry: 'main.py' };
test('K01 new/encode/decode literal golden and ownership', () => {
  const value = codeDocument({ operation: 'new', language: 'python' }); assert.deepEqual(value, golden);
  assert.deepEqual(codeDocument({ operation: 'encode', value }), { content: golden, assets: [] });
  const input = structuredClone(golden), decoded = codeDocument({ operation: 'decode', content: input });
  assert.deepEqual(decoded, golden); assert.notEqual(decoded.files, input.files);
  assert.ok(Object.isFrozen(decoded) && Object.isFrozen(decoded.files) && Object.isFrozen(decoded.files[0]));
});
test('K01 immutable put/rename/entry/remove and UTF-8 source import', () => {
  const initial = codeDocument({ operation: 'new' });
  const added = codeDocument({ operation: 'import', value: initial, path: 'lib/hello.py', language: 'python', bytes: new TextEncoder().encode('print("雪")\r\n') });
  const selected = codeDocument({ operation: 'entry', value: added, path: 'lib/hello.py' });
  const renamed = codeDocument({ operation: 'rename', value: selected, path: 'lib/hello.py', to: 'hello.py' });
  assert.equal(renamed.entry, 'hello.py'); assert.equal(renamed.files[1]!.text, 'print("雪")\r\n');
  const edited = codeDocument({ operation: 'put', value: renamed, file: { path: 'hello.py', language: 'python', text: 'print(42)' } });
  assert.equal(edited.files.length, 2); assert.equal(renamed.files[1]!.text, 'print("雪")\r\n');
  const removed = codeDocument({ operation: 'remove', value: edited, path: 'hello.py' });
  assert.deepEqual(removed, initial); assert.equal(initial.files.length, 1);
});
test('K01 rejects unsafe paths, duplicate names, malformed schemas and encoding', () => {
  const value = codeDocument({ operation: 'new' });
  for (const path of ['', '/a.py', '../a.py', 'a/../b.py', 'a//b', 'a\\b', 'a:foo', 'a%2fb', 'a\0b', 'a/./b', 'con.py', 'a '.repeat(121)]) {
    assert.throws(() => codeDocument({ operation: 'put', value, file: { path, language: 'text', text: '' } }), CodeContentError, path);
  }
  for (const content of [null, {}, { ...golden, extra: 1 }, { files: [], entry: '' }, { files: [golden.files[0], golden.files[0]], entry: 'main.py' }, { ...golden, entry: 'missing' }, { files: [{ path: 'a', language: 'ruby', text: '' }], entry: 'a' }]) assert.throws(() => codeDocument({ operation: 'decode', content }), CodeContentError);
  for (const text of ['\ud800', '\udfff', 'a\0b']) assert.throws(() => codeDocument({ operation: 'put', value, file: { path: 'a', language: 'text', text } }), CodeContentError);
  assert.throws(() => codeDocument({ operation: 'import', value, path: 'x', language: 'text', bytes: new Uint8Array([0xc3, 0x28]) }), CodeContentError);
  assert.throws(() => codeDocument({ operation: 'remove', value, path: value.entry }), CodeContentError);
  assert.throws(() => codeDocument({ operation: 'rename', value, path: 'missing', to: 'x' }), CodeContentError);
  assert.throws(() => codeDocument({ operation: 'entry', value, path: 'missing' }), CodeContentError);
});
test('K01 byte/file count boundaries and round-trip properties', () => {
  const file = { path: 'a.txt', language: 'text' as const, text: 'a'.repeat(1024 * 1024) };
  const max = codeDocument({ operation: 'decode', content: { files: [file], entry: file.path } });
  assert.equal(max.files[0]!.text.length, 1024 * 1024);
  assert.throws(() => codeDocument({ operation: 'put', value: max, file: { ...file, text: file.text + 'a' } }), CodeContentError);
  assert.throws(() => codeDocument({ operation: 'decode', content: { files: Array.from({ length: 5 }, (_, i) => ({ ...file, path: `${i}.txt` })), entry: '0.txt' } }), CodeContentError);
  for (const count of [1, 2, 128]) {
    const content = { files: Array.from({ length: count }, (_, i) => ({ path: `${i}.txt`, language: 'text', text: `☃ ${i}\n` })), entry: '0.txt' };
    const decoded = codeDocument({ operation: 'decode', content }); assert.deepEqual(codeDocument({ operation: 'decode', content: codeDocument({ operation: 'encode', value: decoded }).content }), content);
  }
  assert.throws(() => codeDocument({ operation: 'decode', content: { files: Array.from({ length: 129 }, (_, i) => ({ path: `${i}`, language: 'text', text: '' })), entry: '0' } }), CodeContentError);
});
