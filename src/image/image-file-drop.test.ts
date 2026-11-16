import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { bindImageFileDrop, imageFileError, importImageFileSequence } from './image-file-drop.ts';

const file = (name: string, type = '') => new File(['local pixels'], name, { type });
function fixture() {
  const dom = new JSDOM('<main><div id="child"></div></main>'), root = dom.window.document.querySelector('main')!;
  let active = true, reason: string | null = null; const accepted: readonly File[][] = [], errors: string[] = [];
  const received = accepted as File[][];
  const handle = bindImageFileDrop({ root, active: () => active, blocked: () => reason,
    async onFiles(files) { received.push([...files]); }, onError: text => errors.push(text) });
  function event(type: string, files: File[] = [], types = ['Files']) {
    const value = new dom.window.Event(type, { bubbles: true, cancelable: true });
    const transfer = { files, types, items: files.map(() => ({ kind: 'file' })), dropEffect: 'none' };
    Object.defineProperty(value, 'dataTransfer', { value: transfer }); root.dispatchEvent(value); return { value, transfer };
  }
  return { dom, root, handle, event, accepted, errors, inactive() { active = false; }, block(text: string) { reason = text; } };
}

test('IMAGE-DROP captures every local file synchronously, advertises copy and prevents navigation', async () => {
  const f = fixture(), files = [file('scan.PNG'), file('detail.jpg', 'image/jpeg')];
  const over = f.event('dragover'); assert.equal(over.value.defaultPrevented, true); assert.equal(over.transfer.dropEffect, 'copy');
  assert.equal(f.root.classList.contains('image-dropping'), true);
  const drop = f.event('drop', files); files.splice(0); await Promise.resolve();
  assert.equal(drop.value.defaultPrevented, true); assert.deepEqual(f.accepted[0]!.map(f => f.name), ['scan.PNG', 'detail.jpg']);
  assert.equal(f.root.classList.contains('image-dropping'), false); f.handle.dispose(); f.dom.window.close();
});

test('IMAGE-DROP blocks unavailable targets, rejects links, and cleans up listeners/highlight', async () => {
  const f = fixture(); f.event('dragover'); f.block('Finish the current import.');
  const over = f.event('dragover'); assert.equal(over.transfer.dropEffect, 'none'); assert.equal(f.root.classList.contains('image-dropping'), false);
  f.event('drop', [file('scan.png')]); assert.deepEqual(f.errors, ['Finish the current import.']); assert.equal(f.accepted.length, 0);
  f.handle.dispose(); const disposed = f.event('drop', [file('scan.png')]); assert.equal(disposed.value.defaultPrevented, false); f.dom.window.close();
  const links = fixture(); const overLink = links.event('dragover', [], ['text/uri-list']); assert.equal(overLink.value.defaultPrevented, true); assert.equal(overLink.transfer.dropEffect, 'none');
  const dropped = links.event('drop', [], ['text/uri-list']); assert.equal(dropped.value.defaultPrevented, true); assert.match(links.errors[0]!, /links and folders/);
  links.inactive(); assert.equal(links.event('drop', [file('scan.png')]).value.defaultPrevented, false); links.handle.dispose(); links.dom.window.close();
});

test('IMAGE-DROP recognizes image extensions or MIME but directs native projects to explicit Open', () => {
  assert.equal(imageFileError(file('SCAN.JPEG')), null); assert.equal(imageFileError(file('clipboard', 'image/png')), null);
  assert.match(imageFileError(file('project.gsnv-image', 'image/png'))!, /File → Open/);
  assert.match(imageFileError(file('notes.txt'))!, /PNG, JPEG/);
});

test('IMAGE-DROP imports files serially in order, keeps good files and reports individual failures', async () => {
  const actions: string[] = []; let reading = false;
  const result = await importImageFileSequence({ files: [file('one.png'), file('bad.png'), file('notes.txt'), file('two.jpg')], current: () => true,
    async decode(file) { assert.equal(reading, false); reading = true; actions.push(`read ${file.name}`); await Promise.resolve(); reading = false; if (file.name === 'bad.png') throw new Error('Not a decodable image.'); return file.name; },
    async place(value, file) { actions.push(`place ${value}`); assert.equal(value, file.name); return true; } });
  assert.deepEqual(actions, ['read one.png', 'place one.png', 'read bad.png', 'read two.jpg', 'place two.jpg']);
  assert.equal(result.imported, 2); assert.equal(result.cancelled, false); assert.equal(result.errors.length, 2); assert.match(result.errors[0]!, /bad.png: Not a decodable image/);
});

test('IMAGE-DROP a changed/disposed target cancels late decode and the rest of a multi-file drop', async () => {
  let valid = true, release!: () => void, reads = 0, placements = 0;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const job = importImageFileSequence({ files: [file('one.png'), file('two.png')], current: () => valid,
    async decode() { reads++; await waiting; return 'pixels'; }, async place() { placements++; return true; } });
  valid = false; release(); const result = await job;
  assert.equal(result.cancelled, true); assert.equal(reads, 1); assert.equal(placements, 0); assert.equal(result.imported, 0);
});

test('IMAGE-DROP a refused placement stops later files without claiming success', async () => {
  let reads = 0; const result = await importImageFileSequence({ files: [file('one.png'), file('two.png')], current: () => true,
    async decode() { reads++; return 1; }, async place() { return false; } });
  assert.equal(reads, 1); assert.deepEqual(result, { imported: 0, errors: [], cancelled: true });
});
