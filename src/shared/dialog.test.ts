import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { showDialog, type DialogSpec } from './dialog.ts';
import { bindInput } from './input-adapter.ts';

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

test('S11 save choice copy is literal text and the named confirmation retains Enter/Cancel behavior', () => {
  const f=fixture({description:'Keep <layers> editable.',confirmLabel:'Continue'});f.open();
  assert.equal(f.root.querySelector('.gc-dialog-description')?.textContent,'Keep <layers> editable.');
  assert.equal(f.root.querySelector('.gc-dialog-description layers'),null);
  assert.equal(f.button('Continue').title,'Continue (Enter)');f.key('Enter');assert.equal(f.commits.length,1);
  const g=fixture({confirmLabel:'Save'});g.open();g.key('Escape');assert.equal(g.cancels,1);assert.equal(g.commits.length,0);
});
test('S11 rejects malformed optional copy', () => {
  for(const patch of [{description:9},{confirmLabel:false},{confirmLabel:''}]) assert.throws(()=>fixture(patch as never).open(),TypeError);
});

test('S11 color control previews and commits a selected hex color without changing initial values', () => {
  const f = fixture({ fields: [{ key: 'color', label: 'Color', type: 'color' }], initial: { color: '#123456' }, validate: values => ({ ok: true, value: values }) });
  f.open(); assert.equal((f.field('color') as HTMLInputElement).type, 'color');
  assert.deepEqual(f.previews, [{ color: '#123456' }]); f.input('color', '#df258a');
  assert.deepEqual(f.previews.at(-1), { color: '#df258a' }); assert.deepEqual(f.spec.initial, { color: '#123456' });
  f.button('OK').click(); assert.deepEqual(f.commits, [{ color: '#df258a' }]); f.dom.window.close();
  for (const color of ['red', '#abc', '#12345g', '', 123456]) {
    const g = fixture({ fields: [{ key: 'color', label: 'Color', type: 'color' }], initial: { color } });
    assert.throws(g.open, TypeError); assert.equal(g.root.querySelector('dialog'), null); g.dom.window.close();
  }
});

test('S11 textarea Enter stays native through the actual global shortcut adapter', () => {
  const f = fixture({ fields: [{ key: 'text', label: 'Text', type: 'text', multiline: true }], initial: { text: 'First line' }, validate: values => ({ ok: true, value: values }) });
  Object.assign(f.root, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; } });
  const commands: string[] = [];
  const unbind = bindInput({ root: f.root, context: () => ({ workspace: 'image', target: 'view', viewRole: 'none', activeTool: 'text', status: '' }), onCommand: id => commands.push(id), onGesture() {} });
  f.open();
  for (const shiftKey of [false, true]) {
    const enter = new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true, cancelable: true });
    f.field('text').dispatchEvent(enter); assert.equal(enter.defaultPrevented, false); assert.deepEqual(commands, []);
  }
  assert.equal(f.commits.length, 0); assert.ok(f.root.querySelector('dialog'));
  f.input('text', 'First line\nSecond line');
  f.field('text').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.deepEqual(f.commits, [{ text: 'First line\nSecond line' }]); assert.deepEqual(commands, []);
  unbind(); f.dom.window.close();
});

test('S11 select Enter stays native without creating a document; Ctrl+Enter confirms', () => {
  const f = fixture(); f.open(); let bubbled = 0;
  f.root.addEventListener('keydown', () => { bubbled++; });
  const select = f.field('mode'); select.focus();
  const enter = new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  select.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, false); assert.equal(bubbled, 0);
  assert.equal(f.commits.length, 0); assert.ok(f.root.querySelector('dialog'));
  select.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(f.commits.length, 1); assert.equal(f.root.querySelector('dialog'), null); f.dom.window.close();
});

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

function linkedFixture() {
  return fixture({
    fields: [
      { key: 'preset', label: 'Preset', type: 'select', layout: 'stacked', choices: [{ value: 'paper', label: 'Paper' }, { value: 'wide', label: 'Wide' }, { value: 'custom', label: 'Custom' }] },
      { key: 'width', label: 'Width', type: 'number', min: 1, max: 4000, step: 1 },
      { key: 'height', label: 'Height', type: 'number', min: 1, max: 4000, step: 1, action: { label: 'Swap width and height', update: values => Number.isFinite(values.width) && Number.isFinite(values.height) ? { width: values.height, height: values.width, preset: 'custom' } : {} } },
      { key: 'transparent', label: 'Transparent', type: 'checkbox' },
    ],
    initial: { preset: 'paper', width: 2550, height: 3300, transparent: false },
    onChange(key, values) {
      assert.equal(Object.isFrozen(values), true);
      if (key !== 'preset') return { preset: 'custom' };
      return values.preset === 'paper' ? { width: 2550, height: 3300, transparent: false } : values.preset === 'wide' ? { width: 1920, height: 1080, transparent: true } : {};
    },
    validate: values => ({ ok: true, value: values }),
  });
}

test('S11 linked presets update all fields before a single preview and preserve caller values', () => {
  const f = linkedFixture(); Object.freeze(f.spec.initial); f.open();
  assert.ok(f.field('preset').closest('.gc-dialog-field-stacked'));
  const count = f.previews.length; f.input('preset', 'wide');
  assert.deepEqual(f.previews.slice(count), [{ preset: 'wide', width: 1920, height: 1080, transparent: true }]);
  assert.equal(f.field('width').value, '1920'); assert.equal(f.field('height').value, '1080');
  assert.equal((f.field('transparent') as HTMLInputElement).checked, true);
  assert.deepEqual(f.spec.initial, { preset: 'paper', width: 2550, height: 3300, transparent: false });
  assert.equal(f.commits.length, 0); f.input('width', '640');
  assert.equal(f.field('preset').value, 'custom');
  f.button('OK').click(); assert.deepEqual(f.commits, [{ preset: 'custom', width: 640, height: 1080, transparent: true }]);
  f.dom.window.close();
});

test('S11 choosing a preset repairs incomplete numeric fields before native validation', () => {
  const f = linkedFixture(); f.open(); const count = f.previews.length;
  f.input('width', ''); assert.equal(f.button('OK').disabled, true); assert.equal(f.previews.length, count);
  assert.equal(f.field('preset').value, 'custom'); f.input('preset', 'wide');
  assert.equal(f.button('OK').disabled, false); assert.equal(f.field('width').getAttribute('aria-invalid'), 'false');
  assert.deepEqual(f.previews.at(-1), { preset: 'wide', width: 1920, height: 1080, transparent: true });
  assert.equal(f.previews.length, count + 1); assert.equal(f.commits.length, 0);
  f.button('Cancel').click(); f.dom.window.close();
});

test('S11 Enter on a field action changes values without committing, keeps focus and cancels cleanly', () => {
  const f = linkedFixture(); f.open(); const action = f.button('Swap width and height'); action.focus(); f.key('Enter');
  assert.deepEqual(f.previews.at(-1), { preset: 'custom', width: 3300, height: 2550, transparent: false });
  assert.equal(f.commits.length, 0); assert.equal(f.document.activeElement, action); assert.ok(f.root.querySelector('dialog'));
  f.key('Enter'); assert.deepEqual(f.previews.at(-1), { preset: 'custom', width: 2550, height: 3300, transparent: false });
  f.key('Escape'); const count = f.previews.length; action.click();
  assert.equal(f.previews.length, count); assert.equal(f.cancels, 1); assert.equal(f.commits.length, 0); assert.equal(f.document.activeElement, f.opener);
  f.dom.window.close();
});

test('S11 invalid linked patches never half-apply or leave an old value committable', () => {
  const f = linkedFixture(); f.open(); const errors: unknown[] = [];
  f.dom.window.addEventListener('error', event => { event.preventDefault(); errors.push(event.error); });
  f.spec.onChange = () => ({ width: 640, missing: 'bad field' });
  f.input('preset', 'wide'); assert.equal(errors.length, 1); assert.ok(errors[0] instanceof TypeError);
  assert.equal(f.field('width').value, '2550'); assert.equal(f.field('height').value, '3300');
  assert.equal(f.button('OK').disabled, true); f.field('width').focus(); f.key('Enter'); assert.equal(f.commits.length, 0);
  f.button('Cancel').click(); f.dom.window.close();
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
    { onChange: null! },
    { fields: [{ key: 'name', label: 'Name', type: 'text', layout: 'row' as never }], initial: { name: '' } },
    { fields: [{ key: 'name', label: 'Name', type: 'text', action: { label: '', update: () => ({}) } }], initial: { name: '' } },
    { fields: [{ key: 'name', label: 'Name', type: 'text', action: { label: 'Change', update: null! } }], initial: { name: '' } },
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

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function importFixture(run: () => Promise<{ value: string; label: string; notice?: string } | null>, loadChoices?: () => Promise<{ choices: { value: string; label: string }[]; notice?: string }>) {
  const choices = [{ value: 'base', label: 'Built in' }];
  const f = fixture({ fields: [{ key: 'name', label: 'Name', type: 'text', multiline: true }, { key: 'font', label: 'Font', type: 'select', choices, importChoice: { label: 'Import font…', run }, ...(loadChoices ? { loadChoices } : {}) }], initial: { name: 'First\nSecond', font: 'base' }, validate: value => ({ ok: true, value }) });
  return { ...f, choices };
}
test('FONT-01/04 async select import preserves fields, blocks premature commit, selects and previews only when ready', async () => {
  let resolve!: (value: { value: string; label: string }) => void;
  const f = importFixture(() => new Promise(r => { resolve = r; })); f.open();
  f.button('Import font…').focus(); f.key('Enter');
  assert.equal(f.button('OK').disabled, true); f.button('OK').click(); assert.equal(f.commits.length, 0);
  f.input('name', 'Edited\nText'); assert.equal(f.button('OK').disabled, true);
  resolve({ value: 'custom', label: '<My Font>' }); await tick();
  assert.equal(f.field('name').value, 'Edited\nText'); assert.equal(f.field('font').value, 'custom');
  assert.deepEqual(f.previews.at(-1), { name: 'Edited\nText', font: 'custom' });
  assert.equal(f.root.querySelector('My'), null); assert.equal(f.choices.length, 1);
  f.button('OK').click(); assert.deepEqual(f.commits.at(-1), f.previews.at(-1)); f.dom.window.close();
});
test('FONT-04 canceled picker and failed import retain the existing choice and editable text', async () => {
  for (const run of [async () => null, async () => { throw new Error('Unreadable font.'); }]) {
    const f = importFixture(run); f.open(); f.button('Import font…').click(); await tick();
    assert.equal(f.field('font').value, 'base'); assert.equal(f.field('name').value, 'First\nSecond');
    assert.equal(f.button('OK').disabled, false);
    if (run.toString().includes('throw')) assert.match(f.root.textContent!, /Unreadable font/);
    f.button('Cancel').click(); f.dom.window.close();
  }
});
test('FONT-04 cancel is terminal during restoration or import, including rejected late work', async () => {
  for (const restore of [false, true]) {
    let reject!: (error: Error) => void;
    const waiting = () => new Promise<never>((_, r) => { reject = r; });
    const f = importFixture(waiting, restore ? waiting : undefined); f.open();
    if (!restore) f.button('Import font…').click();
    f.button('Cancel').click(); reject(new Error('Late failure')); await tick();
    assert.equal(f.root.querySelector('dialog'), null); assert.equal(f.commits.length, 0); f.dom.window.close();
  }
});
test('FONT-02/03 restored choices retain current selection and report a storage warning without blocking built-ins', async () => {
  const f = importFixture(async () => ({ value: 'custom', label: 'Custom', notice: 'Session only.' }), async () => ({ choices: [{ value: 'old', label: 'Old font' }], notice: 'One font unavailable.' }));
  f.open(); assert.equal(f.button('OK').disabled, true); await tick();
  assert.equal(f.field('font').value, 'base'); assert.equal(f.root.querySelectorAll('option').length, 2);
  assert.match(f.root.textContent!, /One font unavailable/);
  f.button('Import font…').click(); await tick(); assert.match(f.root.textContent!, /Session only/);
  f.button('Import font…').click(); await tick(); assert.equal(f.root.querySelectorAll('option').length, 3);
  f.button('OK').click(); assert.equal(f.commits.length, 1); f.dom.window.close();
});

test('PU-04 dialogs mount an owned live preview and remove it on cancel', () => {
 const f=fixture();const preview=f.document.createElement('output');preview.textContent='800 × 600';f.spec.previewElement=preview;
 f.open();assert.equal(preview.closest('dialog'),f.root.querySelector('dialog'));f.button('Cancel').click();assert.equal(preview.isConnected,false);f.dom.window.close();
});
