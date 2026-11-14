import test from 'node:test';
import assert from 'node:assert/strict';
import { audioDocument, AudioContentError } from './audio-document.ts';
import { nativeContainer } from '../shared/native-container.ts';

const fixture = () => audioDocument({ operation: 'import', id: 'take', sampleRate: 48000, channels: [new Float32Array([0, -0, .5, -1]), new Float32Array([1, -.5, .25, 0])] });
test('A01 owned samples and complete native PCM golden survive the real container', () => {
  const input = new Float32Array([0, -0, .5, -1]);
  const mono = audioDocument({ operation: 'import', id: 'take', sampleRate: 48000, channels: [input] }); input.fill(9);
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => mono.sources[0]!.sample(0, i)), [0, -0, .5, -1]);
  assert.equal(Object.isFrozen(mono.sources[0]), true);
  const encoded = audioDocument({ operation: 'encode', value: fixture() });
  assert.deepEqual(encoded.content, { sampleRate: 48000, channels: 2, sources: [{ id: 'take', frames: 4, asset: 'pcm-take' }], pieces: [{ source: 'take', offset: 0, length: 4, gain: 1, envelopes: [] }] });
  assert.deepEqual([...encoded.assets[0]!.bytes], [0,0,0,0, 0,0,0,128, 0,0,0,63, 0,0,128,191, 0,0,128,63, 0,0,0,191, 0,0,128,62, 0,0,0,0]);
  const packed = nativeContainer({ op: 'encode', package: { project: { format: 'gsnv-audio', version: 1, id: 'song', title: 'Take', content: encoded.content }, assets: encoded.assets } });
  const unpacked = nativeContainer({ op: 'decode', parts: packed.parts });
  const reopened = audioDocument({ operation: 'decode', content: unpacked.project.content, assets: unpacked.assets });
  assert.deepEqual(audioDocument({ operation: 'encode', value: reopened }), encoded);
  encoded.assets[0]!.bytes.fill(0);
  assert.equal(reopened.sources[0]!.sample(1, 0), 1);
});
test('A01 sequence edits share owned source audio and freeze edit metadata', () => {
  const value = fixture();
  const edited = audioDocument({ operation: 'sequence', value, pieces: [{ ...value.pieces[0]!, offset: 1, length: 2, gain: .5, envelopes: [{ offset: -1, length: 4, from: 0, to: 1 }] }] });
  assert.equal(edited.sources[0], value.sources[0]); assert.equal(edited.frames, 2);
  assert.equal(value.frames, 4); assert.equal(value.pieces[0]!.gain, 1);
  assert.equal(Object.isFrozen(edited.pieces[0]!.envelopes[0]), true);
  assert.equal(audioDocument({ operation: 'sequence', value, pieces: [] }).sources.length, 0);
  assert.deepEqual(audioDocument({ operation: 'new' }), { sampleRate: 48000, channels: 2, frames: 0, sources: [], pieces: [] });
});
test('A01 rejects malformed sources, unsafe native metadata, references and sample limits', () => {
  for (const channels of [[], [new Float32Array([NaN])], [new Float32Array([Infinity])], [new Float32Array(2), new Float32Array(3)], Array.from({ length: 3 }, () => new Float32Array(2))]) {
    assert.throws(() => audioDocument({ operation: 'import', id: 'take', sampleRate: 48000, channels }), AudioContentError);
  }
  for (const rate of [0, 7999, 192001, 44100.5]) assert.throws(() => audioDocument({ operation: 'new', sampleRate: rate }), AudioContentError);
  const value = fixture();
  for (const patch of [{ source: 'missing' }, { offset: -1 }, { length: 5 }, { gain: NaN }, { gain: -1 }, { length: 0 }, { envelopes: [{ offset: 0, length: 1, from: 0, to: 1 }] }]) {
    assert.throws(() => audioDocument({ operation: 'sequence', value, pieces: [{ ...value.pieces[0]!, ...patch }] }), AudioContentError);
  }
  const encoded = audioDocument({ operation: 'encode', value });
  for (const content of [null, { ...encoded.content, extra: 1 }, { ...encoded.content, sampleRate: 0 }, { ...encoded.content, sources: [{ id: 'take', frames: 1e9, asset: 'pcm-take' }] }]) {
    assert.throws(() => audioDocument({ operation: 'decode', content, assets: encoded.assets }), AudioContentError);
  }
  assert.throws(() => audioDocument({ operation: 'decode', content: encoded.content, assets: [] }), AudioContentError);
  assert.throws(() => audioDocument({ operation: 'decode', content: encoded.content, assets: [{ ...encoded.assets[0]!, bytes: new Uint8Array(3) }] }), AudioContentError);
});
test('A01 duration, piece, envelope and gain limits reject without allocating a whole recording', () => {
  const value = audioDocument({ operation: 'import', id: 'silence', sampleRate: 8000, channels: [new Float32Array(1800)] });
  const pieces = Array.from({ length: 8000 }, () => value.pieces[0]!);
  assert.equal(audioDocument({ operation: 'sequence', value, pieces }).frames, 8000 * 1800);
  assert.throws(() => audioDocument({ operation: 'sequence', value, pieces: [...pieces, value.pieces[0]!] }), AudioContentError);
  assert.throws(() => audioDocument({ operation: 'sequence', value, pieces: Array.from({ length: 10001 }, () => value.pieces[0]!) }), AudioContentError);
  assert.throws(() => audioDocument({ operation: 'sequence', value, pieces: [{ ...value.pieces[0]!, gain: 1000001 }] }), AudioContentError);
  assert.throws(() => audioDocument({ operation: 'sequence', value, pieces: [{ ...value.pieces[0]!, envelopes: Array.from({ length: 65 }, () => ({ offset: 0, length: 2, from: 0, to: 1 })) }] }), AudioContentError);
});
