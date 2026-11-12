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
  }, { title: 'Test document *', menus: ['File', 'Edit'], workspaces: [['CAD', 'true'], ['Image', 'false'], ['Video', 'false']], panels: ['Properties'], status: 'Ready' });
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
