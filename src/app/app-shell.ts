/**
 * PURPOSE    Assemble the shared application window from verified components.
 * KIND       SHELL assembly A-SHELL; lifecycle/routing only, no domain algorithms.
 * CONTRACT   IN: live root, browser ports and available workspace adapters. Adapters
 *            own immutable document values, codecs, menus, tool effects and rendering.
 *            OUT: ready/idle promises, guarded command dispatch, session snapshot and
 *            idempotent disposal. Independent histories, workspace views and file handles;
 *            validated Open/Recover commit only after replacement consent. Async saves
 *            bind to the invoked revision and document epoch, including same-ID reopen.
 *            Autosave uses serialized, increasing S08 generations; recovery candidates
 *            need explicit Restore/Discard. Corruption never replaces foreground state.
 *            Global shortcuts and view input share command availability. Modal previews
 *            stay outside document history until the adapter explicitly commits once.
 *            RAISES: TypeError for invalid mounting resources. Operational failures
 *            become visible status messages; no late UI updates after disposal.
 * GUARANTEES No unbuilt domain tools, invented document schema, upload or server logic.
 * TUNING     Initial workspace is CAD; view range is 1%–6400%. Domain adapters own
 *            their document factories and codecs. File chooser starts at Untitled.
 * DECISIONS  D1: Keep per-workspace epochs in addition to persisted IDs; same-ID reopen
 *            can otherwise inherit a late save. Revisit if: document lifecycle is atomic.
 *            D2: Observe/serialize recovery operations rather than trusting the journal;
 *            the database is authoritative. Revisit if: recovery storage contract changes.
 *            D3: Defer chrome updates while a modal owns focus rather than replacing
 *            its opener. Revisit if: chrome preserves command DOM identity on update.
 * LIMITS     Workspace algorithms and formats remain their phase's responsibility.
 *            Adapter callbacks must preserve immutable ownership and render without
 *            committing recursively. Browser storage may be evicted. Download success
 *            means browser handoff. Native process crashes and other OSes need evidence.
 * TESTBENCH  src/app/app-shell.test.ts -- run with: node --import tsx --test src/app/app-shell.test.ts
 */
import { session, type Session, type SessionEvent } from '../shared/session.ts';
import { createChrome, type ChromeModel } from '../shared/chrome.ts';
import { bindInput, type CommandContext, type Gesture } from '../shared/input-adapter.ts';
import { viewTransform, type View2D } from '../shared/view-transform.ts';
import { showDialog, type DialogSpec } from '../shared/dialog.ts';
import type { FilePorts } from '../shared/file-access.ts';
import { recoveryStore, type RecoveryPorts } from '../shared/recovery-store.ts';
import { capabilityProbe, type ProbeRequest, type Capability } from '../shared/capability-probe.ts';
import { projectFiles, type ProjectFileRequest } from '../shared/project-files.ts';
import { recoverySession, type RecoveryPort } from '../shared/recovery-session.ts';
import { nativeContainer } from '../shared/native-container.ts';
import type { RecentEntry, RecentPort } from '../shared/recent-projects.ts';

type Workspace = Session<unknown>['workspace'];
type Package = Extract<ProjectFileRequest, { operation: 'save' }>['package'];
type Snapshot = NonNullable<Session<unknown>['documents'][Workspace]>;
export type AppDocument = Omit<Snapshot, 'identity'>;
type EditorView = {
  render(document: Snapshot | undefined, view: View2D): void;
  model(): Pick<ChromeModel, 'menus' | 'tools' | 'panels'>;
  context(): Pick<CommandContext, 'viewRole' | 'activeTool' | 'status'>;
  command(id: string): void;
  gesture(gesture: Gesture): void;
  /** Commits pending view edits synchronously before save, replacement or unload. */
  flush?(): void;
  dispose(): void;
};
export type WorkspaceAdapter = {
  create?: () => AppDocument;
  decode(packageValue: Package): AppDocument;
  encode(document: AppDocument): Package;
  mount(host: {
    root: HTMLElement;
    commit(document: AppDocument, label: string, baseIdentity: string): void;
    dialog(spec: DialogSpec): void;
    /** Re-reads the editor's menus/tools after view-local state (tool, selection) changes. */
    invalidate(): void;
    /** Opens a new unsaved document in this workspace after the usual replacement consent; resolves true if opened. */
    open(document: AppDocument): Promise<boolean>;
  }): EditorView;
};
type Request = {
  root: HTMLElement;
  adapters: Partial<Record<Workspace, WorkspaceAdapter>>;
  files: FilePorts;
  recovery: RecoveryPorts;
  probe: ProbeRequest;
  /** Optional retained-project store: replacement skips consent only after the current revision is stored. */
  recent?: RecentPort;
};
type Handle = {
  ready: Promise<void>;
  idle(): Promise<void>;
  dispatch(id: string): Promise<void>;
  snapshot(): Session<unknown>;
  dispose(): void;
};

const WORKSPACES = ['cad', 'image', 'photo', 'video', 'document', 'slides', 'audio'] as const;
const NAMES = { cad: 'CAD', image: 'Image', photo: 'Photo', video: 'Video', document: 'Document', slides: 'Slides', audio: 'Audio' } as const;
const RANGE = { min: 0.01, max: 64 };
const RECENT_MENU_LIMIT = 12;
const TWO_DIMENSIONAL = new Set(['sketch2d', 'canvas2d', 'preview2d']);
function reason(cause: unknown): string {
  try { return String(cause instanceof Error ? cause.message : cause); } catch { return 'Operation failed.'; }
}

export function mountApp({ root, adapters, files, recovery, probe, recent }: Request): Handle {
  if (!root?.isConnected || !root.ownerDocument.defaultView) throw new TypeError('A live application root is required.');
  const document = root.ownerDocument; const window = document.defaultView!;
  let state: Session<unknown> = { workspace: 'cad', documents: {}, histories: {}, saved: {}, dirty: {}, message: adapters.cad ? 'Ready. Create or open a project.' : 'CAD editing is not available in this development build.' };
  let disposed = false; let disposing = false; let initialized = false; let opening = false; let sequence = 0;
  let modal: { close(): void } | null = null; let modalActive = false;
  let capabilities: Capability[] = []; let viewInput = () => {};
  let recentEntries: RecentEntry[] = []; const rememberTimers: Partial<Record<Workspace, ReturnType<typeof setTimeout>>> = {};
  const remembered: Partial<Record<Workspace, string>> = {};
  const rememberQueues: Partial<Record<Workspace, Promise<boolean>>> = {};
  const remembering: Partial<Record<Workspace, { identity: string; task: Promise<boolean> }>> = {};
  const pending = new Set<Promise<unknown>>();
  const epochs = { cad: 0, image: 0, photo: 0, video: 0, document: 0, slides: 0, audio: 0 };
  const saving = { cad: false, image: false, photo: false, video: false, document: false, slides: false, audio: false };
  const observed = { cad: 0, image: 0, photo: 0, video: 0, document: 0, slides: 0, audio: 0 };
  const issued = { cad: 0, image: 0, photo: 0, video: 0, document: 0, slides: 0, audio: 0 };
  const queues: Record<Workspace, Promise<void>> = { cad: Promise.resolve(), image: Promise.resolve(), photo: Promise.resolve(), video: Promise.resolve(), document: Promise.resolve(), slides: Promise.resolve(), audio: Promise.resolve() };
  const stored = { cad: false, image: false, photo: false, video: false, document: false, slides: false, audio: false };
  const recoveryBlocked = { cad: false, image: false, photo: false, video: false, document: false, slides: false, audio: false };
  const recoveryErrors: Partial<Record<Workspace, string>> = {};
  const candidates: Partial<Record<Workspace, { package?: Package; error?: string }>> = {};
  const handles: Partial<Record<Workspace, FileSystemFileHandle>> = {};
  const views: Record<Workspace, View2D> = { cad: { zoom: 1, pan: { x: 0, y: 0 } }, image: { zoom: 1, pan: { x: 0, y: 0 } }, photo: { zoom: 1, pan: { x: 0, y: 0 } }, video: { zoom: 1, pan: { x: 0, y: 0 } }, document: { zoom: 1, pan: { x: 0, y: 0 } }, slides: { zoom: 1, pan: { x: 0, y: 0 } }, audio: { zoom: 1, pan: { x: 0, y: 0 } } };
  const editors: Partial<Record<Workspace, { root: HTMLElement; view: EditorView }>> = {};
  const historyPanel = document.createElement('div'); historyPanel.dataset.panelHistory = '';
  const recoveryPanel = document.createElement('div'); recoveryPanel.dataset.panelRecovery = '';
  const empty = document.createElement('div'); empty.className = 'app-empty';
  const emptyHeading = document.createElement('h1'); emptyHeading.textContent = 'Editor in development';
  const emptyDetail = document.createElement('p'); empty.append(emptyHeading, emptyDetail);
  const mark = (event: SessionEvent<unknown>) => { state = session({ state, event }).state; };
  const status = (message: string) => { if (!disposed) { mark({ type: 'status', message }); render(); } };
  const activeView = () => editors[state.workspace]?.view;
  const is2D = () => TWO_DIMENSIONAL.has(activeView()?.context().viewRole ?? 'none');
  const nativePort = (workspace: Workspace): RecoveryPort => async request => {
    const result = await recoveryStore(request, recovery);
    if (result.ok && result.value) observed[workspace] = Math.max(observed[workspace], result.value.generation);
    return result;
  };
  function enqueue(workspace: Workspace, operation: () => Promise<void>) {
    const next = queues[workspace].then(operation).catch(cause => status(`Recovery: ${reason(cause)}`));
    queues[workspace] = next; return next;
  }
  function backup(workspace: Workspace) {
    const snapshot = state.documents[workspace]; const epoch = epochs[workspace];
    if (!snapshot || candidates[workspace] || recoveryBlocked[workspace] || !initialized) return;
    stored[workspace] = true;
    void enqueue(workspace, async () => {
      if (epochs[workspace] !== epoch || candidates[workspace]) return;
      const generation = Math.max(observed[workspace], issued[workspace]) + 1;
      if (!Number.isSafeInteger(generation)) { status('Recovery generation limit reached. Save a project file.'); return; }
      issued[workspace] = generation;
      const result = await recoverySession({ operation: 'save', workspace, generation, package: adapters[workspace]!.encode(snapshot) }, nativePort(workspace));
      if (!disposed && epochs[workspace] === epoch) {
        if (!result.ok) { recoveryErrors[workspace] = `${result.error.code}: ${result.error.message}`; status(recoveryErrors[workspace]); }
        else { stored[workspace] = true; delete recoveryErrors[workspace]; render(); }
      }
    });
  }
  function validate(workspace: Workspace, value: AppDocument) {
    if (!value || !value.id || value.format !== `gsnv-${workspace}` || value.version !== 1 || typeof value.title !== 'string') throw new Error('Workspace returned invalid document metadata.');
  }
  function commit(workspace: Workspace, value: AppDocument, label: string, baseIdentity: string) {
    if (disposed) return;
    const current = state.documents[workspace];
    if (!current || current.identity !== baseIdentity) { status('The document changed before this edit completed.'); return; }
    try {
      validate(workspace, value); if (value.id !== current.id) throw new Error('An edit cannot replace the document identity.');
      mark({ type: 'commit', workspace, snapshot: { ...value, identity: `revision-${++sequence}` }, label }); backup(workspace); scheduleRemember(workspace); render();
    } catch (cause) { status(reason(cause)); }
  }
  function dialog(spec: DialogSpec) {
    if (disposed || modalActive) return;
    modalActive = true;
    const settled = (action: () => void) => { modalActive = false; modal = null; try { action(); } finally { render(); } };
    try { modal = showDialog({ root, spec: { ...spec, commit: value => settled(() => spec.commit(value)), cancel: () => settled(spec.cancel) } }); }
    catch (cause) { modalActive = false; modal = null; throw cause; }
  }
  function model(): ChromeModel {
    const workspace = state.workspace; const editor = activeView()?.model(); const current = state.documents[workspace]; const history = state.histories[workspace];
    const item = (id: string, label: string, shortcut: string, enabled: boolean, icon?: string) => ({ id, label, shortcut, enabled, ...(icon ? { icon, toolbar: true } : {}) });
    return { title: current?.title ?? 'No document', workspace, dirty: state.dirty[workspace] ?? false, capabilities, status: state.message,
      menus: [
        { id: 'file', label: 'File', items: [
          item('file.new', 'New', 'Ctrl+N', initialized && !!adapters[workspace]?.create, 'new'),
          item('file.open', 'Open', 'Ctrl+O', initialized && Object.keys(adapters).length > 0 && !opening, 'open'),
          item('file.save', 'Save', 'Ctrl+S', !!current && !saving[workspace], 'save'),
          ...(recent ? [item('file.rename', 'Rename…', '', !!current),
            ...recentEntries.slice(0, RECENT_MENU_LIMIT).map((entry, index) => item(`file.recent.${index}`, `${index + 1}  ${entry.title} (${NAMES[entry.workspace]})`, '', initialized)),
            item('file.stored', 'Open stored project…', '', initialized && recentEntries.length > 0),
            item('file.clearRecent', 'Delete stored projects…', '', recentEntries.length > 0)] : []),
          item('recovery.restore', 'Restore recovery', '', !!candidates[workspace]?.package),
          item('recovery.discard', 'Discard recovery', '', stored[workspace] || !!candidates[workspace]),
        ] },
        { id: 'edit', label: 'Edit', items: [item('edit.undo', 'Undo', 'Ctrl+Z', !!history?.past.length, 'undo'), item('edit.redo', 'Redo', 'Ctrl+Y', !!history?.future.length, 'redo')] },
        { id: 'view', label: 'View', items: [item('view.settings', 'View settings', '', !!current && is2D())] },
        ...(editor?.menus ?? []),
      ], tools: editor?.tools ?? [], panels: [...(editor?.panels ?? []), { id: 'history', title: 'History', content: historyPanel }, { id: 'recovery', title: 'Recovery', content: recoveryPanel }],
    };
  }
  function render() {
    if (disposed || disposing || modalActive) return;
    const workspace = state.workspace;
    if (!editors[workspace] && adapters[workspace]) {
      const pane = document.createElement('div'); pane.className = 'app-editor'; chrome.viewport.append(pane);
      editors[workspace] = { root: pane, view: adapters[workspace]!.mount({ root: pane, commit: (value, label, base) => commit(workspace, value, label, base), dialog,
        invalidate: () => { if (!disposed && !modalActive && state.workspace === workspace) chrome.update(model()); },
        open: async value => {
          if (disposed) return false; delete candidates[workspace];
          if (!await mayReplace(workspace, value.id) || disposed || modalActive) return false;
          replace(workspace, value, false); return true;
        } }) };
    }
    for (const [name, editor] of Object.entries(editors)) editor.root.hidden = name !== workspace;
    empty.hidden = !!editors[workspace]; emptyDetail.textContent = `${NAMES[workspace]} editing is not available in this development build.`;
    activeView()?.render(state.documents[workspace], views[workspace]);
    const history = state.histories[workspace]; historyPanel.replaceChildren();
    const list = document.createElement('ol');
    for (const label of [...(history?.past.map(entry => entry.label) ?? []), 'Current state', ...(history?.future.map(entry => `Redo: ${entry.label}`) ?? [])]) {
      const row = document.createElement('li'); row.textContent = label; list.append(row);
    }
    historyPanel.append(list);
    const candidate = candidates[workspace];
    recoveryPanel.textContent = candidate?.error ?? recoveryErrors[workspace] ?? (candidate?.package ? `Recovery available: ${candidate.package.project.title || 'Untitled'}.` : stored[workspace] ? 'Local recovery enabled. Save a file for a durable copy.' : 'No recovery stored.');
    if (candidate) for (const [id, label] of [['recovery.restore', 'Restore recovery'], ['recovery.discard', 'Discard recovery']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label!;
      button.disabled = id === 'recovery.restore' && !candidate.package; button.onclick = () => { void dispatch(id!); }; recoveryPanel.append(button);
    }
    chrome.update(model());
  }
  function flushView(workspace: Workspace): boolean {
    try { editors[workspace]?.view.flush?.(); return true; }
    catch (cause) { status(`The current edit could not be committed: ${reason(cause)}`); return false; }
  }
  async function save(workspace: Workspace): Promise<boolean> {
    if (!flushView(workspace)) return false;
    const snapshot = state.documents[workspace]; const epoch = epochs[workspace];
    if (!snapshot || saving[workspace]) return false;
    saving[workspace] = true;
    try {
      let handle = handles[workspace];
      // Start permission/picker work before rendering or encoding can consume activation.
      if (!handle && files.showSaveFilePicker) handle = await files.showSaveFilePicker({ suggestedName: `Untitled.gsnv-${workspace}`, types: [{ accept: { 'application/octet-stream': [`.gsnv-${workspace}`] } }] });
      else if (handle) {
        const permission = (handle as FileSystemFileHandle & { requestPermission?: (options: { mode: 'readwrite' }) => Promise<string> }).requestPermission;
        if (permission && await permission.call(handle, { mode: 'readwrite' }) !== 'granted') throw new Error('Write permission was not granted.');
      }
      if (disposed || epochs[workspace] !== epoch) return false;
      render();
      const packageValue = adapters[workspace]!.encode(snapshot);
      const result = await projectFiles({ operation: 'save', package: packageValue, ...(handle ? { handle } : {}) }, files);
      if (disposed || epochs[workspace] !== epoch) return false;
      if ('cancelled' in result) return false;
      if (!result.ok) { status(`${result.error.code}: ${result.error.message}`); return false; }
      if (result.value.handle) handles[workspace] = result.value.handle;
      mark({ type: 'saved', workspace, documentId: snapshot.id, identity: snapshot.identity });
      if (!result.value.handle) mark({ type: 'status', message: `Download handed to browser: ${result.value.name}` });
      return true;
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError')) status(reason(cause));
      return false;
    } finally { saving[workspace] = false; render(); }
  }
  function remember(workspace: Workspace): Promise<boolean> {
    const snapshot = state.documents[workspace], epoch = epochs[workspace];
    if (!recent || !snapshot || disposed) return Promise.resolve(false);
    if (remembered[workspace] === snapshot.identity) return Promise.resolve(true);
    if (remembering[workspace]?.identity === snapshot.identity) return remembering[workspace]!.task;
    // Any queued write can replace an earlier stored revision, including after Undo.
    delete remembered[workspace];
    const task: Promise<boolean> = (rememberQueues[workspace] ?? Promise.resolve(true)).then(async () => {
      try {
        const parts = nativeContainer({ op: 'encode', package: adapters[workspace]!.encode(snapshot) }).parts;
        await recent.save({ id: snapshot.id, workspace, title: snapshot.title || 'Untitled', updated: Date.now(), parts });
        if (remembering[workspace]?.task === task && epochs[workspace] === epoch && state.documents[workspace]?.identity === snapshot.identity) remembered[workspace] = snapshot.identity;
      } catch (cause) {
        status(`Browser backup failed: ${reason(cause)} Current project kept. Use File > Save to save a project file.`);
        return false;
      }
      try { recentEntries = await recent.list(); if (!disposed) render(); }
      catch (cause) { status(`Project stored, but the stored-project list could not be refreshed: ${reason(cause)}`); }
      return true;
    });
    const operation = { identity: snapshot.identity, task }; remembering[workspace] = operation; rememberQueues[workspace] = task;
    void task.finally(() => { if (remembering[workspace] === operation) delete remembering[workspace]; });
    return task;
  }
  function scheduleRemember(workspace: Workspace) {
    if (!recent) return; clearTimeout(rememberTimers[workspace]);
    rememberTimers[workspace] = setTimeout(() => { delete rememberTimers[workspace]; void remember(workspace); }, 700);
  }
  function flushRemember(workspace: Workspace): Promise<boolean> {
    clearTimeout(rememberTimers[workspace]); delete rememberTimers[workspace]; return remember(workspace);
  }
  async function mayReplace(workspace: Workspace, replacementId?: string): Promise<boolean> {
    if (modalActive) { status('Close the current dialog, then try opening the document again.'); return false; }
    if (!flushView(workspace)) return false;
    if (!state.dirty[workspace]) return true;
    const protectedDocument = state.documents[workspace];
    if (recent) {
      if (replacementId === protectedDocument?.id) {
        status('Opening another version of this project would replace its stored copy. Current project kept. Use File > Save to save the current version first.');
        return false;
      }
      const storedRevision = await flushRemember(workspace);
      if (state.documents[workspace] !== protectedDocument) { status('The document changed while its backup was pending. Current project kept; try again.'); return false; }
      return storedRevision && remembered[workspace] === protectedDocument?.identity;
    }
    return new Promise(resolve => dialog({
      title: `Replace ${protectedDocument?.title || 'Untitled'}?`, fields: [{ key: 'decision', label: 'Unsaved changes', type: 'select', choices: [
        { value: 'keep', label: 'Keep current document' }, { value: 'save', label: 'Save then replace' }, { value: 'replace', label: 'Replace without saving' },
      ] }], initial: { decision: 'keep' }, validate: values => ({ ok: true, value: values.decision as string }), preview() {},
      commit: value => {
        if (state.documents[workspace] !== protectedDocument) { status('The document changed while replacement was pending.'); resolve(false); }
        else if (value === 'save') void save(workspace).then(saved => resolve(saved && state.documents[workspace] === protectedDocument && !state.dirty[workspace]));
        else resolve(value === 'replace');
      }, cancel: () => resolve(false),
    }));
  }
  function replace(workspace: Workspace, value: AppDocument, isSaved: boolean, handle?: FileSystemFileHandle) {
    validate(workspace, value); epochs[workspace]++;
    if (handle) handles[workspace] = handle; else delete handles[workspace];
    mark({ type: 'open', workspace, snapshot: { ...value, identity: `revision-${++sequence}` }, isSaved });
    changeWorkspace(workspace); backup(workspace); if (isSaved) scheduleRemember(workspace);
  }
  async function open() {
    opening = true; let selected: FileSystemFileHandle | undefined;
    const initialEpochs = { ...epochs };
    const ports: FilePorts = { ...files, ...(files.showOpenFilePicker ? { showOpenFilePicker: async (options: Parameters<NonNullable<FilePorts['showOpenFilePicker']>>[0]) => {
      const selectedHandles = await files.showOpenFilePicker!(options); selected = selectedHandles[0]; return selectedHandles;
    } } : {}) };
    try {
      const result = await projectFiles({ operation: 'open' }, ports);
      if (disposed || 'cancelled' in result) return;
      if (!result.ok) { status(`${result.error.code}: ${result.error.message}`); return; }
      const workspace = result.value.project.format.slice(5) as Workspace;
      if (!adapters[workspace]) throw new Error(`${NAMES[workspace]} editing is not available in this development build.`);
      if (candidates[workspace]) throw new Error('Restore or discard the pending recovery before opening another document.');
      const value = adapters[workspace]!.decode(result.value); validate(workspace, value);
      if (epochs[workspace] !== initialEpochs[workspace]) throw new Error('The target document changed while the file was opening.');
      if (await mayReplace(workspace, value.id) && !disposed && !modalActive) replace(workspace, value, true, selected);
    } finally { opening = false; render(); }
  }
  async function openStored(entry: RecentEntry) {
    if (!recent || disposed) return;
    const target = entry.workspace;
    if (!adapters[target]) throw new Error(`${NAMES[target]} editing is not available in this build.`);
    if (state.documents[target]?.id === entry.id) { changeWorkspace(target); return; }
    const packageValue = nativeContainer({ op: 'decode', parts: await recent.load(entry.id) }), value = adapters[target]!.decode(packageValue);
    if (await mayReplace(target, value.id) && !disposed && !modalActive) {
      replace(target, value, false);
      await remember(target);
    }
  }
  function storedProjects() {
    const entries = [...recentEntries];
    dialog({ title: 'Open stored project', fields: [{ key: 'project', label: 'Project', type: 'select', choices: entries.map(entry => ({ value: entry.id, label: `${entry.title} (${NAMES[entry.workspace]})` })) }],
      initial: { project: entries[0]!.id }, validate: values => {
        const entry = entries.find(value => value.id === values.project);
        return entry ? { ok: true, value: entry } : { ok: false, error: { code: 'file.project', message: 'Choose a stored project.' } };
      }, preview() {}, cancel() {}, commit: value => { void track(openStored(value as RecentEntry)); } });
  }
  function confirmDeleteStored() {
    dialog({ title: 'Delete stored projects', fields: [{ key: 'remove', label: `Delete all ${recentEntries.length} stored projects from this browser. Exported files are kept.`, type: 'checkbox' }],
      initial: { remove: false }, validate: values => ({ ok: true, value: values.remove === true }), preview() {}, cancel() {},
      commit: value => {
        if (!value) return;
        void track((async () => {
          for (const workspace of WORKSPACES) { clearTimeout(rememberTimers[workspace]); delete rememberTimers[workspace]; }
          await Promise.all(Object.values(rememberQueues)); await recent!.clear();
          for (const workspace of WORKSPACES) delete remembered[workspace];
          recentEntries = []; render();
        })());
      } });
  }
  function viewSettings() {
    const workspace = state.workspace; const original = views[workspace];
    const draw = () => activeView()?.render(state.documents[workspace], views[workspace]);
    dialog({ title: 'View settings', fields: [{ key: 'zoom', label: 'Zoom (%)', type: 'number', min: 1, max: 6400 }, { key: 'x', label: 'Pan X', type: 'number' }, { key: 'y', label: 'Pan Y', type: 'number' }],
      initial: { zoom: original.zoom * 100, x: original.pan.x, y: original.pan.y }, validate: values => ({ ok: true, value: values }),
      preview: value => { const data = value as { zoom: number; x: number; y: number }; views[workspace] = { zoom: data.zoom / 100, pan: { x: data.x, y: data.y } }; draw(); },
      commit() {}, cancel() { views[workspace] = original; draw(); },
    });
  }
  async function operate(id: string) {
    if (disposed || modalActive) return;
    if (id === 'tool.cancel') { activeView()?.command(id); return; }
    if (id === 'tool.confirm') { activeView()?.command(id); return; }
    if ((id === 'edit.undo' || id === 'edit.redo') && !flushView(state.workspace)) return;
    const menu = model(); const entry = [...menu.menus.flatMap(group => group.items), ...menu.tools].find(item => item.id === id);
    if (!entry?.enabled) return;
    const workspace = state.workspace;
    if (id === 'file.open') return open();
    if (id === 'file.save') { await save(workspace); return; }
    if (id === 'file.new') { if (await mayReplace(workspace) && !disposed && !modalActive) replace(workspace, adapters[workspace]!.create!(), false); return; }
    if (id === 'file.rename') {
      const current = state.documents[workspace]!;
      dialog({ title: 'Rename project', fields: [{ key: 'title', label: 'Name', type: 'text' }], initial: { title: current.title },
        validate: values => String(values.title).trim() ? { ok: true, value: String(values.title).trim() } : { ok: false, error: { code: 'file.title', message: 'Type a name.' } },
        preview() {}, cancel() {}, commit: value => { const latest = state.documents[workspace]; if (latest) commit(workspace, { ...latest, title: value as string }, 'Rename', latest.identity); } });
      return;
    }
    if (id === 'file.stored') { storedProjects(); return; }
    if (id === 'file.clearRecent') { confirmDeleteStored(); return; }
    if (id.startsWith('file.recent.')) {
      const entry = recentEntries[Number(id.slice(12))]; if (entry) await openStored(entry); return;
    }
    if (id === 'edit.undo' || id === 'edit.redo') { mark({ type: id === 'edit.undo' ? 'undo' : 'redo', workspace }); backup(workspace); scheduleRemember(workspace); render(); return; }
    if (id === 'view.settings') { viewSettings(); return; }
    if (id === 'recovery.restore') {
      const candidate = candidates[workspace]?.package; if (!candidate) return;
      const value = adapters[workspace]!.decode(candidate); validate(workspace, value);
      if (await mayReplace(workspace, value.id) && !disposed && !modalActive) { delete candidates[workspace]; replace(workspace, value, false); } return;
    }
    if (id === 'recovery.discard') {
      await enqueue(workspace, async () => {
        const result = await recoverySession({ operation: 'discard', workspace, generation: issued[workspace] }, nativePort(workspace));
        if (!result.ok) { status(`${result.error.code}: ${result.error.message}`); return; }
        delete candidates[workspace]; delete recoveryErrors[workspace]; stored[workspace] = false; render();
      }); return;
    }
    activeView()?.command(id);
  }
  function track(operation: Promise<void>): Promise<void> {
    const task = operation.catch(cause => status(reason(cause))); pending.add(task);
    void task.finally(() => pending.delete(task)); return task;
  }
  function dispatch(id: string): Promise<void> { return track(operate(id)); }
  function gesture(value: Gesture) {
    if (disposed || !state.documents[state.workspace]) return;
    // Focus entering a modal ends the captured tool gesture in the originating view.
    if (modalActive && !(value.type === 'pointer' && value.phase === 'cancel')) return;
    try {
      if (is2D() && (value.type === 'pan' || value.type === 'wheel')) {
        views[state.workspace] = viewTransform({ view: views[state.workspace], range: RANGE,
          action: value.type === 'pan' ? value : { type: 'zoom', factor: value.factor, cursor: value.cursor } });
        activeView()!.render(state.documents[state.workspace], views[state.workspace]);
      } else activeView()?.gesture(value);
    } catch (cause) { status(reason(cause)); }
  }
  function bindView() {
    viewInput(); viewInput = bindInput({ root: chrome.viewport, context: () => ({ workspace: state.workspace, target: 'view', ...(activeView()?.context() ?? { viewRole: 'none', activeTool: 'none', status: state.message }) }), onCommand: id => { void dispatch(id); }, onGesture: gesture });
  }
  function changeWorkspace(workspace: Workspace) {
    if (disposed || modalActive) return;
    viewInput(); viewInput = () => {}; mark({ type: 'switch', workspace });
    if (!adapters[workspace]) mark({ type: 'status', message: `${NAMES[workspace]} editing is not available in this development build.` });
    render(); bindView();
  }
  const chrome = createChrome({ root, model: model(), onCommand: id => { void dispatch(id); }, onWorkspace: changeWorkspace });
  chrome.viewport.append(empty); render(); bindView();
  const globalInput = bindInput({ root, context: () => ({ workspace: state.workspace, target: 'view', viewRole: 'none', activeTool: 'none', status: state.message }), onCommand: id => { void dispatch(id); }, onGesture() {} });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    let pendingEdit = false;
    for (const workspace of WORKSPACES) {
      if (!flushView(workspace)) pendingEdit = true;
      if (recent && state.documents[workspace]) void flushRemember(workspace);
    }
    if (pendingEdit || WORKSPACES.some(workspace => state.dirty[workspace] && (!recent || remembered[workspace] !== state.documents[workspace]?.identity))) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', beforeUnload);
  const ready = Promise.all([
    capabilityProbe(probe).then(value => { capabilities = value; }),
    ...WORKSPACES.filter(workspace => adapters[workspace]).map(async workspace => {
      const result = await recoverySession({ operation: 'recover', workspace, generation: 0 }, nativePort(workspace));
      if (disposed) return;
      if (!result.ok) {
        const message = `${result.error.code}: ${result.error.message}`;
        if (['recovery.unavailable', 'recovery.read', 'recovery.transport'].includes(result.error.code)) {
          recoveryBlocked[workspace] = true; recoveryErrors[workspace] = message;
        } else candidates[workspace] = { error: message };
        return;
      }
      if (result.value) {
        stored[workspace] = true;
        try {
          const value = adapters[workspace]!.decode(result.value); validate(workspace, value);
          // With recent projects, the last session simply reopens (and is kept in File > Recent) instead of blocking.
          if (recent) { epochs[workspace]++; mark({ type: 'open', workspace, snapshot: { ...value, identity: `revision-${++sequence}` }, isSaved: false }); void remember(workspace); }
          else candidates[workspace] = { package: result.value };
        }
        catch (cause) { candidates[workspace] = { error: `Recovery content: ${reason(cause)}` }; }
      }
    }),
    recent?.list().then(entries => { recentEntries = entries; }, () => { recentEntries = []; }),
  ]).then(() => { initialized = true; render(); }).catch(cause => { status(reason(cause)); });
  return { ready, dispatch, snapshot: () => state,
    async idle() {
      await ready; let work: Promise<unknown>[];
      do { work = [...pending, ...Object.values(queues), ...Object.values(rememberQueues)]; await Promise.all(work); }
      while (pending.size || [...Object.values(queues), ...Object.values(rememberQueues)].some(task => !work.includes(task)));
    },
    dispose() {
      if (disposed || disposing) return; disposing = true; modal?.close(); modal = null; viewInput(); globalInput();
      for (const [workspace, editor] of Object.entries(editors)) { flushView(workspace as Workspace); editor.view.dispose(); }
      for (const workspace of WORKSPACES) { if (recent && state.documents[workspace]) void flushRemember(workspace); else { clearTimeout(rememberTimers[workspace]); delete rememberTimers[workspace]; } }
      disposed = true; window.removeEventListener('beforeunload', beforeUnload); chrome.dispose();
    },
  };
}
