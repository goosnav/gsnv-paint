import assert from 'node:assert/strict';
import test from 'node:test';
import { session, type Session, type SessionEvent } from './session.ts';

type Part = { readonly width: number };
const empty = <T>(): Session<T> => ({ workspace: 'cad', documents: {}, histories: {}, saved: {}, dirty: {}, message: '' });
const snapshot = (identity = 'r0', width = 100, id = 'plate') => ({
  id, title: 'Plate', format: 'gsnv-cad', version: 1, identity, value: { width },
});
const reduce = <T>(state: Session<T>, event: SessionEvent<T>) => {
  const result = session({ state, event });
  assert.deepEqual(result.effects, []);
  return result.state;
};
const opened = (isSaved = true) => reduce(empty<Part>(), { type: 'open', workspace: 'cad', snapshot: snapshot(), isSaved });
const changed = () => reduce(opened(), { type: 'commit', workspace: 'cad', snapshot: snapshot('r1', 120), label: 'Change width' });

test('S02 golden transcript preserves exact history, metadata and dirty state', () => {
  let state = changed();
  state = reduce(state, { type: 'undo', workspace: 'cad' });
  state = reduce(state, { type: 'redo', workspace: 'cad' });
  assert.deepEqual(state, {
    workspace: 'cad', documents: { cad: snapshot('r1', 120) },
    histories: { cad: { past: [{ label: 'Change width', value: snapshot() }], present: snapshot('r1', 120), future: [], limit: 100 } },
    saved: { cad: 'r0' }, dirty: { cad: true }, message: 'Redo Change width.',
  });
});

test('S02 unopened workspaces have no invented domain state', () => {
  const state = reduce(empty(), { type: 'switch', workspace: 'video' });
  assert.deepEqual(state, { ...empty(), workspace: 'video', message: 'Video workspace.' });
});

test('S02 each workspace owns independent histories and saved baselines', () => {
  let state = changed();
  const cad = state.histories.cad;
  state = reduce(state, { type: 'open', workspace: 'image', snapshot: { ...snapshot('i0', 4000, 'image'), format: 'gsnv-image' }, isSaved: false });
  state = reduce(state, { type: 'open', workspace: 'video', snapshot: { ...snapshot('v0', 1920, 'video'), format: 'gsnv-video' }, isSaved: true });
  state = reduce(state, { type: 'switch', workspace: 'image' });
  state = reduce(state, { type: 'commit', workspace: 'image', snapshot: { ...snapshot('i1', 2000, 'image'), format: 'gsnv-image' }, label: 'Resize' });
  assert.equal(state.histories.cad, cad);
  assert.equal(state.documents.video?.identity, 'v0');
  assert.deepEqual(state.dirty, { cad: true, image: true, video: false });
  assert.deepEqual(state.saved, { cad: 'r0', video: 'v0' });
  assert.equal(state.workspace, 'image');
});

test('S02 new documents are dirty; saved open resets history and baseline', () => {
  let state = opened(false);
  assert.equal(state.dirty.cad, true);
  assert.equal(state.saved.cad, undefined);
  state = reduce(changed(), { type: 'open', workspace: 'cad', snapshot: snapshot('new', 60, 'new'), isSaved: true });
  assert.equal(state.dirty.cad, false);
  assert.equal(state.saved.cad, 'new');
  assert.deepEqual(state.histories.cad?.past, []);
  state = reduce(state, { type: 'open', workspace: 'cad', snapshot: snapshot('fresh', 20, 'fresh'), isSaved: false });
  assert.equal(state.saved.cad, undefined);
  assert.equal(state.dirty.cad, true);
});

test('S02 undo/redo restores dirty state at the exact saved revision', () => {
  let state = reduce(changed(), { type: 'undo', workspace: 'cad' });
  assert.equal(state.dirty.cad, false);
  state = reduce(state, { type: 'redo', workspace: 'cad' });
  state = reduce(state, { type: 'saved', workspace: 'cad', documentId: 'plate', identity: 'r1' });
  assert.equal(state.dirty.cad, false);
  state = reduce(state, { type: 'undo', workspace: 'cad' });
  assert.equal(state.dirty.cad, true);
  state = reduce(state, { type: 'redo', workspace: 'cad' });
  assert.equal(state.dirty.cad, false);
});

test('S02 asynchronous save of an earlier revision leaves newer edits dirty', () => {
  const state = reduce(changed(), { type: 'saved', workspace: 'cad', documentId: 'plate', identity: 'r0' });
  assert.equal(state.dirty.cad, true);
  assert.equal(state.documents.cad?.value.width, 120);
  assert.equal(state.saved.cad, 'r0');
});

test('S02 late save completion after replacement is ignored', () => {
  const state = reduce(changed(), { type: 'open', workspace: 'cad', snapshot: snapshot('other', 1, 'other'), isSaved: false });
  assert.equal(reduce(state, { type: 'saved', workspace: 'cad', documentId: 'plate', identity: 'r1' }), state);
});

test('S02 a failed save reports status without losing dirty edits', () => {
  const before = changed();
  const after = reduce(before, { type: 'status', message: 'Save failed. Choose a writable location.' });
  assert.deepEqual(after, { ...before, message: 'Save failed. Choose a writable location.' });
});

test('S02 S01 seam: 120 commits retain 100 transactions and new edits discard redo', () => {
  let state = opened();
  for (let revision = 1; revision <= 120; revision++) {
    state = reduce(state, { type: 'commit', workspace: 'cad', snapshot: snapshot(`r${revision}`, revision), label: `Width ${revision}` });
  }
  assert.equal(state.histories.cad?.past.length, 100);
  for (let revision = 0; revision < 100; revision++) state = reduce(state, { type: 'undo', workspace: 'cad' });
  assert.equal(state.documents.cad?.identity, 'r20');
  assert.equal(state.dirty.cad, true);
  state = reduce(state, { type: 'commit', workspace: 'cad', snapshot: snapshot('branch', 555), label: 'Branch' });
  assert.deepEqual(state.histories.cad?.future, []);
});

test('S02 roundtrip property restores values and dirty states across revision sequences', () => {
  for (let count = 0; count < 40; count++) {
    let state = opened();
    for (let i = 1; i <= count; i++) state = reduce(state, { type: 'commit', workspace: 'cad', snapshot: snapshot(`r${i}`, i), label: `Width ${i}` });
    const edited = state.documents.cad;
    for (let i = 0; i < count; i++) state = reduce(state, { type: 'undo', workspace: 'cad' });
    assert.equal(state.dirty.cad, false);
    assert.deepEqual(state.documents.cad, snapshot());
    for (let i = 0; i < count; i++) state = reduce(state, { type: 'redo', workspace: 'cad' });
    assert.deepEqual(state.documents.cad, edited);
    assert.equal(state.dirty.cad, count > 0);
  }
});

test('S02 accepts immutable maps, typed arrays and bigint domain values without cloning', () => {
  const value = new Map([['tile', { time: 1n, bytes: new Uint8Array([255, 0, 0, 255]) }]]);
  const state = reduce(empty<typeof value>(), { type: 'open', workspace: 'image', snapshot: { ...snapshot(), value }, isSaved: false });
  assert.equal(state.documents.image?.value, value);
});

test('S02 frozen history/session inputs are unmodified, including boundary undo/redo', () => {
  const state = changed();
  for (const value of [state, state.documents, state.saved, state.dirty, state.histories,
    state.histories.cad!, state.histories.cad!.past, state.histories.cad!.future, state.documents.cad!]) Object.freeze(value);
  const original = structuredClone(state);
  reduce(state, { type: 'undo', workspace: 'cad' });
  reduce(state, { type: 'redo', workspace: 'cad' });
  reduce(state, { type: 'saved', workspace: 'cad', documentId: 'plate', identity: 'r1' });
  assert.deepEqual(state, original);
  assert.equal(reduce(opened(), { type: 'undo', workspace: 'cad' }).documents.cad?.identity, 'r0');
});

for (const event of [
  { type: 'undo', workspace: 'cad' }, { type: 'redo', workspace: 'cad' },
  { type: 'commit', workspace: 'cad', snapshot: snapshot(), label: 'Edit' },
  { type: 'saved', workspace: 'cad', documentId: 'plate', identity: 'r0' },
] as const) test(`S02 ${event.type} on an unopened workspace raises RangeError`, () => {
  assert.throws(() => session({ state: empty(), event }), RangeError);
});

const malformed: unknown[] = [
  null, {}, { type: 'mystery' }, { type: 'status', message: 1 }, { type: 'switch', workspace: 'other' },
  { type: 'undo' }, { type: 'open', workspace: 'cad', snapshot: snapshot() },
  ...[null, {}, { ...snapshot(), id: '' }, { ...snapshot(), identity: '' }, { ...snapshot(), version: Infinity },
    { ...snapshot(), title: 1 }, { ...snapshot(), format: false }].map(value => ({ type: 'open', workspace: 'cad', snapshot: value, isSaved: true })),
  { type: 'open', workspace: 'cad', snapshot: snapshot(), isSaved: 'true' },
  { type: 'commit', workspace: 'cad', snapshot: snapshot(), label: '' },
  { type: 'commit', workspace: 'cad', snapshot: snapshot(), label: '  ' },
  { type: 'saved', workspace: 'cad', documentId: '', identity: 'r0' },
  { type: 'saved', workspace: 'cad', documentId: 'plate', identity: '' },
];
for (const [index, event] of malformed.entries()) test(`S02 malformed event ${index} raises TypeError`, () => {
  assert.throws(() => session({ state: opened(), event: event as SessionEvent<Part> }), TypeError);
});
