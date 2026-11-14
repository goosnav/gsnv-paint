import test from 'node:test';
import assert from 'node:assert/strict';
import { audioDocument } from './audio-document.ts';
import { audioSamples, AudioSampleError } from './audio-samples.ts';

const value = audioDocument({ operation: 'import', id: 'take', sampleRate: 48000, channels: [new Float32Array([0, .5, -1, 2]), new Float32Array([1, -.5, .25, -2])] });
test('A03 samples, extrema and complete RIFF bytes match literal stereo golden', () => {
  assert.deepEqual(audioSamples({ operation: 'render', value }).map(c => [...c]), [[0, .5, -1, 2], [1, -.5, .25, -2]]);
  assert.deepEqual(audioSamples({ operation: 'waveform', value, buckets: 2 }), [[{ min: 0, max: .5 }, { min: -1, max: 2 }], [{ min: -.5, max: 1 }, { min: -2, max: .25 }]]);
  assert.equal(audioSamples({ operation: 'peak', value, start: 0, end: 2 }), 1);
  assert.equal(Buffer.from(audioSamples({ operation: 'wav', value })).toString('hex'), '524946463400000057415645666d7420100000000100020080bb000000ee02000400100064617461100000000000ff7f004000c000800020ff7f0080');
});
test('A03 ramps retain exact source coordinates after slicing and multiply without mutation', () => {
  const source = audioDocument({ operation: 'import', id: 'flat', sampleRate: 8000, channels: [new Float32Array([1, 1, 1, 1, 1])] });
  const edited = audioDocument({ operation: 'sequence', value: source, pieces: [{ ...source.pieces[0]!, gain: 2, offset: 1, length: 3, envelopes: [{ offset: -1, length: 5, from: 0, to: 1 }] }] });
  assert.deepEqual([...audioSamples({ operation: 'render', value: edited })[0]!], [.5, 1, 1.5]);
  assert.deepEqual([...audioSamples({ operation: 'render', value: edited, start: 1, end: 3 })[0]!], [1, 1.5]);
  assert.deepEqual([...audioSamples({ operation: 'render', value: source })[0]!], [1, 1, 1, 1, 1]);
});
test('A03 empty and single-sample buckets are defined and invalid ranges reject', () => {
  const empty = audioDocument({ operation: 'new' });
  assert.equal(audioSamples({ operation: 'peak', value: empty }), 0);
  assert.equal(audioSamples({ operation: 'wav', value: empty }).length, 44);
  assert.deepEqual(audioSamples({ operation: 'waveform', value: empty, buckets: 2 }), [[], []]);
  assert.equal(audioSamples({ operation: 'waveform', value, buckets: 100 })[0]!.length, 4);
  for (const start of [-1, .5, 5, NaN]) assert.throws(() => audioSamples({ operation: 'render', value, start }), AudioSampleError);
  assert.throws(() => audioSamples({ operation: 'render', value, start: 2, end: 1 }), AudioSampleError);
  for (const buckets of [0, 1.5, 16385]) assert.throws(() => audioSamples({ operation: 'waveform', value, buckets }), AudioSampleError);
});
test('A03 oversized repeated-source render/export rejects before output allocation', () => {
  const small = audioDocument({ operation: 'import', id: 'repeat', sampleRate: 192000, channels: [new Float32Array(10000), new Float32Array(10000)] });
  const long = audioDocument({ operation: 'sequence', value: small, pieces: Array.from({ length: 10000 }, () => small.pieces[0]!) });
  assert.throws(() => audioSamples({ operation: 'render', value: long }), AudioSampleError);
  assert.throws(() => audioSamples({ operation: 'wav', value: long }), AudioSampleError);
  const large = audioDocument({ operation: 'import', id: 'large', sampleRate: 8000, channels: [new Float32Array([3e38])] });
  const amplified = audioDocument({ operation: 'sequence', value: large, pieces: [{ ...large.pieces[0]!, gain: 2 }] });
  assert.throws(() => audioSamples({ operation: 'render', value: amplified }), AudioSampleError);
});
