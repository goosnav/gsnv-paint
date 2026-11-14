/**
 * PURPOSE    Own validated non-destructive audio sequences.
 * KIND       CORE
 * CONTRACT   IN: new layout, imported Float32 channels, sequence replacement, or untrusted native metadata/assets.
 *            OUT: frozen AudioDocument, or planar little-endian float32 assets plus JSON metadata.
 *            Sources expose sample reads only; input buffers are copied once and never exposed or changed.
 *            Pieces use source offsets and half-open frame lengths; gain and linear envelopes multiply.
 *            Envelope offsets may be negative after a split; a ramp clamps outside its original span.
 *            RAISES: AudioContentError for invalid layouts, samples, references, envelopes or bounds.
 * GUARANTEES Deterministic; no I/O; edits share owned sources, never copy recording buffers for history.
 * TUNING     MAX_PCM_BYTES=256MiB, MAX_SECONDS=1800, MAX_PIECES=10000, MAX_ENVELOPES=64, MAX_GAIN=1e6.
 * DECISIONS  D1: Private PCM with a sample reader prevents accidental history mutation; the alternative is public mutable typed arrays.
 *            Revisit if profiling requires a separately reviewed bulk read API.
 *            D2: Preserve source PCM plus edit envelopes in native files instead of flattening edited samples;
 *            flattening would prevent reversible edits. Revisit only for a new native format version.
 * LIMITS     Mono/stereo, 8–192kHz; 30-minute sequence; 256MiB total retained source PCM. Trusted sequence inputs
 *            use sources created here. Encode allocates PCM assets; it does not serialize undo history.
 * TESTBENCH  src/audio/audio-document.test.ts -- run with: node --import tsx --test src/audio/audio-document.test.ts
 */
type Envelope = Readonly<{ offset: number; length: number; from: number; to: number }>;
type Piece = Readonly<{ source: string; offset: number; length: number; gain: number; envelopes: readonly Envelope[] }>;
type Source = Readonly<{ id: string; frames: number; sample(channel: number, frame: number): number }>;
export type AudioDocument = Readonly<{ sampleRate: number; channels: number; frames: number; sources: readonly Source[]; pieces: readonly Piece[] }>;
export class AudioContentError extends Error { override name = 'AudioContentError'; }
type Asset = { id: string; mime: string; bytes: Uint8Array };
type Encoded = { content: { sampleRate: number; channels: number; sources: { id: string; frames: number; asset: string }[]; pieces: Piece[] }; assets: Asset[] };
type Request = { operation: 'new'; sampleRate?: number; channels?: number }
  | { operation: 'import'; id: string; sampleRate: number; channels: readonly Float32Array[] }
  | { operation: 'sequence'; value: AudioDocument; pieces: readonly Piece[]; sources?: readonly Source[] }
  | { operation: 'encode'; value: AudioDocument }
  | { operation: 'decode'; content: unknown; assets: readonly Asset[] };

const MAX_PCM_BYTES = 256 * 1024 * 1024, MAX_SECONDS = 1800, MAX_PIECES = 10000, MAX_ENVELOPES = 64, MAX_GAIN = 1e6;
const MIME = 'application/vnd.gsnv.pcm-f32le';
function fail(message: string): never { throw new AudioContentError(message); }
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length || keys.some(k => !Object.getOwnPropertyDescriptor(value, k)?.enumerable || !('value' in Object.getOwnPropertyDescriptor(value, k)!))) fail('Audio metadata has missing or unsupported fields.');
  return value as Record<string, unknown>;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.keys(value).length !== value.length) fail('Audio metadata has an invalid or oversized list.');
  return value;
}
function layout(rate: number, channels: number) {
  if (!integer(rate, 8000, 192000) || !integer(channels, 1, 2)) fail('Audio needs a sample rate of 8000–192000 Hz and one or two channels.');
}
function sourceId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail('Audio source IDs must be 1–100 letters, digits, hyphens or underscores.');
}
function own(id: string, buffers: readonly Float32Array[]): Source {
  sourceId(id);
  if (!buffers.length || !buffers.every(c => c instanceof Float32Array && c.length === buffers[0]!.length) || !buffers[0]!.length) fail('Audio channels must be nonempty, equal-length Float32 arrays.');
  if (buffers[0]!.length * buffers.length * 4 > MAX_PCM_BYTES) fail('Decoded audio exceeds the 256 MiB PCM limit.');
  const data = buffers.map(c => { for (const s of c) if (!Number.isFinite(s)) fail('Audio samples must be finite.'); return c.slice(); });
  return Object.freeze({ id, frames: data[0]!.length, sample: (channel: number, frame: number) => data[channel]![frame]! });
}
function sequence(rate: number, channels: number, sources: readonly Source[], pieces: readonly Piece[]): AudioDocument {
  layout(rate, channels); list(sources, MAX_PIECES); list(pieces, MAX_PIECES);
  const byId = new Map<string, Source>(); let bytes = 0, frames = 0;
  for (const source of sources) {
    sourceId(source.id);
    if (byId.has(source.id) || !integer(source.frames, 1, MAX_PCM_BYTES / (4 * channels)) || typeof source.sample !== 'function') fail('Audio sources have invalid lengths or duplicate IDs.');
    byId.set(source.id, source); bytes += source.frames * channels * 4;
  }
  if (bytes > MAX_PCM_BYTES) fail('Retained audio exceeds the 256 MiB PCM limit.');
  const used = new Set<string>();
  const result = pieces.map(p => {
    record(p, ['source', 'offset', 'length', 'gain', 'envelopes']);
    const source = byId.get(p.source);
    if (!source || !integer(p.offset, 0, source.frames - 1) || !integer(p.length, 1, source.frames - p.offset) || !Number.isFinite(p.gain) || p.gain < 0 || p.gain > MAX_GAIN) fail('An audio piece has an invalid source range or gain.');
    frames += p.length; if (frames > rate * MAX_SECONDS) fail('The edited audio exceeds the 30-minute limit.');
    const envelopes = list(p.envelopes, MAX_ENVELOPES).map(e => {
      const v = record(e, ['offset', 'length', 'from', 'to']);
      if (!integer(v.offset, -rate * MAX_SECONDS, rate * MAX_SECONDS) || !integer(v.length, 2, rate * MAX_SECONDS) ||
        typeof v.from !== 'number' || !Number.isFinite(v.from) || v.from < 0 || v.from > 1 || typeof v.to !== 'number' || !Number.isFinite(v.to) || v.to < 0 || v.to > 1) fail('An audio fade has invalid endpoints or length.');
      return Object.freeze({ offset: v.offset, length: v.length, from: v.from, to: v.to });
    });
    used.add(p.source); return Object.freeze({ ...p, envelopes: Object.freeze(envelopes) });
  });
  return Object.freeze({ sampleRate: rate, channels, frames, sources: Object.freeze(sources.filter(s => used.has(s.id))), pieces: Object.freeze(result) });
}
function decode(content: unknown, assets: readonly Asset[]): AudioDocument {
  const c = record(content, ['sampleRate', 'channels', 'sources', 'pieces']);
  const rate = c.sampleRate as number, channels = c.channels as number; layout(rate, channels);
  const byId = new Map<string, Asset>(); let total = 0;
  for (const asset of list(assets, MAX_PIECES) as Asset[]) {
    if (!asset || typeof asset.id !== 'string' || byId.has(asset.id) || !(asset.bytes instanceof Uint8Array) || asset.mime !== MIME) fail('Audio PCM assets are invalid or duplicated.');
    total += asset.bytes.byteLength; if (total > MAX_PCM_BYTES) fail('Retained audio exceeds the 256 MiB PCM limit.'); byId.set(asset.id, asset);
  }
  const used = new Set<string>();
  const sources = list(c.sources, MAX_PIECES).map(item => {
    const s = record(item, ['id', 'frames', 'asset']); sourceId(s.id);
    if (!integer(s.frames, 1, MAX_PCM_BYTES / (4 * channels)) || typeof s.asset !== 'string' || used.has(s.asset)) fail('Invalid audio source metadata.');
    const asset = byId.get(s.asset);
    if (!asset || asset.bytes.length !== s.frames * channels * 4) fail('An audio PCM source is missing or has the wrong byte length.');
    used.add(s.asset); const data = new DataView(asset.bytes.buffer, asset.bytes.byteOffset, asset.bytes.byteLength);
    const buffers = Array.from({ length: channels }, (_, channel) => Float32Array.from({ length: s.frames as number }, (_, i) => data.getFloat32((channel * (s.frames as number) + i) * 4, true)));
    return own(s.id, buffers);
  });
  if (used.size !== assets.length) fail('The project contains unreferenced PCM assets.');
  return sequence(rate, channels, sources, list(c.pieces, MAX_PIECES) as Piece[]);
}
function audioDocument(request: Extract<Request, { operation: 'encode' }>): Encoded;
function audioDocument(request: Exclude<Request, { operation: 'encode' }>): AudioDocument;
function audioDocument(request: Request): AudioDocument | Encoded {
  if (request.operation === 'new') return sequence(request.sampleRate ?? 48000, request.channels ?? 2, [], []);
  if (request.operation === 'import') {
    layout(request.sampleRate, request.channels.length); const source = own(request.id, request.channels);
    return sequence(request.sampleRate, request.channels.length, [source], [{ source: source.id, offset: 0, length: source.frames, gain: 1, envelopes: [] }]);
  }
  if (request.operation === 'sequence') return sequence(request.value.sampleRate, request.value.channels, request.sources ?? request.value.sources, request.pieces);
  if (request.operation === 'decode') return decode(request.content, request.assets);
  if (request.operation !== 'encode') return fail('Unknown audio document operation.');
  const value = request.value;
  const assets = value.sources.map(source => {
    const bytes = new Uint8Array(source.frames * value.channels * 4), data = new DataView(bytes.buffer);
    for (let channel = 0; channel < value.channels; channel++) for (let i = 0; i < source.frames; i++) data.setFloat32((channel * source.frames + i) * 4, source.sample(channel, i), true);
    return { id: `pcm-${source.id}`, mime: MIME, bytes };
  });
  return { content: { sampleRate: value.sampleRate, channels: value.channels, sources: value.sources.map(s => ({ id: s.id, frames: s.frames, asset: `pcm-${s.id}` })), pieces: value.pieces.map(p => ({ ...p, envelopes: p.envelopes.map(e => ({ ...e })) })) }, assets };
}
export { audioDocument };
