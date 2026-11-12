import { test } from 'node:test'; import assert from 'node:assert/strict';
import { imageToolInput, pixelRect, type ImageToolState } from './image-tool-input.ts';

const at = (kind: 'down' | 'move' | 'up', point: [number, number], button: 0 | 1 | 2 = 0, shift = false) => ({ kind, point, button, shift } as const);
const run = (state: ImageToolState, event: Parameters<typeof imageToolInput>[0]['event'], selection = null as Parameters<typeof imageToolInput>[0]['selection'], floating = false) => imageToolInput({ state, event, selection, floating });

test('I-TOOLS freehand strokes emit incremental segments and exactly one end', () => {
  let s: ImageToolState = { tool: 'brush', drag: null };
  let r = run(s, at('down', [1, 1], 2)); assert.deepEqual(r.intent, { kind: 'stroke', points: [[1, 1]], button: 2, first: true }); s = r.state;
  r = run(s, at('move', [3, 1])); assert.deepEqual(r.intent, { kind: 'stroke', points: [[1, 1], [3, 1]], button: 2, first: false }); s = r.state;
  r = run(s, at('move', [3, 4])); assert.deepEqual(r.intent.kind === 'stroke' && r.intent.points, [[3, 1], [3, 4]]); s = r.state;
  r = run(s, at('up', [3, 4])); assert.deepEqual(r.intent, { kind: 'stroke-end' }); assert.equal(r.state.drag, null);
  assert.deepEqual(run(r.state, at('move', [5, 5])).intent, { kind: 'hover', point: [5, 5] });
  assert.deepEqual(run(r.state, at('down', [5, 5], 1)).intent, { kind: 'none' }, 'middle button is reserved for navigation');
});

test('I-TOOLS shapes preview, constrain with Shift and commit on release; cancel abandons', () => {
  let s: ImageToolState = { tool: 'rectangle', drag: null };
  s = run(s, at('down', [10, 10])).state;
  assert.deepEqual(run(s, at('move', [14, 30], 0, true)).intent, { kind: 'shape', a: [10, 10], b: [30, 30], button: 0, commit: false });
  assert.deepEqual(run(s, at('up', [14, 12])).intent, { kind: 'shape', a: [10, 10], b: [14, 12], button: 0, commit: true });
  const cancelled = run(s, { kind: 'cancel' }); assert.deepEqual(cancelled.intent, { kind: 'cancel' }); assert.equal(cancelled.state.drag, null);
  let line: ImageToolState = { tool: 'line', drag: null }; line = run(line, at('down', [0, 0])).state;
  assert.deepEqual(run(line, at('move', [10, 1], 0, true)).intent, { kind: 'shape', a: [0, 0], b: [10, 0], button: 0, commit: false });
  const diagonal = run(line, at('move', [10, 9], 0, true)).intent; assert.ok(diagonal.kind === 'shape' && diagonal.b[0] === diagonal.b[1]);
  assert.deepEqual(run({ tool: 'ellipse', drag: null }, { kind: 'tool', tool: 'pencil' }).intent, { kind: 'none' });
  assert.deepEqual(run(s, { kind: 'tool', tool: 'pencil' }).intent, { kind: 'cancel' });
});

test('I-TOOLS selection marquee, move/lift and drop of a floating selection', () => {
  let s: ImageToolState = { tool: 'select', drag: null };
  let r = run(s, at('down', [2.5, 3.5])); assert.deepEqual(r.intent, { kind: 'marquee', rect: null, commit: false, drop: false }); s = r.state;
  assert.deepEqual(run(s, at('up', [2.9, 3.1])).intent, { kind: 'marquee', rect: null, commit: true, drop: false }, 'a click clears the selection');
  assert.deepEqual(run(s, at('up', [0.2, 6])).intent, { kind: 'marquee', rect: { x: 0, y: 3, width: 3, height: 4 }, commit: true, drop: false });
  const selection = { x: 0, y: 0, width: 4, height: 4 };
  r = run({ tool: 'select', drag: null }, at('down', [1, 1]), selection); assert.deepEqual(r.intent, { kind: 'move', dx: 0, dy: 0, lift: true, commit: false });
  assert.deepEqual(run(r.state, at('up', [3.6, 0.2]), selection).intent, { kind: 'move', dx: 3, dy: -1, lift: false, commit: true });
  assert.equal((run({ tool: 'select', drag: null }, at('down', [1, 1]), selection, true).intent as { lift: boolean }).lift, false);
  assert.deepEqual(run({ tool: 'select', drag: null }, at('down', [9, 9]), selection, true).intent, { kind: 'marquee', rect: null, commit: false, drop: true });
});

test('I-TOOLS single-click tools and validation', () => {
  assert.deepEqual(run({ tool: 'fill', drag: null }, at('down', [1, 2], 2)).intent, { kind: 'fill', point: [1, 2], button: 2 });
  assert.deepEqual(run({ tool: 'picker', drag: null }, at('down', [1, 2])).intent, { kind: 'pick', point: [1, 2], button: 0 });
  assert.deepEqual(run({ tool: 'text', drag: null }, at('down', [1, 2])).intent, { kind: 'text', point: [1, 2], button: 0 });
  assert.deepEqual(pixelRect([5.5, 1], [2, 1.9]), { x: 2, y: 1, width: 4, height: 1 });
  assert.throws(() => run({ tool: 'spray' as never, drag: null }, { kind: 'cancel' }), TypeError);
  assert.throws(() => run({ tool: 'pencil', drag: null }, at('down', [NaN, 0])), TypeError);
});
