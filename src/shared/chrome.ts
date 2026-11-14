/**
 * PURPOSE    Render the shared web application shell from a workspace view model.
 * KIND       SHELL
 * CONTRACT   IN: ChromeRequest; live root, valid ChromeModel with nonempty IDs and callbacks. Menu entries
 *            marked toolbar=true supply their glyph; tools populate the left palette.
 *            OUT: update/dispose plus a stable viewport element; XP-inspired application header/menu/
 *            toolbar/palette/panels/status, workspace switcher and accessible controls.
 *            update preserves viewport and caller-owned panel content identities, an open
 *            menu and its focused command (focus returns to the trigger if it vanished);
 *            dispose is idempotent and removes all installed event listeners.
 *            RAISES: TypeError for invalid root/model/callbacks.
 * GUARANTEES No domain decisions or fake tool actions; supplied strings are text;
 *            disabled commands are inert, and commands route only through callbacks.
 * TUNING     Visual dimensions/colors live in chrome.css; host must load that stylesheet.
 * DECISIONS  D1: Keep viewport identity stable. Alternative: rerender the entire window;
 *            rejected because renderer/canvas state would be lost. Revisit if: ownership
 *            changes so the renderer mounts outside the chrome.
 *            D2: Delegate events to the frame/document. Alternative: per-render handlers;
 *            rejected because frequent model updates risk leaks. Revisit if: profiling
 *            reveals a measurable dispatch cost.
 * LIMITS     Workspace editing, history, file operations and modal content are external.
 * TESTBENCH  src/shared/chrome.test.ts -- run with: node --import tsx --test src/shared/chrome.test.ts
 */

import { iconCatalog, renderIcon } from './icons.ts';

type Workspace = 'cad' | 'image' | 'photo' | 'video' | 'document' | 'slides' | 'audio' | 'spreadsheet' | 'code';
type MenuItem = { id: string; label: string; shortcut: string; enabled: boolean; icon?: string; toolbar?: boolean };
type Menu = { id: string; label: string; items: readonly MenuItem[] };
type Tool = { id: string; label: string; shortcut: string; icon: string; status: string; enabled: boolean; active?: boolean };
type Panel = { id: string; title: string; content: HTMLElement };
type Capability = { id: string; label: string; status: 'supported' | 'unavailable' | 'error'; message: string };
export type ChromeModel = {
  title: string; workspace: Workspace; dirty: boolean; menus: readonly Menu[]; tools: readonly Tool[];
  panels: readonly Panel[]; status: string; capabilities: readonly Capability[];
};
export type ChromeRequest = { root: HTMLElement; model: ChromeModel; onCommand: (id: string) => void; onWorkspace: (workspace: Workspace) => void };
type ChromeHandle = { update(model: ChromeModel): void; dispose(): void; viewport: HTMLElement };

function validate(model: ChromeModel): void {
  const text = (value: unknown) => typeof value === 'string';
  const id = (value: unknown) => typeof value === 'string' && value.length > 0;
  const glyph = (value: unknown) => typeof value === 'string' && iconCatalog.includes(value);
  if (!model || !['cad', 'image', 'photo', 'video', 'document', 'slides', 'audio', 'spreadsheet', 'code'].includes(model.workspace) || !text(model.title) ||
      !text(model.status) || typeof model.dirty !== 'boolean' ||
      ![model.menus, model.tools, model.panels, model.capabilities].every(Array.isArray)) throw new TypeError('Invalid window view model.');
  for (const menu of model.menus) {
    if (!menu || !id(menu.id) || !text(menu.label) || !Array.isArray(menu.items)) throw new TypeError('Invalid menu.');
    for (const item of menu.items) {
      if (!item || !id(item.id) || !text(item.label) || !text(item.shortcut) || typeof item.enabled !== 'boolean' ||
          (item.icon !== undefined && !glyph(item.icon)) || (item.toolbar === true && !glyph(item.icon))) throw new TypeError('Invalid menu item.');
    }
  }
  for (const tool of model.tools) {
    if (!tool || !id(tool.id) || ![tool.label, tool.shortcut, tool.status].every(text) || !glyph(tool.icon) || typeof tool.enabled !== 'boolean' || (tool.active !== undefined && typeof tool.active !== 'boolean')) throw new TypeError('Invalid tool.');
  }
  for (const panel of model.panels) {
    if (!panel || !id(panel.id) || !text(panel.title) || panel.content?.nodeType !== 1) throw new TypeError('Invalid panel.');
  }
  for (const capability of model.capabilities) {
    if (!capability || !id(capability.id) || ![capability.label, capability.message].every(text) ||
        !['supported', 'unavailable', 'error'].includes(capability.status)) throw new TypeError('Invalid capability.');
  }
}

export function createChrome({ root, model, onCommand, onWorkspace }: ChromeRequest): ChromeHandle {
  if (!root || root.nodeType !== 1 || !root.ownerDocument || typeof onCommand !== 'function' || typeof onWorkspace !== 'function') throw new TypeError('Window root and callbacks are required.');
  validate(model);
  const document = root.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) => {
    const element = document.createElement(tag); element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const frame = make('section', 'gc-window');
  frame.innerHTML = `<header class="gc-app-header"><div class="gc-identity"><span class="gc-app-icon"></span><strong class="gc-brand">gsnv-paint</strong></div><span data-window-title></span><div class="gc-workspaces" role="tablist" aria-label="Workspace"></div></header>
    <div class="gc-command-row"><nav class="gc-menubar" role="menubar" aria-label="Menu bar"></nav><div class="gc-standard" role="toolbar" aria-label="Standard toolbar"></div></div>
    <div class="gc-main"><aside class="gc-palette" role="toolbar" aria-label="Tool palette"></aside><div class="gc-viewport" role="region" tabindex="0"></div><aside class="gc-panels" role="complementary" aria-label="Panels"></aside></div>
    <footer class="gc-statusbar"><div class="gc-status" role="status"></div><details class="gc-capabilities"><summary></summary><div class="gc-capability-list"></div></details></footer>`;
  const get = <T extends HTMLElement>(selector: string) => frame.querySelector<T>(selector)!;
  const viewport = get<HTMLDivElement>('.gc-viewport');
  const menuBar = get<HTMLElement>('.gc-menubar');
  const toolbar = get<HTMLElement>('.gc-standard');
  const palette = get<HTMLElement>('.gc-palette');
  const panels = get<HTMLElement>('.gc-panels');
  const status = get<HTMLElement>('.gc-status');
  get<HTMLElement>('.gc-app-icon').append(renderIcon({ document, name: 'app', label: 'gsnv-paint', size: 20 }));
  const workspaceNames = { cad: 'CAD', image: 'Image', photo: 'Photo', video: 'Video', document: 'Document', slides: 'Slides', audio: 'Audio', spreadsheet: 'Spreadsheet', code: 'Code' } as const;
  const workspaceButtons = (['cad', 'image', 'photo', 'video', 'document', 'slides', 'audio', 'spreadsheet', 'code'] as const).map(workspace => {
    const button = make('button', 'gc-workspace'); button.type = 'button'; button.dataset.workspace = workspace;
    button.dataset.focusKey = `workspace:${workspace}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-label', workspaceNames[workspace]);
    button.append(renderIcon({ document, name: workspace, label: workspaceNames[workspace], size: 18 }), make('span', '', workspaceNames[workspace]));
    get<HTMLElement>('.gc-workspaces').append(button); return button;
  });
  let current = model;
  let disposed = false;
  let activeMenu = -1;
  let menuNodes: { button: HTMLButtonElement; popup: HTMLElement }[] = [];
  let panelCache: Panel[] = [];
  const closeMenu = (focus = false) => {
    const previous = menuNodes[activeMenu];
    for (const item of menuNodes) { item.popup.hidden = true; item.button.setAttribute('aria-expanded', 'false'); }
    activeMenu = -1;
    if (focus) previous?.button.focus();
  };
  const openMenu = (index: number, focus = false, last = false) => {
    closeMenu(); const item = menuNodes[index]; if (!item) return;
    activeMenu = index; item.popup.hidden = false; item.button.setAttribute('aria-expanded', 'true');
    const choices = [...item.popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (focus) (last ? choices.at(-1) : choices[0])?.focus();
  };
  const commandButton = (item: MenuItem | Tool, surface: string) => {
    const button = make('button', surface === 'menu' ? 'gc-menu-item' : 'gc-icon-button'); button.type = 'button';
    button.disabled = !item.enabled; button.dataset.command = item.id; button.dataset.focusKey = `${surface}:${item.id}`;
    button.title = item.shortcut ? `${item.label} (${item.shortcut})` : item.label;
    button.setAttribute('aria-label', button.title);
    if ('status' in item) { button.dataset.status = item.status; if (item.active !== undefined) button.setAttribute('aria-pressed', String(item.active)); }
    if (item.icon) button.append(renderIcon({ document, name: item.icon, label: item.label, size: 18 }));
    if (surface === 'toolbar') button.append(make('span', 'gc-command-label', item.label));
    if (surface === 'menu') { button.setAttribute('role', 'menuitem'); button.append(make('span', 'gc-menu-label', item.label), make('span', 'gc-key', item.shortcut)); }
    return button;
  };
  const update = (next: ChromeModel) => {
    validate(next); if (disposed) return;
    const focused = document.activeElement as HTMLElement | null;
    let focusKey = focused?.dataset.focusKey;
    // Background updates (worker results, autosave) keep an open menu open with the same focused command.
    const openId = activeMenu >= 0 ? menuNodes[activeMenu]!.button.dataset.menu : undefined;
    const popupFocused = activeMenu >= 0 && menuNodes[activeMenu]!.popup.contains(focused);
    closeMenu(); current = next;
    get<HTMLElement>('[data-window-title]').textContent = `${next.title || 'Untitled'}${next.dirty ? ' *' : ''}`;
    viewport.setAttribute('aria-label', `${workspaceNames[next.workspace]} workspace view`);
    workspaceButtons.forEach(button => { const selected = button.dataset.workspace === next.workspace; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    menuBar.replaceChildren(); toolbar.replaceChildren(); palette.replaceChildren(); menuNodes = [];
    for (const menu of next.menus) {
      const wrap = make('div', 'gc-menu-wrap'); const button = make('button', 'gc-menu-trigger', menu.label); button.type = 'button';
      button.dataset.menu = menu.id; button.dataset.focusKey = `menu:${menu.id}`; button.setAttribute('role', 'menuitem');
      button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
      const popup = make('div', 'gc-menu-popup'); popup.setAttribute('role', 'menu'); popup.setAttribute('aria-label', menu.label); popup.hidden = true;
      for (const item of menu.items) { popup.append(commandButton(item, 'menu')); if (item.toolbar) toolbar.append(commandButton(item, 'toolbar')); }
      wrap.append(button, popup); menuBar.append(wrap); menuNodes.push({ button, popup });
    }
    palette.append(make('div', 'gc-palette-label', 'Tools'));
    for (const tool of next.tools) palette.append(commandButton(tool, 'tool'));
    if (panelCache.length !== next.panels.length || next.panels.some((panel, index) => {
      const old = panelCache[index]; return !old || old.id !== panel.id || old.title !== panel.title || old.content !== panel.content;
    })) {
      panels.replaceChildren();
      for (const panel of next.panels) {
        const section = make('section', 'gc-panel'); const content = make('div', 'gc-panel-content'); content.append(panel.content);
        section.append(make('h2', '', panel.title), content); panels.append(section);
      }
      panelCache = next.panels.map(panel => ({ ...panel }));
    }
    status.textContent = next.status;
    const unavailable = next.capabilities.filter(capability => capability.status !== 'supported').length;
    get<HTMLElement>('.gc-capabilities summary').textContent = unavailable ? `${unavailable} browser notice${unavailable === 1 ? '' : 's'}` : next.capabilities.length ? 'Browser support' : 'Browser support not checked';
    const list = get<HTMLElement>('.gc-capability-list'); list.replaceChildren();
    for (const capability of next.capabilities) { const row = make('p', 'gc-capability', `${capability.label}: ${capability.message}`); row.dataset.state = capability.status; list.append(row); }
    const reopen = openId === undefined ? -1 : menuNodes.findIndex(item => item.button.dataset.menu === openId);
    if (reopen >= 0) openMenu(reopen);
    // A focused command that is gone or now disabled hands focus back to its visible trigger.
    if (popupFocused && (reopen < 0 || ![...menuNodes[reopen]!.popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].some(item => item.dataset.focusKey === focusKey))) focusKey = reopen >= 0 ? menuNodes[reopen]!.button.dataset.focusKey : `menu:${openId}`;
    if (focusKey) {
      const replacement = [...frame.querySelectorAll<HTMLElement>('[data-focus-key]')].find(element => element.dataset.focusKey === focusKey);
      replacement?.focus();
      if (!replacement || document.activeElement !== replacement) viewport.focus();
    }
    else if (focused && frame.contains(focused)) focused.focus();
  };
  const clicked = (event: Event) => {
    const button = (event.target as Element).closest?.('button'); if (!button || button.disabled || !frame.contains(button)) return;
    if (button.dataset.menu !== undefined) { const index = menuNodes.findIndex(item => item.button === button); activeMenu === index ? closeMenu() : openMenu(index); }
    else if (button.dataset.workspace) { closeMenu(); onWorkspace(button.dataset.workspace as Workspace); }
    else if (button.dataset.command) { closeMenu(true); onCommand(button.dataset.command); }
  };
  const keyed = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const index = menuNodes.findIndex(item => item.button === target);
    if (target.dataset.workspace && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const currentIndex = workspaceButtons.indexOf(target as HTMLButtonElement);
      const count = workspaceButtons.length;
      const next = workspaceButtons[(currentIndex + (event.key === 'ArrowRight' ? 1 : count - 1)) % count]!;
      next.focus(); onWorkspace(next.dataset.workspace as Workspace); event.preventDefault(); return;
    }
    if (event.key === 'Escape' && activeMenu >= 0) { closeMenu(true); event.preventDefault(); event.stopPropagation(); return; }
    if (event.key === 'Tab' && activeMenu >= 0) { closeMenu(true); return; }
    if (event.key === 'F10') { openMenu(0); menuNodes[0]?.button.focus(); event.preventDefault(); return; }
    if (index >= 0 && ['ArrowDown', 'ArrowUp'].includes(event.key)) { openMenu(index, true, event.key === 'ArrowUp'); event.preventDefault(); return; }
    if (activeMenu < 0 || !menuBar.contains(target)) return;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { openMenu((activeMenu + (event.key === 'ArrowRight' ? 1 : menuNodes.length - 1)) % menuNodes.length, true); event.preventDefault(); return; }
    const choices = [...menuNodes[activeMenu]!.popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const selected = choices.indexOf(target as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : event.key === 'ArrowDown' ? (selected + 1) % choices.length : event.key === 'ArrowUp' ? (selected + choices.length - 1) % choices.length : -1;
    if (next >= 0) { choices[next]?.focus(); event.preventDefault(); }
  };
  const hint = (event: Event) => { const control = (event.target as Element).closest?.<HTMLElement>('[data-status]'); status.textContent = control && !control.hasAttribute('disabled') ? control.dataset.status! : current.status; };
  const resetHint = () => { status.textContent = current.status; };
  const outside = (event: Event) => { if (!menuBar.contains(event.target as Node)) closeMenu(); };
  frame.addEventListener('click', clicked); frame.addEventListener('keydown', keyed);
  frame.addEventListener('pointerover', hint); frame.addEventListener('focusin', hint);
  frame.addEventListener('pointerout', resetHint); frame.addEventListener('focusout', resetHint);
  document.addEventListener('pointerdown', outside);
  document.addEventListener('focusin', outside);
  root.append(frame); update(model);
  return { viewport, update, dispose() {
    if (disposed) return; disposed = true;
    frame.removeEventListener('click', clicked); frame.removeEventListener('keydown', keyed);
    frame.removeEventListener('pointerover', hint); frame.removeEventListener('focusin', hint);
    frame.removeEventListener('pointerout', resetHint); frame.removeEventListener('focusout', resetHint);
    document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); frame.remove();
  } };
}
