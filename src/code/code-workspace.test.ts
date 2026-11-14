import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodeWorkspace } from './code-workspace.ts';
import type { FilePorts } from '../shared/file-access.ts';
import { codeDocument } from './code-document.ts';
const adapter = () => createCodeWorkspace({} as FilePorts);
test('K04 native source golden preserves all files and the entry without execution', () => {
  const workspace = adapter(), created = workspace.create!();
  assert.equal(created.format, 'gsnv-code'); assert.equal(created.version, 1);
  const value = codeDocument({ operation: 'put', value: codeDocument({ operation: 'new' }), file: { path: 'index.html', language: 'html', text: '<script>throw Error("never execute on open")</script>' } });
  const encoded = workspace.encode({ ...created, value }); assert.equal(encoded.assets.length, 0); assert.deepEqual(encoded.project.content, value);
  assert.deepEqual(workspace.decode(encoded).value, value);
});
test('K04 rejects wrong native format, unsupported version and malformed source', () => {
  const workspace = adapter(), encoded = workspace.encode(workspace.create!());
  for (const project of [{ ...encoded.project, format: 'gsnv-image' }, { ...encoded.project, version: 2 }, { ...encoded.project, content: { files: [], entry: '../bad.py' } }]) assert.throws(() => workspace.decode({ project, assets: [] } as typeof encoded));
});
