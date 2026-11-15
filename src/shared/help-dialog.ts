/**
 * PURPOSE    Present local help in an accessible modal.
 * KIND       SHELL
 * CONTRACT   IN: owning document/live root, workspace, commands, section, onCommand callback.
 *            OUT: close() plus a closed Promise; closing restores focus and settles once.
 *            Show me invokes only an enabled current-workspace command explicitly marked
 *            showMe by the caller, after closed handlers can release their modal guard.
 *            RAISES: TypeError for invalid input; browser modal errors propagate after cleanup.
 * GUARANTEES No file access, content insertion, markup interpolation or remote help loads.
 * TUNING     Help layout is in help.css; authored search material lives in HELP-INDEX.
 * DECISIONS  D1: Use a dedicated modal. Alternative: overload the typed form dialog; rejected
 *            because help is navigation, not a form edit. Revisit if: a shared modal controller
 *            replaces app-owned lifecycle. Caller routing retains command authority.
 * LIMITS     Caller owns modal exclusion and imports dialog.css/help.css. Read-only command
 *            metadata is captured for display; the callback must not bypass normal guards.
 * TESTBENCH  src/shared/help-dialog.test.ts; node --import tsx --test src/shared/help-dialog.test.ts
 * DEMO       npm run dev -- --host 127.0.0.1; open /src/shared/help-dialog.demo.html.
 */
import { searchHelp, type HelpCommand, type HelpResult, type HelpSection, type HelpWorkspace } from './help-index.ts';

export type HelpRequest = {
  document: Document; root: HTMLElement; workspace: HelpWorkspace; commands: readonly HelpCommand[];
  section: HelpSection; onCommand(id: string): void;
};
export type HelpHandle = { close(): void; closed: Promise<void> };

export function showHelp({ document, root, workspace, commands, section, onCommand }: HelpRequest): HelpHandle {
  if (!root?.isConnected || root.ownerDocument !== document || typeof onCommand !== 'function' || !['search', 'getting-started', 'faq'].includes(section)) throw new TypeError('Help needs a live owning root, section and command callback.');
  searchHelp({ query: '', workspace, commands });
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) => {
    const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node;
  };
  const previous = document.activeElement as HTMLElement | null;
  const modal = make('dialog', 'gc-dialog gc-help'); modal.setAttribute('aria-label', 'Help');
  const title = make('h2', 'gc-dialog-title', 'Help');
  const body = make('div', 'gc-dialog-body gc-help-body');
  const label = make('label', 'gc-help-search'); label.append(make('span', '', 'Search tools and help'));
  const query = make('input', 'xp-field'); query.type = 'search'; query.placeholder = 'Try font, zoom or export'; query.autocomplete = 'off'; label.append(query);
  const nav = make('nav', 'gc-help-sections'); nav.setAttribute('aria-label', 'Help sections');
  const tabs = new Map<HelpSection, HTMLButtonElement>();
  for (const [key, caption] of [['search', 'Search'], ['getting-started', 'Getting started'], ['faq', 'FAQ']] as const) {
    const button = make('button', 'xp-button', caption); button.type = 'button'; button.dataset.helpSection = key; tabs.set(key, button); nav.append(button);
  }
  const count = make('p', 'gc-help-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const columns = make('div', 'gc-help-columns'), list = make('ul', 'gc-help-results'), detail = make('article', 'gc-help-detail');
  list.setAttribute('aria-label', 'Help results'); detail.setAttribute('aria-label', 'Help instructions'); columns.append(list, detail);
  const footer = make('div', 'gc-dialog-buttons'); const closeButton = make('button', 'xp-button', 'Close'); closeButton.type = 'button'; closeButton.title = 'Close Help (Esc)'; const credits = make('a', '', 'Icon credits'); credits.href = './icon-credits.html'; credits.target = '_blank'; credits.rel = 'noopener';
  footer.append(credits, closeButton);
  body.append(label, nav, count, columns, footer); modal.append(title, body);
  let settled = false, selected: HelpResult | undefined, currentSection = section;
  let resolveClosed!: () => void; const closed = new Promise<void>(resolve => { resolveClosed = resolve; });
  const cleanup = () => {
    modal.removeEventListener('keydown', keydown); modal.removeEventListener('cancel', cancel); modal.removeEventListener('close', close);
    query.removeEventListener('input', input); nav.removeEventListener('click', navigation); closeButton.removeEventListener('click', close);
  };
  const close = () => {
    if (settled) return; settled = true; cleanup();
    if (modal.open) modal.close(); modal.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true }); resolveClosed();
  };
  const show = (result: HelpResult | undefined) => {
    selected = result; detail.replaceChildren();
    for (const button of list.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.helpResult === result?.id));
    if (!result) { detail.append(make('p', '', 'Try a tool name, a file type or a task such as “custom font”.')); return; }
    const scope = result.workspace === 'shared' ? 'All workspaces' : result.workspace === 'image' ? 'Image / Paint' : result.workspace[0]!.toUpperCase() + result.workspace.slice(1);
    detail.append(make('p', 'gc-help-scope', scope), make('h3', '', result.title));
    const steps = make('ol'); for (const step of result.steps) steps.append(make('li', '', step)); detail.append(steps);
    if (result.available && result.commandId) {
      const action = make('button', 'xp-button', 'Show me'); action.type = 'button'; action.title = 'Close Help and select this tool or view';
      action.onclick = () => {
        if (settled || selected !== result) return;
        const command = commands.find(command => command.id === result.commandId && command.workspace === workspace);
        if (!command?.enabled || command.showMe !== true) { action.disabled = true; return; }
        close(); queueMicrotask(() => onCommand(command.id));
      }; detail.append(action);
    }
  };
  const render = () => {
    const results = searchHelp({ query: query.value, workspace, commands }).filter(result => currentSection === 'search' || result.section === currentSection);
    for (const [key, button] of tabs) button.setAttribute('aria-pressed', String(key === currentSection));
    list.replaceChildren();
    for (const result of results) {
      const row = make('li'), button = make('button', 'gc-help-result'); button.type = 'button'; button.dataset.helpResult = result.id;
      button.append(make('span', '', result.title), make('small', '', result.workspace === 'shared' ? 'All workspaces' : result.workspace === 'image' ? 'Image / Paint' : result.workspace));
      button.onclick = () => { if (!settled) show(result); }; row.append(button); list.append(row);
    }
    count.textContent = results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'No matches. Try a different word.';
    show(results[0]);
  };
  const input = () => { if (!settled) { currentSection = 'search'; render(); } };
  const navigation = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-help-section]'); if (!button || settled) return;
    currentSection = button.dataset.helpSection as HelpSection; query.value = ''; render();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || settled) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') {
      const controls = [...modal.querySelectorAll<HTMLElement>('input,button:not(:disabled),a[href]')], index = controls.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey ? index <= 0 : index === controls.length - 1 || index < 0) {
        event.preventDefault(); event.stopPropagation(); (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    }
    const choices = [...list.querySelectorAll<HTMLButtonElement>('button')], index = choices.indexOf(document.activeElement as HTMLButtonElement);
    if ((event.target === query && ['ArrowDown', 'Enter'].includes(event.key)) || (index >= 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))) {
      event.preventDefault(); event.stopPropagation();
      const next = index < 0 || event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + choices.length) % choices.length;
      choices[next]?.focus();
    }
  };
  const cancel = (event: Event) => { event.preventDefault(); close(); };
  modal.addEventListener('keydown', keydown); modal.addEventListener('cancel', cancel); modal.addEventListener('close', close);
  query.addEventListener('input', input); nav.addEventListener('click', navigation); closeButton.addEventListener('click', close);
  render(); root.append(modal);
  try { modal.showModal(); query.focus(); } catch (error) { close(); throw error; }
  return { close, closed };
}
