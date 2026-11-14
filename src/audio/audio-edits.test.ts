import test from 'node:test';
import assert from 'node:assert/strict';
import { audioDocument, type AudioDocument } from './audio-document.ts';
import { audioSamples } from './audio-samples.ts';
import { audioEdits, AudioEditError } from './audio-edits.ts';
const imported = (samples = [0, .25, .5, .75, 1]) => audioDocument({ operation: 'import', id: 'take', sampleRate: 48000, channels: [new Float32Array(samples)] });
const samples = (value: AudioDocument) => [...audioSamples({ operation: 'render', value })[0]!];
test('A02 cut/copy/paste/delete/trim produce literal samples and retain previous history', () => {
  const value = imported();
  const cut = audioEdits({ operation: 'cut', value, start: 1, end: 3 });
  assert.deepEqual(samples(cut.value), [0, .75, 1]); assert.deepEqual(samples(cut.clipboard!), [.25, .5]); assert.deepEqual(cut.selection, { start: 1, end: 1 });
  assert.equal(cut.value.sources[0], value.sources[0]); assert.equal(cut.clipboard!.sources[0], value.sources[0]);
  const pasted = audioEdits({ operation: 'paste', value: cut.value, start: 1, end: 1, clipboard: cut.clipboard! });
  assert.deepEqual(samples(pasted.value), [0, .25, .5, .75, 1]); assert.deepEqual(pasted.selection, { start: 1, end: 3 });
  assert.deepEqual(samples(audioEdits({ operation: 'paste', value, start: 0, end: 4, clipboard: cut.clipboard! }).value), [.25, .5, 1]);
  assert.deepEqual(samples(audioEdits({ operation: 'trim', value, start: 1, end: 4 }).value), [.25, .5, .75]);
  assert.deepEqual(samples(audioEdits({ operation: 'delete', value, start: 0, end: 5 }).value), []);
  assert.equal(audioEdits({ operation: 'copy', value, start: 0, end: 2 }).value, value);
  assert.deepEqual(samples(value), [0, .25, .5, .75, 1]);
});
test('A02 fades span multiple pieces and keep their shape after splitting or native reopen', () => {
  const value = imported([1, 1, 1, 1, 1]);
  const clip = audioEdits({ operation: 'copy', value, start: 0, end: 2 }).clipboard!;
  const spliced = audioEdits({ operation: 'paste', value, start: 2, end: 4, clipboard: clip }).value;
  const faded = audioEdits({ operation: 'fadeIn', value: spliced, start: 0, end: 5 }).value;
  assert.deepEqual(samples(faded), [0, .25, .5, .75, 1]);
  const cut = audioEdits({ operation: 'cut', value: faded, start: 1, end: 4 });
  assert.deepEqual(samples(cut.value), [0, 1]); assert.deepEqual(samples(cut.clipboard!), [.25, .5, .75]);
  const stored = audioDocument({ operation: 'encode', value: cut.clipboard! });
  assert.deepEqual(samples(audioDocument({ operation: 'decode', content: stored.content, assets: stored.assets })), [.25, .5, .75]);
  assert.deepEqual(samples(audioEdits({ operation: 'fadeOut', value, start: 0, end: 5 }).value), [1, .75, .5, .25, 0]);
});
test('A02 volume and normalize keep stereo balance and leave silence unchanged', () => {
  const value = audioDocument({ operation: 'import', id: 'stereo', sampleRate: 48000, channels: [new Float32Array([.25, -.5]), new Float32Array([.125, .25])] });
  const normal = audioEdits({ operation: 'normalize', value, start: 0, end: 2, peak: 1 }).value;
  assert.deepEqual(audioSamples({ operation: 'render', value: normal }).map(c => [...c]), [[.5, -1], [.25, .5]]);
  assert.deepEqual(samples(audioEdits({ operation: 'gain', value, start: 0, end: 1, factor: 2 }).value), [.5, -.5]);
  const silence = imported([0, 0]); assert.equal(audioEdits({ operation: 'normalize', value: silence, start: 0, end: 2, peak: 1 }).value, silence);
});
test('A02 120 edits share source storage and deterministic clipboard ID collisions retain both recordings', () => {
  const value = imported(); let edited = value;
  for (let i = 0; i < 120; i++) edited = audioEdits({ operation: 'gain', value: edited, start: 0, end: 5, factor: .99 }).value;
  assert.equal(edited.sources[0], value.sources[0]); assert.deepEqual(samples(value), [0, .25, .5, .75, 1]);
  const other = imported([-.25, -.5]);
  const joined = audioEdits({ operation: 'paste', value, start: 5, end: 5, clipboard: other }).value;
  assert.deepEqual(samples(joined), [0, .25, .5, .75, 1, -.25, -.5]); assert.equal(joined.sources.length, 2);
  const repeated = audioEdits({ operation: 'paste', value: joined, start: 7, end: 7, clipboard: other }).value;
  assert.equal(repeated.sources.length, 2); assert.deepEqual(samples(repeated).slice(-4), [-.25, -.5, -.25, -.5]);
});
test('A02 invalid or empty selections, incompatible paste and invalid effect amounts preserve the document', () => {
  const value = imported();
  for (const [start, end] of [[-1, 2], [0, 6], [2, 1], [.5, 2], [2, 2]]) assert.throws(() => audioEdits({ operation: 'delete', value, start: start!, end: end! }), AudioEditError);
  assert.throws(() => audioEdits({ operation: 'fadeIn', value, start: 0, end: 1 }), AudioEditError);
  for (const factor of [-1, 65, Infinity]) assert.throws(() => audioEdits({ operation: 'gain', value, start: 0, end: 5, factor }), AudioEditError);
  assert.throws(() => audioEdits({ operation: 'normalize', value, start: 0, end: 5, peak: 0 }), AudioEditError);
  assert.throws(() => audioEdits({ operation: 'paste', value, start: 0, end: 0, clipboard: audioDocument({ operation: 'new', sampleRate: 44100 }) }), AudioEditError);
  assert.deepEqual(samples(value), [0, .25, .5, .75, 1]);
});
