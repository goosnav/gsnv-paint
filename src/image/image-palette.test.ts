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
  assert.equal(root.querySelectorAll('input[type=range][data-option]').length, 5); assert.equal(root.querySelectorAll('input[type=number][data-option]').length, 5);
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

test('pointer coordinates update without rewriting controls; switching colour editor still refreshes', () => {
  const { dom, root, palette } = setup();
  const model = { primary: [0, 0, 0, 255] as const, secondary: [255, 255, 255, 255] as const,
    tool: 'brush' as const, options: DEFAULT_OPTIONS, info: '800 × 600 px', enabled: true };
  palette.update(model);
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(root, { attributes: true, childList: true, subtree: true });
  palette.update({ ...model, info: '800 × 600 px · 12, 34' });
  const info = root.querySelector('.image-info')!;
  assert.equal(info.textContent, '800 × 600 px · 12, 34');
  assert.ok(observer.takeRecords().every(record => record.target === info));
  observer.disconnect();

  // Selecting the already-active foreground colour still switches the editor
  // back from Background, even though the document's colour values are equal.
  const choice = root.querySelector<HTMLSelectElement>('[aria-label="Colour to edit"]')!;
  const hexBox = root.querySelector<HTMLInputElement>('[aria-label="Hex colour"]')!;
  choice.value = 'secondary'; fire(dom, choice, 'change');
  assert.equal(hexBox.value, '#ffffff');
  root.querySelector<HTMLButtonElement>('[data-color="#000000"]')!.click();
  palette.update(model);
  assert.equal(choice.value, 'primary'); assert.equal(hexBox.value, '#000000');
  palette.dispose(); dom.window.close();
});

test('focused numeric controls normalize clamped and invalid edits without waiting for a hover', () => {
  const { dom, root, palette } = setup();
  const model = { primary: [0, 0, 0, 255] as const, secondary: [255, 255, 255, 255] as const,
    tool: 'brush' as const, options: { ...DEFAULT_OPTIONS, size: 500 }, info: '', enabled: true };
  palette.update(model);
  const size = root.querySelector<HTMLInputElement>('input[type=number][data-option=size]')!;
  size.focus();
  size.value = '999'; fire(dom, size, 'change'); palette.update(model);
  assert.equal(size.value, '500');
  size.value = ''; fire(dom, size, 'change');
  assert.equal(size.value, '500');
  size.value = '0'; fire(dom, size, 'change');
  assert.equal(size.value, '1');
  palette.dispose(); dom.window.close();
});

test('I53 hard pixels default; pixel size and smooth-only options switch visibly and clamp', () => {
  const { dom, root, changes, palette } = setup();
  assert.equal(DEFAULT_OPTIONS.edge, 'pixel'); assert.equal(DEFAULT_OPTIONS.pixelSize, 1);
  const model = { primary: [0, 0, 0, 255] as const, secondary: [255, 255, 255, 255] as const, tool: 'brush' as const, options: DEFAULT_OPTIONS, info: '', enabled: true };
  palette.update(model);
  const edge = root.querySelector<HTMLSelectElement>('select[data-option=edge]')!;
  assert.equal(edge.value, 'pixel');
  const pixel = root.querySelector<HTMLInputElement>('input[type=number][data-option=pixelSize]')!;
  assert.equal(pixel.closest<HTMLElement>('.image-option')!.hidden, false);
  assert.equal(root.querySelector('[data-option=hardness]')!.closest<HTMLElement>('.image-option')!.hidden, true);
  pixel.value = '8'; fire(dom, pixel, 'change'); assert.deepEqual(changes.at(-1), { kind: 'option', key: 'pixelSize', value: 8 });
  pixel.value = '999'; fire(dom, pixel, 'change'); assert.equal((changes.at(-1) as any).value, 32);
  edge.value = 'smooth'; fire(dom, edge, 'change'); assert.deepEqual(changes.at(-1), { kind: 'option', key: 'edge', value: 'smooth' });
  palette.update({ ...model, options: { ...DEFAULT_OPTIONS, edge: 'smooth' } });
  assert.equal(pixel.closest<HTMLElement>('.image-option')!.hidden, true);
  assert.equal(root.querySelector('[data-option=hardness]')!.closest<HTMLElement>('.image-option')!.hidden, false);
  palette.dispose(); edge.dispatchEvent(new dom.window.Event('change', { bubbles: true })); assert.equal(changes.length, 3);
});

test('I53 expanded RGB/hex controls preserve compact swatches and emit exact opaque colours',()=>{
 const {dom,root,changes,palette}=setup(),model={primary:[10,20,30,255] as const,secondary:[40,50,60,255] as const,tool:'brush' as const,options:DEFAULT_OPTIONS,info:'',enabled:true};palette.update(model);
 const more=root.querySelector<HTMLDetailsElement>('.image-more-colours')!;assert.ok(more);assert.equal(more.open,false);assert.equal(root.querySelectorAll('[data-color]').length,28);
 const red=root.querySelector<HTMLInputElement>('input[type=range][data-channel="0"]')!,green=root.querySelector<HTMLInputElement>('input[type=number][data-channel="1"]')!,hexBox=root.querySelector<HTMLInputElement>('[aria-label="Hex colour"]')!;
 assert.equal(red.value,'10');assert.ok(red.classList.contains('xp-range'));red.value='120';fire(dom,red,'input');assert.deepEqual(changes.at(-1),{kind:'primary',color:[120,20,30,255]});
 green.value='260';fire(dom,green,'change');assert.deepEqual(changes.at(-1),{kind:'primary',color:[10,255,30,255]});
 hexBox.value='#1020ff';hexBox.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.deepEqual(changes.at(-1),{kind:'primary',color:[16,32,255,255]});
 const target=root.querySelector<HTMLSelectElement>('[aria-label="Colour to edit"]')!;target.value='secondary';fire(dom,target,'change');assert.equal(red.value,'40');assert.equal(hexBox.value,'#28323c');
 hexBox.value='aabbcc';fire(dom,hexBox,'change');assert.deepEqual(changes.at(-1),{kind:'secondary',color:[170,187,204,255]});
 palette.update({...model,secondary:[170,187,204,255]});assert.equal(root.querySelector<HTMLInputElement>('.image-secondary')!.value,'#aabbcc');assert.equal(red.value,'170');
 const before=changes.length;hexBox.value='wrong';fire(dom,hexBox,'change');assert.equal(changes.length,before);assert.equal(hexBox.getAttribute('aria-invalid'),'true');assert.match(root.querySelector('.image-colour-error')!.textContent!,/hex/i);
 hexBox.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(hexBox.value,'#aabbcc');assert.equal(hexBox.hasAttribute('aria-invalid'),false);
 green.value='';fire(dom,green,'change');assert.equal(changes.length,before);
 palette.update({...model,enabled:false});red.value='0';fire(dom,red,'input');assert.equal(changes.length,before);assert.equal(red.disabled,true);
 palette.dispose();dom.window.close();
});
