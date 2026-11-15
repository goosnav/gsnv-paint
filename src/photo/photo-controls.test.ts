import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { photoControls, type ControlsState } from './photo-controls.ts';
import { defaultSettings, mergeSettings, type DevelopSettings } from './develop-settings.ts';

function fixture(change: Partial<DevelopSettings> = {}) {
  const dom = new JSDOM('<main></main>'), document = dom.window.document, root = document.querySelector('main')!;
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { value: () => null });
  let state: ControlsState = { settings: mergeSettings(defaultSettings(), change), histogram: null, enabled: true, cropMode: false, before: false, aspect: 'Free' };
  const commits: { change: Partial<DevelopSettings>; label: string }[] = [];
  const controls = photoControls({ root, onPreview(next) { update(next); }, onCommit(next, label) { commits.push({ change: next, label }); update(next); }, onAction() {} });
  function update(next: Partial<DevelopSettings>) { state = { ...state, settings: mergeSettings(state.settings, next) }; controls.update(state); }
  controls.update(state);
  return { dom, document, root, commits, controls, update, close() { controls.dispose(); dom.window.close(); } };
}

test('Photo label reset refreshes the focused range and keeps the next keyboard edit at zero', () => {
  const f = fixture({ exposure: 0.3 });
  try {
    const range = f.root.querySelector<HTMLInputElement>('#photo-exposure')!, label = f.root.querySelector('label[data-reset="exposure"]')!;
    // Native label activation focuses its associated range before dblclick fires.
    range.focus(); label.dispatchEvent(new f.dom.window.MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    assert.deepEqual(f.commits, [{ change: { exposure: 0 }, label: 'Reset Exposure' }]);
    assert.equal(f.document.activeElement, range, 'reset preserves keyboard focus');
    assert.equal(range.value, '0', 'range must reflect the committed reset even while focused');
    assert.equal(f.root.querySelector<HTMLInputElement>('[aria-label="Exposure value"]')!.value, '0.00');
    range.value = String(Number(range.value) + Number(range.step));
    range.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
    range.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
    assert.deepEqual(f.commits.at(-1), { change: { exposure: 0.05 }, label: 'Exposure' });
  } finally { f.close(); }
});

test('Photo colour mixer label reset refreshes its focused range', () => {
  const f = fixture({ hue: [12, 0, 0, 0, 0, 0, 0, 0] });
  try {
    const range = f.root.querySelector<HTMLInputElement>('#photo-band-red')!;
    range.focus(); f.root.querySelector('label[data-band="0"]')!.dispatchEvent(new f.dom.window.MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    assert.deepEqual(f.commits, [{ change: { hue: [0, 0, 0, 0, 0, 0, 0, 0] }, label: 'Reset colour' }]);
    assert.equal(range.value, '0'); assert.equal(f.document.activeElement, range);
  } finally { f.close(); }
});

test('Photo renders current ranges without replacing an unfinished typed number', () => {
  const f = fixture({ exposure: 0.3 });
  try {
    const number = f.root.querySelector<HTMLInputElement>('[aria-label="Exposure value"]')!;
    number.focus(); number.value = ''; f.update({ contrast: 15 });
    assert.equal(number.value, '', 'an in-progress number remains editable');
    assert.equal(f.root.querySelector<HTMLInputElement>('#photo-exposure')!.value, '0.3');
    assert.equal(f.root.querySelector<HTMLInputElement>('#photo-contrast')!.value, '15');
    assert.deepEqual(f.commits, []);
  } finally { f.close(); }
});
