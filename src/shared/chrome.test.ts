import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createChrome, type ChromeModel, type ChromeRequest } from './chrome.ts';

function fixture() {
  const dom = new JSDOM('<!doctype html><button id="outside">Outside</button><main id="app"></main>');
  const document = dom.window.document;
  const root = document.querySelector<HTMLElement>('#app')!;
  const content = document.createElement('p'); content.textContent = 'Nothing selected';
  const model: ChromeModel = {
    title: 'Test document', workspace: 'cad', dirty: true,
    menus: [{ id: 'file', label: 'File', items: [
      { id: 'file.new', label: 'New', shortcut: 'Ctrl+N', enabled: false, icon: 'new', toolbar: true },
      { id: 'file.open', label: 'Open', shortcut: 'Ctrl+O', enabled: true, icon: 'open', toolbar: true },
      { id: 'file.save', label: 'Save', shortcut: 'Ctrl+S', enabled: true, icon: 'save', toolbar: true },
    ] }, { id: 'edit', label: 'Edit', items: [{ id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', enabled: false, icon: 'undo', toolbar: true }] }],
    tools: [{ id: 'view.panHold', label: 'Hand', shortcut: 'Space', icon: 'hand', status: 'Drag to pan the view.', enabled: true },
      { id: 'view.fit', label: 'Fit view', shortcut: 'F', icon: 'fit', status: 'Fit the model to the view.', enabled: false }],
    panels: [{ id: 'properties', title: 'Properties', content }], status: 'Ready',
    capabilities: [{ id: 'webgl2', label: 'WebGL 2', status: 'unavailable', message: 'Enable graphics support.' }],
  };
  const commands: string[] = []; const workspaces: string[] = [];
  const args: ChromeRequest = { root, model, onCommand: id => commands.push(id), onWorkspace: workspace => workspaces.push(workspace) };
  return { dom, document, root, content, model, commands, workspaces, args };
}
const button = (root: ParentNode, selector: string) => root.querySelector<HTMLButtonElement>(selector)!;

test('S10 golden shared window exposes the requested regions and view model', () => {
  const f = fixture();
  const chrome = createChrome(f.args);
  assert.deepEqual({
    title: f.root.querySelector('[data-window-title]')?.textContent,
    menus: [...f.root.querySelectorAll('[aria-haspopup="menu"]')].map(node => node.textContent),
    workspaces: [...f.root.querySelectorAll('[role="tab"]')].map(node => [node.getAttribute('aria-label'), node.getAttribute('aria-selected')]),
    panels: [...f.root.querySelectorAll('h2')].map(node => node.textContent),
    status: f.root.querySelector('[role="status"]')?.textContent,
  }, { title: 'Test document *', menus: ['File', 'Edit'], workspaces: [['CAD', 'true'], ['Image', 'false'], ['Photo', 'false'], ['Video', 'false'], ['Document', 'false'], ['Slides', 'false'], ['Audio', 'false'], ['Spreadsheet', 'false'], ['Code', 'false']], panels: ['Properties'], status: 'Ready' });
  assert.equal(f.root.querySelector('.gc-brand')?.textContent, 'gsnv-paint');
  assert.ok(f.root.querySelector('.gc-app-header [role=tablist]'));
  assert.equal(chrome.viewport.getAttribute('aria-label'), 'CAD workspace view');
  assert.equal(chrome.viewport.tabIndex, 0);
  assert.equal(f.content.parentElement?.className, 'gc-panel-content');
  assert.ok(f.root.querySelectorAll('svg[role="img"]').length >= 10);
  assert.match(f.root.textContent!, /Enable graphics support/);
});

test('S10 toolbar/palette route enabled commands once and never activate disabled tools', () => {
  const f = fixture(); createChrome(f.args);
  button(f.root, '[aria-label="Standard toolbar"] [data-command="file.open"]').click();
  button(f.root, '[aria-label="Tool palette"] [data-command="view.panHold"]').click();
  button(f.root, '[aria-label="Standard toolbar"] [data-command="file.new"]').dispatchEvent(new f.dom.window.MouseEvent('click', { bubbles: true }));
  button(f.root, '[aria-label="Tool palette"] [data-command="view.fit"]').dispatchEvent(new f.dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(f.commands, ['file.open', 'view.panHold']);
  assert.equal(button(f.root, '[data-command="view.panHold"]').title, 'Hand (Space)');
});

test('S10 menus open, route enabled items, close on outside interaction and restore focus on Escape', () => {
  const f = fixture(); createChrome(f.args);
  const file = button(f.root, '[data-menu="file"]');
  file.click(); assert.equal(file.getAttribute('aria-expanded'), 'true');
  button(f.root, '[role="menu"] [data-command="file.open"]').click();
  assert.deepEqual(f.commands, ['file.open']); assert.equal(file.getAttribute('aria-expanded'), 'false');
  file.click();
  f.document.querySelector('#outside')!.dispatchEvent(new f.dom.window.Event('pointerdown', { bubbles: true }));
  assert.equal(file.getAttribute('aria-expanded'), 'false');
  file.click();
  file.focus();
  f.document.activeElement!.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(file.getAttribute('aria-expanded'), 'false'); assert.equal(f.document.activeElement, file);
});

test('S10 menu keyboard navigation skips disabled items and wraps', () => {
  const f = fixture(); createChrome(f.args);
  const file = button(f.root, '[data-menu="file"]'); file.focus();
  const press = (key: string) => f.document.activeElement!.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  press('ArrowDown'); assert.equal((f.document.activeElement as HTMLElement).dataset.command, 'file.open');
  press('ArrowUp'); assert.equal((f.document.activeElement as HTMLElement).dataset.command, 'file.save');
  press('Home'); assert.equal((f.document.activeElement as HTMLElement).dataset.command, 'file.open');
  press('End'); assert.equal((f.document.activeElement as HTMLElement).dataset.command, 'file.save');
  press('Escape'); assert.equal(f.document.activeElement, file);
});

test('S10 workspace controls emit the exact target and reflect updates', () => {
  const f = fixture(); const chrome = createChrome(f.args);
  button(f.root, '[data-workspace="image"]').click();
  assert.deepEqual(f.workspaces, ['image']);
  chrome.update({ ...f.model, workspace: 'image', dirty: false });
  assert.equal(button(f.root, '[data-workspace="image"]').getAttribute('aria-selected'), 'true');
  assert.equal(chrome.viewport.getAttribute('aria-label'), 'Image workspace view');
});

test('S10 workspace keyboard navigation reaches every tab and wraps in both directions', () => {
  const f = fixture(); const chrome = createChrome(f.args);
  const tabs = [...f.root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  tabs[0]!.focus();
  for (const direction of ['ArrowRight', 'ArrowLeft']) {
    for (let i = 1; i <= tabs.length; i++) {
      const expected = tabs[(direction === 'ArrowRight' ? i : tabs.length - i) % tabs.length]!;
      const event = new f.dom.window.KeyboardEvent('keydown', { key: direction, bubbles: true, cancelable: true });
      f.document.activeElement!.dispatchEvent(event);
      assert.equal(f.document.activeElement, expected); assert.equal(f.workspaces.at(-1), expected.dataset.workspace);
      assert.equal(event.defaultPrevented, true);
    }
  }
  chrome.dispose();
});

test('S10 updates retain viewport, mounted renderer, panel content and focused control identity', () => {
  const f = fixture(); const chrome = createChrome(f.args);
  const viewport = chrome.viewport;
  const canvas = f.document.createElement('canvas'); viewport.append(canvas);
  button(f.root, '[aria-label="Standard toolbar"] [data-command="file.open"]').focus();
  chrome.update({ ...f.model, title: 'Renamed', dirty: false, status: 'Saved' });
  assert.equal(chrome.viewport, viewport); assert.equal(canvas.parentElement, viewport);
  assert.equal(f.content.parentElement?.className, 'gc-panel-content');
  assert.equal((f.document.activeElement as HTMLElement).dataset.command, 'file.open');
  assert.equal(f.root.querySelector('[data-window-title]')?.textContent, 'Renamed');
});

test('S10 tool focus displays next action and blur restores current status', () => {
  const f = fixture(); createChrome(f.args);
  const hand = button(f.root, '[aria-label="Tool palette"] [data-command="view.panHold"]'); hand.focus();
  assert.equal(f.root.querySelector('[role="status"]')?.textContent, 'Drag to pan the view.');
  hand.blur(); assert.equal(f.root.querySelector('[role="status"]')?.textContent, 'Ready');
});

test('S10 supplied strings are literal text and panel elements keep their listeners', () => {
  const f = fixture(); let clicks = 0;
  f.content.addEventListener('click', () => clicks++);
  const chrome = createChrome({ ...f.args, model: { ...f.model, title: '<img onerror=alert(1)>', status: '<script>bad</script>' } });
  f.content.click(); chrome.update(f.model); f.content.click();
  assert.equal(clicks, 2);
  assert.equal(f.root.querySelector('img,script'), null);
});

test('S10 dispose is idempotent and removes frame and all listeners', () => {
  const f = fixture();
  let added = 0; let removed = 0;
  const add = f.document.addEventListener.bind(f.document); const remove = f.document.removeEventListener.bind(f.document);
  f.document.addEventListener = ((...args: Parameters<Document['addEventListener']>) => { if (args[0] === 'pointerdown') added++; add(...args); }) as Document['addEventListener'];
  f.document.removeEventListener = ((...args: Parameters<Document['removeEventListener']>) => { if (args[0] === 'pointerdown') removed++; remove(...args); }) as Document['removeEventListener'];
  const chrome = createChrome(f.args);
  const detached = button(f.root, '[aria-label="Standard toolbar"] [data-command="file.open"]');
  chrome.dispose(); chrome.dispose(); detached.click();
  assert.equal(f.root.children.length, 0); assert.deepEqual(f.commands, []);
  assert.equal(added, 1); assert.equal(removed, 1);
});

test('S10 invalid root/callbacks/model raise TypeError before damaging current DOM', () => {
  const f = fixture();
  assert.throws(() => createChrome({ ...f.args, root: null! }), TypeError);
  assert.throws(() => createChrome({ ...f.args, onCommand: null! }), TypeError);
  const chrome = createChrome(f.args); const before = f.root.innerHTML;
  for (const patch of [{ workspace: 'sound' }, { menus: null }, { dirty: 1 }, { tools: [{ ...f.model.tools[0], icon: 'unknown' }] }, { panels: [{ id: 'p', title: 'P', content: null }] }]) {
    assert.throws(() => chrome.update({ ...f.model, ...patch } as ChromeModel), TypeError);
    assert.equal(f.root.innerHTML, before);
  }
});

test('S10 focus departure closes menus and preserves panel text navigation', () => {
  const f = fixture(); createChrome(f.args);
  const input = f.document.createElement('input'); f.content.append(input);
  const file = button(f.root, '[data-menu="file"]'); file.focus();
  file.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  input.focus();
  const arrow = new f.dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
  input.dispatchEvent(arrow);
  assert.equal(arrow.defaultPrevented, false); assert.equal(f.document.activeElement, input);
  assert.equal(file.getAttribute('aria-expanded'), 'false');
  file.click(); f.document.querySelector<HTMLButtonElement>('#outside')!.focus();
  assert.equal(file.getAttribute('aria-expanded'), 'false');
});

test('S10 background updates keep an open menu and its focused command; vanished commands return focus to the trigger', () => {
  const f = fixture(); const chrome = createChrome(f.args);
  const file = button(f.root, '[data-menu="file"]'); file.focus();
  file.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal((f.document.activeElement as HTMLElement).dataset.command, 'file.open');
  chrome.update({ ...f.model, status: 'Autosaved' });
  assert.equal(button(f.root, '[data-menu="file"]').getAttribute('aria-expanded'), 'true');
  assert.equal((f.document.activeElement as HTMLElement).dataset.command, 'file.open');
  const items = f.model.menus[0]!.items.map(item => item.id === 'file.open' ? { ...item, enabled: false } : item);
  chrome.update({ ...f.model, menus: [{ ...f.model.menus[0]!, items }, f.model.menus[1]!] });
  assert.equal(f.document.activeElement, button(f.root, '[data-menu="file"]'));
  assert.equal(button(f.root, '[data-menu="file"]').getAttribute('aria-expanded'), 'true');
  chrome.update({ ...f.model, menus: [f.model.menus[1]!] });
  assert.equal(f.root.querySelector('[data-menu="file"]'), null); assert.ok(f.root.querySelectorAll('[aria-expanded="true"]').length === 0);
  chrome.dispose();
});

test('S10 rejects empty IDs from every view-model collection before updating DOM', () => {
  const f = fixture(); const chrome = createChrome(f.args); const before = f.root.innerHTML;
  const patches = [
    { menus: [{ ...f.model.menus[0]!, id: '' }] },
    { menus: [{ ...f.model.menus[0]!, items: [{ ...f.model.menus[0]!.items[0]!, id: '' }] }] },
    { tools: [{ ...f.model.tools[0]!, id: '' }] },
    { panels: [{ ...f.model.panels[0]!, id: '' }] },
    { capabilities: [{ ...f.model.capabilities[0]!, id: '' }] },
  ];
  for (const patch of patches) {
    assert.throws(() => chrome.update({ ...f.model, ...patch }), TypeError);
    assert.equal(f.root.innerHTML, before);
  }
});

test('S10 palette tools expose their optional active state and reject non-boolean values', () => {
  const f = fixture(); const chrome = createChrome(f.args);
  assert.equal(button(f.root, '.gc-palette [data-command="view.panHold"]').hasAttribute('aria-pressed'), false);
  chrome.update({ ...f.model, tools: [{ ...f.model.tools[0]!, active: true }, { ...f.model.tools[1]!, active: false }] });
  assert.equal(button(f.root, '.gc-palette [data-command="view.panHold"]').getAttribute('aria-pressed'), 'true');
  assert.equal(button(f.root, '.gc-palette [data-command="view.fit"]').getAttribute('aria-pressed'), 'false');
  assert.throws(() => chrome.update({ ...f.model, tools: [{ ...f.model.tools[0]!, active: 'yes' as unknown as boolean }] }), TypeError);
  chrome.dispose();
});

test('S10 offline status slot keeps caller content and keyboard focus across chrome updates', () => {
  const f = fixture(), chrome = createChrome(f.args);
  try {
    const slot = chrome.offlineSlot;
    assert.ok(slot instanceof f.dom.window.HTMLElement);
    assert.equal(slot.closest('footer'), f.root.querySelector('.gc-statusbar'));
    const action = f.document.createElement('button'); action.textContent = 'Check for updates'; slot.append(action); action.focus();
    chrome.update({ ...f.model, workspace: 'image', title: 'New title', dirty: false });
    assert.equal(chrome.offlineSlot, slot); assert.equal(action.parentElement, slot); assert.equal(f.document.activeElement, action);
  } finally { chrome.dispose(); f.dom.window.close(); }
});

test('S10 keeps native command targets connected when a field blur commits before its click', () => {
  const f = fixture(), chrome = createChrome(f.args), input = f.document.createElement('input'); f.content.append(input);
  const save = button(f.root, '.gc-standard [data-command="file.save"]'), glyph = save.firstElementChild;
  const menu = button(f.root, '[data-menu="file"]'), item = button(f.root, '.gc-menu-popup [data-command="file.save"]');
  const hand = button(f.root, '.gc-palette [data-command="view.panHold"]');
  input.addEventListener('blur', () => chrome.update({ ...f.model, status: 'Edit committed', dirty: false,
    menus: f.model.menus.map(m => ({ ...m, items: m.items.map(i => i.id === 'edit.undo' ? { ...i, enabled: true } : i) })) }));
  input.focus(); save.focus();
  assert.equal(save.isConnected, true); assert.equal(button(f.root, '.gc-standard [data-command="file.save"]'), save);
  assert.equal(save.firstElementChild, glyph); assert.equal(button(f.root, '[data-menu="file"]'), menu);
  assert.equal(button(f.root, '.gc-menu-popup [data-command="file.save"]'), item); assert.equal(button(f.root, '.gc-palette [data-command="view.panHold"]'), hand);
  save.click(); assert.deepEqual(f.commands, ['file.save']); chrome.dispose();
});

test('S10 reconciles command order and labels while removed, disabled or old-workspace targets stay inert', () => {
  const f = fixture(), chrome = createChrome(f.args);
  const save = button(f.root, '.gc-standard [data-command="file.save"]'), open = button(f.root, '.gc-standard [data-command="file.open"]');
  const changed: ChromeModel = { ...f.model, menus: [{ ...f.model.menus[0]!, items: [
    { ...f.model.menus[0]!.items[2]!, label: 'Save a copy', icon: 'export' }, { ...f.model.menus[0]!.items[1]!, enabled: false },
  ] }] };
  chrome.update(changed);
  assert.equal(f.root.querySelector('.gc-standard')!.firstElementChild, save); assert.equal(save.textContent, 'Save a copySave a copy');
  assert.equal(save.getAttribute('aria-label'), 'Save a copy (Ctrl+S)'); assert.equal(button(f.root, '.gc-standard [data-command="file.open"]'), open);
  open.dispatchEvent(new f.dom.window.MouseEvent('click', { bubbles: true })); assert.deepEqual(f.commands, []);
  chrome.update({ ...changed, menus: [{ ...changed.menus[0]!, items: [changed.menus[0]!.items[1]!] }] });
  assert.equal(save.isConnected, false); save.click(); assert.deepEqual(f.commands, []);
  const oldMenu = button(f.root, '[data-menu="file"]'); chrome.update({ ...f.model, workspace: 'image' });
  assert.notEqual(button(f.root, '[data-menu="file"]'), oldMenu); assert.equal(open.isConnected, false); open.click(); assert.deepEqual(f.commands, []);
  chrome.dispose();
});

test('S10 keeps distinct duplicate occurrences and removes unused command nodes', () => {
  const f = fixture(), duplicate = f.model.menus[0]!.items[2]!;
  const model: ChromeModel = { ...f.model, menus: [{ ...f.model.menus[0]!, items: [duplicate, duplicate] }] };
  const chrome = createChrome({ ...f.args, model }), before = [...f.root.querySelectorAll('.gc-standard button')];
  chrome.update({ ...model, title: 'Updated' }); [...f.root.querySelectorAll('.gc-standard button')].forEach((node, i) => assert.equal(node, before[i]));
  assert.notEqual(before[0], before[1]); chrome.update({ ...model, menus: [] });
  assert.equal(f.root.querySelectorAll('.gc-standard button,.gc-menu-trigger').length, 0); assert.equal(before.every(node => !node.isConnected), true);
  chrome.dispose();
});

for (const surface of ['toolbar', 'tool'] as const) test(`S10 disabled focused ${surface} hands focus to the viewport even when activeElement remains stale`, () => {
  const f = fixture(), chrome = createChrome(f.args);
  const control = button(f.root, surface === 'toolbar' ? '.gc-standard [data-command="file.open"]' : '.gc-palette [data-command="view.panHold"]');
  control.focus(); let attemptedDisabledFocus = 0;
  const focus = control.focus.bind(control);
  control.focus = options => { if (control.disabled) attemptedDisabledFocus++; focus(options); };
  // jsdom, like Chrome within this event, retains a just-disabled active element.
  control.disabled = true; assert.equal(f.document.activeElement, control); control.disabled = false;
  chrome.update(surface === 'toolbar' ? { ...f.model, menus: f.model.menus.map(menu => ({ ...menu, items: menu.items.map(item => item.id === 'file.open' ? { ...item, enabled: false } : item) })) } :
    { ...f.model, tools: f.model.tools.map(tool => tool.id === 'view.panHold' ? { ...tool, enabled: false } : tool) });
  assert.equal(attemptedDisabledFocus, 0); assert.equal(f.document.activeElement, chrome.viewport);
  assert.equal(control.disabled, true); chrome.dispose(); f.dom.window.close();
});

test('S10 removed focused commands return to the viewport and background updates keep outside focus', () => {
  const f = fixture(), chrome = createChrome(f.args);
  button(f.root, '.gc-standard [data-command="file.open"]').focus();
  chrome.update({ ...f.model, menus: [] }); assert.equal(f.document.activeElement, chrome.viewport);
  const outside = button(f.document, '#outside'); outside.focus();
  chrome.update(f.model); assert.equal(f.document.activeElement, outside);
  chrome.dispose(); f.dom.window.close();
});
