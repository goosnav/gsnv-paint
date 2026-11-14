/**
 * PURPOSE    Edit one source file with a keyboard-accessible CodeMirror view.
 * KIND       SHELL
 * CONTRACT   IN: live root, onChange(file), onCommand(flush|run|escape), then render(file|null).
 *            OUT: render, getText, focus, search and dispose methods; changes are synchronous intents.
 *            RAISES: TypeError for an invalid host. Callbacks are trusted and synchronous.
 * GUARANTEES No source execution or private undo history; render does not emit edits; selection is
 *            retained per path. Shared save/undo shortcuts receive a pending-edit flush first.
 * TUNING     Source indentation is two spaces; editor appearance belongs to its setup adapter.
 * DECISIONS  D1: Shared project history. Alternative: CodeMirror history; rejected because file
 *            operations and source edits must undo together. Revisit if the shared history changes.
 * LIMITS     Validated text files only; no language server, terminal, package installer or debugger.
 * TESTBENCH  src/code/code-editor.browser.spec.ts -- node node_modules/@playwright/test/cli.js test --config src/code/code-workspace.playwright.config.ts
 */
import type { CodeDocument } from './code-document.ts';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { codeLanguage } from './code-editor-languages.ts';
type File = CodeDocument['files'][number];
type Request = { root: HTMLElement; onChange(file: File): void; onCommand(command: 'flush' | 'run' | 'escape'): void };
export function createCodeEditor({ root, onChange, onCommand }: Request): { render(file: File | null): void; getText(): string; focus(): void; search(): void; dispose(): void } {
  if (!root?.isConnected || !root.ownerDocument.defaultView) throw new TypeError('A live source editor root is required.');
  let current: File | null = null, synchronizing = false, disposed = false;
  const language = new Compartment(), positions = new Map<string, { anchor: number; head: number; top: number; left: number }>();
  const theme = EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'white', color: '#111' }, '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "Liberation Mono", monospace' },
    '.cm-content': { minHeight: '100%', padding: '6px 0' }, '.cm-gutters': { backgroundColor: '#f1f1eb', color: '#666', borderRight: '1px solid #aaa' },
    '.cm-activeLine': { backgroundColor: '#eef4fc' }, '.cm-search': { backgroundColor: '#ece9d8', font: '12px Tahoma, sans-serif' },
  });
  const state = (file: File | null, selection = { anchor: 0, head: 0 }) => EditorState.create({ doc: file?.text ?? '', selection, extensions: [
    lineNumbers(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(), indentOnInput(), indentUnit.of('  '), bracketMatching(), syntaxHighlighting(defaultHighlightStyle),
    search({ top: true }), highlightSelectionMatches(), keymap.of([...searchKeymap, ...defaultKeymap, indentWithTab]), language.of(file ? codeLanguage(file.language) : []), theme,
    EditorState.readOnly.of(!file), EditorView.editable.of(!!file), EditorView.contentAttributes.of({ 'aria-label': 'Source code', 'aria-description': 'Escape moves to the Code controls. Tab indents. Control or Command plus Enter runs the entry file.' }),
    EditorView.updateListener.of(update => { if (!synchronizing && update.docChanged && current) { current = { ...current, text: update.state.doc.toString() }; onChange(current); } }),
  ] });
  const view = new EditorView({ parent: root, state: state(null) });
  const keys = (event: KeyboardEvent) => {
    if (event.isComposing || disposed) return;
    const primary = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (primary && ['s', 'o', 'n', 'z', 'y'].includes(key)) onCommand('flush');
    if (primary && event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onCommand('run'); }
    if (event.key === 'Escape' && !root.querySelector('.cm-search')) { event.preventDefault(); event.stopPropagation(); onCommand('escape'); }
  };
  root.addEventListener('keydown', keys, true);
  return {
    render(file) {
      if (disposed) return;
      const old = current, previous = view.state.selection.main;
      if (old) positions.set(old.path, { anchor: previous.anchor, head: previous.head, top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft });
      current = file; synchronizing = true;
      try {
        if (file?.path !== old?.path || !!file !== !!old) {
          const position = file ? positions.get(file.path) : undefined, length = file?.text.length ?? 0;
          view.setState(state(file, { anchor: Math.min(position?.anchor ?? 0, length), head: Math.min(position?.head ?? 0, length) }));
          view.scrollDOM.scrollTop = position?.top ?? 0; view.scrollDOM.scrollLeft = position?.left ?? 0;
        } else if (file && (file.text !== view.state.doc.toString() || file.language !== old?.language)) {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: file.text }, selection: { anchor: Math.min(previous.anchor, file.text.length), head: Math.min(previous.head, file.text.length) }, effects: language.reconfigure(codeLanguage(file.language)) });
        }
      } finally { synchronizing = false; }
    },
    getText: () => view.state.doc.toString(), focus: () => { if (!disposed && current) view.focus(); }, search: () => { if (!disposed && current) openSearchPanel(view); },
    dispose() { if (disposed) return; disposed = true; root.removeEventListener('keydown', keys, true); view.destroy(); root.replaceChildren(); positions.clear(); },
  };
}
