import { test } from 'node:test';
import assert from 'node:assert/strict';
import { history, type History } from './history.ts';

function commit<T>(state: History<T>, value: T, label = 'Edit'): History<T> {
  return history({ op: 'commit', history: state, value, label });
}

test('S01 golden: create, commit, undo and redo retain exact state and labels', () => {
  const initial = history({ op: 'create', value: 'blank' });
  assert.deepEqual(initial, { past: [], present: 'blank', future: [], limit: 100 });
  const drawn = commit(initial, 'line', 'Draw line');
  assert.deepEqual(drawn, {
    past: [{ label: 'Draw line', value: 'blank' }], present: 'line', future: [], limit: 100,
  });
  const undone = history({ op: 'undo', history: drawn });
  assert.deepEqual(undone, {
    past: [], present: 'blank', future: [{ label: 'Draw line', value: 'line' }], limit: 100,
  });
  assert.deepEqual(history({ op: 'redo', history: undone }), drawn);
});

test('S01 / CTL-021 retains at least 100 complete edits, with oldest-only eviction', () => {
  let state = history({ op: 'create', value: 0 });
  for (let i = 1; i <= 120; i++) state = commit(state, i, `Edit ${i}`);
  assert.equal(state.past.length, 100);
  assert.deepEqual(state.past[0], { label: 'Edit 21', value: 20 });
  state = history({ op: 'jump', history: state, offset: -100 });
  assert.equal(state.present, 20);
  assert.equal(state.future.length, 100);
  assert.equal(history({ op: 'jump', history: state, offset: 100 }).present, 120);
});

test('S01 undo/redo roundtrip property for 0 through 150 transactions', () => {
  for (let count = 0; count <= 150; count++) {
    let state = history({ op: 'create', value: 0, limit: 200 });
    for (let i = 1; i <= count; i++) state = commit(state, i);
    const undone = history({ op: 'jump', history: state, offset: -count });
    assert.equal(undone.present, 0);
    assert.deepEqual(history({ op: 'jump', history: undone, offset: count }), state);
  }
});

test('S01 branch after undo discards only the redo branch', () => {
  let state = history({ op: 'create', value: 'A' });
  state = commit(commit(state, 'B'), 'C');
  state = history({ op: 'undo', history: state });
  state = commit(state, 'D', 'Replacement');
  assert.deepEqual(state, {
    past: [{ label: 'Edit', value: 'A' }, { label: 'Replacement', value: 'B' }],
    present: 'D', future: [], limit: 100,
  });
});

test('S01 boundaries are no-ops and input arrays remain untouched', () => {
  const initial = Object.freeze({
    past: Object.freeze([]), present: 42, future: Object.freeze([]), limit: 100,
  });
  assert.strictEqual(history({ op: 'undo', history: initial }), initial);
  assert.strictEqual(history({ op: 'redo', history: initial }), initial);
  assert.strictEqual(history({ op: 'jump', history: initial, offset: 0 }), initial);
  const next = commit(initial, 43);
  assert.equal(initial.present, 42);
  assert.equal(initial.past.length, 0);
  assert.equal(next.past.length, 1);
});

test('S01 preserves immutable typed arrays, maps and bigint values without JSON conversion', () => {
  const tile = new Uint8Array([255, 0, 128, 255]);
  const original = { tiles: new Map([['0,0', tile]]), frame: 9007199254740993n };
  const state = history({ op: 'create', value: original });
  const edited = commit(state, { tiles: new Map(), frame: original.frame + 1n });
  assert.strictEqual(history({ op: 'undo', history: edited }).present, original);
  assert.strictEqual(original.tiles.get('0,0'), tile);
});

for (const limit of [0, 99, -1, 100.5, NaN, Infinity]) {
  test(`S01 invalid limit ${limit} raises RangeError`, () => {
    assert.throws(() => history({ op: 'create', value: 0, limit }), RangeError);
  });
}
for (const offset of [-1, 1, 0.5, NaN, Infinity]) {
  test(`S01 invalid jump ${offset} raises RangeError`, () => {
    const initial = history({ op: 'create', value: 0 });
    assert.throws(() => history({ op: 'jump', history: initial, offset }), RangeError);
  });
}
for (const label of ['', '   ', null, 7]) {
  test(`S01 invalid commit label ${String(label)} raises TypeError`, () => {
    const initial = history({ op: 'create', value: 0 });
    assert.throws(() => commit(initial, 1, label as string), TypeError);
  });
}
test('S01 invalid operation raises TypeError', () => {
  assert.throws(() => history({ op: 'remove' } as never), TypeError);
});
