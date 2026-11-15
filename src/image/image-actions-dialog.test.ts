import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { imageActionsDialog } from './image-actions-dialog.ts';
import { imageContent } from './image-content.ts';
import type { ImageRecipe } from './image-operation-types.ts';
import { showDialog } from '../shared/dialog.ts';

const recipe = (): ImageRecipe => ({ format: 'gsnv-actions', version: 1, name: 'My action', output: 'png', assets: [], steps: [
  { id: 'one', label: 'Invert', enabled: true, reference: { width: 2, height: 2 }, operation: { kind: 'adjust', adjustment: { kind: 'invert' } } },
  { id: 'two', label: 'Select all', enabled: true, reference: { width: 2, height: 2 }, operation: { kind: 'selection', action: 'all' } },
] });
const image = () => imageContent({ operation: 'new', width: 2, height: 2, fill: [255, 0, 0, 255] });
function fixture() {
  const dom = new JSDOM('<main></main>'), document = dom.window.document, changes: ImageRecipe[] = [], applied: ImageRecipe[] = [], errors: string[] = []; let previews = 0, stopped = 0, closed = 0;
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { value: () => ({ createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }), putImageData() {} }) });
  Object.defineProperty(dom.window.HTMLDialogElement.prototype, 'showModal', { value: function () { this.open = true; } });
  Object.defineProperty(dom.window.HTMLDialogElement.prototype, 'close', { value: function () { this.open = false; } });
  const options = { document, recipe: recipe(), source: image(), onChange: (value: ImageRecipe) => changes.push(value), onPreview: async (_value: ImageRecipe) => { previews++; return image(); }, onApply: (value: ImageRecipe) => applied.push(value), onStop: () => { stopped++; }, onClose: () => { closed++; }, onError: (message: string) => errors.push(message) };
  return { dom, document, options, changes, applied, errors, get previews() { return previews; }, get stopped() { return stopped; }, get closed() { return closed; } };
}
const button = (root: HTMLElement, text: string) => { const found = [...root.querySelectorAll('button')].find(node => node.textContent === text); assert.ok(found, text); return found; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('ACTIONS-DIALOG opening lists editable steps without previewing, applying or changing recipe', () => {
  const f = fixture(), before = recipe(), spec = imageActionsDialog(f.options); showDialog({ root: f.document.querySelector('main')!, spec });
  assert.equal(spec.title, 'Image actions'); assert.equal(spec.confirmLabel, 'Apply once'); assert.equal(f.previews, 0); assert.equal(f.applied.length, 0); assert.equal(f.changes.length, 0);
  assert.equal(spec.previewElement.querySelectorAll('[data-step-id]').length, 2); assert.deepEqual(f.options.recipe, before);
  assert.match(spec.previewElement.textContent!, /Preview on copy/); assert.match(spec.previewElement.textContent!, /Source/); f.dom.window.close();
});

test('ACTIONS-DIALOG enables, renames, reorders and removes owned steps with keyboard-operable controls', () => {
  const f = fixture(), spec = imageActionsDialog(f.options); showDialog({ root: f.document.querySelector('main')!, spec });
  const enabled = spec.previewElement.querySelector<HTMLInputElement>('[aria-label="Enable step 1"]')!; enabled.checked = false; enabled.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
  assert.equal(f.changes.at(-1)!.steps[0]!.enabled, false);
  const rename = spec.previewElement.querySelector<HTMLInputElement>('[aria-label="Step 1 name"]')!; rename.value = '<script>Literal label</script>'; rename.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
  assert.equal(f.changes.at(-1)!.steps[0]!.label, '<script>Literal label</script>'); assert.equal(spec.previewElement.querySelector('script'), null);
  const down = spec.previewElement.querySelector<HTMLButtonElement>('[aria-label="Move step 1 down"]')!; down.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.deepEqual(f.changes.at(-1)!.steps.map(step => step.id), ['two', 'one']); assert.equal(f.applied.length, 0);
  spec.previewElement.querySelector<HTMLButtonElement>('[aria-label="Remove step 2"]')!.click(); assert.equal(f.changes.at(-1)!.steps.length, 1); assert.equal(f.options.recipe.steps.length, 2); f.dom.window.close();
});

test('ACTIONS-DIALOG edits recipe name/output, blocks invalid fields and applies exactly on confirmation', () => {
  const f = fixture(), spec = imageActionsDialog(f.options); showDialog({ root: f.document.querySelector('main')!, spec });
  const name = f.document.querySelector<HTMLInputElement>('[name="name"]')!, output = f.document.querySelector<HTMLSelectElement>('[name="output"]')!, apply = button(f.document.body, 'Apply once');
  name.value = ''; name.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); assert.equal(apply.disabled, true);
  name.value = 'Colour pass'; output.value = 'project'; name.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
  assert.equal(apply.disabled, false); assert.equal(f.changes.at(-1)!.name, 'Colour pass'); assert.equal(f.changes.at(-1)!.output, 'project');
  apply.click(); assert.equal(f.applied.length, 1); assert.equal(f.applied[0]!.name, 'Colour pass'); assert.equal(f.closed, 1); assert.equal(f.previews, 0); f.dom.window.close();
});

test('ACTIONS-DIALOG explicit preview leaves source untouched and result is not applied', async () => {
  const f = fixture(), spec = imageActionsDialog(f.options), original = [...f.options.source.layers[0]!.tiles[0]!]; showDialog({ root: f.document.querySelector('main')!, spec });
  button(spec.previewElement, 'Preview on copy').click(); assert.equal(f.previews, 1); assert.equal(button(f.document.body, 'Apply once').disabled, true); await tick();
  assert.match(spec.previewElement.querySelector('[role="status"]')!.textContent!, /Preview ready/); assert.equal(button(f.document.body, 'Apply once').disabled, false); assert.equal(f.applied.length, 0);
  assert.deepEqual([...f.options.source.layers[0]!.tiles[0]!], original); assert.equal(spec.previewElement.querySelectorAll('canvas').length, 2); f.dom.window.close();
});

test('ACTIONS-DIALOG Stop and close reject stale preview completion and report current errors', async () => {
  const f = fixture(); let resolve!: (value: ReturnType<typeof image>) => void; f.options.onPreview = () => new Promise(done => { resolve = done; });
  const spec = imageActionsDialog(f.options); showDialog({ root: f.document.querySelector('main')!, spec }); button(spec.previewElement, 'Preview on copy').click(); button(spec.previewElement, 'Stop preview').click();
  assert.equal(f.stopped, 1); resolve(image()); await tick(); assert.match(spec.previewElement.querySelector('[role="status"]')!.textContent!, /stopped/i);
  button(spec.previewElement, 'Preview on copy').click(); spec.cancel(); resolve(image()); await tick(); assert.equal(f.stopped, 2); assert.equal(f.closed, 1); assert.equal(f.applied.length, 0); f.dom.window.close();
  const g = fixture(); g.options.onPreview = async () => { throw new Error('Step 2 has no selection.'); }; const failed = imageActionsDialog(g.options); showDialog({ root: g.document.querySelector('main')!, spec: failed });
  button(failed.previewElement, 'Preview on copy').click(); await tick(); assert.deepEqual(g.errors, ['Step 2 has no selection.']); assert.match(failed.previewElement.textContent!, /Step 2 has no selection/); g.dom.window.close();
});

test('ACTIONS-DIALOG invalid step names block preview/apply until repaired, and cancellation keeps edits only', () => {
  const f = fixture(), spec = imageActionsDialog(f.options); showDialog({ root: f.document.querySelector('main')!, spec });
  const name = spec.previewElement.querySelector<HTMLInputElement>('[aria-label="Step 1 name"]')!; name.value = ''; name.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
  assert.equal(button(f.document.body, 'Apply once').disabled, true); assert.equal(button(spec.previewElement, 'Preview on copy').disabled, true);
  name.value = 'Fixed step'; name.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); assert.equal(button(f.document.body, 'Apply once').disabled, false);
  button(f.document.body, 'Cancel').click(); assert.equal(f.closed, 1); assert.equal(f.changes.at(-1)!.steps[0]!.label, 'Fixed step'); assert.equal(f.applied.length, 0); f.dom.window.close();
});
