import { test } from 'node:test'; import assert from 'node:assert/strict';
import { imageToolInput, pixelRect, IMAGE_TOOLS, type ImageToolState, type ImageTool } from './image-tool-input.ts';

const at = (kind: 'down' | 'move' | 'up', point: [number, number], button: 0 | 1 | 2 = 0, shift = false, ctrl = false) => ({ kind, point, button, shift, ctrl } as const);
const outside = () => false;
const run = (state: ImageToolState, event: Parameters<typeof imageToolInput>[0]['event'], inside: (p: [number, number]) => boolean = outside, floating = false) => imageToolInput({ state, event, inside, floating });
const tool = (t: ImageTool): ImageToolState => ({ tool: t, drag: null });

test('I-TOOLS freehand tools emit incremental segments and exactly one end', () => {
  for (const t of ['pencil', 'brush', 'airbrush', 'eraser', 'clone', 'blur'] as const) {
    let s = tool(t), r = run(s, at('down', [1, 1], 2)); assert.deepEqual(r.intent, { kind: 'stroke', points: [[1, 1]], button: 2, first: true }); s = r.state;
    r = run(s, at('move', [3, 1])); assert.deepEqual(r.intent, { kind: 'stroke', points: [[1, 1], [3, 1]], button: 2, first: false }); s = r.state;
    r = run(s, at('up', [3, 1])); assert.deepEqual(r.intent, { kind: 'stroke-end' }); assert.equal(r.state.drag, null);
  }
  assert.deepEqual(run(tool('brush'), at('move', [5, 5])).intent, { kind: 'hover', point: [5, 5] });
  assert.deepEqual(run(tool('brush'), at('down', [5, 5], 1)).intent, { kind: 'none' }, 'middle button is reserved for navigation');
  assert.equal(IMAGE_TOOLS.length, 18);
});

test('I-TOOLS shapes and gradients preview, constrain with Shift and commit on release', () => {
  let s = run(tool('rectangle'), at('down', [10, 10])).state;
  assert.deepEqual(run(s, at('move', [14, 30], 0, true)).intent, { kind: 'shape', a: [10, 10], b: [30, 30], button: 0, commit: false });
  assert.deepEqual(run(s, at('up', [14, 12])).intent, { kind: 'shape', a: [10, 10], b: [14, 12], button: 0, commit: true });
  assert.deepEqual(run(s, { kind: 'cancel' }).intent, { kind: 'cancel' });
  s = run(tool('gradient'), at('down', [0, 0])).state; assert.deepEqual(run(s, at('up', [10, 1], 0, true)).intent, { kind: 'shape', a: [0, 0], b: [10, 0], button: 0, commit: true });
  assert.deepEqual(run(s, { kind: 'tool', tool: 'pencil' }).intent, { kind: 'cancel' });
});

test('I-TOOLS selections: modes from modifiers, ellipse and lasso shapes, move inside, wand clicks', () => {
  let r = run(tool('select'), at('down', [2.5, 3.5])); assert.deepEqual(r.intent, { kind: 'marquee', shape: 'rectangle', points: [[2.5, 3.5]], mode: 'replace', commit: false, drop: false });
  assert.deepEqual(run(r.state, at('up', [2.9, 3.1])).intent, { kind: 'marquee', shape: 'rectangle', points: [], mode: 'replace', commit: true, drop: false });
  assert.deepEqual(run(r.state, at('up', [0.2, 6])).intent, { kind: 'marquee', shape: 'rectangle', points: [[2.5, 3.5], [0.2, 6]], mode: 'replace', commit: true, drop: false });
  assert.equal((run(tool('ellipseSelect'), at('down', [0, 0], 0, true)).intent as { mode: string }).mode, 'add');
  assert.equal((run(tool('select'), at('down', [0, 0], 0, false, true)).intent as { mode: string }).mode, 'subtract');
  r = run(tool('lasso'), at('down', [0, 0])); r = run(r.state, at('move', [5, 0])); r = run(r.state, at('up', [5, 5]));
  assert.deepEqual(r.intent, { kind: 'marquee', shape: 'polygon', points: [[0, 0], [5, 0], [5, 5]], mode: 'replace', commit: true, drop: false });
  const inside = () => true;
  r = run(tool('select'), at('down', [1, 1]), inside); assert.deepEqual(r.intent, { kind: 'move', dx: 0, dy: 0, lift: true, commit: false });
  assert.deepEqual(run(r.state, at('up', [3.6, 0.2]), inside).intent, { kind: 'move', dx: 3, dy: -1, lift: false, commit: true });
  assert.equal(run(tool('select'), at('down', [1, 1], 0, true), inside).intent.kind, 'marquee', 'Shift adds even inside the selection');
  assert.deepEqual(run(tool('move'), at('down', [1, 1]), outside, true).intent, { kind: 'move', dx: 0, dy: 0, lift: false, commit: false });
  assert.deepEqual(run(tool('select'), at('down', [9, 9]), outside, true).intent, { kind: 'marquee', shape: 'rectangle', points: [[9, 9]], mode: 'replace', commit: false, drop: true });
  assert.deepEqual(run(tool('wand'), at('down', [1, 2], 0, false, true)).intent, { kind: 'wand', point: [1, 2], mode: 'subtract' });
});

test('I-TOOLS single-click tools, clone source and validation', () => {
  assert.deepEqual(run(tool('fill'), at('down', [1, 2], 2)).intent, { kind: 'fill', point: [1, 2], button: 2 });
  assert.deepEqual(run(tool('picker'), at('down', [1, 2])).intent, { kind: 'pick', point: [1, 2], button: 0 });
  assert.deepEqual(run(tool('text'), at('down', [1, 2])).intent, { kind: 'text', point: [1, 2], button: 0 });
  assert.deepEqual(run(tool('clone'), at('down', [4, 5], 0, false, true)).intent, { kind: 'clone-source', point: [4, 5], button: 0 });
  assert.deepEqual(pixelRect([5.5, 1], [2, 1.9]), { x: 2, y: 1, width: 4, height: 1 });
  assert.throws(() => run({ tool: 'spray' as never, drag: null }, { kind: 'cancel' }), TypeError);
  assert.throws(() => run(tool('pencil'), at('down', [NaN, 0])), TypeError);
});
