import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { imageBatchDialog } from './image-batch-dialog.ts';
import { imageContent, type ImageContent } from './image-content.ts';
import { showDialog } from '../shared/dialog.ts';
import type { BatchDirectory, BatchFileHandle, BatchFilePorts } from './image-batch-files.ts';
import type { ImageRecipe } from './image-operation-types.ts';

class Directory implements BatchDirectory {
  kind = 'directory' as const; items = new Map<string, Directory | BatchFileHandle>(); written: string[] = []; failWrite = false;
  constructor(public name: string) {}
  async *entries(): AsyncIterableIterator<[string, BatchDirectory | BatchFileHandle]> { yield* this.items; }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Directory> {
    const found = this.items.get(name); if (found) { if (found.kind === 'directory') return found as Directory; throw new DOMException('File exists', 'TypeMismatchError'); }
    if (!options?.create) throw new DOMException('Missing', 'NotFoundError'); const child = new Directory(name); child.failWrite = this.failWrite; this.items.set(name, child); return child;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<BatchFileHandle> {
    const found = this.items.get(name); if (found) { if (found.kind === 'file') return found; throw new DOMException('Directory exists', 'TypeMismatchError'); }
    if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
    const handle: BatchFileHandle = { kind: 'file', name, getFile: async () => new File(['output'], name), createWritable: async () => ({ write: async () => { if (this.failWrite) throw new Error('disk full'); }, close: async () => { this.written.push(name); }, abort: async () => {} }) };
    this.items.set(name, handle); return handle;
  }
  async removeEntry(name: string) { this.items.delete(name); }
  add(file: File) { this.items.set(file.name, { kind: 'file', name: file.name, getFile: async () => file }); }
}
const recipe: ImageRecipe = { format: 'gsnv-actions', version: 1, name: 'Test recipe', output: 'png', assets: [], steps: [] };
const tick = () => new Promise(resolve => setImmediate(resolve));
const button = (root: HTMLElement, name: string) => { const found = [...root.querySelectorAll('button')].find(node => node.textContent === name); assert.ok(found, name); return found; };
function fixture(names = ['a.png', 'b.jpg', 'c.png'], folder = true) {
  const dom = new JSDOM('<main></main>'), document = dom.window.document, source = new Directory('source'), destination = new Directory('destination');
  let filePicks = 0, folderPicks = 0, closed = 0, stopped = 0, decodes = 0, replays = 0;
  const downloads: { blob: Blob; name: string }[] = [], files = names.map((name, i) => new File([`${i === 2 ? 8 : 4}`], name, { lastModified: 1 })); files.forEach(file => source.add(file));
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { value: () => ({ createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }), putImageData() {} }) });
  Object.defineProperty(dom.window.HTMLDialogElement.prototype, 'showModal', { value: function () { this.open = true; } }); Object.defineProperty(dom.window.HTMLDialogElement.prototype, 'close', { value: function () { this.open = false; } });
  const ports: BatchFilePorts = { document, showOpenFilePicker: async () => { filePicks++; return [...source.items.values()] as BatchFileHandle[]; }, ...(folder ? { showDirectoryPicker: async ({ mode }: { mode: 'read' | 'readwrite' }) => { folderPicks++; return mode === 'read' ? source : destination; } } : {}) };
  const args = { document, recipe, ports, decode: async (file: File) => { decodes++; if (file.name.includes('bad')) throw new Error('Invalid image'); const size = Number(await file.text()); return imageContent({ operation: 'new', width: size, height: size, fill: [20, 40, 60, 255] }); }, encode: async () => new Blob(['processed']), replay: async (image: ImageContent) => { replays++; return image; }, stop: () => { stopped++; }, onDownload: async (blob: Blob, name: string) => { downloads.push({ blob, name }); }, onClose: () => { closed++; } };
  return { dom, document, args, source, destination, downloads, get filePicks() { return filePicks; }, get folderPicks() { return folderPicks; }, get closed() { return closed; }, get stopped() { return stopped; }, get decodes() { return decodes; }, get replays() { return replays; } };
}
async function chooseAndPreview(f: ReturnType<typeof fixture>, body: HTMLElement) { button(body, 'Choose images').click(); await tick(); button(body, 'Preview samples').click(); await tick(); }

test('BATCH-DIALOG opening and Close never choose files or run a recipe', () => {
  const f = fixture(), spec = imageBatchDialog(f.args); showDialog({ root: f.document.querySelector('main')!, spec });
  assert.equal(spec.confirmLabel, 'Close'); assert.deepEqual(spec.fields, []); assert.equal(f.filePicks, 0); assert.equal(f.replays, 0); assert.equal(button(spec.previewElement!, 'Run batch').disabled, true);
  button(f.document.body, 'Close').click(); assert.equal(f.closed, 1); assert.equal(f.decodes, 0); f.dom.window.close();
});
test('BATCH-DIALOG previews each distinct size before a gesture-triggered destination and exact per-file report', async () => {
  const f = fixture(), spec = imageBatchDialog(f.args); showDialog({ root: f.document.querySelector('main')!, spec }); const body = spec.previewElement!;
  await chooseAndPreview(f, body); assert.equal(f.decodes, 3); assert.equal(f.replays, 2); assert.equal(body.querySelectorAll('canvas').length, 4); assert.equal(button(body, 'Run batch').disabled, false);
  assert.equal(body.querySelector<HTMLSelectElement>('[aria-label="Output destination"]')!.value, 'choose');
  button(body, 'Run batch').click(); assert.equal(f.folderPicks, 1, 'destination picker starts inside click'); await tick();
  assert.equal(f.decodes, 6); assert.equal(f.replays, 5); assert.match(body.textContent!, /3.*written/i); assert.equal(body.querySelectorAll('[data-batch-result]').length, 3);
  const output = [...f.destination.items.values()][0] as Directory; assert.deepEqual(output.written, ['a.png', 'b.png', 'c.png']);
  button(f.document.body, 'Close').click(); assert.equal(f.replays, 5); assert.equal(f.closed, 1); f.dom.window.close();
});
test('BATCH-DIALOG corrupt inputs continue and unsupported folder writing is explicitly ZIP', async () => {
  const f = fixture(['a.png', 'bad.png', 'c.png'], false), spec = imageBatchDialog(f.args), body = spec.previewElement!; f.document.body.append(body);
  await chooseAndPreview(f, body); assert.match(body.textContent!, /ZIP/); assert.match(body.textContent!, /bad.png.*Invalid image/); assert.equal(button(body, 'Run batch').disabled, false);
  button(body, 'Run batch').click(); await tick(); assert.equal(f.downloads.length, 1); assert.match(f.downloads[0]!.name, /^gsnv-paint-batch-.*\.zip$/); assert.match(body.textContent!, /2.*written/i); assert.match(body.textContent!, /bad.png.*Invalid image/); f.dom.window.close();
});
test('BATCH-DIALOG Stop rejects stale previews, while keyboard buttons do not confirm Close', async () => {
  const f = fixture(); let resolve!: (image: ImageContent) => void; f.args.replay = () => new Promise(done => { resolve = done; });
  const spec = imageBatchDialog(f.args); showDialog({ root: f.document.querySelector('main')!, spec }); const body = spec.previewElement!;
  button(body, 'Choose images').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick(); assert.equal(f.filePicks, 1); assert.equal(f.closed, 0);
  button(body, 'Preview samples').click(); await tick(); button(body, 'Stop').click(); assert.equal(f.stopped, 1);
  resolve(imageContent({ operation: 'new', width: 4, height: 4, fill: [0, 0, 0, 255] })); await tick(); assert.match(body.querySelector('[role="status"]')!.textContent!, /stopped/i); assert.equal(button(body, 'Run batch').disabled, true); spec.cancel(); assert.equal(f.closed, 1); f.dom.window.close();
});
test('BATCH-DIALOG more than25 distinct sizes blocks Run with a readable preview limit', async () => {
  const f = fixture(Array.from({ length: 26 }, (_, i) => `${String(i).padStart(2, '0')}.png`)); f.args.decode = async file => imageContent({ operation: 'new', width: Number(file.name.slice(0, 2)) + 1, height: 1, fill: [0, 0, 0, 255] });
  const spec = imageBatchDialog(f.args), body = spec.previewElement!; f.document.body.append(body); await chooseAndPreview(f, body);
  assert.equal(f.replays, 25); assert.match(body.textContent!, /25 distinct/i); assert.equal(button(body, 'Run batch').disabled, true); f.dom.window.close();
});
test('BATCH-DIALOG a folder selection defaults to a new child, and write failure stops honestly', async () => {
  const f = fixture(); f.source.failWrite = true; const spec = imageBatchDialog(f.args), body = spec.previewElement!; f.document.body.append(body);
  button(body, 'Choose folder').click(); await tick(); assert.equal(body.querySelector<HTMLSelectElement>('[aria-label="Output destination"]')!.value, 'source'); button(body, 'Preview samples').click(); await tick(); button(body, 'Run batch').click(); await tick();
  assert.match(body.textContent!, /disk full/); assert.match(body.textContent!, /failed/i); assert.match(body.textContent!, /unprocessed/i); assert.equal(f.folderPicks, 1); f.dom.window.close();
});

test('BATCH-DIALOG Stop retains completed directory outputs and discards incomplete ZIP', async () => {
  for (const nativeFolder of [true, false]) {
    const f = fixture(undefined, nativeFolder); let calls = 0, release!: (value: ImageContent) => void;
    f.args.replay = async image => { if (++calls === 4) return new Promise(done => { release = done; }); return image; };
    const spec = imageBatchDialog(f.args), body = spec.previewElement!; f.document.body.append(body); await chooseAndPreview(f, body);
    button(body, 'Run batch').click(); await tick(); assert.equal(calls, 4); button(body, 'Stop').click(); assert.equal(f.stopped, 1);
    release(imageContent({ operation: 'new', width: 4, height: 4, fill: [0, 0, 0, 255] })); await tick();
    assert.match(body.textContent!, /Batch stopped: 1 files written/); assert.match(body.textContent!, /2 unprocessed/); assert.equal(f.downloads.length, 0);
    if (nativeFolder) { assert.deepEqual(([...f.destination.items.values()][0] as Directory).written, ['a.png']); assert.match(body.textContent!, /Completed files remain/); }
    else assert.match(body.textContent!, /incomplete ZIP was discarded/);
    assert.equal(await (await (f.source.items.get('a.png') as BatchFileHandle).getFile()).text(), '4'); f.dom.window.close();
  }
});
test('BATCH-DIALOG failed recipe previews block Run and ZIP download failures can retry without replay', async () => {
  const f = fixture(); f.args.replay = async () => { throw new Error('Step 2 cannot find its layer.'); }; const spec = imageBatchDialog(f.args), body = spec.previewElement!; f.document.body.append(body); await chooseAndPreview(f, body);
  assert.equal(button(body, 'Run batch').disabled, true); assert.match(body.textContent!, /Step 2 cannot find/); f.dom.window.close();
  const g = fixture(undefined, false); let downloads = 0; g.args.onDownload = async () => { if (++downloads === 1) throw new Error('Download blocked'); };
  const other = imageBatchDialog(g.args), view = other.previewElement!; g.document.body.append(view); await chooseAndPreview(g, view); button(view, 'Run batch').click(); await tick(); const replayCount = g.replays;
  assert.match(view.textContent!, /Download failed/); button(view, 'Download ZIP').click(); await tick(); assert.equal(downloads, 2); assert.equal(g.replays, replayCount); g.dom.window.close();
});
test('BATCH-DIALOG Close ignores a late destination chooser and never begins processing', async () => {
  const f = fixture(); let release!: (directory: BatchDirectory) => void; f.args.ports.showDirectoryPicker = () => new Promise(done => { release = done; });
  const spec = imageBatchDialog(f.args), body = spec.previewElement!; f.document.body.append(body); await chooseAndPreview(f, body); const decodes = f.decodes;
  button(body, 'Run batch').click(); spec.cancel(); release(f.destination); await tick(); assert.equal(f.closed, 1); assert.equal(f.decodes, decodes); assert.equal(f.downloads.length, 0); f.dom.window.close();
});
