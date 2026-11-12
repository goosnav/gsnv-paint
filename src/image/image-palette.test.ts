import { test } from 'node:test'; import assert from 'node:assert/strict'; import { JSDOM } from 'jsdom';
import { imagePalette, hex, parseHex, SWATCHES, DEFAULT_OPTIONS, OPTIONS, type PaletteChange } from './image-palette.ts';
import { IMAGE_TOOLS } from './image-tool-input.ts';

const setup = () => {
  const dom = new JSDOM('<div id="p"></div>'), root = dom.window.document.getElementById('p')!, changes: PaletteChange[] = [];
  const palette = imagePalette({ root, onChange: change => changes.push(change) });
  return { dom, root, changes, palette };
};
const fire = (dom: JSDOM, el: Element, type: string) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));

test('I-PALETTE swatches, colour inputs and swap report exact changes', () => {
  const { dom, root, changes, palette } = setup();
  palette.update({ primary: [0, 0, 0, 255], secondary: [255, 255, 255, 255], tool: 'brush', options: DEFAULT_OPTIONS, info: '640 × 480 px', enabled: true });
  assert.equal(root.querySelectorAll('[data-color]').length, SWATCHES.length); assert.equal(root.querySelector<HTMLInputElement>('.image-secondary')!.value, '#ffffff');
  const red = root.querySelector<HTMLButtonElement>('[data-color="#ff0000"]')!; red.click(); red.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  root.querySelector<HTMLButtonElement>('.image-swap')!.click();
  const input = root.querySelector<HTMLInputElement>('.image-primary')!; input.value = '#102030'; fire(dom, input, 'input');
  assert.deepEqual(changes, [{ kind: 'primary', color: [255, 0, 0, 255] }, { kind: 'secondary', color: [255, 0, 0, 255] }, { kind: 'swap' }, { kind: 'primary', color: [16, 32, 48, 255] }]);
  assert.equal(root.querySelector('.image-info')!.textContent, '640 × 480 px');
});

test('I-PALETTE each numeric option is a trackbar plus a typed box; typing applies on change and clamps', () => {
  const { dom, root, changes, palette } = setup();
  palette.update({ primary: [0, 0, 0, 255], secondary: [255, 255, 255, 255], tool: 'brush', options: DEFAULT_OPTIONS, info: '', enabled: true });
  assert.equal(root.querySelectorAll('input[type=range][data-option]').length, 4); assert.equal(root.querySelectorAll('input[type=number][data-option]').length, 4);
  const range = root.querySelector<HTMLInputElement>('input[type=range][data-option=size]')!, box = root.querySelector<HTMLInputElement>('input[type=number][data-option=size]')!;
  assert.equal(range.value, '8'); assert.equal(box.value, '8');
  range.value = '40'; fire(dom, range, 'input'); box.value = '12'; fire(dom, box, 'input'); fire(dom, box, 'change'); box.value = '9999'; fire(dom, box, 'change'); box.value = ''; fire(dom, box, 'change');
  assert.deepEqual(changes, [{ kind: 'option', key: 'size', value: 40 }, { kind: 'option', key: 'size', value: 12 }, { kind: 'option', key: 'size', value: 500 }]);
  palette.update({ primary: [0, 0, 0, 255], secondary: [255, 255, 255, 255], tool: 'fill', options: { ...DEFAULT_OPTIONS, contiguous: false }, info: '', enabled: true });
  const check = root.querySelector<HTMLInputElement>('input[type=checkbox][data-option=contiguous]')!; assert.equal(check.checked, false);
  check.checked = true; fire(dom, check, 'change'); assert.deepEqual(changes.at(-1), { kind: 'option', key: 'contiguous', value: true });
  palette.update({ primary: [0, 0, 0, 255], secondary: [255, 255, 255, 255], tool: 'gradient', options: DEFAULT_OPTIONS, info: '', enabled: true });
  const shape = root.querySelector<HTMLSelectElement>('select[data-option=gradient]')!; shape.value = 'radial'; fire(dom, shape, 'change'); assert.deepEqual(changes.at(-1), { kind: 'option', key: 'gradient', value: 'radial' });
  palette.update({ primary: [0, 0, 0, 255], secondary: [255, 255, 255, 255], tool: 'select', options: DEFAULT_OPTIONS, info: '', enabled: false });
  assert.match(root.textContent!, /no options/); assert.ok(root.querySelector<HTMLButtonElement>('.image-swap')!.disabled);
  for (const tool of IMAGE_TOOLS) assert.ok(Array.isArray(OPTIONS[tool]));
});

test('I-PALETTE colour text conversion is exact', () => {
  assert.equal(hex([1, 171, 255, 9]), '#01abff'); assert.deepEqual(parseHex('#01ABff'), [1, 171, 255, 255]); assert.throws(() => parseHex('red'), RangeError);
});
