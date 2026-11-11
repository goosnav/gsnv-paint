import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { showDialog, type DialogSpec } from './dialog.ts';

function fixture(patch: Partial<DialogSpec> = {}) {
  const dom = new JSDOM('<!doctype html><main id="app"><button id="opener">Edit</button></main>');
  const document = dom.window.document; const root = document.querySelector<HTMLElement>('#app')!;
  const opener = document.querySelector<HTMLButtonElement>('#opener')!; opener.focus();
  Object.assign(dom.window.HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
    close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); },
  });
  const previews: unknown[] = []; const commits: unknown[] = []; let cancels = 0;
  const spec: DialogSpec = { title: 'Edit rectangle', fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'width', label: 'Width', type: 'number', min: 0, max: 100 },
    { key: 'visible', label: 'Visible', type: 'checkbox' },
    { key: 'mode', label: 'Mode', type: 'select', choices: [{ value: 'fill', label: 'Fill' }, { value: 'stroke', label: 'Stroke' }] },
  ], initial: { name: '  Plate  ', width: 40, visible: true, mode: 'fill' },
  validate: values => values.name === 'bad' ? { ok: false, error: { code: 'name.invalid', message: 'Choose another name.' } } : { ok: true, value: { ...values, name: String(values.name).trim() } },
  preview: value => previews.push(value), commit: value => commits.push(value), cancel: () => { cancels++; }, ...patch };
  const open = () => showDialog({ root, spec });
  const field = (key: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${key}"]`)!;
  const button = (text: string) => [...root.querySelectorAll<HTMLButtonElement>('dialog button')].find(node => node.textContent === text)!;
  const key = (name: string, shiftKey = false, isComposing = false) => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, shiftKey, isComposing, bubbles: true, cancelable: true }));
  const input = (name: string, value: string) => { field(name).value = value; field(name).dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  return { dom, document, root, opener, spec, previews, commits, get cancels() { return cancels; }, open, field, button, key, input };
}

test('S11 golden modal renders typed fields and previews normalized initial values', () => {
  const f = fixture(); f.open();
  assert.deepEqual({ title: f.root.querySelector('dialog')?.getAttribute('aria-label'),
    fields: [...f.root.querySelectorAll('label')].map(label => [label.textContent, label.querySelector('input,select')?.getAttribute('name')]),
    values: [f.field('name').value, f.field('width').value, (f.field('visible') as HTMLInputElement).checked, f.field('mode').value],
    previews: f.previews, commits: f.commits, cancels: f.cancels,
  }, { title: 'Edit rectangle', fields: [['Name', 'name'], ['Width', 'width'], ['Visible', 'visible'], ['ModeFillStroke', 'mode']],
    values: ['  Plate  ', '40', true, 'fill'], previews: [{ name: 'Plate', width: 40, visible: true, mode: 'fill' }], commits: [], cancels: 0 });
  assert.equal(f.document.activeElement, f.field('name')); assert.equal(f.button('OK').disabled, false);
});

test('S11 valid edits preview typed normalized values without mutating the initial record', () => {
  const f = fixture(); Object.freeze(f.spec.initial); f.open();
  f.input('name', '  Changed  '); f.input('width', '0.25');
  (f.field('visible') as HTMLInputElement).checked = false;
  f.field('visible').dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); f.input('mode', 'stroke');
  assert.deepEqual(f.previews.at(-1), { name: 'Changed', width: .25, visible: false, mode: 'stroke' });
  assert.deepEqual(f.spec.initial, { name: '  Plate  ', width: 40, visible: true, mode: 'fill' });
  const preview = f.previews.at(-1); f.button('OK').click(); assert.equal(f.commits[0], preview);
});

for (const value of ['', '-1', '101', 'Infinity']) test(`S11 invalid numeric input ${JSON.stringify(value)} blocks preview and commit`, () => {
  const f = fixture(); f.open(); const count = f.previews.length; f.input('width', value);
  assert.equal(f.button('OK').disabled, true); assert.ok(f.root.querySelector('[role="alert"]')!.textContent!.length > 0);
  assert.equal(f.field('width').getAttribute('aria-invalid'), 'true'); f.field('width').focus(); f.key('Enter'); f.button('OK').click();
  assert.deepEqual(f.commits, []); assert.equal(f.previews.length, count); assert.ok(f.root.querySelector('dialog'));
});

test('S11 step and domain validation errors recover after valid edits', () => {
  const f = fixture(); f.spec.fields = [{ key: 'width', label: 'Width', type: 'number', min: 0, max: 100, step: .5 }]; f.spec.initial = { width: 0 };
  f.open(); f.input('width', '.25'); assert.equal(f.button('OK').disabled, true);
  f.input('width', '100'); assert.equal(f.button('OK').disabled, false);
  const g = fixture(); g.open(); const count = g.previews.length; g.input('name', 'bad');
  assert.equal(g.root.querySelector('[role="alert"]')!.textContent, 'Choose another name.');
  assert.equal(g.previews.length, count); assert.equal(g.button('OK').disabled, true);
  g.input('name', 'Good'); assert.equal(g.button('OK').disabled, false); assert.equal(g.root.querySelector('[role="alert"]')!.textContent, '');
});

test('S11 Enter commits once and later terminal actions are inert', () => {
  const f = fixture(); const handle = f.open(); const dialog = f.root.querySelector('dialog')!; const ok = f.button('OK');
  f.field('width').focus(); f.input('width', '60'); f.key('Enter'); ok.click(); handle.close(); dialog.dispatchEvent(new f.dom.window.Event('cancel', { cancelable: true }));
  assert.equal(f.commits.length, 1); assert.equal(f.cancels, 0); assert.equal(f.root.querySelector('dialog'), null); assert.equal(f.document.activeElement, f.opener);
});

for (const action of ['button', 'escape', 'native-cancel', 'native-close', 'handle'] as const) test(`S11 ${action} cancels exactly once and restores opener`, () => {
  const f = fixture(); const handle = f.open(); const dialog = f.root.querySelector('dialog')!;
  if (action === 'button') f.button('Cancel').click();
  if (action === 'escape') f.key('Escape');
  if (action === 'native-cancel') dialog.dispatchEvent(new f.dom.window.Event('cancel', { cancelable: true }));
  if (action === 'native-close') dialog.close();
  if (action === 'handle') handle.close();
  handle.close(); assert.equal(f.cancels, 1); assert.equal(f.commits.length, 0);
  assert.equal(f.root.querySelector('dialog'), null); assert.equal(f.document.activeElement, f.opener);
});

test('S11 Tab wraps, IME Enter/Escape remain native and terminal callback can reenter safely', () => {
  const f = fixture(); const handle = f.open();
  f.field('name').focus(); f.key('Tab', true); assert.equal(f.document.activeElement, f.button('Cancel'));
  f.button('Cancel').focus(); f.key('Tab'); assert.equal(f.document.activeElement, f.field('name'));
  f.key('Enter', false, true); f.key('Escape', false, true); assert.deepEqual(f.commits, []); assert.equal(f.cancels, 0);
  let reentries = 0; f.spec.cancel = () => { reentries++; handle.close(); }; handle.close(); assert.equal(reentries, 1);
});

test('S11 empty field list supports confirmation and safe literal copy', () => {
  const f = fixture({ title: '<script>bad</script>', fields: [], initial: {} }); f.open();
  assert.equal(f.root.querySelector('script'), null); assert.equal(f.document.activeElement, f.button('OK'));
  f.key('Enter'); assert.equal(f.commits.length, 1);
});

test('S11 rejects malformed fields, initial values, bounds and callbacks before mounting', () => {
  const patches: Partial<DialogSpec>[] = [
    { fields: [{ key: '', label: 'X', type: 'text' }] },
    { fields: [{ key: 'x', label: 'X', type: 'text' }, { key: 'x', label: 'X', type: 'text' }], initial: { x: '' } },
    { fields: [{ key: 'n', label: 'N', type: 'number', min: 2, max: 1 }], initial: { n: 1 } },
    { fields: [{ key: 'n', label: 'N', type: 'number', step: 0 }], initial: { n: 1 } },
    { fields: [{ key: 'n', label: 'N', type: 'number', max: Infinity }], initial: { n: 1 } },
    { fields: [{ key: 's', label: 'S', type: 'select', choices: [] }], initial: { s: '' } },
    { fields: [{ key: 's', label: 'S', type: 'select', choices: [{ value: 'a', label: 'A' }, { value: 'a', label: 'Again' }] }], initial: { s: 'a' } },
    { initial: { name: 'A', width: '40', visible: true, mode: 'fill' } },
    { initial: { name: 'A', width: NaN, visible: true, mode: 'fill' } },
    { initial: { name: 'A', width: 40, visible: true, mode: 'missing' } },
    { initial: { name: 'A', width: 40, visible: true, mode: 'fill', extra: 3 } },
    { validate: null! }, { preview: null! }, { commit: null! }, { cancel: null! },
  ];
  for (const patch of patches) { const f = fixture(patch); assert.throws(f.open, TypeError); assert.equal(f.root.querySelector('dialog'), null); assert.equal(f.previews.length, 0); }
  const f = fixture(); assert.throws(() => showDialog({ root: null!, spec: f.spec }), TypeError);
});

test('S11 Enter on Cancel cancels rather than committing', () => {
  const f = fixture(); f.open(); f.button('Cancel').focus(); f.key('Enter');
  assert.equal(f.cancels, 1); assert.equal(f.commits.length, 0); assert.equal(f.document.activeElement, f.opener);
});

test('S11 a reentrant preview cannot enable commit after a newer invalid edit', () => {
  const f = fixture(); f.open(); const preview = f.spec.preview;
  f.spec.preview = value => { preview(value); if (value && typeof value === 'object' && !Array.isArray(value) && value.width === 60) f.input('width', ''); };
  f.input('width', '60');
  assert.equal(f.field('width').value, ''); assert.equal(f.field('width').getAttribute('aria-invalid'), 'true');
  assert.equal(f.button('OK').disabled, true); f.field('width').focus(); f.key('Enter'); assert.equal(f.commits.length, 0);
});

test('S11 cancellation inside validation suppresses post-cancel previews', () => {
  const f = fixture(); const handle = f.open(); const validate = f.spec.validate; const count = f.previews.length;
  f.spec.validate = values => { handle.close(); return validate(values); };
  f.input('width', '60');
  assert.equal(f.cancels, 1); assert.equal(f.previews.length, count); assert.equal(f.root.querySelector('dialog'), null);
});

test('S11 newer valid edits replace a reentrant validator result', () => {
  const f = fixture(); f.open(); const validate = f.spec.validate;
  f.spec.validate = values => { if (values.width === 60) f.input('width', '70'); return validate(values); };
  f.input('width', '60'); f.button('OK').click();
  assert.deepEqual(f.previews.at(-1), { name: 'Plate', width: 70, visible: true, mode: 'fill' });
  assert.deepEqual(f.commits, [{ name: 'Plate', width: 70, visible: true, mode: 'fill' }]);
});

test('S11 initial preview cancellation never opens or retains the modal', () => {
  const f = fixture(); let shows = 0; const show = f.dom.window.HTMLDialogElement.prototype.showModal;
  f.dom.window.HTMLDialogElement.prototype.showModal = function () { shows++; show.call(this); };
  f.spec.preview = () => { f.root.querySelector('dialog')!.dispatchEvent(new f.dom.window.Event('cancel', { cancelable: true })); };
  const handle = f.open(); handle.close(); assert.equal(shows, 0); assert.equal(f.root.querySelector('dialog'), null); assert.equal(f.cancels, 1); assert.equal(f.document.activeElement, f.opener);
});

test('S11 missing modal support and disconnected roots produce readable errors without preview', () => {
  const f = fixture();
  assert.throws(() => showDialog({ root: f.document.createElement('div'), spec: f.spec }), TypeError);
  Object.defineProperty(f.dom.window.HTMLDialogElement.prototype, 'showModal', { value: undefined, configurable: true });
  assert.throws(f.open, /Modal dialogs are unavailable/);
  assert.deepEqual(f.previews, []); assert.equal(f.root.querySelector('dialog'), null);
});
