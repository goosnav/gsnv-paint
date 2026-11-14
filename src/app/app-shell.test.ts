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
  let identity = ''; let current: AppDocument | undefined; let encoded = 0; let disposed = 0; let staged: number | undefined;
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
      const flush = () => { if (staged !== undefined) { const width = staged; staged = undefined; change(width); } };
      commits = change; invalidate = () => host.invalidate(); opener = value => host.open(value);
      return {
        render(document, view) { current = document; identity = document?.identity ?? ''; output.textContent = JSON.stringify({ width: (document?.value as { width: number } | undefined)?.width ?? null, view }); },
        model: () => ({ menus: [{ id: 'fixture', label: 'Fixture', items: [{ id: 'fixture.change', label, shortcut: '', enabled: !!current }] }], tools: [], panels: [] }),
        context: () => ({ viewRole: workspace === 'cad' ? 'sketch2d' : 'canvas2d', activeTool: 'fixture', status: 'Development fixture.' }),
        command() { change((current!.value as { width: number }).width + 1); },
        gesture(value) { gestures.push(value); }, flush, dispose() { flush(); disposed++; },
      };
    },
  };
  return { adapter, gestures, change: (width: number, baseIdentity?: string) => commits!(width, baseIdentity), stage(width: number) { staged = width; }, relabel(next: string) { label = next; invalidate(); }, open: (value: AppDocument) => opener!(value), get encoded() { return encoded; }, get disposed() { return disposed; } };
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
function setup(options: { storage?: ReturnType<typeof resource>; available?: Workspace[]; recent?: RecentPort; viewSettings?: () => void } = {}) {
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
  const adapters = Object.fromEntries((options.available ?? ['cad', 'image', 'video']).map(workspace => {
    const adapter = fixtures[workspace].adapter;
    return [workspace, options.viewSettings && workspace === 'cad' ? { ...adapter, mount: (host: Parameters<WorkspaceAdapter['mount']>[0]) => ({ ...adapter.mount(host), viewSettings: options.viewSettings! }) } : adapter];
  }));
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
const partsFor = (width: number, id = 'fixture-id') => nativeContainer({ op: 'encode', package: packageFor('cad', width, id) }).parts;
const storedWidth = (parts: readonly Uint8Array[]) => (nativeContainer({ op: 'decode', parts }).project.content as { width: number }).width;
async function recoveryParts(storage: ReturnType<typeof resource>) {
  const result = await recoveryStore({ op: 'read', workspace: 'cad' }, storage);
  assert.ok(result.ok); return result.value?.payload ?? null;
}
const unload = (s: ReturnType<typeof setup>) => { const event = new s.window.Event('beforeunload', { cancelable: true }); s.window.dispatchEvent(event); return event.defaultPrevented; };

test('A-SHELL golden starts one empty CAD window with unavailable editing commands', async () => {
  const s = setup({ available: [] }); await s.app.ready;
  assert.deepEqual(s.app.snapshot(), { workspace: 'cad', documents: {}, histories: {}, saved: {}, dirty: {}, message: 'CAD editing is not available in this development build.' });
  assert.equal(s.root.querySelectorAll('.gc-window').length, 1);
  assert.deepEqual([...s.root.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute('data-workspace')), ['cad', 'image', 'photo', 'video', 'document', 'slides', 'audio', 'spreadsheet', 'code']);
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

test('A-SHELL project rename preserves pending editor input and has its own undo step', async () => {
  const s = setup({ recent: recentProjects(new FakeFactory()) }); await s.app.ready; await s.app.dispatch('file.new');
  s.fixtures.cad.stage(99); await s.app.dispatch('file.rename');
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 99 }, 'flush editor input before mounting Rename');
  const input = s.root.querySelector<HTMLInputElement>('dialog input[type="text"]')!;
  input.value = 'Renamed model'; input.dispatchEvent(new s.window.Event('input', { bubbles: true }));
  [...s.root.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'OK')!.click();
  assert.equal(s.app.snapshot().documents.cad!.title, 'Renamed model');
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 99 });
  await s.app.dispatch('edit.undo'); assert.equal(s.app.snapshot().documents.cad!.title, 'cad fixture');
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 99 });
  await s.app.dispatch('edit.undo'); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 10 }); s.close();
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
  await s.app.dispatch('file.clearRecent');
  const checkbox = s.root.querySelector<HTMLInputElement>('dialog input[type="checkbox"]')!; assert.ok(checkbox, 'deleting stored work requires explicit confirmation');
  checkbox.checked = true; checkbox.dispatchEvent(new s.window.Event('change', { bubbles: true }));
  [...s.root.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'OK')!.click();
  await s.app.idle(); assert.deepEqual(await recent.list(), []); s.close();
});

for (const failure of ['unavailable', 'NotAllowedError', 'QuotaExceededError']) test(`A-SHELL ${failure} recent backup keeps dirty work on New and Open and warns on unload`, async () => {
  const recent = recentProjects(failure === 'unavailable' ? undefined : new FakeFactory());
  if (failure !== 'unavailable') recent.save = async () => { throw new DOMException('Dummy storage failure', failure); };
  const s = setup({ recent });
  try {
    await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(47);
    const original = s.app.snapshot().documents.cad;
    await s.app.dispatch('file.new'); assert.equal(s.app.snapshot().documents.cad, original, 'failed backup cannot discard the current work');
    assert.match(status(s.root), /save.*file|file.*save/i);
    s.files.showOpenFilePicker = async () => [nativeHandle(fileFor(packageFor('cad', 80, 'other'))).handle];
    await s.app.dispatch('file.open'); assert.equal(s.app.snapshot().documents.cad, original);
    const unload = new s.window.Event('beforeunload', { cancelable: true }); s.window.dispatchEvent(unload);
    assert.equal(unload.defaultPrevented, true);
    await s.app.idle();
  } finally { s.close(); }
});

test('A-SHELL unload protects the exact dirty revision until its recent backup succeeds', async () => {
  const recent = recentProjects(new FakeFactory()), s = setup({ recent });
  const unload = () => { const event = new s.window.Event('beforeunload', { cancelable: true }); s.window.dispatchEvent(event); return event.defaultPrevented; };
  try {
    await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(55);
    assert.equal(unload(), true, 'a requested backup is not a completed backup');
    await s.app.idle(); assert.equal(unload(), false, 'the exact stored revision can close without a warning');
    s.fixtures.cad.stage(56);
    assert.equal(unload(), true, 'pending view edits must flush before checking durability');
    assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 56 });
    await s.app.idle(); assert.equal(unload(), false);
  } finally { s.close(); }
});

test('A-SHELL a changed revision during replacement backup stays open', async () => {
  const recent = recentProjects(new FakeFactory()), realSave = recent.save.bind(recent), entered = deferred(), release = deferred();
  recent.save = async entry => { entered.resolve(); await release.promise; await realSave(entry); };
  const s = setup({ recent });
  try {
    await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(41);
    const opening = s.fixtures.cad.open({ id: 'replacement', title: 'Replacement', format: 'gsnv-cad', version: 1, value: { width: 80 } });
    await entered.promise; s.fixtures.cad.change(42); release.resolve();
    assert.equal(await opening, false); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 42 });
    assert.match(status(s.root), /changed/i);
  } finally { release.resolve(); await s.app.idle(); s.close(); }
});

test('A-SHELL overlapping recent writes cannot leave an older revision stored last', async () => {
  const recent = recentProjects(new FakeFactory()), realSave = recent.save.bind(recent), entered = deferred(), release = deferred(), completed = deferred(); let saves = 0;
  recent.save = async entry => { const position = ++saves; if (position === 1) { entered.resolve(); await release.promise; } await realSave(entry); if (position === 2) completed.resolve(); };
  const s = setup({ recent });
  const unload = () => s.window.dispatchEvent(new s.window.Event('beforeunload', { cancelable: true }));
  try {
    await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(71); unload(); await entered.promise;
    s.fixtures.cad.change(72); unload(); await turn(); release.resolve(); await completed.promise; await s.app.idle();
    const stored = nativeContainer({ op: 'decode', parts: await recent.load('fixture-id') });
    assert.equal((stored.project.content as { width: number }).width, 72);
  } finally { release.resolve(); s.close(); }
});

test('A-SHELL Undo cannot acknowledge a stored revision while queued writes can still replace it', async () => {
  const recent = recentProjects(new FakeFactory()), realSave = recent.save.bind(recent), firstEntered = deferred(), firstRelease = deferred(), secondEntered = deferred(), secondRelease = deferred(); let saves = 0;
  recent.save = async entry => {
    const position = ++saves;
    if (position === 1) { firstEntered.resolve(); await firstRelease.promise; }
    if (position === 2) { secondEntered.resolve(); await secondRelease.promise; }
    await realSave(entry);
  };
  const s = setup({ recent });
  const unload = () => { const event = new s.window.Event('beforeunload', { cancelable: true }); s.window.dispatchEvent(event); return event.defaultPrevented; };
  try {
    await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(71); unload(); await firstEntered.promise;
    s.fixtures.cad.change(72); unload(); await s.app.dispatch('edit.undo'); unload();
    firstRelease.resolve(); await secondEntered.promise;
    assert.equal(unload(), true, 'an older completed write cannot acknowledge the final Undo state while later writes are queued');
    secondRelease.resolve(); await s.app.idle(); assert.equal(unload(), false);
    const stored = nativeContainer({ op: 'decode', parts: await recent.load('fixture-id') });
    assert.equal((stored.project.content as { width: number }).width, 71);
  } finally { firstRelease.resolve(); secondRelease.resolve(); await s.app.idle(); s.close(); }
});

test('A-SHELL disposal accepts pending view edits and finishes their stored backup', async () => {
  const recent = recentProjects(new FakeFactory()), s = setup({ recent });
  await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.stage(63);
  s.app.dispose(); await s.app.idle();
  assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 63 });
  const stored = nativeContainer({ op: 'decode', parts: await recent.load('fixture-id') });
  assert.equal((stored.project.content as { width: number }).width, 63);
  assert.equal(s.fixtures.cad.disposed, 1); s.dom.window.close();
});

test('A-SHELL all retained projects remain reachable beyond the newest 12 menu entries', async () => {
  const recent = recentProjects(new FakeFactory());
  for (let i = 0; i < 14; i++) await recent.save({ id: `project-${i}`, title: `Project ${i}`, workspace: 'cad', updated: i, parts: nativeContainer({ op: 'encode', package: packageFor('cad', i + 10, `project-${i}`) }).parts });
  const s = setup({ recent });
  try {
    await s.app.ready;
    assert.equal(s.root.querySelectorAll('[data-command^="file.recent."]').length, 12);
    await s.app.dispatch('file.stored'); const choice = s.root.querySelector<HTMLSelectElement>('dialog select')!; assert.ok(choice);
    assert.equal(choice.options.length, 14); choice.value = 'project-0'; choice.dispatchEvent(new s.window.Event('change', { bubbles: true }));
    [...s.root.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'OK')!.click();
    await s.app.idle(); assert.equal(s.app.snapshot().documents.cad!.id, 'project-0');
    assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 10 });
  } finally { s.close(); }
});

test('A-SHELL opening an older file with the same project id preserves displaced unsaved work', async () => {
  const recent = recentProjects(new FakeFactory()), s = setup({ recent });
  try {
    await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(91);
    s.files.showOpenFilePicker = async () => [nativeHandle(fileFor(packageFor('cad', 10))).handle];
    await s.app.dispatch('file.open');
    assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 91 });
    assert.match(status(s.root), /replace its stored copy.*Save.*current version first/);
    s.window.dispatchEvent(new s.window.Event('beforeunload', { cancelable: true })); await s.app.idle();
    await s.app.dispatch('file.recent.0'); assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 91 }, 'selecting the current stored project is harmless');
    await s.app.dispatch('file.save'); await s.app.dispatch('file.open');
    assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 10 }, 'an exported current version permits opening the other copy');
  } finally { s.close(); }
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

test('A-SHELL New restores keyboard scope when an editor replaces its focused view', async () => {
  const s = setup(); await s.app.ready; await s.app.dispatch('file.new'); await s.app.dispatch('file.save');
  const field = s.window.document.createElement('input');
  s.root.querySelector('output')!.append(field); field.focus();
  assert.equal(s.window.document.activeElement, field);
  await s.app.dispatch('file.new');
  assert.equal(field.isConnected, false);
  assert.equal(s.window.document.activeElement, s.root.querySelector('.gc-viewport'));
  let opened = 0;
  s.files.showOpenFilePicker = async () => { opened++; throw new s.window.DOMException('Canceled', 'AbortError'); };
  s.window.document.activeElement!.dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }));
  await s.app.idle(); assert.equal(opened, 1); s.close();
});


test('A-SHELL view settings delegates to an adapter-owned transform without changing document state', async () => {
  let opened = 0;
  const s = setup({ viewSettings: () => { opened++; } });
  try {
    await s.app.ready; await s.app.dispatch('file.new');
    const before = s.app.snapshot();
    await s.app.dispatch('view.settings');
    assert.equal(opened, 1);
    assert.equal(s.root.querySelector('dialog'), null, 'the fallback dialog must not also open');
    assert.equal(s.app.snapshot(), before);
  } finally { s.close(); }
});

test('A-SHELL restored storage plus native Save repairs the current recovery before close and reopen', async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), journal = storage.localStorage.setItem, saveRecent = recent.save.bind(recent); let denied = false;
  storage.localStorage.setItem = (key, value) => { if (denied) throw new DOMException('Blocked', 'SecurityError'); journal(key, value); };
  recent.save = async entry => { if (denied) throw new DOMException('Blocked', 'SecurityError'); await saveRecent(entry); };
  const s = setup({ storage, recent });
  try {
    await s.app.ready; await s.app.dispatch('file.new'); s.fixtures.cad.change(51); unload(s); await s.app.idle();
    denied = true; s.fixtures.cad.stage(52); assert.equal(unload(s), true); await s.app.idle(); assert.equal(storedWidth((await recoveryParts(storage))!), 51);
    denied = false; const file = nativeHandle(fileFor(packageFor('cad'))); s.files.showSaveFilePicker = async () => file.handle;
    await s.app.dispatch('file.save'); assert.equal(storedWidth(file.writes), 52); assert.equal(s.app.snapshot().dirty.cad, false);
    assert.equal(storedWidth((await recoveryParts(storage))!), 52); assert.equal(storedWidth(await recent.load('fixture-id')), 52); assert.equal(unload(s), false);
    s.app.dispose(); await s.app.idle();
    const reopened = setup({ storage, recent }); try { await reopened.app.ready; assert.deepEqual(reopened.app.snapshot().documents.cad!.value, { width: 52 }); } finally { reopened.close(); await reopened.app.idle(); }
  } finally { denied = false; s.close(); await s.app.idle(); }
});
test('A-SHELL Recent never advances past failed recovery, and a retry commits recovery before Recent', async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), journal = storage.localStorage.setItem, saveRecent = recent.save.bind(recent); let denied = false, verifyOrder = false, writes = 0;
  storage.localStorage.setItem = (key, value) => { if (denied) throw new Error('Recovery denied'); journal(key, value); };
  recent.save = async entry => { writes++; if (verifyOrder) assert.deepEqual(await recoveryParts(storage), entry.parts); await saveRecent(entry); };
  const s = setup({ storage, recent });
  try {
    await s.app.ready; await s.app.dispatch('file.new'); unload(s); await s.app.idle(); const before = writes;
    denied = true; s.fixtures.cad.change(53); assert.equal(unload(s), true); await s.app.idle();
    assert.equal(writes, before); assert.equal(storedWidth(await recent.load('fixture-id')), 10); assert.match(s.root.textContent!, /Recovery denied/);
    denied = false; verifyOrder = true; assert.equal(unload(s), true); await s.app.idle(); assert.equal(unload(s), false); assert.equal(storedWidth(await recent.load('fixture-id')), 53);
  } finally { denied = false; s.close(); await s.app.idle(); }
});
test('A-SHELL native Save stays successful with a truthful warning when Recent fails after recovery', async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), saveRecent = recent.save.bind(recent); let denied = false;
  recent.save = async entry => { if (denied) throw new Error('Recent quota denied'); await saveRecent(entry); };
  const s = setup({ storage, recent });
  try {
    await s.app.ready; await s.app.dispatch('file.new'); unload(s); await s.app.idle(); denied = true; s.fixtures.cad.change(54);
    const file = nativeHandle(fileFor(packageFor('cad'))); s.files.showSaveFilePicker = async () => file.handle; await s.app.dispatch('file.save');
    assert.equal(storedWidth(file.writes), 54); assert.equal(s.app.snapshot().dirty.cad, false); assert.equal(storedWidth((await recoveryParts(storage))!), 54); assert.equal(storedWidth(await recent.load('fixture-id')), 10); assert.match(status(s.root), /Recent quota denied/);
  } finally { denied = false; s.close(); await s.app.idle(); }
});
test('A-SHELL delayed file Save retries the newer current revision without marking it saved', async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), journal = storage.localStorage.setItem; let denied = false;
  storage.localStorage.setItem = (key, value) => { if (denied) throw new Error('Recovery denied'); journal(key, value); };
  const s = setup({ storage, recent }), entered = deferred(), release = deferred();
  try {
    await s.app.ready; await s.app.dispatch('file.new'); await s.app.idle();
    const file = nativeHandle(fileFor(packageFor('cad')), async () => { entered.resolve(); await release.promise; }); s.files.showSaveFilePicker = async () => file.handle;
    const saving = s.app.dispatch('file.save'); await entered.promise; denied = true; s.fixtures.cad.change(55); await turn(); await turn(); denied = false; release.resolve(); await saving;
    assert.equal(storedWidth(file.writes), 10); assert.equal(s.app.snapshot().dirty.cad, true); assert.equal(storedWidth((await recoveryParts(storage))!), 55); assert.equal(storedWidth(await recent.load('fixture-id')), 55);
  } finally { denied = false; release.resolve(); s.close(); await s.app.idle(); }
});
for (const [generation, width] of [[1, 77], [100, 77], [100, 10]] as const) test(`A-SHELL returned generation ${generation} and width ${width} cannot acknowledge the attempted recovery`, async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), s = setup({ storage, recent });
  try {
    await s.app.ready; await recoveryStore({ op: 'write', record: { workspace: 'cad', generation, title: 'Other', payload: partsFor(width) } }, storage);
    await s.app.dispatch('file.new'); assert.equal(unload(s), true); await s.app.idle();
    assert.deepEqual(await recent.list(), []); assert.equal(storedWidth((await recoveryParts(storage))!), width); assert.match(s.root.textContent!, /acknowledg|different|match/i);
    assert.equal(unload(s), true); await s.app.idle(); assert.equal(storedWidth((await recoveryParts(storage))!), 10); assert.equal(storedWidth(await recent.load('fixture-id')), 10);
  } finally { s.close(); await s.app.idle(); }
});
for (const [recovered, retained] of [[61, 62], [62, 61]]) test(`A-SHELL startup conflict ${recovered}/${retained} stays read-only and recovery opens as an editable copy`, async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), original = partsFor(retained!);
  await recoveryStore({ op: 'write', record: { workspace: 'cad', generation: 20, title: 'Recovery', payload: partsFor(recovered!) } }, storage);
  await recent.save({ id: 'fixture-id', workspace: 'cad', title: 'Stored original', updated: 1000, parts: original });
  const s = setup({ storage, recent });
  try {
    await s.app.ready; assert.equal(s.app.snapshot().documents.cad, undefined); assert.match(s.root.textContent!, /Recover as copy/); unload(s); await s.app.idle(); s.app.dispose(); await s.app.idle();
    assert.deepEqual(await recent.load('fixture-id'), original); assert.equal(storedWidth((await recoveryParts(storage))!), recovered);
    const next = setup({ storage, recent }); try {
      await next.app.ready; await next.app.dispatch('file.recent.0'); assert.deepEqual(next.app.snapshot().documents.cad!.value, { width: retained });
      await next.app.dispatch('recovery.restore'); await next.app.idle(); const copy = next.app.snapshot().documents.cad!; assert.notEqual(copy.id, 'fixture-id'); assert.deepEqual(copy.value, { width: recovered });
      assert.deepEqual(await recent.load('fixture-id'), original); assert.equal(storedWidth(await recent.load(copy.id)), recovered); next.fixtures.cad.change(63); await next.app.dispatch('file.save'); assert.equal(storedWidth(await recent.load(copy.id)), 63); assert.deepEqual(await recent.load('fixture-id'), original);
    } finally { next.close(); await next.app.idle(); }
  } finally { s.close(); await s.app.idle(); }
});
for (const alternative of ['identical', 'absent', 'unreadable', 'invalid', 'unlisted'] as const) test(`A-SHELL startup with ${alternative} Recent performs no writes on startup or no-edit disposal`, async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB);
  await recoveryStore({ op: 'write', record: { workspace: 'cad', generation: 20, title: 'Recovery', payload: partsFor(65) } }, storage);
  if (alternative !== 'absent') await recent.save({ id: 'fixture-id', workspace: 'cad', title: 'Original', updated: 1000, parts: alternative === 'invalid' ? partsFor(0) : partsFor(65) });
  if (alternative === 'unreadable') recent.load = async () => { throw new Error('Read denied'); };
  if (alternative === 'unlisted') recent.list = async () => { throw new Error('List denied'); };
  let writes = 0; const journal = storage.localStorage.setItem, saveRecent = recent.save.bind(recent); storage.localStorage.setItem = (key, value) => { writes++; journal(key, value); }; recent.save = async entry => { writes++; await saveRecent(entry); };
  const s = setup({ storage, recent });
  try { await s.app.ready; await s.app.idle(); assert.equal(!!s.app.snapshot().documents.cad, alternative === 'identical' || alternative === 'absent'); unload(s); await s.app.idle(); s.app.dispose(); await s.app.idle(); assert.equal(writes, 0); }
  finally { s.close(); await s.app.idle(); }
});
test('A-SHELL explicit recovery discard is not undone by Recent flush; a later edit resumes recovery', async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), s = setup({ storage, recent });
  try {
    await s.app.ready; await s.app.dispatch('file.new'); unload(s); await s.app.idle(); await s.app.dispatch('recovery.discard'); unload(s); await s.app.idle(); assert.equal(await recoveryParts(storage), null);
    s.fixtures.cad.change(66); unload(s); await s.app.idle(); assert.equal(storedWidth((await recoveryParts(storage))!), 66); assert.equal(storedWidth(await recent.load('fixture-id')), 66);
  } finally { s.close(); await s.app.idle(); }
});

test('A-SHELL obsolete queued snapshots are never encoded into recovery, including during disposal', async () => {
  const s = setup();
  try {
    await s.app.ready; await s.app.dispatch('file.new'); await s.app.idle();
    const widths: number[] = [], encode = s.fixtures.cad.adapter.encode;
    s.fixtures.cad.adapter.encode = snapshot => { widths.push((snapshot.value as { width: number }).width); return encode(snapshot); };
    s.fixtures.cad.change(71); s.fixtures.cad.change(72); s.fixtures.cad.change(73); s.app.dispose(); await s.app.idle();
    assert.deepEqual(widths, [73]); assert.equal(storedWidth((await recoveryParts(s.storage))!), 73); assert.equal(s.root.children.length, 0);
  } finally { s.close(); await s.app.idle(); }
});

test('A-SHELL an initiated native Save can finish current browser persistence after disposal without late UI', async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), journal = storage.localStorage.setItem;
  const firstFailure = deferred(), disposalFailure = deferred(), fileEntered = deferred(), fileRelease = deferred(); let denied = false, failures = 0;
  storage.localStorage.setItem = (key, value) => { if (denied) { if (++failures === 1) firstFailure.resolve(); else disposalFailure.resolve(); throw new Error('Recovery denied'); } journal(key, value); };
  const s = setup({ storage, recent });
  try {
    await s.app.ready; await s.app.dispatch('file.new'); unload(s); await s.app.idle();
    const file = nativeHandle(fileFor(packageFor('cad')), async () => { fileEntered.resolve(); await fileRelease.promise; }); s.files.showSaveFilePicker = async () => file.handle;
    const saving = s.app.dispatch('file.save'); await fileEntered.promise; denied = true; s.fixtures.cad.change(74); await firstFailure.promise; await turn();
    s.app.dispose(); await disposalFailure.promise; await turn(); denied = false; fileRelease.resolve(); await saving; await s.app.idle();
    assert.equal(storedWidth(file.writes), 10); assert.equal(storedWidth((await recoveryParts(storage))!), 74); assert.equal(storedWidth(await recent.load('fixture-id')), 74);
    assert.deepEqual(s.app.snapshot().documents.cad!.value, { width: 74 }); assert.equal(s.root.children.length, 0);
  } finally { denied = false; fileRelease.resolve(); s.close(); await s.app.idle(); }
});

test('A-SHELL an editor import cannot silently remove an unresolved recovery conflict', async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), original = partsFor(81);
  await recoveryStore({ op: 'write', record: { workspace: 'cad', generation: 20, title: 'Recovery', payload: partsFor(82) } }, storage);
  await recent.save({ id: 'fixture-id', workspace: 'cad', title: 'Original', updated: 1000, parts: original });
  const s = setup({ storage, recent });
  try {
    await s.app.ready;
    assert.equal(await s.fixtures.cad.open({ id: 'imported', title: 'Imported', format: 'gsnv-cad', version: 1, value: { width: 83 } }), false);
    assert.equal(s.app.snapshot().documents.cad, undefined); assert.match(s.root.textContent!, /Recover as copy/); assert.match(status(s.root), /pending recovery/);
    unload(s); await s.app.idle(); assert.deepEqual(await recent.load('fixture-id'), original); assert.equal(storedWidth((await recoveryParts(storage))!), 82);
  } finally { s.close(); await s.app.idle(); }
});

test('A-SHELL a pending browser backup permits the next Save without releasing its newer native write guard', { timeout: 5000 }, async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), realSave = recent.save.bind(recent);
  const backupEntered = deferred(), backupRelease = deferred(), secondWriteEntered = deferred(), secondWriteRelease = deferred(); let recentWrites = 0;
  recent.save = async entry => { if (++recentWrites === 1) { backupEntered.resolve(); await backupRelease.promise; } await realSave(entry); };
  const s = setup({ storage, recent }), writes: Uint8Array[][] = []; let firstSettled = false;
  const target = nativeHandle(fileFor(packageFor('cad')));
  target.handle.createWritable = async () => {
    const parts: Uint8Array[] = []; const index = writes.push(parts);
    return { write: async (bytes: Uint8Array) => { parts.push(bytes.slice()); }, close: async () => { if (index === 2) { secondWriteEntered.resolve(); await secondWriteRelease.promise; } }, abort: async () => {} } as unknown as FileSystemWritableFileStream;
  };
  try {
    await s.app.ready; await s.app.dispatch('file.new'); await s.app.idle(); s.files.showSaveFilePicker = async () => target.handle;
    const first = s.app.dispatch('file.save').then(() => { firstSettled = true; }); await backupEntered.promise;
    assert.equal(storedWidth(writes[0]!), 10); assert.equal(firstSettled, false, 'Save still awaits its required browser persistence');
    assert.equal(s.root.querySelector<HTMLButtonElement>('[data-command="file.save"]')!.disabled, false, 'file handoff releases Save before Recent finishes');
    s.fixtures.cad.change(42); await s.app.dispatch('edit.undo'); await s.app.dispatch('edit.redo'); const secondIdentity = s.app.snapshot().documents.cad!.identity;
    const second = s.app.dispatch('file.save'); await secondWriteEntered.promise;
    assert.equal(storedWidth(writes[1]!), 42); assert.equal(writes.length, 2); assert.equal(s.app.snapshot().dirty.cad, true);
    backupRelease.resolve(); await first;
    assert.equal(s.root.querySelector<HTMLButtonElement>('[data-command="file.save"]')!.disabled, true, 'older backup completion cannot release the newer native write');
    await s.app.dispatch('file.save'); assert.equal(writes.length, 2, 'duplicate Save during the second native write remains ignored');
    secondWriteRelease.resolve(); await second;
    assert.equal(s.app.snapshot().saved.cad, secondIdentity); assert.equal(s.app.snapshot().dirty.cad, false); assert.equal(storedWidth((await recoveryParts(storage))!), 42); assert.equal(storedWidth(await recent.load('fixture-id')), 42);
    assert.equal(s.root.querySelector<HTMLButtonElement>('[data-command="file.save"]')!.disabled, false);
  } finally { backupRelease.resolve(); secondWriteRelease.resolve(); s.close(); await s.app.idle(); }
});

test('A-SHELL download handoff releases Save while its browser persistence remains pending', { timeout: 5000 }, async () => {
  const storage = resource(), recent = recentProjects(storage.indexedDB), realSave = recent.save.bind(recent), backupEntered = deferred(), backupRelease = deferred(), secondDownload = deferred(); let recentWrites = 0;
  recent.save = async entry => { if (++recentWrites === 1) { backupEntered.resolve(); await backupRelease.promise; } await realSave(entry); };
  const s = setup({ storage, recent }), downloads: Blob[] = [];
  s.files.URL.createObjectURL = blob => { assert.ok(blob instanceof Blob); downloads.push(blob); if (downloads.length === 2) secondDownload.resolve(); return 'blob:fixture'; };
  try {
    await s.app.ready; await s.app.dispatch('file.new'); await s.app.idle();
    const first = s.app.dispatch('file.save'); await backupEntered.promise;
    assert.equal(s.root.querySelector<HTMLButtonElement>('[data-command="file.save"]')!.disabled, false);
    s.fixtures.cad.change(43); await s.app.dispatch('edit.undo'); await s.app.dispatch('edit.redo'); const second = s.app.dispatch('file.save'); await secondDownload.promise;
    assert.equal(storedWidth([new Uint8Array(await downloads[0]!.arrayBuffer())]), 10); assert.equal(storedWidth([new Uint8Array(await downloads[1]!.arrayBuffer())]), 43);
    backupRelease.resolve(); await Promise.all([first, second]); assert.equal(s.app.snapshot().dirty.cad, false); assert.equal(storedWidth((await recoveryParts(storage))!), 43); assert.equal(storedWidth(await recent.load('fixture-id')), 43);
  } finally { backupRelease.resolve(); s.close(); await s.app.idle(); }
});

for (const failure of ['cancelled picker', 'failed native write'] as const) test(`A-SHELL ${failure} releases only its file guard and a later Save succeeds`, async () => {
  const s = setup(), pickerEntered = deferred(), pickerRelease = deferred(); let picks = 0;
  const destination = nativeHandle(fileFor(packageFor('cad'))), failing = nativeHandle(fileFor(packageFor('cad')));
  failing.handle.createWritable = async () => { throw new Error('Native write failed'); };
  try {
    await s.app.ready; await s.app.dispatch('file.new'); await s.app.idle();
    s.files.showSaveFilePicker = async () => { picks++; pickerEntered.resolve(); await pickerRelease.promise; if (failure === 'cancelled picker') throw new DOMException('Cancelled', 'AbortError'); return failing.handle; };
    const first = s.app.dispatch('file.save'); await pickerEntered.promise; await s.app.dispatch('file.save'); assert.equal(picks, 1, 'pending picker still owns the guard');
    pickerRelease.resolve(); await first; assert.equal(s.app.snapshot().dirty.cad, true); assert.equal(s.app.snapshot().saved.cad, undefined); assert.equal(s.root.querySelector<HTMLButtonElement>('[data-command="file.save"]')!.disabled, false);
    s.files.showSaveFilePicker = async () => destination.handle; await s.app.dispatch('file.save'); assert.equal(storedWidth(destination.writes), 10); assert.equal(s.app.snapshot().dirty.cad, false);
  } finally { pickerRelease.resolve(); s.close(); await s.app.idle(); }
});
