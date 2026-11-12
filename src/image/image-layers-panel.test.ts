import { test } from 'node:test'; import assert from 'node:assert/strict'; import { JSDOM } from 'jsdom';
import { imageLayersPanel, type LayerAction } from './image-layers-panel.ts';

test('I-LAYERS lists top layer first, routes row and button actions, and gates impossible actions', () => {
  const dom = new JSDOM('<div id="p"></div>'), root = dom.window.document.getElementById('p')!, actions: LayerAction[] = [];
  const panel = imageLayersPanel({ root, onAction: a => actions.push(a) });
  const layers = [{ id: 'bg', name: 'Background', visible: true, opacity: 1, blend: 'normal' as const }, { id: 'ink', name: '<b>Ink</b>', visible: false, opacity: 0.5, blend: 'multiply' as const }];
  panel.update({ layers, activeLayerId: 'ink', thumbnails: new Map(), enabled: true });
  assert.deepEqual([...root.querySelectorAll('[data-layer-id]')].map(r => r.getAttribute('data-layer-id')), ['ink', 'bg']);
  assert.equal(root.querySelector('.image-layer-name')!.textContent, '<b>Ink</b>'); assert.equal(root.querySelectorAll('b').length, 0);
  assert.match(root.textContent!, /50% · Multiply/); assert.equal(root.querySelector<HTMLSelectElement>('#image-layer-blend')!.value, 'multiply'); assert.equal(root.querySelector<HTMLInputElement>('#image-layer-opacity')!.value, '50');
  assert.equal(root.querySelector<HTMLButtonElement>('[data-layer-action=up]')!.disabled, true); assert.equal(root.querySelector<HTMLButtonElement>('[data-layer-action=mergeDown]')!.disabled, false);
  (root.querySelector('[data-layer-id=bg] .image-layer-name') as HTMLElement).click();
  (root.querySelector('[data-layer-id=ink] [data-visibility]') as HTMLElement).click();
  root.querySelector('[data-layer-id=ink] .image-layer-name')!.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  root.querySelector<HTMLButtonElement>('[data-layer-action=duplicate]')!.click();
  const range = root.querySelector<HTMLInputElement>('#image-layer-opacity')!; range.value = '30'; range.dispatchEvent(new dom.window.Event('input', { bubbles: true })); range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const select = root.querySelector<HTMLSelectElement>('#image-layer-blend')!; select.value = 'screen'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(actions, [{ id: 'select', layerId: 'bg' }, { id: 'toggle', layerId: 'ink' }, { id: 'rename', layerId: 'ink' }, { id: 'duplicate' }, { id: 'opacity', value: 0.3, commit: false }, { id: 'opacity', value: 0.3, commit: true }, { id: 'blend', value: 'screen' }]);
  panel.update({ layers: [layers[0]!], activeLayerId: 'bg', thumbnails: new Map(), enabled: true });
  assert.equal(root.querySelector<HTMLButtonElement>('[data-layer-action=delete]')!.disabled, true);
  panel.dispose(); assert.equal(root.childElementCount, 0);
});
