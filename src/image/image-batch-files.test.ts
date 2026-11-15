import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { pickBatchInputs, createBatchDestination, type BatchDirectory, type BatchFileHandle, type BatchFilePorts } from './image-batch-files.ts';

class Directory implements BatchDirectory {
  kind = 'directory' as const; items = new Map<string, Directory | BatchFileHandle>(); creates: string[] = []; writes: string[] = []; permission: PermissionState = 'granted';
  constructor(public name: string) {}
  async *entries(): AsyncIterableIterator<[string, BatchDirectory | BatchFileHandle]> { yield* this.items; }
  async requestPermission() { return this.permission; }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const entry = this.items.get(name); if (entry) { if (entry.kind === 'directory') return entry as Directory; throw new DOMException('File exists', 'TypeMismatchError'); }
    if (!options?.create) throw new DOMException('Missing', 'NotFoundError'); const child = new Directory(name); this.items.set(name, child); this.creates.push(name); return child;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<BatchFileHandle> {
    const entry = this.items.get(name); if (entry) { if (entry.kind === 'file') return entry; throw new DOMException('Directory exists', 'TypeMismatchError'); }
    if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
    let bytes = new Blob(), pending = new Blob();
    const file: BatchFileHandle = { kind: 'file', name, getFile: async () => new File([bytes], name), createWritable: async () => ({ write: async value => { pending = value; }, close: async () => { bytes = pending; this.writes.push(name); }, abort: async () => {} }) };
    this.items.set(name, file); return file;
  }
  async removeEntry(name: string) { this.items.delete(name); }
  add(name: string, bytes: string) { let current = new File([bytes], name, { lastModified: 123 }); this.items.set(name, { kind: 'file', name, getFile: async () => current }); return { change() { current = new File(['changed'], name, { lastModified: 999 }); } }; }
}
function fixture(directory?: Directory) {
  const dom = new JSDOM('<body></body>'); let picks = 0;
  const ports: BatchFilePorts = { document: dom.window.document, ...(directory ? { showDirectoryPicker: async () => { picks++; return directory; } } : {}) };
  return { dom, ports, get picks() { return picks; } };
}
const stamp = { now: Date.parse('2026-11-15T23:04:05Z'), runId: 'run-1234' };

test('BATCH-FILES snapshots only direct supported inputs before creating a collision-safe output child', async () => {
  const source = new Directory('source'); source.add('one.PNG', 'original'); source.add('note.txt', 'ignored'); source.items.set('nested', new Directory('nested'));
  source.items.set('gsnv-paint-batch-2026-11-15_23-04-05Z-run-1234', new Directory('existing output'));
  const f = fixture(source), selection = (await pickBatchInputs({ source: 'folder', ports: f.ports }))!;
  assert.deepEqual(selection.inputs.map(input => input.name), ['one.PNG']); assert.deepEqual(source.creates, []); assert.equal(await (await selection.inputs[0]!.read()).text(), 'original');
  const destination = (await createBatchDestination({ selection, mode: 'source', ports: f.ports, ...stamp }))!;
  assert.equal(destination.kind, 'directory'); assert.match(destination.name, /-2$/); assert.equal(selection.inputs.length, 1);
  await destination.write('one.png', new Blob(['processed'])); await assert.rejects(destination.write('one.png', new Blob(['overwrite'])), /already|exists/i);
  await assert.rejects(destination.write('../one.PNG', new Blob(['bad'])), /name|path/i);
  const result = await destination.finish(); assert.equal(result.written, 1); assert.equal(await (await selection.inputs[0]!.read()).text(), 'original'); assert.deepEqual(source.writes, []); f.dom.window.close();
});

test('BATCH-FILES source changes fail visibly and single-file output requires a separate destination', async () => {
  const source = new Directory('source'), changing = source.add('a.jpg', 'a'), destination = new Directory('destination'), f = fixture(destination);
  f.ports.showOpenFilePicker = async () => [source.items.get('a.jpg') as BatchFileHandle];
  const selection = (await pickBatchInputs({ source: 'files', ports: f.ports }))!; assert.equal(f.picks, 0);
  await assert.rejects(createBatchDestination({ selection, mode: 'source', ports: f.ports, ...stamp }), /destination|folder/i);
  await createBatchDestination({ selection, mode: 'choose', ports: f.ports, ...stamp }); assert.equal(f.picks, 1);
  changing.change(); await assert.rejects(selection.inputs[0]!.read(), /changed/i); f.dom.window.close();
});

test('BATCH-FILES unsupported directory write returns a labelled ZIP; picker cancellation and denial are distinct', async () => {
  const f = fixture(), source = new Directory('source'); source.add('a.png', 'a'); f.ports.showOpenFilePicker = async () => [source.items.get('a.png') as BatchFileHandle];
  const selection = (await pickBatchInputs({ source: 'files', ports: f.ports }))!, output = (await createBatchDestination({ selection, mode: 'choose', ports: f.ports, ...stamp }))!;
  assert.equal(output.kind, 'zip'); await output.write('a.png', new Blob(['processed'])); const finished = await output.finish(); assert.equal(finished.kind, 'zip'); if (finished.kind === 'zip') assert.equal(finished.blob.type, 'application/zip');
  f.ports.showDirectoryPicker = async () => { throw new DOMException('Cancelled', 'AbortError'); };
  assert.equal(await createBatchDestination({ selection, mode: 'choose', ports: f.ports, ...stamp }), null);
  source.permission = 'denied'; f.ports.showDirectoryPicker = async () => source;
  await assert.rejects(createBatchDestination({ selection, mode: 'choose', ports: f.ports, ...stamp }), /permission/i); f.dom.window.close();
});

test('BATCH-FILES file-input fallback filters nested directory entries and removes chooser controls', async () => {
  const f = fixture(), selecting = pickBatchInputs({ source: 'folder', ports: f.ports });
  const input = f.dom.window.document.querySelector('input')!; assert.equal(input.hasAttribute('webkitdirectory'), true);
  const flat = new File(['a'], 'a.png'), nested = new File(['b'], 'b.png'), text = new File(['c'], 'c.txt');
  Object.defineProperty(flat, 'webkitRelativePath', { value: 'folder/a.png' }); Object.defineProperty(nested, 'webkitRelativePath', { value: 'folder/nested/b.png' }); Object.defineProperty(text, 'webkitRelativePath', { value: 'folder/c.txt' });
  Object.defineProperty(input, 'files', { value: [flat, nested, text] }); input.dispatchEvent(new f.dom.window.Event('change'));
  const selection = (await selecting)!; assert.equal(selection.inputs.length, 1); assert.equal(selection.ignored, 2); assert.equal(f.dom.window.document.querySelector('input'), null);
  const output = (await createBatchDestination({ selection, mode: 'source', ports: f.ports, ...stamp }))!; assert.equal(output.kind, 'zip'); await output.cancel(); await assert.rejects(output.write('a.png', new Blob()), /cancel/i); f.dom.window.close();
});

test('BATCH-FILES unknown selections, unsupported-only inputs and cancelled file pickers never write', async () => {
  const f = fixture(), source = new Directory('source'); source.add('bad.exe', 'x'); f.ports.showOpenFilePicker = async () => [source.items.get('bad.exe') as BatchFileHandle];
  await assert.rejects(pickBatchInputs({ source: 'files', ports: f.ports }), /supported/i);
  await assert.rejects(createBatchDestination({ selection: { kind: 'files', inputs: [], ignored: 0 }, mode: 'zip', ports: f.ports, ...stamp }), /snapshot|selection/i);
  f.ports.showOpenFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); }; assert.equal(await pickBatchInputs({ source: 'files', ports: f.ports }), null); f.dom.window.close();
});
