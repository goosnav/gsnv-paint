import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFiles, type ProjectFileRequest } from './project-files.ts';
import { nativeContainer } from './native-container.ts';
import type { FilePorts } from './file-access.ts';

const sample = {
  project: { format: 'gsnv-image' as const, version: 1 as const, id: 'p1', title: 'Pixels', content: { width: 1, height: 1 } },
  assets: [{ id: 'tile-0', mime: 'application/octet-stream', bytes: new Uint8Array([0, 255, 1]) }],
};
const goldenManifest = '{"assets":[{"crc32":459412726,"id":"tile-0","length":3,"mime":"application/octet-stream"}],"project":{"content":{"height":1,"width":1},"format":"gsnv-image","id":"p1","title":"Pixels","version":1}}';
const golden = new Uint8Array(Buffer.concat([Buffer.from('47534e56504b310ac5000000', 'hex'), Buffer.from(goldenManifest), new Uint8Array([0, 255, 1])]));
const accept = { 'application/octet-stream': ['.gsnv-cad', '.gsnv-image', '.gsnv-video'] };
function portsFor(selected: File | null = null) {
  const calls: string[] = []; let blob: Blob | undefined;
  class Input extends EventTarget {
    type = ''; accept = ''; hidden = false; files = selected ? [selected] : [];
    click() { calls.push('choose'); this.dispatchEvent(new Event(selected ? 'change' : 'cancel')); }
    remove() { calls.push('remove'); }
  }
  const input = new Input();
  const anchor = { href: '', download: '', click() { calls.push('download'); }, remove() { calls.push('remove'); } };
  const ports: FilePorts = {
    document: { body: { append() {} }, createElement: (name: string) => name === 'input' ? input : anchor } as unknown as FilePorts['document'],
    URL: { createObjectURL(value) { blob = value as Blob; return 'blob:project'; }, revokeObjectURL() {} },
    setTimeout(callback) { callback(); },
  };
  return { ports, calls, input, anchor, blob: () => blob! };
}
function fileHandle(options: { file?: File; write?: (bytes: Uint8Array) => Promise<void>; close?: () => Promise<void>; abort?: () => Promise<void> } = {}): FileSystemFileHandle {
  return { name: 'selected.gsnv-image', kind: 'file', getFile: async () => options.file ?? new File([golden], 'selected.gsnv-image'),
    createWritable: async () => ({ write: options.write ?? (async () => {}), close: options.close ?? (async () => {}), abort: options.abort ?? (async () => {}) }),
  } as unknown as FileSystemFileHandle;
}
const errorOf = (result: Awaited<ReturnType<typeof projectFiles>>) => { assert.ok('ok' in result && !result.ok); return result.error; };
const invalid = (request: unknown, ports: FilePorts) => projectFiles(request as ProjectFileRequest, ports);

test('S13 golden actual S07 open decodes an independent complete container', async () => {
  const fake = portsFor(); const handle = fileHandle();
  fake.ports.showOpenFilePicker = async options => { assert.deepEqual(options, { multiple: false, types: [{ accept }] }); return [handle]; };
  assert.deepEqual(await projectFiles({ operation: 'open' }, fake.ports), { ok: true, value: sample });
  assert.deepEqual(fake.calls, []);
});

test('S13 fallback save/open preserves exact metadata and binary bytes through real S15/S07', async () => {
  const fake = portsFor();
  const saved = await projectFiles({ operation: 'save', package: sample }, fake.ports);
  assert.ok('ok' in saved && saved.ok); assert.equal(saved.value.name, 'Pixels.gsnv-image');
  assert.ok(Array.isArray(saved.value.bytes) && saved.value.bytes.length > 1);
  assert.deepEqual(new Uint8Array(await fake.blob().arrayBuffer()), golden);
  assert.equal(fake.blob().type, 'application/octet-stream'); assert.equal(fake.anchor.download, 'Pixels.gsnv-image');
  const reopen = portsFor(new File([fake.blob()], 'opaque.bin'));
  assert.deepEqual(await projectFiles({ operation: 'open' }, reopen.ports), { ok: true, value: sample });
  assert.equal(reopen.input.accept, '.gsnv-cad,.gsnv-image,.gsnv-video');
});

test('S13 each workspace suggests its extension and native picker type', async () => {
  for (const format of ['gsnv-cad', 'gsnv-image', 'gsnv-video'] as const) {
    const fake = portsFor(); const handle = fileHandle();
    fake.ports.showSaveFilePicker = async options => {
      assert.deepEqual(options, { suggestedName: `Pixels.${format}`, types: [{ accept: { 'application/octet-stream': [`.${format}`] } }] });
      return handle;
    };
    const result = await projectFiles({ operation: 'save', package: { ...sample, project: { ...sample.project, format } } }, fake.ports);
    assert.ok('ok' in result && result.ok); assert.equal(result.value.handle, handle);
    assert.equal(result.value.name, handle.name);
  }
});

test('S13 filename sanitation preserves titles, bounds Unicode and appends one extension', async () => {
  const cases = [
    ['   ', 'Untitled'], ['..', 'Untitled'], [' A/B: C?*. ', 'A_B_ C__'], ['CON', '_CON'], ['nul.notes', '_nul.notes'],
    ['COM¹', '_COM¹'], ['name.gsnv-image', 'name'], ['name.GSNV-IMAGE', 'name'], ['🙂'.repeat(100), '🙂'.repeat(45)], ['日'.repeat(100), '日'.repeat(60)],
  ];
  for (const [title, stem] of cases) {
    const fake = portsFor(); const project = Object.freeze({ ...sample.project, title: title! });
    const result = await projectFiles({ operation: 'save', package: { ...sample, project } }, fake.ports);
    assert.ok('ok' in result && result.ok); assert.equal(result.value.name, `${stem}.gsnv-image`);
    assert.equal(project.title, title); assert.ok(new TextEncoder().encode(stem).length <= 180);
  }
});

test('S13 final truncated filenames protect reserved basenames within the byte cap', async () => {
  for (const [title, expected] of [
    ['CON' + ' '.repeat(177) + 'suffix', '_CON.gsnv-image'],
    ['COM¹' + ' '.repeat(177) + 'suffix', '_COM¹.gsnv-image'],
    ['CON.' + '🙂'.repeat(100), '_CON.' + '🙂'.repeat(43) + '.gsnv-image'],
  ]) {
    const fake = portsFor();
    const result = await projectFiles({ operation: 'save', package: { ...sample, project: { ...sample.project, title: title! } } }, fake.ports);
    assert.ok('ok' in result && result.ok); assert.equal(result.value.name, expected);
    assert.ok(new TextEncoder().encode(result.value.name.replace(/\.gsnv-image$/, '')).length <= 180);
  }
});

test('S13 unexpected codec exceptions stay readable even when an error accessor throws', async () => {
  for (const cause of [new Error('Cannot inspect package'), Object.defineProperty(new Error('Broken error'), 'name', { get() { throw new Error('Cannot inspect error'); } })]) {
    const fake = portsFor(); const broken = new Proxy({}, { ownKeys() { throw cause; } });
    const result = await invalid({ operation: 'save', package: broken }, fake.ports);
    assert.equal(errorOf(result).code, 'project.codec'); assert.ok(errorOf(result).message.length > 0);
    assert.deepEqual(fake.calls, []);
  }
});

test('S13 native save reuses the handle and waits for close after ordered part writes', async () => {
  const fake = portsFor(); const written: Uint8Array[] = [];
  let finish!: () => void; let started!: () => void; const closing = new Promise<void>(resolve => { started = resolve; });
  const handle = fileHandle({ write: async bytes => { written.push(bytes); }, close: () => { started(); return new Promise(resolve => { finish = resolve; }); } });
  fake.ports.showSaveFilePicker = async () => { assert.fail('Existing handle must bypass picker'); };
  let complete = false;
  const saving = projectFiles({ operation: 'save', package: sample, handle }, fake.ports).then(value => { complete = true; return value; });
  await closing; assert.equal(complete, false); assert.ok(written.length > 1);
  assert.deepEqual(nativeContainer({ op: 'decode', parts: written }), sample);
  finish(); const result = await saving;
  assert.ok('ok' in result && result.ok); assert.equal(result.value.handle, handle); assert.deepEqual(result.value.bytes, written);
  assert.deepEqual(fake.calls, []);
});

test('S13 cancellation from both native pickers and fallback open remains explicit', async () => {
  const fake = portsFor();
  assert.deepEqual(await projectFiles({ operation: 'open' }, fake.ports), { cancelled: true });
  fake.ports.showOpenFilePicker = async () => { throw new DOMException('User cancelled', 'AbortError'); };
  fake.ports.showSaveFilePicker = async () => { throw new DOMException('User cancelled', 'AbortError'); };
  assert.deepEqual(await projectFiles({ operation: 'open' }, fake.ports), { cancelled: true });
  assert.deepEqual(await projectFiles({ operation: 'save', package: sample }, fake.ports), { cancelled: true });
  assert.ok(!fake.calls.includes('download'));
});

test('S13 native permission/read/write errors retain S07 codes and never fall back', async () => {
  const fake = portsFor();
  fake.ports.showOpenFilePicker = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  assert.deepEqual(errorOf(await projectFiles({ operation: 'open' }, fake.ports)), { code: 'file.permission', message: 'File operation failed: Denied' });
  fake.ports.showOpenFilePicker = async () => [{ ...fileHandle(), getFile: async () => { throw new Error('Unreadable'); } } as FileSystemFileHandle];
  assert.deepEqual(errorOf(await projectFiles({ operation: 'open' }, fake.ports)), { code: 'file.read', message: 'File operation failed: Unreadable' });
  for (const stage of ['write', 'close'] as const) {
    let aborted = 0;
    const handle = fileHandle({ [stage]: async () => { throw new Error(`${stage} failed`); }, abort: async () => { aborted++; } });
    assert.deepEqual(errorOf(await projectFiles({ operation: 'save', package: sample, handle }, fake.ports)), { code: 'file.write', message: `File operation failed: ${stage} failed` });
    assert.equal(aborted, 1);
  }
  assert.deepEqual(fake.calls, []);
});

test('S13 malformed files return errors without replacing a caller document', async () => {
  const damaged = golden.slice(); damaged[damaged.length - 1] = 7;
  const oversized = golden.slice(0, 12); new DataView(oversized.buffer).setUint32(8, 64 * 1024 * 1024 + 1, true);
  for (const [bytes, code] of [[damaged, 'project.format'], [new Uint8Array(), 'project.format'], [oversized, 'project.limit']] as const) {
    const current = { title: 'Existing document', revision: 9 }; let document: unknown = current;
    const result = await projectFiles({ operation: 'open' }, portsFor(new File([bytes], 'broken.gsnv-image')).ports);
    if ('ok' in result && result.ok) document = result.value;
    assert.equal(errorOf(result).code, code); assert.equal(document, current);
  }
});

test('S13 malformed project metadata has its own readable error on open and save', async () => {
  const futureText = goldenManifest.replace('"version":1', '"version":2'); const bad = new Uint8Array(golden);
  bad.set(new TextEncoder().encode(futureText), 12);
  const opened = await projectFiles({ operation: 'open' }, portsFor(new File([bad], 'future.gsnv-image')).ports);
  assert.equal(errorOf(opened).code, 'project.metadata'); assert.match(errorOf(opened).message, /Unsupported project version/);
  const fake = portsFor();
  const saved = await invalid({ operation: 'save', package: { ...sample, project: { ...sample.project, version: 2 } } }, fake.ports);
  assert.equal(errorOf(saved).code, 'project.metadata'); assert.deepEqual(fake.calls, []);
});

test('S13 invalid or excessive packages fail before any picker or file write', async () => {
  const fake = portsFor(); let pickers = 0;
  fake.ports.showSaveFilePicker = async () => { pickers++; return fileHandle(); };
  const malformed = await projectFiles({ operation: 'save', package: { ...sample, assets: [sample.assets[0]!, sample.assets[0]!] } }, fake.ports);
  assert.equal(errorOf(malformed).code, 'project.format');
  const excessive = Array.from({ length: 20001 }, (_, index) => ({ id: String(index), mime: 'x', bytes: new Uint8Array() }));
  assert.equal(errorOf(await projectFiles({ operation: 'save', package: { ...sample, assets: excessive } }, fake.ports)).code, 'project.limit');
  assert.equal(pickers, 0); assert.deepEqual(fake.calls, []);
});

test('S13 malformed requests reject without invoking getters or browser ports', async () => {
  const fake = portsFor(); let calls = 0;
  for (const request of [null, {}, { operation: 'other' }, { operation: 'save' }, { get operation() { calls++; return 'open'; } }, { operation: 'save', get package() { calls++; return sample; } }]) {
    assert.equal(errorOf(await invalid(request, fake.ports)).code, 'project.request');
  }
  assert.equal(calls, 0); assert.deepEqual(fake.calls, []);
});

test('S13 large assets cross the actual S07 read-chunk boundary without changing bytes', async () => {
  const bytes = new Uint8Array(9 * 1024 * 1024 + 3); bytes[0] = 7; bytes[8 * 1024 * 1024] = 42; bytes[bytes.length - 1] = 255;
  const packageValue = { ...sample, assets: [{ ...sample.assets[0]!, bytes }] };
  const encoded = nativeContainer({ op: 'encode', package: packageValue });
  const file = new File(encoded.parts as Uint8Array<ArrayBuffer>[], 'large.gsnv-image'); const fake = portsFor();
  fake.ports.showOpenFilePicker = async () => [fileHandle({ file })];
  assert.deepEqual(await projectFiles({ operation: 'open' }, fake.ports), { ok: true, value: packageValue });
});

test('S13 hostile error-message coercion cannot reject the file adapter promise', async () => {
  const hostile = Object.defineProperty(new Error('Hidden'), 'message', { value: { toString() { throw new Error('Message coercion escaped'); } } });
  const broken = new Proxy({}, { ownKeys() { throw hostile; } });
  const fake = portsFor();
  assert.equal(errorOf(await invalid({ operation: 'save', package: broken }, fake.ports)).code, 'project.codec');
  assert.deepEqual(fake.calls, []);
});
