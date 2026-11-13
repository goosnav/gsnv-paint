import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { recentProjects, type RecentPort } from '../shared/recent-projects.ts';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { mountApp, type AppDocument, type WorkspaceAdapter } from './app-shell.ts';
import { nativeContainer } from '../shared/native-container.ts';
import { recoveryStore } from '../shared/recovery-store.ts';
import type { FilePorts } from '../shared/file-access.ts';
import type { Gesture } from '../shared/input-adapter.ts';

type Workspace = 'cad' | 'image' | 'video';
type Package = ReturnType<typeof nativeContainer<{ op: 'decode'; parts: readonly Uint8Array[] }>>;
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const packageFor = (workspace: Workspace, width = 10, id = 'fixture-id'): Package => ({
  project: { format: `gsnv-${workspace}`, version: 1, id, title: `${workspace} fixture`, content: { fixture: true, width } },
  assets: [{ id: 'sample', mime: 'application/octet-stream', bytes: new Uint8Array([1, 2]) }],
});
const fileFor = (value: Package) => new File(nativeContainer({ op: 'encode', package: value }).parts as Uint8Array<ArrayBuffer>[], 'fixture.gsnv-cad');
function resource() {
  const journal = new Map<string, string>();
  return { indexedDB: new IDBFactory(), localStorage: {
    getItem: (key: string) => journal.get(key) ?? null,
    setItem: (key: string, value: string) => { journal.set(key, value); }, removeItem: (key: string) => { journal.delete(key); },
  } };
}
function fixture(workspace: Workspace) {
  let commits: ((width: number, baseIdentity?: string) => void) | undefined; let invalidate = () => {}; let label = 'Change fixture'; let opener: ((value: AppDocument) => Promise<boolean>) | undefined;
  let identity = ''; let current: AppDocument | undefined; let encoded = 0; let disposed = 0;
  const gestures: Gesture[] = [];
  const adapter: WorkspaceAdapter = {
    create: () => ({ id: 'fixture-id', title: `${workspace} fixture`, format: `gsnv-${workspace}`, version: 1, value: { width: 10 } }),
    decode(value) {
      const content = value.project.content as { fixture?: boolean; width?: number };
      if (content.fixture !== true || typeof content.width !== 'number' || !Number.isFinite(content.width) || content.width <= 0) throw new Error('Fixture domain schema rejected.');
      return { ...value.project, value: { width: content.width } };
    },
    encode(document) { encoded++; return packageFor(workspace, (document.value as { width: number }).width, document.id); },
    mount(host) {
      const output = host.root.ownerDocument.createElement('output'); host.root.append(output);
      const change = (width: number, baseIdentity = identity) => { assert.ok(current); host.commit({ ...current, value: { width } }, 'Change fixture width', baseIdentity); };
      commits = change; invalidate = () => host.invalidate(); opener = value => host.open(value);
      return {
        render(document, view) { current = document; identity = document?.identity ?? ''; output.textContent = JSON.stringify({ width: (document?.value as { width: number } | undefined)?.width ?? null, view }); },
        model: () => ({ menus: [{ id: 'fixture', label: 'Fixture', items: [{ id: 'fixture.change', label, shortcut: '', enabled: !!current }] }], tools: [], panels: [] }),
        context: () => ({ viewRole: workspace === 'cad' ? 'sketch2d' : 'canvas2d', activeTool: 'fixture', status: 'Development fixture.' }),
        command() { change((current!.value as { width: number }).width + 1); },
        gesture(value) { gestures.push(value); }, dispose() { disposed++; },
      };
    },
  };
  return { adapter, gestures, change: (width: number, baseIdentity?: string) => commits!(width, baseIdentity), relabel(next: string) { label = next; invalidate(); }, open: (value: AppDocument) => opener!(value), get encoded() { return encoded; }, get disposed() { return disposed; } };
}
function nativeHandle(value: File, close: () => Promise<void> = async () => {}) {
  const writes: Uint8Array[] = []; let permission = 'granted'; let requested = 0;
  const handle = {
    name: value.name, getFile: async () => value,
    requestPermission: async () => { requested++; return permission; },
    createWritable: async () => ({ write: async (bytes: Uint8Array) => { writes.push(bytes.slice()); }, close, abort: async () => {} }),
  } as unknown as FileSystemFileHandle;
  return { handle, writes, deny() { permission = 'denied'; }, get requested() { return requested; } };
}
function setup(options: { storage?: ReturnType<typeof resource>; available?: Workspace[]; recent?: RecentPort } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { url: 'https://fixture.test' });
  const window = dom.window;
  const captures = new WeakMap<HTMLElement, Set<number>>();
  Object.assign(window.HTMLElement.prototype, {
    setPointerCapture(this: HTMLElement, id: number) { const set = captures.get(this) ?? new Set<number>(); set.add(id); captures.set(this, set); },
    hasPointerCapture(this: HTMLElement, id: number) { return captures.get(this)?.has(id) ?? false; },
    releasePointerCapture(this: HTMLElement, id: number) { captures.get(this)?.delete(id); },
  });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const root = window.document.querySelector<HTMLElement>('#app')!;
  const fixtures = { cad: fixture('cad'), image: fixture('image'), video: fixture('video') };
  const files: FilePorts = { document: window.document, URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} }, setTimeout: callback => { callback(); } };
  const storage = options.storage ?? resource();
  const adapters = Object.fromEntries((options.available ?? ['cad', 'image', 'video']).map(workspace => [workspace, fixtures[workspace].adapter]));
  const app = mountApp({ root, adapters, files, recovery: storage, probe: { environment: {}, codecRequests: [] }, ...(options.recent ? { recent: options.recent } : {}) });
  return { app, root, dom, window, files, storage, fixtures, close: () => { app.dispose(); dom.window.close(); } };
}
function status(root: HTMLElement) { return root.querySelector('[role="status"]')!.textContent!; }
function clickWorkspace(root: HTMLElement, workspace: Workspace) { root.querySelector<HTMLButtonElement>(`[data-workspace="${workspace}"]`)!.click(); }
function confirm(root: HTMLElement, value: 'replace' | 'keep' | 'save' = 'replace') {
  const select = root.querySelector<HTMLSelectElement>('dialog select')!; assert.ok(select, 'replacement modal exists');
  select.value = value; select.dispatchEvent(new select.ownerDocument.defaultView!.Event('change', { bubbles: true }));
  [...root.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'OK')!.click();
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

test('A-SHELL golden starts one empty CAD window with unavailable editing commands', async () => {
  const s = setup({ available: [] }); await s.app.ready;
  assert.deepEqual(s.app.snapshot(), { workspace: 'cad', documents: {}, histories: {}, saved: {}, dirty: {}, message: 'CAD editing is not available in this development build.' });
  assert.equal(s.root.querySelectorAll('.gc-window').length, 1);
  assert.equal(s.root.querySelectorAll('[role="tab"]').length, 4);
  assert.equal(s.root.querySelector<HTMLButtonElement>('[data-command="file.new"]')!.disabled, true);
  await s.app.dispatch('file.new'); await s.app.dispatch('edit.undo');
  assert.deepEqual(s.app.snapshot().documents, {});
  assert.match(s.root.textContent!, /browser notice/); s.close();
});

test('A-SHELL invalidate refreshes the active editor menus without committing or touching other workspaces', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new');
  const before = s.app.snapshot();
  s.fixtures.cad.relabel('Relabelled fixture');
  assert.match(s.root.querySelector('[data-command="fixture.change"]')!.textContent!, /Relabelled fixture/);
  assert.equal(s.app.snapshot(), before);
  s.fixtures.image.relabel('Hidden image label');
  assert.doesNotMatch(s.root.textContent!, /Hidden image label/); s.close();
});

test('A-SHELL editor open creates an unsaved document only after replacement consent', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new'); await s.app.dispatch('edit.undo');
  const first = s.fixtures.cad.open({ id: 'imported', title: 'Imported', format: 'gsnv-cad', version: 1, value: { width: 77 } });
  await turn(); confirm(s.root, 'replace'); assert.equal(await first, true);
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 77 }); assert.equal(s.app.snapshot().dirty.cad, true);
  const pending = s.fixtures.cad.open({ id: 'second', title: 'Second', format: 'gsnv-cad', version: 1, value: { width: 5 } });
  await new Promise(resolve => setTimeout(resolve, 0)); confirm(s.root, 'keep');
  assert.equal(await pending, false); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 77 }); s.close();
});

test('A-SHELL with recent projects: New never prompts, edits autosave to File > Recent and reopen from there', async () => {
  const recent = recentProjects(new FakeFactory()), s = setup({ recent }); await s.app.ready;
  await s.app.dispatch('file.new'); s.fixtures.cad.change(55); await new Promise(resolve => setTimeout(resolve, 800));
  const first = s.app.snapshot().documents.cad!;
  assert.equal(await s.fixtures.cad.open({ id: 'second', title: 'Second', format: 'gsnv-cad', version: 1, value: { width: 10 } }), true);
  assert.equal(s.root.querySelector('dialog'), null, 'no replacement prompt'); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 10 });
  assert.deepEqual((await recent.list()).map(e => [e.id, e.workspace, e.title]), [[first.id, 'cad', 'cad fixture']]);
  s.app.snapshot(); await s.app.dispatch('file.recent.0'); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 55 });
  assert.match(s.root.querySelector('[data-command="file.recent.0"]')!.textContent!, /cad fixture \(CAD\)/);
  await s.app.dispatch('file.clearRecent'); assert.deepEqual(await recent.list(), []); s.close();
});

test('A-SHELL real sessions keep 100 edits, independent workspaces and exactly-once keyboard history', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new');
  for (let width = 11; width <= 110; width++) s.fixtures.cad.change(width);
  const view = s.root.querySelector<HTMLElement>('.gc-viewport')!; view.focus();
  view.dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 109 });
  assert.equal(s.app.snapshot().histories.cad!.past.length, 99);
  view.dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 110 });
  assert.match(s.root.querySelector('[data-panel-history]')!.textContent!, /Change fixture width/);
  clickWorkspace(s.root, 'image'); await s.app.dispatch('file.new'); s.fixtures.image.change(20);
  clickWorkspace(s.root, 'cad'); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 110 });
  assert.deepEqual(s.app.snapshot().documents.image!.value, { width: 20 });
  const event = new s.window.Event('beforeunload', { cancelable: true }); s.window.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  await s.app.idle(); s.close();
});

test('A-SHELL native Open validates domain before replacement and preserves handles on rejection', async () => {
  const s = setup(); await s.app.ready;
  const good = nativeHandle(fileFor(packageFor('cad')));
  s.files.showOpenFilePicker = async () => [good.handle]; await s.app.dispatch('file.open');
  const opened = s.app.snapshot().documents.cad; assert.equal(s.app.snapshot().dirty.cad, false);
  const badPackage = { ...packageFor('cad'), project: { ...packageFor('cad').project, content: { fixture: false } } };
  const bad = nativeHandle(fileFor(badPackage)); s.files.showOpenFilePicker = async () => [bad.handle];
  await s.app.dispatch('file.open'); assert.equal(s.app.snapshot().documents.cad, opened); assert.match(status(s.root), /schema rejected/);
  s.files.showOpenFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); };
  await s.app.dispatch('file.open'); assert.equal(s.app.snapshot().documents.cad, opened);
  s.fixtures.cad.change(12); await s.app.dispatch('file.save');
  assert.ok(good.writes.length); assert.equal(bad.writes.length, 0); assert.equal(good.requested, 1);
  assert.equal(s.app.snapshot().dirty.cad, false); await s.app.idle(); s.close();
});

test('A-SHELL Open protects its target workspace, including dirty replacement consent', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(15);
  clickWorkspace(s.root, 'image'); await s.app.dispatch('file.new'); s.fixtures.image.change(22);
  s.files.showOpenFilePicker = async () => [nativeHandle(fileFor(packageFor('cad', 30))).handle];
  let opening = s.app.dispatch('file.open'); await turn();
  confirm(s.root, 'keep'); await opening; assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 15 });
  opening = s.app.dispatch('file.open'); await turn(); confirm(s.root); await opening;
  assert.equal(s.app.snapshot().workspace, 'cad'); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 30 });
  assert.deepEqual(s.app.snapshot().documents.image!.value, { width: 22 }); assert.equal(s.app.snapshot().dirty.image, true);
  await s.app.idle(); s.close();
});

test('A-SHELL save binds the written revision while later edits remain dirty', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new');
  const closed = deferred(); const started = deferred();
  const target = nativeHandle(fileFor(packageFor('cad')), async () => { started.resolve(); await closed.promise; });
  let encodedAtPicker = -1;
  s.files.showSaveFilePicker = async () => { encodedAtPicker = s.fixtures.cad.encoded; return target.handle; };
  await s.app.idle(); const encodedBefore = s.fixtures.cad.encoded;
  const saving = s.app.dispatch('file.save'); await started.promise;
  assert.equal(encodedAtPicker, encodedBefore, 'picker precedes expensive serialization');
  const savedIdentity = s.app.snapshot().documents.cad!.identity;
  s.fixtures.cad.change(25); closed.resolve(); await saving;
  assert.equal(s.app.snapshot().saved.cad, savedIdentity); assert.equal(s.app.snapshot().dirty.cad, true);
  assert.equal(nativeContainer({ op: 'decode', parts: target.writes }).project.content && (nativeContainer({ op: 'decode', parts: target.writes }).project.content as { width: number }).width, 10);
  await s.app.idle(); s.close();
});

test('A-SHELL late native save cannot bind its handle to a reopened document with the same ID', async () => {
  const s = setup(); await s.app.ready;
  const close = deferred(); const started = deferred();
  const first = nativeHandle(fileFor(packageFor('cad')), async () => { started.resolve(); await close.promise; });
  s.files.showOpenFilePicker = async () => [first.handle]; await s.app.dispatch('file.open');
  const saving = s.app.dispatch('file.save'); await started.promise;
  const second = nativeHandle(fileFor(packageFor('cad', 40))); s.files.showOpenFilePicker = async () => [second.handle];
  await s.app.dispatch('file.open'); const replacement = s.app.snapshot().documents.cad;
  close.resolve(); await saving; assert.equal(s.app.snapshot().documents.cad, replacement); assert.equal(s.app.snapshot().saved.cad, replacement!.identity);
  s.fixtures.cad.change(45); await s.app.dispatch('file.save'); assert.ok(second.writes.length);
  await s.app.idle(); s.close();
});

test('A-SHELL denied write permission fails before serialization and preserves dirty state', async () => {
  const s = setup(); await s.app.ready; const target = nativeHandle(fileFor(packageFor('cad')));
  s.files.showOpenFilePicker = async () => [target.handle]; await s.app.dispatch('file.open'); s.fixtures.cad.change(20); await s.app.idle();
  const count = s.fixtures.cad.encoded; target.deny(); await s.app.dispatch('file.save');
  assert.equal(s.fixtures.cad.encoded, count); assert.equal(target.writes.length, 0); assert.equal(s.app.snapshot().dirty.cad, true);
  assert.match(status(s.root), /permission/i); s.close();
});

test('A-SHELL Save-then-replace proceeds only after a successful write of the protected revision', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(22);
  const destination = nativeHandle(fileFor(packageFor('cad'))); s.files.showSaveFilePicker = async () => destination.handle;
  s.files.showOpenFilePicker = async () => [nativeHandle(fileFor(packageFor('cad', 40))).handle];
  const opening = s.app.dispatch('file.open'); await turn(); confirm(s.root, 'save'); await opening;
  assert.equal((nativeContainer({ op: 'decode', parts: destination.writes }).project.content as { width: number }).width, 22);
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 40 });
  s.fixtures.cad.change(45); s.files.showOpenFilePicker = async () => [nativeHandle(fileFor(packageFor('cad', 50))).handle];
  const active = s.app.snapshot().documents.cad; const pending = s.app.dispatch('file.open'); await turn();
  const original = s.fixtures.cad.adapter.encode; s.fixtures.cad.adapter.encode = () => { throw new Error('Encoding failed'); };
  confirm(s.root, 'save'); await pending; s.fixtures.cad.adapter.encode = original;
  assert.equal(s.app.snapshot().documents.cad, active); assert.match(status(s.root), /Encoding failed/);
  await s.app.idle(); s.close();
});

test('A-SHELL recovery is offered explicitly and restores editable data as dirty', async () => {
  const storage = resource(); const first = setup({ storage }); await first.app.ready; await first.app.dispatch('file.new'); first.fixtures.cad.change(37);
  await first.app.idle(); first.close();
  const second = setup({ storage }); await second.app.ready;
  assert.equal(second.app.snapshot().documents.cad, undefined); assert.match(second.root.textContent!, /recovery/i);
  await second.app.dispatch('file.new'); assert.deepEqual(second.app.snapshot().documents.cad!.value, { width: 10 }, 'New is never blocked by a pending recovery');
  assert.match(second.root.textContent!, /Recovery available/, 'and the recovery stays restorable');
  const restoring = second.app.dispatch('recovery.restore'); await turn(); confirm(second.root, 'replace'); await restoring; assert.deepEqual(second.app.snapshot().documents.cad!.value, { width: 37 });
  assert.equal(second.app.snapshot().dirty.cad, true); second.fixtures.cad.change(38); await second.app.idle();
  const record = await recoveryStore({ op: 'read', workspace: 'cad' }, storage); assert.ok(record.ok && record.value);
  assert.equal((nativeContainer({ op: 'decode', parts: record.value.payload }).project.content as { width: number }).width, 38);
  second.close();
});

test('A-SHELL corrupt recovery remains readable and its observed generation is exceeded after discard', async () => {
  const storage = resource(); await recoveryStore({ op: 'write', record: { workspace: 'cad', title: 'Broken', generation: 50, payload: [new Uint8Array([1])] } }, storage);
  const s = setup({ storage }); await s.app.ready;
  assert.match(s.root.textContent!, /recovery.format/); assert.equal(s.app.snapshot().documents.cad, undefined);
  await s.app.dispatch('recovery.restore'); assert.equal(s.app.snapshot().documents.cad, undefined);
  await s.app.dispatch('recovery.discard'); await s.app.dispatch('file.new'); await s.app.idle();
  const record = await recoveryStore({ op: 'read', workspace: 'cad' }, storage); assert.ok(record.ok && record.value); assert.ok(record.value.generation > 50);
  s.close();
});

test('A-SHELL discard runs after queued autosaves without recreating a recovery record', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new');
  for (let width = 11; width <= 20; width++) s.fixtures.cad.change(width);
  await s.app.dispatch('recovery.discard'); await s.app.idle();
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, s.storage), { ok: true, value: null });
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 20 }); s.close();
});

test('A-SHELL stale editor callbacks and post-disposal file completions cannot replace documents', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new'); const old = s.app.snapshot().documents.cad!.identity;
  s.fixtures.cad.change(11); s.fixtures.cad.change(99, old); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 11 });
  await s.app.idle(); const opened = deferred(); const target = nativeHandle(fileFor(packageFor('image')));
  s.files.showOpenFilePicker = async () => { await opened.promise; return [target.handle]; };
  const opening = s.app.dispatch('file.open'); s.app.dispose(); s.app.dispose(); opened.resolve(); await opening;
  assert.equal(s.root.children.length, 0); assert.equal(s.app.snapshot().documents.image, undefined); assert.equal(s.fixtures.cad.disposed, 1);
  s.dom.window.close();
});

test('A-SHELL unavailable browser recovery does not block editing or explicit project saves', async () => {
  const storage = resource(); Object.assign(storage, { indexedDB: undefined, localStorage: undefined });
  const s = setup({ storage }); await s.app.ready; await s.app.dispatch('file.new');
  assert.ok(s.app.snapshot().documents.cad, 'missing recovery API must not disable editing');
  s.fixtures.cad.change(24); const target = nativeHandle(fileFor(packageFor('cad')));
  s.files.showSaveFilePicker = async () => target.handle; await s.app.dispatch('file.save');
  assert.ok(target.writes.length); assert.equal(s.app.snapshot().dirty.cad, false);
  assert.match(s.root.querySelector('[data-panel-recovery]')!.textContent!, /unavailable/i);
  assert.doesNotMatch(s.root.querySelector('[data-panel-recovery]')!.textContent!, /recovery enabled/i);
  await s.app.idle(); s.close();
});

test('A-SHELL Open completion during another modal settles without a hidden replacement prompt', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new'); await s.app.idle();
  const reading = deferred(); const release = deferred(); const target = nativeHandle(fileFor(packageFor('cad', 50)));
  target.handle.getFile = async () => { reading.resolve(); await release.promise; return fileFor(packageFor('cad', 50)); };
  s.files.showOpenFilePicker = async () => [target.handle]; let settled = false;
  const opening = s.app.dispatch('file.open').then(() => { settled = true; }); await reading.promise;
  await s.app.dispatch('view.settings'); assert.ok(s.root.querySelector('dialog'));
  release.resolve(); await turn();
  try {
    assert.equal(settled, true, 'the pending Open must settle instead of losing its confirmation callback');
    assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 10 });
    [...s.root.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'Cancel')!.click();
    await opening; await s.app.idle(); assert.equal(s.root.querySelector<HTMLButtonElement>('[data-command="file.open"]')!.disabled, false);
  } finally { s.close(); }
});

test('A-SHELL a new edit after pending discard makes the resulting recovery available again', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new'); await s.app.idle();
  const discarding = s.app.dispatch('recovery.discard'); s.fixtures.cad.change(31);
  await discarding; await s.app.idle();
  const record = await recoveryStore({ op: 'read', workspace: 'cad' }, s.storage); assert.ok(record.ok && record.value);
  assert.equal((nativeContainer({ op: 'decode', parts: record.value.payload }).project.content as { width: number }).width, 31);
  assert.match(s.root.querySelector('[data-panel-recovery]')!.textContent!, /Local recovery enabled/);
  assert.equal(s.root.querySelector<HTMLButtonElement>('[data-command="recovery.discard"]')!.disabled, false);
  s.close();
});

test('A-SHELL a modal forwards the active pointer cancellation before further editing', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new');
  const viewport = s.root.querySelector<HTMLElement>('.gc-viewport')!;
  const down = new s.window.MouseEvent('pointerdown', { button: 0, buttons: 1, clientX: 3, clientY: 4, bubbles: true, cancelable: true });
  Object.defineProperties(down, { pointerId: { value: 1 }, pointerType: { value: 'mouse' }, pressure: { value: 0.5 } });
  viewport.dispatchEvent(down); assert.equal(viewport.hasPointerCapture(1), true);
  await s.app.dispatch('view.settings');
  assert.deepEqual(s.fixtures.cad.gestures.map(value => value.type === 'pointer' ? value.phase : value.type), ['down', 'cancel']);
  assert.equal(viewport.hasPointerCapture(1), false); s.close();
});
