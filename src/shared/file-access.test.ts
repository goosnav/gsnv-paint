import assert from 'node:assert/strict';
import test from 'node:test';
import { fileAccess, type FilePorts } from './file-access.ts';

const bytes = new Uint8Array([0, 127, 128, 255]);
const accept = { 'application/octet-stream': ['.bin'] };
const save = { op: 'save' as const, name: 'sample.bin', mime: 'application/octet-stream', bytes };
function fakePorts(selected: File | null = null) {
  const events: string[] = [];
  let blob: Blob | undefined;
  class Input extends EventTarget {
    type = ''; accept = ''; hidden = false; files = selected ? [selected] : [];
    click() { this.dispatchEvent(new Event(selected ? 'change' : 'cancel')); }
    remove() { events.push('remove-input'); }
  }
  const input = new Input();
  const anchor = { href: '', download: '', click() { events.push('download'); }, remove() { events.push('remove-anchor'); } };
  const ports: FilePorts = {
    document: { body: { append() {} }, createElement: (tag: string) => tag === 'input' ? input : anchor } as unknown as FilePorts['document'],
    URL: { createObjectURL(value) { blob = value as Blob; events.push('url'); return 'blob:fixture'; }, revokeObjectURL(url) { assert.equal(url, 'blob:fixture'); events.push('revoke'); } },
    setTimeout(callback, delay) { assert.ok(delay > 0); events.push('timer'); callback(); },
  };
  return { ports, input, anchor, events, getBlob: () => blob };
}
function handle(options: { file?: File; write?: (bytes: Uint8Array) => Promise<void>; close?: () => Promise<void>; abort?: () => Promise<void> } = {}) {
  return { name: 'sample.bin', kind: 'file', getFile: async () => options.file ?? new File([bytes], 'sample.bin'),
    createWritable: async () => ({ write: options.write ?? (async () => {}), close: options.close ?? (async () => {}), abort: options.abort ?? (async () => {}) }),
  } as unknown as FileSystemFileHandle;
}

test('S07 golden native open preserves selected bytes and handle', async () => {
  const { ports, events } = fakePorts();
  const selected = handle();
  ports.showOpenFilePicker = async options => { assert.deepEqual(options, { multiple: false, types: [{ accept }] }); return [selected]; };
  assert.deepEqual(await fileAccess({ op: 'open', accept }, ports), { ok: true, value: { name: 'sample.bin', bytes: [bytes], handle: selected } });
  assert.deepEqual(events, []);
});

test('S07 fallback input reads the file and removes the temporary element', async () => {
  const { ports, input, events } = fakePorts(new File([bytes], 'input.bin'));
  assert.deepEqual(await fileAccess({ op: 'open', accept }, ports), { ok: true, value: { name: 'input.bin', bytes: [bytes] } });
  assert.equal(input.accept, '.bin');
  assert.deepEqual(events, ['remove-input']);
});
test('S07 optional read bounds reject both picker paths before allocating payload chunks',async()=>{
 for(const native of[false,true]){
  let reads=0;const file=new File([bytes],'large.bin');file.slice=()=>{reads++;throw new Error('Must not read an oversized file');};const {ports}=fakePorts(file);
  if(native)ports.showOpenFilePicker=async()=>[handle({file})];
  const result=await fileAccess({op:'open',accept,maxBytes:3},ports);assert.ok('ok'in result&&!result.ok);assert.equal(result.error.code,'file.read');assert.match(result.error.message,/3 bytes/);assert.equal(reads,0);
 }
 const {ports}=fakePorts(new File([bytes],'valid.bin'));assert.ok('value'in await fileAccess({op:'open',accept,maxBytes:4},ports));
 for(const maxBytes of[-1,1.5,Infinity,NaN]){const invalid=await fileAccess({op:'open',accept,maxBytes},ports);assert.ok('ok'in invalid&&!invalid.ok);assert.equal(invalid.error.code,'file.request');}
});

test('S07 native and fallback picker cancellation are explicit', async () => {
  const fake = fakePorts();
  assert.deepEqual(await fileAccess({ op: 'open', accept }, fake.ports), { cancelled: true });
  assert.deepEqual(fake.events, ['remove-input']);
  fake.ports.showOpenFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); };
  fake.ports.showSaveFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); };
  assert.deepEqual(await fileAccess({ op: 'open', accept }, fake.ports), { cancelled: true });
  assert.deepEqual(await fileAccess(save, fake.ports), { cancelled: true });
  fake.ports.showOpenFilePicker = async () => [];
  assert.deepEqual(await fileAccess({ op: 'open', accept }, fake.ports), { cancelled: true });
});

test('S07 native save writes segments in order and waits for close before succeeding', async () => {
  const { ports, events } = fakePorts();
  const written: Uint8Array[] = [];
  let finishClose!: () => void;
  let closing!: () => void;
  const closeStarted = new Promise<void>(resolve => { closing = resolve; });
  const selected = handle({ write: async part => { written.push(part); }, close: () => { closing(); return new Promise(resolve => { finishClose = resolve; }); } });
  ports.showSaveFilePicker = async options => {
    assert.deepEqual(options, { suggestedName: 'sample.bin', types: [{ accept }] }); return selected;
  };
  const parts = [bytes.subarray(0, 2), bytes.subarray(2)];
  let resolved = false;
  const saving = fileAccess({ ...save, bytes: parts }, ports).then(value => { resolved = true; return value; });
  await closeStarted;
  assert.equal(resolved, false);
  assert.deepEqual(written, parts);
  finishClose();
  assert.deepEqual(await saving, { ok: true, value: { name: 'sample.bin', bytes: parts, handle: selected } });
  assert.deepEqual(events, []);
});

test('S07 existing native handle is reused without a picker', async () => {
  const { ports } = fakePorts();
  ports.showSaveFilePicker = async () => { throw new Error('Picker must not run'); };
  const selected = handle();
  const result = await fileAccess({ ...save, handle: selected }, ports);
  assert.ok('ok' in result && result.ok);
  assert.equal(result.value.handle, selected);
});

for (const operation of ['write', 'close'] as const) test(`S07 ${operation} failure aborts and never falls back to download`, async () => {
  const { ports, events } = fakePorts();
  let aborted = 0;
  const selected = handle({ [operation]: async () => { throw new Error(`${operation} failed`); }, abort: async () => { aborted++; throw new Error('Abort also failed'); } });
  const result = await fileAccess({ ...save, handle: selected }, ports);
  assert.ok('ok' in result && !result.ok);
  assert.equal(result.error.code, 'file.write');
  assert.match(result.error.message, new RegExp(`${operation} failed`));
  assert.equal(aborted, 1);
  assert.deepEqual(events, []);
});

test('S07 permission denial remains an error without a fallback write', async () => {
  const { ports, events } = fakePorts();
  ports.showSaveFilePicker = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  const result = await fileAccess(save, ports);
  assert.ok('ok' in result && !result.ok);
  assert.equal(result.error.code, 'file.permission');
  assert.deepEqual(events, []);
});

test('S07 read errors and aborted writes are errors, not user cancellation', async () => {
  const { ports } = fakePorts();
  const unreadable = { ...handle(), getFile: async () => { throw new Error('Unreadable'); } } as FileSystemFileHandle;
  ports.showOpenFilePicker = async () => [unreadable];
  const read = await fileAccess({ op: 'open', accept }, ports);
  assert.ok('ok' in read && !read.ok);
  assert.equal(read.error.code, 'file.read');
  const write = await fileAccess({ ...save, handle: handle({ write: async () => { throw new DOMException('Disk aborted', 'AbortError'); } }) }, ports);
  assert.ok('ok' in write && !write.ok);
  assert.equal(write.error.code, 'file.write');
});

test('S07 fallback download preserves segmented bytes, file name and MIME, releasing URL', async () => {
  const fake = fakePorts();
  const parts = [bytes.subarray(0, 2), bytes.subarray(2)];
  assert.deepEqual(await fileAccess({ ...save, bytes: parts }, fake.ports), { ok: true, value: { name: 'sample.bin', bytes: parts } });
  assert.equal(fake.anchor.download, 'sample.bin');
  assert.equal(fake.getBlob()!.type, save.mime);
  assert.deepEqual(new Uint8Array(await fake.getBlob()!.arrayBuffer()), bytes);
  assert.deepEqual(fake.events, ['url', 'download', 'remove-anchor', 'timer', 'revoke']);
});

test('S07 fallback errors clean temporary resources', async () => {
  const fake = fakePorts();
  fake.anchor.click = () => { throw new Error('Download blocked'); };
  const result = await fileAccess(save, fake.ports);
  assert.ok('ok' in result && !result.ok);
  assert.equal(result.error.code, 'file.download');
  assert.ok(fake.events.includes('remove-anchor') && fake.events.includes('revoke'));
  fake.input.click = () => { throw new Error('Input blocked'); };
  const opened = await fileAccess({ op: 'open', accept }, fake.ports);
  assert.ok('ok' in opened && !opened.ok);
  assert.ok(fake.events.includes('remove-input'));
});

test('S07 zero bytes and segmented large reads preserve exact file contents', async () => {
  const { ports } = fakePorts();
  for (const size of [0, 9 * 1024 * 1024 + 3]) {
    const source = new Uint8Array(size);
    if (size) { source[0] = 21; source[size - 1] = 201; }
    const selected = handle({ file: new File([source], 'large.bin') });
    ports.showOpenFilePicker = async () => [selected];
    const result = await fileAccess({ op: 'open', accept }, ports);
    assert.ok('ok' in result && result.ok);
    assert.equal(result.value.bytes.reduce((total, part) => total + part.length, 0), size);
    if (size) {
      assert.ok(result.value.bytes.length > 1);
      assert.equal(result.value.bytes[0]![0], 21);
      assert.equal(result.value.bytes.at(-1)!.at(-1), 201);
    }
  }
});
