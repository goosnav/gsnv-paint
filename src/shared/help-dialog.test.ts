import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { showHelp } from './help-dialog.ts';
import type { HelpCommand, HelpSection } from './help-index.ts';

function fixture(section: HelpSection = 'search', commands?: readonly HelpCommand[]) {
  const dom = new JSDOM('<!doctype html><main><button id="opener">Help</button></main>');
  const document = dom.window.document, root = document.querySelector('main')!, opener = document.querySelector<HTMLButtonElement>('#opener')!;
  opener.focus(); Object.assign(dom.window.HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
    close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); },
  });
  const actions: string[] = [], states: boolean[] = []; let unlocked = false;
  const handle = showHelp({ document, root, workspace: 'image', section, commands: commands ?? [
    { id: 'image.text', label: 'Text', workspace: 'image', path: ['Tool palette'], shortcut: 'T', enabled: true, showMe: true },
    { id: 'image.flatten', label: 'Flatten image', workspace: 'image', path: ['Image'], enabled: true },
  ], onCommand(id) { actions.push(id); states.push(unlocked && !root.querySelector('dialog') && document.activeElement === opener); } });
  void handle.closed.then(() => { unlocked = true; });
  const dialog = root.querySelector('dialog')!, query = dialog.querySelector<HTMLInputElement>('input[type=search]')!;
  const button = (name: string) => [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === name)!;
  const search = (value: string) => { query.value = value; query.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  const key = (name: string, shiftKey = false, isComposing = false) => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, shiftKey, isComposing, bubbles: true, cancelable: true }));
  return { dom, document, root, opener, handle, dialog, query, actions, states, button, search, key };
}

test('HELP-DIALOG searches fonts and routes an enabled safe tool only after releasing the modal', async () => {
  const f = fixture(); assert.equal(f.document.activeElement, f.query); f.search('otf');
  assert.match(f.dialog.textContent!, /Import font…/); assert.match(f.dialog.textContent!, /click the canvas/);
  const action = f.button('Show me'); assert.ok(action); action.click(); action.click(); await f.handle.closed; await Promise.resolve();
  assert.deepEqual(f.actions, ['image.text']); assert.deepEqual(f.states, [true]); assert.equal(f.root.querySelector('dialog'), null); f.dom.window.close();
});

test('HELP-DIALOG never offers executable actions for destructive or unavailable commands', async () => {
  const f = fixture(); f.search('flatten'); assert.match(f.dialog.textContent!, /Image/); assert.equal(f.button('Show me'), undefined);
  f.search('doesnotexist'); assert.match(f.dialog.textContent!, /No matches/); assert.equal(f.button('Show me'), undefined); f.handle.close(); await f.handle.closed;
  const g = fixture('search', [{ id: 'image.text', label: 'Text', workspace: 'image', path: ['Tool palette'], enabled: false, showMe: true }]);
  g.search('otf'); assert.equal(g.button('Show me'), undefined); g.handle.close(); await g.handle.closed; assert.deepEqual(g.actions, []);
  f.dom.window.close(); g.dom.window.close();
});

test('HELP-DIALOG FAQ and getting started sections expose bundled instructions and keyboard navigation', async () => {
  const f = fixture('faq'); assert.equal(f.button('FAQ').getAttribute('aria-pressed'), 'true');
  f.dialog.querySelector<HTMLButtonElement>('[data-help-result="help.save"]')!.click();
  assert.match(f.dialog.textContent!, /saving a project/); f.button('Getting started').click();
  assert.equal(f.button('Getting started').getAttribute('aria-pressed'), 'true'); assert.match(f.dialog.textContent!, /canvas/);
  f.query.focus(); f.key('ArrowDown'); assert.ok((f.document.activeElement as HTMLElement).dataset.helpResult);
  f.key('ArrowDown'); const next = f.document.activeElement; f.key('ArrowUp'); assert.notEqual(f.document.activeElement, next);
  f.button('Close').focus(); f.key('Tab'); assert.equal(f.document.activeElement, f.query);
  f.query.focus(); f.key('Tab', true); assert.equal(f.document.activeElement, f.button('Close'));
  f.key('Escape'); await f.handle.closed; assert.equal(f.document.activeElement, f.opener); f.dom.window.close();
});

for (const method of ['close', 'button', 'native-cancel', 'native-close'] as const) test(`HELP-DIALOG ${method} closes once without invoking a command`, async () => {
  const f = fixture(); let closed = 0; void f.handle.closed.then(() => { closed++; });
  if (method === 'close') f.handle.close();
  if (method === 'button') f.button('Close').click();
  if (method === 'native-cancel') f.dialog.dispatchEvent(new f.dom.window.Event('cancel', { cancelable: true }));
  if (method === 'native-close') f.dialog.close();
  f.handle.close(); await f.handle.closed; assert.equal(closed, 1); assert.deepEqual(f.actions, []); assert.equal(f.document.activeElement, f.opener); f.dom.window.close();
});

test('HELP-DIALOG renders caller labels as text, preserves IME, and tolerates a removed opener', async () => {
  const f = fixture('search', [{ id: 'test.safe', label: '<img src=x onerror=alert(1)>', workspace: 'image', path: ['<script>'], enabled: true }]);
  f.search('onerror'); assert.match(f.dialog.textContent!, /<img/); assert.equal(f.dialog.querySelector('img,script'), null);
  f.query.focus(); f.key('Escape', false, true); assert.ok(f.root.querySelector('dialog')); f.opener.remove(); f.handle.close(); await f.handle.closed; f.dom.window.close();
});

test('HELP-DIALOG validates live document ownership and supported section before installing DOM', () => {
  const dom = new JSDOM('<main></main>'), document = dom.window.document, root = document.querySelector('main')!;
  const args = { document, root, workspace: 'image' as const, commands: [], section: 'search' as const, onCommand() {} };
  assert.throws(() => showHelp({ ...args, section: 'bad' } as never), TypeError); assert.equal(root.querySelector('dialog'), null);
  root.remove(); assert.throws(() => showHelp(args), TypeError); dom.window.close();
});

test('HELP-DIALOG rechecks caller command availability before dispatching a displayed action', async () => {
  const command: HelpCommand = { id: 'image.text', label: 'Text', workspace: 'image', path: ['Tool palette'], enabled: true, showMe: true };
  const f = fixture('search', [command]); f.search('otf'); const action = f.button('Show me'); command.enabled = false; action.click();
  assert.deepEqual(f.actions, []); assert.equal(action.disabled, true); assert.ok(f.root.querySelector('dialog'));
  f.handle.close(); await f.handle.closed; f.dom.window.close();
});
