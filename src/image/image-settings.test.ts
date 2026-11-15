import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { imageNewDialog, imagePolicyDialog } from './image-settings.ts';
import { pixelPolicy, type PixelPolicy } from './image-pixel-policy.ts';
import { MAX_PIXELS, type Raster } from './raster-ops.ts';
import { showDialog, type DialogSpec } from '../shared/dialog.ts';

const raster = (): Raster => ({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) });
function valid(spec: DialogSpec, values: DialogSpec['initial'] = spec.initial) {
  const result = spec.validate(values); if (!result.ok) assert.fail(result.error.message); return result.value;
}
function context() { const dom = new JSDOM('<main></main>'); return { dom, document: dom.window.document }; }

test('IMAGE-SETTINGS New defaults to white 800×600 Pixel art with full colour and a live miniature', () => {
  const f = context(), created: unknown[] = [], spec = imageNewDialog({ document: f.document, colour: [18, 52, 86, 255], onCreate: value => created.push(value) });
  const value = valid(spec); spec.preview(value);
  assert.deepEqual(value, { width: 800, height: 600, fill: [255, 255, 255, 255], policy: { mode: 'pixel-art', palette: null } });
  assert.ok(spec.previewElement); assert.match(spec.previewElement.textContent!, /800 × 600/); assert.equal(created.length, 0);
  spec.commit(value); assert.deepEqual(created, [value]); f.dom.window.close();
});

test('IMAGE-SETTINGS New transparent/foreground backgrounds and strict palettes are explicit', () => {
  const f = context(), colour = [12, 34, 56, 128] as const, spec = imageNewDialog({ document: f.document, colour, onCreate() {} });
  for (const [background, fill] of [['transparent', [0, 0, 0, 0]], ['foreground', [...colour]]] as const) {
    const value = valid(spec, { ...spec.initial, width: 32, height: 24, background, mode: 'smooth', colours: '2', dither: 'bayer' }) as Record<string, unknown>;
    assert.deepEqual(value.fill, fill); assert.deepEqual(value.policy, { mode: 'smooth', palette: { colours: [[0, 0, 0], [255, 255, 255]], dither: 'bayer' } });
    spec.preview(value as never); assert.match(spec.previewElement.textContent!, /32 × 24/);
  }
  assert.deepEqual(colour, [12, 34, 56, 128]); f.dom.window.close();
});

test('IMAGE-SETTINGS New invalid sizes/choices never validate and exact pixel budget is accepted', () => {
  const f = context(), spec = imageNewDialog({ document: f.document, colour: [0, 0, 0, 255], onCreate() {} });
  for (const patch of [{ width: 0 }, { height: -1 }, { width: 1.5 }, { width: Infinity }, { width: '8' }, { width: MAX_PIXELS, height: 2 }, { background: 'unknown' }, { mode: 'gaussian' }, { colours: '3' }, { dither: 'random' }]) {
    const result = spec.validate({ ...spec.initial, ...patch }); assert.equal(result.ok, false, JSON.stringify(patch)); if (!result.ok) assert.ok(result.error.message);
  }
  valid(spec, { ...spec.initial, width: 4096, height: 4096 }); f.dom.window.close();
});

test('IMAGE-SETTINGS New cancellation never creates a canvas and validates supplied ports', () => {
  const f = context(), created: unknown[] = [], spec = imageNewDialog({ document: f.document, colour: [0, 0, 0, 255], onCreate: value => created.push(value) });
  spec.preview(valid(spec)); spec.cancel(); assert.deepEqual(created, []);
  for (const colour of [[0, 0, 0], [-1, 0, 0, 255], [0, 0, 0, 1.5]]) assert.throws(() => imageNewDialog({ document: f.document, colour, onCreate() {} } as never), TypeError);
  f.dom.window.close();
});

test('IMAGE-SETTINGS Pixel settings preserves custom current palette byte-for-byte until commit', () => {
  const f = context(), policy = pixelPolicy({ mode: 'smooth', palette: { colours: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], dither: 'floyd-steinberg' } });
  const previews: PixelPolicy[] = [], commits: PixelPolicy[] = []; let cancelled = 0;
  const image = raster(), before = [...image.data], spec = imagePolicyDialog({ document: f.document, policy, raster: image, onPreview: value => previews.push(value), onCommit: value => commits.push(value), onCancel() { cancelled++; } });
  assert.equal(spec.initial.colours, '3'); assert.equal(spec.initial.source, 'custom');
  const value = valid(spec); spec.preview(value); assert.deepEqual(previews, [policy]); assert.deepEqual(commits, []);
  spec.cancel(); assert.equal(cancelled, 1); assert.deepEqual(image.data, new Uint8ClampedArray(before)); assert.deepEqual(policy.palette?.colours, [[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  spec.commit(value); assert.deepEqual(commits, [policy]); f.dom.window.close();
});

test('IMAGE-SETTINGS Pixel settings generates source colours only when chosen and supports editable swatches', () => {
  const f = context(), spec = imagePolicyDialog({ document: f.document, policy: pixelPolicy(), raster: raster(), onPreview() {}, onCommit() {}, onCancel() {} });
  const generated = valid(spec, { ...spec.initial, colours: '2', source: 'generate', dither: 'none' });
  assert.deepEqual(generated, { mode: 'pixel-art', palette: { colours: [[0, 0, 255], [255, 0, 0]], dither: 'none' } });
  const custom = valid(spec, { ...spec.initial, colours: '2', source: 'custom', swatches: '#123456\nABCDEF', mode: 'smooth', dither: 'bayer' });
  assert.deepEqual(custom, { mode: 'smooth', palette: { colours: [[18, 52, 86], [171, 205, 239]], dither: 'bayer' } });
  assert.deepEqual(valid(spec, { ...spec.initial, colours: 'full', source: 'custom', swatches: 'ignored while full colour' }), { mode: 'pixel-art', palette: null });
  f.dom.window.close();
});

test('IMAGE-SETTINGS custom palette validation explains malformed, duplicate and wrong-count swatches', () => {
  const f = context(), spec = imagePolicyDialog({ document: f.document, policy: pixelPolicy(), raster: raster(), onPreview() {}, onCommit() {}, onCancel() {} });
  for (const swatches of ['', '#fff #ffffff', '#123456 #123456', '#123456', '#12gg56 #abcdef']) {
    const result = spec.validate({ ...spec.initial, colours: '2', source: 'custom', swatches }); assert.equal(result.ok, false, swatches);
    if (!result.ok) assert.match(result.error.message, /colour|swatch|hex|distinct|exactly/i);
  }
  for (const patch of [{ source: 'remote' }, { colours: '17' }, { mode: 'invalid' }, { dither: 'invalid' }]) assert.equal(spec.validate({ ...spec.initial, ...patch }).ok, false);
  f.dom.window.close();
});

test('IMAGE-SETTINGS previews own frozen policy copies and original metadata is untouched', () => {
  const f = context(), policy = pixelPolicy({ mode: 'pixel-art', palette: { colours: [[0, 0, 0], [255, 255, 255]], dither: 'none' } });
  const seen: PixelPolicy[] = [], spec = imagePolicyDialog({ document: f.document, policy, raster: raster(), onPreview: p => seen.push(p), onCommit() {}, onCancel() {} });
  const value = valid(spec, { ...spec.initial, mode: 'smooth' }); spec.preview(value);
  assert.equal(seen[0]!.mode, 'smooth'); assert.ok(Object.isFrozen(seen[0])); assert.notEqual(seen[0], policy); assert.equal(policy.mode, 'pixel-art');
  assert.match(spec.description!, /existing pixels/i); f.dom.window.close();
});

test('IMAGE-SETTINGS typed dialog mounts miniature, blocks invalid dimensions and confirms selected policy', () => {
  const f = context(), root = f.document.querySelector('main')!;
  Object.assign(f.dom.window.HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
    close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new f.dom.window.Event('close')); },
  });
  const created: unknown[] = [], spec = imageNewDialog({ document: f.document, colour: [0, 0, 0, 255], onCreate: value => created.push(value) });
  showDialog({ root, spec }); assert.equal(root.querySelector('figure'), spec.previewElement);
  const width = root.querySelector<HTMLInputElement>('[name=width]')!, create = [...root.querySelectorAll('button')].find(button => button.textContent === 'Create')!;
  width.value = '0'; width.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); assert.equal(create.disabled, true);
  width.value = '32'; width.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); assert.equal(create.disabled, false);
  const mode = root.querySelector<HTMLSelectElement>('[name=mode]')!; mode.value = 'smooth'; mode.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
  assert.match(spec.previewElement.textContent!, /32 × 600 px · Smooth artwork/); create.click();
  assert.deepEqual(created, [{ width: 32, height: 600, fill: [255, 255, 255, 255], policy: { mode: 'smooth', palette: null } }]); f.dom.window.close();
});
