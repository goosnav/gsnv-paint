/**
 * PURPOSE    Compose usable local source projects.
 * KIND       SHELL
 * CONTRACT   IN: shared FilePorts. OUT: WorkspaceAdapter for editable gsnv-code documents.
 *            Pending source text flushes before shared save/undo, file operations and execution.
 *            RAISES: invalid native content on decode; a failed pending edit blocks shared save.
 * GUARANTEES No execution on open/render; stale imports and duplicate filenames preserve source.
 *            All file/text edits commit once against the current shared revision identity.
 * TUNING     TYPING_PAUSE=400ms; document and runtime modules own their validated limits.
 * DECISIONS  D1: Lazy runtime loading after Run. Alternative: load at mount; rejected to keep
 *            editor startup light and explicit. Revisit if a measured warmup benefit is approved.
 * LIMITS     Runtime capabilities remain visible; no terminals, remote packages or DOM scripting.
 * TESTBENCH  src/code/code-workspace.test.ts and src/code/code-workspace.browser.spec.ts -- node --import tsx --test src/code/code-workspace.test.ts; node node_modules/@playwright/test/cli.js test --config src/code/code-workspace.playwright.config.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import type { FilePorts } from '../shared/file-access.ts';
import { codeDocument, type CodeDocument } from './code-document.ts';
import { createCodeEditor } from './code-editor.ts';
import { codeWorkspaceView } from './code-workspace-view.ts';
import { codeFiles } from './code-files.ts';
import type { createCodeRuntime, CodeRuntimeEvent } from './code-runtime.ts';
type Snapshot = NonNullable<Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0]>;
type File = CodeDocument['files'][number];
const TYPING_PAUSE = 400;
export function createCodeWorkspace(files: FilePorts): WorkspaceAdapter {
  const blank = () => ({ id: crypto.randomUUID(), title: 'Untitled code', format: 'gsnv-code', version: 1, value: codeDocument({ operation: 'new' }) });
  return {
    create: blank,
    decode(pkg) { const p = pkg.project; if (p.format !== 'gsnv-code' || p.version !== 1) throw new Error('This is not a supported gsnv-code project.'); return { id: p.id, title: p.title, format: p.format, version: p.version, value: codeDocument({ operation: 'decode', content: p.content }) }; },
    encode(document) { const encoded = codeDocument({ operation: 'encode', value: document.value as CodeDocument }); return { project: { format: 'gsnv-code', version: 1, id: document.id, title: document.title, content: encoded.content }, assets: encoded.assets }; },
    mount(host) {
      const window = host.root.ownerDocument.defaultView!;
      let current: Snapshot | undefined, selected = '', pending: File | null = null, timer = 0, disposed = false, running = false, preview = false, output = '', runStatus = 'Ready', failed = false, generation = 0;
      let runtime: ReturnType<typeof createCodeRuntime> | undefined;
      const value = () => current?.value as CodeDocument | undefined;
      const activeFile = () => value()?.files.find(file => file.path === selected);
      const refresh = () => view.render({ value: value(), selected, running, status: runStatus, preview });
      const error = (cause: unknown) => { if (disposed) return; view.notice(cause instanceof Error ? cause.message : String(cause), true); host.invalidate(); };
      const view = codeWorkspaceView({ root: host.root, command, select(path) { try { flush(); selected = path; editor.render(activeFile() ?? null); refresh(); editor.focus(); } catch (cause) { error(cause); } }, entry(path) { try { flush(); if (current) commit(codeDocument({ operation: 'entry', value: value()!, path }), 'Set entry file'); } catch (cause) { error(cause); } }, language(language) { try { flush(); const file = activeFile(); if (file) commit(codeDocument({ operation: 'put', value: value()!, file: { ...file, language } }), 'Source language'); } catch (cause) { error(cause); } } });
      const editor = createCodeEditor({ root: view.editorRoot, onChange(file) { pending = file; window.clearTimeout(timer); timer = window.setTimeout(() => { try { flush(); } catch (cause) { error(cause); } }, TYPING_PAUSE); }, onCommand(intent) { if (intent === 'escape') { try { flush(); } catch (cause) { error(cause); } view.focusRun(); } else command(intent === 'run' ? 'code.run' : 'code.flush'); } });
      function commit(next: CodeDocument, label: string) { if (!current) return; view.notice(''); host.commit({ ...current, value: next }, label, current.identity); }
      function flush() {
        window.clearTimeout(timer); timer = 0; if (!pending || !current) return;
        const next = codeDocument({ operation: 'put', value: value()!, file: pending }); pending = null;
        if (JSON.stringify(next) !== JSON.stringify(value())) commit(next, 'Edit source');
      }
      function stop() { ++generation; runtime?.stop(); running = false; runStatus = 'Stopped'; refresh(); }
      function event(message: CodeRuntimeEvent) {
        if (disposed) return;
        if (message.type === 'status') {
          if (message.status === 'loading') runStatus = 'Loading runtime…';
          if (message.status === 'running') runStatus = 'Running entry…';
          if (message.status === 'done') { running = false; runStatus = failed ? 'Finished with errors' : 'Finished'; }
          if (message.status === 'stopped') { running = false; runStatus = 'Stopped'; }
        } else { failed ||= message.type === 'error'; output += (message.type === 'error' ? 'Error: ' : '') + message.text; view.output(output); }
        refresh();
      }
      async function run() {
        flush(); if (!current) return; const document = value()!, entry = document.files.find(file => file.path === document.entry)!;
        stop(); const token = generation; output = ''; failed = false; view.output(''); view.notice(''); running = true; preview = entry.language === 'html' || entry.language === 'css'; runStatus = `Loading ${document.entry}…`; refresh();
        try { const { createCodeRuntime } = await import('./code-runtime.ts'); if (disposed || token !== generation) return; runtime ??= createCodeRuntime({ root: view.runtimeRoot, onEvent: event }); await runtime.run(document.files, document.entry, entry.language); }
        catch (cause) { if (!disposed && token === generation) { running = false; runStatus = 'Could not run'; error(cause); refresh(); } }
      }
      function fileDialog(rename: boolean) {
        flush(); if (!current) return; const file = activeFile(); if (!file) return;
        let name = 'untitled.js', counter = 2; while (value()!.files.some(file => file.path === name)) name = `untitled${counter++}.js`;
        const fields = [{ key: 'path', label: 'File path', type: 'text' as const }, ...(!rename ? [{ key: 'language', label: 'Language', type: 'select' as const, choices: ['javascript', 'python', 'html', 'css', 'text'].map(value => ({ value, label: value })) }] : [])];
        host.dialog({ title: rename ? 'Rename source file' : 'New source file', fields, initial: rename ? { path: file.path } : { path: name, language: 'javascript' },
          validate(values) { try { const path = String(values.path), language = (rename ? file.language : values.language) as File['language']; if (!rename && value()!.files.some(file => file.path === path)) throw new Error('A file with this path already exists.'); const next = rename ? codeDocument({ operation: 'rename', value: value()!, path: file.path, to: path }) : codeDocument({ operation: 'put', value: value()!, file: { path, language, text: codeDocument({ operation: 'new', language }).files[0]!.text } }); return { ok: true, value: { path, content: { entry: next.entry, files: next.files.map(file => ({ ...file })) } } }; } catch (cause) { return { ok: false, error: { code: 'code.path', message: cause instanceof Error ? cause.message : String(cause) } }; } },
          preview() {}, cancel() {}, commit(result) { const data = result as { path: string; content: { entry: string; files: File[] } }; selected = data.path; commit(codeDocument({ operation: 'decode', content: data.content }), rename ? 'Rename source file' : 'New source file'); editor.focus(); },
        });
      }
      async function importSource() {
        flush(); const identity = current?.identity, result = await codeFiles({ operation: 'read' }, files); if (disposed || result.kind !== 'opened') return;
        if (pending || current?.identity !== identity) throw new Error('The project changed while the source file was opening. Import it again.');
        if (value()?.files.some(file => file.path === result.path)) throw new Error(`A file named ${result.path} already exists. Rename that file before importing another with the same name.`);
        const next = codeDocument({ operation: 'import', value: value() ?? codeDocument({ operation: 'new' }), path: result.path, language: result.language, bytes: result.bytes }); selected = result.path;
        if (current) commit(next, 'Import source file');
        else { const file = next.files.find(file => file.path === result.path)!; await host.open({ ...blank(), title: result.path, value: codeDocument({ operation: 'decode', content: { files: [file], entry: file.path } }) }); }
      }
      function command(id: string) {
        if (disposed) return;
        try {
          if (id === 'code.stop') { stop(); return; } if (id === 'code.clear') { output = ''; view.output(''); return; }
          flush();
          if (id === 'code.run') { void run().catch(error); return; }
          if (id === 'code.import') { void importSource().catch(error); return; }
          if (id === 'code.export') { const file = activeFile(); if (file) void codeFiles({ operation: 'write', file }, files).then(result => { if (!disposed && result.kind === 'saved') view.notice(`Exported ${file.path}.`); }).catch(error); return; }
          if (id === 'code.newProject') { void host.open(blank()).catch(error); return; }
          if (id === 'code.newFile' || id === 'code.rename') { fileDialog(id === 'code.rename'); return; }
          if (id === 'code.delete' && current) { const next = codeDocument({ operation: 'remove', value: value()!, path: selected }); selected = next.entry; commit(next, 'Delete source file'); }
          if (id === 'code.find') editor.search();
        } catch (cause) { error(cause); }
      }
      return {
        render(snapshot) {
          const different = snapshot?.id !== current?.id, changed = snapshot?.identity !== current?.identity;
          if (different) { stop(); output = ''; view.output(''); view.notice(''); preview = false; runStatus = 'Ready'; selected = ''; editor.render(null); }
          if (changed) { pending = null; window.clearTimeout(timer); timer = 0; }
          current = snapshot; if (!value()?.files.some(file => file.path === selected)) selected = value()?.entry ?? '';
          if (!pending) editor.render(activeFile() ?? null); refresh();
        },
        model() { const on = !!current, item = (id: string, label: string, enabled = on) => ({ id: `code.${id}`, label, shortcut: '', enabled }); return { menus: [{ id: 'code', label: 'Code', items: [item('newFile', 'New source file…'), item('rename', 'Rename source file…'), item('delete', 'Delete source file', on && value()!.files.length > 1), item('import', 'Import source…', true), item('export', 'Export source…'), item('find', 'Find / replace…'), item('run', 'Run entry'), item('stop', 'Stop', running)] }], tools: [], panels: [] }; },
        context: () => ({ viewRole: 'none', activeTool: 'code', status: current ? `${value()!.files.length} source files · Entry: ${value()!.entry} · Ctrl+Enter: Run · Escape: Code controls` : 'Create or open a Code project.' }),
        command, gesture() {}, flush, dispose() { if (disposed) return; try { flush(); } catch (cause) { error(cause); } stop(); disposed = true; window.clearTimeout(timer); runtime?.dispose(); editor.dispose(); view.dispose(); },
      };
    },
  };
}
