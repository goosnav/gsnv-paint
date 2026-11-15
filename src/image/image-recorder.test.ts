import test from 'node:test';
import assert from 'node:assert/strict';
import { imageRecorder, type ImageRecordingState } from './image-recorder.ts';
import { imageContent } from './image-content.ts';
import type { ImageOperation, ImageRecipeAsset } from './image-operation-types.ts';

const image = () => imageContent({ operation: 'new', width: 2, height: 2, fill: [255, 255, 255, 255] });
const copy: ImageOperation = { kind: 'clipboard', action: 'copy', source: 'canvas', background: [255, 255, 255, 255] };
const invert: ImageOperation = { kind: 'adjust', adjustment: { kind: 'invert' } };
const start = (a = image()) => imageRecorder({ kind: 'start', image: a, name: 'My action' });
const observe = (state: ImageRecordingState, before: ReturnType<typeof image>, after: ReturnType<typeof image>, operation: ImageOperation = invert, label = 'Invert') => imageRecorder({ kind: 'observe', state, before, after, label, operations: [{ operation, reference: { width: 2, height: 2 } }] });
const go = (state: ImageRecordingState, target: ReturnType<typeof image>) => imageRecorder({ kind: 'navigate', state, image: target });
const asset = (id = 'text'): ImageRecipeAsset => ({ id, width: 1, height: 1, data: new Uint8ClampedArray([8, 9, 10, 255]) });
const paste = (id = 'text'): ImageOperation => ({ kind: 'paste', source: { kind: 'asset', id }, name: 'Text', box: { x: 0, y: 0, width: 1, height: 1 }, sampling: 'nearest', select: true });

test('initial recording and first semantic step have exact portable recipe fields', () => {
  const a = image(), b = image(), first = start(a), next = observe(first, a, b);
  assert.equal(first.version, 1); assert.equal(first.status, 'recording'); assert.equal(first.reason, null);
  assert.deepEqual(first.recipe, { format: 'gsnv-actions', version: 1, name: 'My action', steps: [], assets: [], output: 'png' });
  assert.deepEqual(next.recipe, { format: 'gsnv-actions', version: 1, name: 'My action', steps: [{ id: 'step-1', label: 'Invert', enabled: true, reference: { width: 2, height: 2 }, operation: invert }], assets: [], output: 'png' });
  assert.ok(Object.isFrozen(next)); assert.ok(Object.isFrozen(next.recipe)); assert.ok(Object.isFrozen(next.recipe.steps));
  assert.ok(Object.isFrozen(next.recipe.steps[0]!.operation)); assert.equal(first.recipe.steps.length, 0);
});

test('cancelled previews do not record; copy without a history commit does', () => {
  const a = image(), b = image(); let state = start(a);
  assert.equal(imageRecorder({ kind: 'observe', state, before: a, after: a, label: 'Cancelled', operations: [] }), state);
  assert.equal(imageRecorder({ kind: 'observe', state, before: a, after: a, label: 'Cancelled', operations: null }), state);
  state = observe(state, a, a, copy, 'Copy canvas');
  state = observe(state, a, b);
  const undo = go(state, a); assert.deepEqual(undo.recipe.steps.map(s => s.label), ['Copy canvas']);
  assert.deepEqual(go(undo, b).recipe.steps.map(s => s.label), ['Copy canvas', 'Invert']);
  assert.equal(go(state, b), state);
});

test('a commit containing layer selection and drawing undoes as one transaction', () => {
  const a = image(), b = image();
  const state = imageRecorder({ kind: 'observe', state: start(a), before: a, after: b, label: 'Paint other layer', operations: [
    { operation: { kind: 'layer', action: 'select', index: 1 }, reference: { width: 2, height: 2 } },
    { operation: invert, reference: { width: 2, height: 2 } },
  ] });
  assert.deepEqual(state.recipe.steps.map(s => s.operation.kind), ['layer', 'adjust']);
  assert.equal(go(state, a).recipe.steps.length, 0);
  assert.equal(go(go(state, a), b).recipe.steps.length, 2);
});

test('Undo/Redo jumps track exact identities; a branch truncates future steps', () => {
  const a = image(), b = image(), c = image(), d = image();
  let state = observe(observe(start(a), a, b, invert, 'First'), b, c, invert, 'Second');
  assert.deepEqual(go(state, a).recipe.steps, []);
  assert.equal(go(go(state, a), c).recipe.steps.length, 2);
  state = observe(go(state, b), b, d, invert, 'Branch');
  assert.deepEqual(state.recipe.steps.map(s => [s.id, s.label]), [['step-1', 'First'], ['step-3', 'Branch']]);
  const paused = go(state, c); assert.equal(paused.status, 'paused'); assert.match(paused.reason!, /boundary|recording|history/i);
  assert.equal(paused.recipe, state.recipe);
});

test('copy after Undo explicitly branches; discarded Redo pauses rather than silently losing copy', () => {
  const a = image(), b = image(); const original = observe(start(a), a, b);
  const branch = observe(go(original, a), a, a, copy, 'Copy');
  assert.deepEqual(branch.recipe.steps.map(s => s.label), ['Copy']);
  const paused = go(branch, b); assert.equal(paused.status, 'paused'); assert.deepEqual(paused.recipe.steps.map(s => s.label), ['Copy']);
});

test('assets are owned, deduplicated by ID and pruned from effective undone branches', () => {
  const a = image(), b = image(), c = image(), d = image(), text = asset();
  let state = imageRecorder({ kind: 'observe', state: start(a), before: a, after: b, label: 'Text', operations: [{ operation: paste(), reference: { width: 2, height: 2 }, assets: [text] }] });
  text.data[0] = 200;
  assert.deepEqual(Array.from(state.recipe.assets[0]!.data), [8, 9, 10, 255]);
  const retained = state.recipe.assets[0];
  state = imageRecorder({ kind: 'observe', state, before: b, after: c, label: 'Paste again', operations: [{ operation: paste(), reference: { width: 2, height: 2 }, assets: [asset()] }] });
  assert.equal(state.recipe.assets.length, 1); assert.equal(state.recipe.assets[0], retained);
  assert.equal(go(state, a).recipe.assets.length, 0);
  assert.equal(go(go(state, a), c).recipe.assets.length, 1);
  const branch = observe(go(state, a), a, d);
  assert.equal(branch.recipe.assets.length, 0); assert.equal(branch.recipe.steps.length, 1);
});

test('asset reuse without resupply is valid, while conflicting IDs pause atomically', () => {
  const a = image(), b = image(), c = image();
  const state = imageRecorder({ kind: 'observe', state: start(a), before: a, after: b, label: 'Text', operations: [{ operation: paste(), reference: { width: 2, height: 2 }, assets: [asset()] }] });
  const reused = observe(state, b, c, paste(), 'Paste'); assert.equal(reused.status, 'recording'); assert.equal(reused.recipe.assets.length, 1);
  const conflicting = asset(); conflicting.data[0] = 42;
  const paused = imageRecorder({ kind: 'observe', state, before: b, after: c, label: 'Text', operations: [{ operation: paste(), reference: { width: 2, height: 2 }, assets: [conflicting] }] });
  assert.equal(paused.status, 'paused'); assert.match(paused.reason!, /asset.*(conflict|different|reused)/i); assert.equal(paused.recipe, state.recipe);
});

test('affine transforms retain their original full-size asset and reject missing asset references', () => {
  const a = image(), b = image();
  const operation: ImageOperation = { kind: 'affine', asset: 'original', box: { x: 0, y: 0, width: 2, height: 2, angle: 0 }, sampling: 'nearest', background: [0, 0, 0, 0] };
  const state = imageRecorder({ kind: 'observe', state: start(a), before: a, after: b, label: 'Scale paste', operations: [{ operation, reference: { width: 2, height: 2 }, assets: [asset('original')] }] });
  assert.equal(state.status, 'recording'); assert.equal(state.recipe.assets.length, 1); assert.equal(state.recipe.assets[0]!.id, 'original');
  assert.equal(go(state, a).recipe.assets.length, 0); assert.equal(go(go(state, a), b).recipe.assets.length, 1);
  const missing = observe(start(a), a, b, operation); assert.equal(missing.status, 'paused'); assert.match(missing.reason!, /Missing.*original/);
});

test('unsupported commits, missing assets and malformed semantics pause visibly without partial steps', () => {
  const a = image(), b = image(), state = start(a);
  for (const operations of [null, [], [{ operation: { kind: 'unknown' } as unknown as ImageOperation, reference: { width: 2, height: 2 } }], [{ operation: paste('missing'), reference: { width: 2, height: 2 } }], [{ operation: invert, reference: { width: 0, height: 2 } }]]) {
    const paused = imageRecorder({ kind: 'observe', state, before: a, after: b, label: 'Special edit', operations });
    assert.equal(paused.status, 'paused'); assert.match(paused.reason!, /Special edit/); assert.ok(paused.reason!.length > 20); assert.equal(paused.recipe, state.recipe);
    assert.equal(observe(paused, a, b), paused); assert.equal(go(paused, a), paused);
  }
  const mismatched = observe(state, image(), b); assert.equal(mismatched.status, 'paused'); assert.match(mismatched.reason!, /history|document/i);
});

test('a pre-recording or unknown history identity pauses, and stopping preserves the effective recipe', () => {
  const a = image(), b = image(), outside = image();
  const state = observe(start(a), a, b), paused = go(state, outside);
  assert.equal(paused.status, 'paused'); assert.match(paused.reason!, /boundary|outside/i);
  const stopped = imageRecorder({ kind: 'stop', state: go(state, a) });
  assert.equal(stopped.status, 'stopped'); assert.equal(stopped.recipe.steps.length, 0);
  assert.equal(imageRecorder({ kind: 'stop', state: stopped }), stopped);
  assert.equal(observe(stopped, a, b), stopped); assert.equal(go(stopped, b), stopped);
  assert.equal(imageRecorder({ kind: 'start', image: a, name: 'Again', output: 'project' }).recipe.output, 'project');
});

test('recording accepts exactly 1000 steps; one more pauses with all prior steps intact', () => {
  const a = image(), b = image();
  const operations = Array.from({ length: 1000 }, () => ({ operation: copy, reference: { width: 2, height: 2 } }));
  const full = imageRecorder({ kind: 'observe', state: start(a), before: a, after: b, label: 'Copies', operations });
  assert.equal(full.status, 'recording'); assert.equal(full.recipe.steps.length, 1000);
  const over = observe(full, b, b, copy); assert.equal(over.status, 'paused'); assert.match(over.reason!, /1000/); assert.equal(over.recipe, full.recipe);
});

test('the one-million-sample limit includes preceding commits', () => {
  const a = image();
  const stroke = (count: number): ImageOperation => ({ kind: 'stroke', tool: 'pencil', segments: [{ seed: 1, points: Array.from({ length: count }, () => [0, 0] as const) }], options: { size: 1, pixelSize: 1, edge: 'pixel', hardness: 1, opacity: 1, flow: 1, strength: 1, density: 1 }, color: [0, 0, 0, 255], background: [255, 255, 255, 255], cloneOffset: null });
  const half = stroke(500000);
  const first = observe(start(a), a, a, half), full = observe(first, a, a, half);
  assert.equal(full.status, 'recording'); assert.equal(full.recipe.steps.length, 2);
  const over = observe(full, a, a, stroke(1));
  assert.equal(over.status, 'paused'); assert.match(over.reason!, /million samples/); assert.equal(over.recipe, full.recipe);
});

test('decoded assets accept 128 MiB total and reject the next pixel atomically', () => {
  const a = image(), pixels = new Uint8ClampedArray(4096 * 4096 * 4);
  const entries = ['large-a', 'large-b'].map(id => ({ operation: paste(id), reference: { width: 2, height: 2 }, assets: [{ id, width: 4096, height: 4096, data: pixels }] }));
  const full = imageRecorder({ kind: 'observe', state: start(a), before: a, after: a, label: 'Large assets', operations: entries });
  assert.equal(full.status, 'recording'); assert.equal(full.recipe.assets.reduce((n, value) => n + value.data.byteLength, 0), 128 * 1024 * 1024);
  const over = imageRecorder({ kind: 'observe', state: full, before: a, after: a, label: 'One more pixel', operations: [{ operation: paste('extra'), reference: { width: 2, height: 2 }, assets: [asset('extra')] }] });
  assert.equal(over.status, 'paused'); assert.match(over.reason!, /128 MiB/); assert.equal(over.recipe, full.recipe);
});

test('start rejects invalid names, sizes, outputs and command kinds', () => {
  assert.throws(() => imageRecorder({ kind: 'start', image: image(), name: '' }), RangeError);
  assert.throws(() => imageRecorder({ kind: 'start', image: { ...image(), width: 0 }, name: 'Action' }), RangeError);
  assert.throws(() => imageRecorder({ kind: 'start', image: image(), name: 'Action', output: 'jpeg' as 'png' }), RangeError);
  assert.throws(() => imageRecorder({ kind: 'bad' } as never), TypeError);
});

test('operation inputs cannot mutate recorded steps and navigation is idempotent', () => {
  const a = image(), b = image(); const op: ImageOperation = { kind: 'move', dx: 1, dy: 0, background: [0, 0, 0, 0] };
  const state = observe(start(a), a, b, op); op.dx = 99;
  assert.equal((state.recipe.steps[0]!.operation as typeof op).dx, 1);
  const undo = go(state, a); assert.equal(go(undo, a), undo);
});
