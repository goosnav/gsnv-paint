import { test } from 'node:test'; import assert from 'node:assert/strict'; import { JSDOM } from 'jsdom';
import { imagePalette, hex, parseHex, SWATCHES, type PaletteChange } from './image-palette.ts';

test('I-PALETTE swatches, sizes, colour inputs and style report exact changes', () => {
  const dom = new JSDOM('<div id="p"></div>'), root = dom.window.document.getElementById('p')!, changes: PaletteChange[] = [];
  const palette = imagePalette({ root, onChange: change => changes.push(change) });
  palette.update({ primary: [0, 0, 0, 255], secondary: [255, 255, 255, 255], size: 3, style: 'outline', info: '640 × 480 px', enabled: true });
  assert.equal(root.querySelectorAll('[data-color]').length, SWATCHES.length);
  assert.equal(root.querySelector<HTMLInputElement>('.image-secondary')!.value, '#ffffff');
  assert.equal(root.querySelector('[data-size="3"]')!.getAttribute('aria-checked'), 'true');
  const red = root.querySelector<HTMLButtonElement>('[data-color="#ed1c24"]')!;
  red.click(); red.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  root.querySelector<HTMLButtonElement>('[data-size="8"]')!.click(); root.querySelector<HTMLButtonElement>('.image-swap')!.click();
  const input = root.querySelector<HTMLInputElement>('.image-primary')!; input.value = '#102030'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const size = root.querySelector<HTMLInputElement>('.image-size-input')!; size.value = '700'; size.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  size.value = '42'; size.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const style = root.querySelector<HTMLSelectElement>('.image-style')!; style.value = 'both'; style.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(changes, [
    { kind: 'primary', color: [237, 28, 36, 255] }, { kind: 'secondary', color: [237, 28, 36, 255] }, { kind: 'size', size: 8 }, { kind: 'swap' },
    { kind: 'primary', color: [16, 32, 48, 255] }, { kind: 'size', size: 42 }, { kind: 'style', style: 'both' },
  ]);
  assert.equal(root.querySelector('.image-info')!.textContent, '640 × 480 px');
  palette.update({ primary: [0, 0, 0, 255], secondary: [255, 255, 255, 255], size: 3, style: 'outline', info: '', enabled: false });
  assert.ok(red.disabled); palette.dispose(); assert.equal(root.childElementCount, 0);
});

test('I-PALETTE colour text conversion is exact', () => {
  assert.equal(hex([1, 171, 255, 9]), '#01abff'); assert.deepEqual(parseHex('#01ABff'), [1, 171, 255, 255]);
  assert.throws(() => parseHex('red'), RangeError);
});
