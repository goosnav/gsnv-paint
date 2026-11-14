/**
 * PURPOSE    Read an audio piece sequence as samples, waveform extrema or PCM16 WAV.
 * KIND       CORE
 * CONTRACT   IN: validated A01 document, half-open frame range, and a render/peak/waveform/WAV request.
 *            OUT: owned Float32 channels, absolute peak, per-channel min/max buckets, or interleaved PCM16 WAV.
 *            Linear fades clamp outside their span; gain multiplies before PCM16 clipping/rounding.
 *            WAV clips [-1,1], rounds negative samples against 32768 and nonnegative against 32767.
 *            RAISES: AudioSampleError for invalid ranges/buckets, nonfinite rendered PCM or output size overflow.
 * GUARANTEES Pure deterministic reads, no source mutation; waveform and peak scan without a full audio copy.
 * TUNING     MAX_OUTPUT_BYTES=256MiB; MAX_BUCKETS=16384; RIFF UINT32 size limit also enforced.
 * DECISIONS  D1: Stream over pieces for waveform/peak. Alternative: flattening would allocate full recording copies.
 *            Revisit if measured long-recording scans require a multiresolution cache.
 * LIMITS     PCM16 WAV only, no dither or compression. Rendered float32 overflow rejects instead of emitting infinity.
 * TESTBENCH  src/audio/audio-samples.test.ts -- run with: node --import tsx --test src/audio/audio-samples.test.ts
 */
import type { AudioDocument } from './audio-document.ts';
export class AudioSampleError extends Error { override name = 'AudioSampleError'; }
type Base = { value: AudioDocument; start?: number; end?: number };
type Request = Base & ({ operation: 'render' } | { operation: 'peak' } | { operation: 'waveform'; buckets: number } | { operation: 'wav' });
type Bucket = { min: number; max: number };
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024, MAX_BUCKETS = 16384;
const fail = (message: string): never => { throw new AudioSampleError(message); };
function visit(value: AudioDocument, start: number, end: number, write: (frame: number, channel: number, sample: number) => void) {
  const sources = new Map(value.sources.map(source => [source.id, source])); let position = 0;
  for (const piece of value.pieces) {
    const from = Math.max(0, start - position), to = Math.min(piece.length, end - position), source = sources.get(piece.source)!;
    for (let frame = from; frame < to; frame++) {
      let gain = piece.gain;
      for (const envelope of piece.envelopes) {
        const t = Math.max(0, Math.min(1, (frame - envelope.offset) / (envelope.length - 1)));
        gain *= envelope.from + (envelope.to - envelope.from) * t;
      }
      for (let channel = 0; channel < value.channels; channel++) write(position + frame - start, channel, source.sample(channel, piece.offset + frame) * gain);
    }
    position += piece.length; if (position >= end) break;
  }
}
function audioSamples(request: Base & { operation: 'render' }): Float32Array[];
function audioSamples(request: Base & { operation: 'peak' }): number;
function audioSamples(request: Base & { operation: 'waveform'; buckets: number }): Bucket[][];
function audioSamples(request: Base & { operation: 'wav' }): Uint8Array;
function audioSamples(request: Request): Float32Array[] | number | Bucket[][] | Uint8Array {
  const { value } = request, start = request.start ?? 0, end = request.end ?? value.frames, length = end - start;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > value.frames) fail('Choose a whole-frame audio range inside the recording.');
  if (request.operation === 'peak') {
    let peak = 0; visit(value, start, end, (_frame, _channel, sample) => { peak = Math.max(peak, Math.abs(sample)); }); return peak;
  }
  if (request.operation === 'waveform') {
    if (!Number.isInteger(request.buckets) || request.buckets < 1 || request.buckets > MAX_BUCKETS) fail('Waveform needs 1–16384 buckets.');
    const count = Math.min(length, request.buckets), channels = Array.from({ length: value.channels }, () => Array.from({ length: count }, () => ({ min: Infinity, max: -Infinity })));
    visit(value, start, end, (frame, channel, sample) => { const bucket = channels[channel]![Math.floor(frame * count / length)]!; bucket.min = Math.min(bucket.min, sample); bucket.max = Math.max(bucket.max, sample); });
    return channels;
  }
  if (request.operation === 'render') {
    if (length * value.channels * 4 > MAX_OUTPUT_BYTES) fail('Rendering this range exceeds 256 MiB. Select a shorter range.');
    const channels = Array.from({ length: value.channels }, () => new Float32Array(length));
    visit(value, start, end, (frame, channel, sample) => { channels[channel]![frame] = sample; if (!Number.isFinite(channels[channel]![frame])) fail('The audio gain is too large to play. Normalize or lower the volume first.'); });
    return channels;
  }
  if (request.operation !== 'wav') return fail('Unknown audio sample operation.');
  const dataBytes = length * value.channels * 2, byteLength = 44 + dataBytes;
  if (dataBytes + 36 > 0xffffffff || byteLength > MAX_OUTPUT_BYTES) fail('WAV output exceeds 256 MiB. Trim the recording before exporting.');
  const bytes = new Uint8Array(byteLength), view = new DataView(bytes.buffer);
  const tag = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i); };
  tag(0, 'RIFF'); view.setUint32(4, byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, value.channels, true); view.setUint32(24, value.sampleRate, true);
  view.setUint32(28, value.sampleRate * value.channels * 2, true); view.setUint16(32, value.channels * 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, dataBytes, true);
  visit(value, start, end, (frame, channel, sample) => { const clipped = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + (frame * value.channels + channel) * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true); });
  return bytes;
}
export { audioSamples };
