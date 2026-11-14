/**
 * PURPOSE    Display the local source workspace.
 * KIND       SHELL
 * CONTRACT   IN: live root and intent callbacks. OUT: editor/runtime roots and render/output methods.
 *            RAISES: TypeError for an invalid host. Callbacks own all document changes.
 * GUARANTEES Source names and output render as text; no source execution or document mutation.
 * TUNING     Console display is limited to 140000 characters; grid proportions are in STYLE.
 * DECISIONS  D1: Keep the file list and source tabs visible together. Alternative: modal file
 *            switching; rejected for multi-file work. Revisit if narrow-screen support is required.
 * LIMITS     File paths are a flat navigable list; directory move/rename is not supported.
 * TESTBENCH  src/code/code-workspace.browser.spec.ts -- node node_modules/@playwright/test/cli.js test --config src/code/code-workspace.playwright.config.ts
 */
import type { CodeDocument } from './code-document.ts';
type Language = CodeDocument['files'][number]['language'];
type Request = { root: HTMLElement; command(id: string): void; select(path: string): void; entry(path: string): void; language(value: Language): void };
const STYLE = `.code-workspace{position:absolute;inset:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);background:#ece9d8;font:12px Tahoma,sans-serif;color:#111;min-width:0}.code-toolbar{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:5px;border-bottom:1px solid #aca899}.code-workspace button,.code-workspace select{font:11px Tahoma,sans-serif;min-height:25px;max-width:220px}.code-workspace button{border:1px solid #7f9db9;border-radius:2px;background:linear-gradient(#fff,#e3dfd2);padding:3px 7px;color:#111}.code-workspace button:disabled{color:#777}.code-workspace button:focus-visible{outline:2px solid #235da8;outline-offset:-3px}.code-workspace select{background:white;border:1px solid #7f9db9}.code-capabilities{margin:0;padding:4px 7px;font-size:11px;color:#3d434b;border-bottom:1px solid #aca899}.code-main{display:grid;grid-template-columns:170px minmax(0,1fr);min-height:0}.code-files{overflow:auto;background:#fff;border-right:1px solid #aca899;padding:5px}.code-files strong{display:block;margin:3px 0 8px}.code-files button{display:block;width:100%;text-align:left;overflow:hidden;text-overflow:ellipsis;background:transparent;border-color:transparent;white-space:nowrap}.code-files button[aria-current=true]{background:#dce8fb;border-color:#7f9db9}.code-right{display:grid;grid-template-rows:auto minmax(110px,1fr) minmax(125px,.55fr);min-height:0;min-width:0}.code-tabs{display:flex;overflow:auto;gap:2px;background:#ddd9ca;min-height:27px}.code-tabs button{flex:none;border-radius:3px 3px 0 0}.code-tabs button[aria-selected=true]{background:white;border-bottom-color:white}.code-editor-host{min-height:0;overflow:hidden;background:white}.code-bottom{display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0;border-top:1px solid #aca899;background:white}.code-output-head{display:flex;align-items:center;gap:8px;padding:3px 6px;background:#ece9d8}.code-run-status{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.code-output{margin:0;padding:6px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12px Consolas,monospace;min-height:0}.code-runtime{min-height:0;overflow:auto;padding:4px}.code-runtime p{margin:0 0 4px;font-size:11px}.code-notice{position:absolute;left:175px;right:8px;bottom:6px;background:#ffffe1;border:1px solid #aaa;padding:6px;z-index:2;max-height:60px;overflow:auto}.code-notice[role=alert]{color:#8c0000}.code-empty{position:absolute;inset:0;display:grid;place-content:center;gap:12px;text-align:center;background:#ece9d8}.code-workspace [hidden]{display:none!important}`;
export function codeWorkspaceView({ root, command, select, entry, language }: Request) {
  if (!root?.isConnected) throw new TypeError('A live Code workspace root is required.');
  const doc = root.ownerDocument, make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const element = doc.createElement(tag); element.className = className; element.textContent = text; return element; };
  const stage = make('section', 'code-workspace'), style = make('style'), toolbar = make('div', 'code-toolbar'), capabilities = make('p', 'code-capabilities'); style.textContent = STYLE;
  capabilities.textContent = 'JavaScript runs the entry file in an isolated worker; local module imports and browser DOM APIs are unavailable. Python supports project-local imports and the bundled standard library. HTML/CSS preview does not run scripts.';
  const controls = new Map<string, HTMLButtonElement>();
  const button = (id: string, label: string, parent = toolbar) => { const value = make('button', '', label); value.type = 'button'; value.dataset.codeCommand = id; value.onclick = () => command(id); value.title = label; controls.set(id, value); parent.append(value); return value; };
  for (const [id, label] of [['newFile', 'New file'], ['rename', 'Rename file'], ['delete', 'Delete file'], ['import', 'Import source'], ['export', 'Export source'], ['find', 'Find'], ['run', 'Run entry'], ['stop', 'Stop']]) button(`code.${id}`, label!);
  const entrySelect = make('select'), languageSelect = make('select'); entrySelect.setAttribute('aria-label', 'Entry file'); languageSelect.setAttribute('aria-label', 'Source language');
  for (const value of ['javascript', 'python', 'html', 'css', 'text']) { const option = make('option', '', value); option.value = value; languageSelect.append(option); }
  entrySelect.onchange = () => entry(entrySelect.value); languageSelect.onchange = () => language(languageSelect.value as Language); toolbar.append(make('span', '', 'Entry:'), entrySelect, make('span', '', 'Language:'), languageSelect);
  const main = make('div', 'code-main'), files = make('nav', 'code-files'), right = make('div', 'code-right'), tabs = make('div', 'code-tabs'), editorRoot = make('div', 'code-editor-host'), bottom = make('div', 'code-bottom'), outputHead = make('div', 'code-output-head'), runStatus = make('span', 'code-run-status', 'Ready'), output = make('pre', 'code-output'), runtimeRoot = make('div', 'code-runtime'), notice = make('div', 'code-notice'), empty = make('div', 'code-empty');
  files.setAttribute('aria-label', 'Project files'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Source files'); output.setAttribute('aria-label', 'Code output'); output.setAttribute('tabindex', '0'); runStatus.setAttribute('role', 'status'); notice.hidden = true; runtimeRoot.hidden = true;
  tabs.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(tabs.querySelectorAll<HTMLButtonElement>('button')), index = items.findIndex(item => item === doc.activeElement); if (index < 0) return;
    event.preventDefault(); event.stopPropagation(); const next = items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + items.length) % items.length]!;
    select(next.dataset.codePath!); next.focus();
  };
  outputHead.append(make('strong', '', 'Output'), runStatus); button('code.clear', 'Clear output', outputHead); bottom.append(outputHead, output, runtimeRoot); right.append(tabs, editorRoot, bottom); main.append(files, right); stage.append(style, toolbar, capabilities, main, notice, empty); empty.append(make('h2', '', 'Edit local code'), make('p', '', 'Create a project, add source files, then choose an entry to run.')); button('code.newProject', 'New JavaScript project', empty); root.append(stage);
  let paths = '', active = '';
  return { editorRoot, runtimeRoot,
    render({ value, selected, running, status, preview }: { value: CodeDocument | undefined; selected: string; running: boolean; status: string; preview: boolean }) {
      empty.hidden = !!value; const names = value?.files.map(file => file.path) ?? [], signature = JSON.stringify(names);
      if (signature !== paths) {
        paths = signature; files.replaceChildren(make('strong', '', 'Project files')); tabs.replaceChildren(); entrySelect.replaceChildren();
        for (const path of names) {
          const item = make('button', '', path), tab = make('button', '', path.split('/').at(-1)!); item.type = tab.type = 'button'; item.title = tab.title = path; item.dataset.codePath = tab.dataset.codePath = path; tab.setAttribute('role', 'tab'); item.onclick = tab.onclick = () => select(path); files.append(item); tabs.append(tab);
          const option = make('option', '', path); option.value = path; entrySelect.append(option);
        }
        active = '';
      }
      if (active !== selected) { active = selected; for (const item of files.querySelectorAll<HTMLButtonElement>('button')) item.setAttribute('aria-current', String(item.dataset.codePath === selected)); for (const tab of tabs.querySelectorAll<HTMLButtonElement>('button')) { tab.setAttribute('aria-selected', String(tab.dataset.codePath === selected)); tab.tabIndex = tab.dataset.codePath === selected ? 0 : -1; } }
      const focused = doc.activeElement; let refocus = false;
      for (const [id, control] of controls) { control.disabled = id === 'code.stop' ? !running : id === 'code.import' || id === 'code.newProject' || id === 'code.clear' ? false : !value || id === 'code.delete' && names.length <= 1; refocus ||= focused === control && control.disabled; }
      if (refocus) controls.get(value ? 'code.run' : 'code.newProject')!.focus();
      entrySelect.disabled = languageSelect.disabled = !value; entrySelect.value = value?.entry ?? ''; languageSelect.value = value?.files.find(file => file.path === selected)?.language ?? 'text';
      runStatus.textContent = status || 'Ready'; output.hidden = preview; runtimeRoot.hidden = !preview;
    },
    notice(message: string, error = false) { notice.textContent = message; notice.hidden = !message; notice.setAttribute('role', error ? 'alert' : 'status'); },
    output(text: string) { output.textContent = text.slice(0, 140000); output.scrollTop = output.scrollHeight; },
    focusRun() { controls.get('code.run')!.focus(); }, dispose() { stage.remove(); },
  };
}
