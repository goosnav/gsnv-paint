/**
 * PURPOSE    Apply sample-accurate immutable edits to an audio piece sequence.
 * KIND       CORE
 * CONTRACT   IN: A01 document and half-open integer [start,end) range; clipboard for paste, linear factor for gain,
 *            or target peak (0,1] for normalize. Copy/cut/delete/trim/effects require a nonempty selection;
 *            fades require at least two frames. Paste inserts at a cursor or replaces the selected range.
 *            OUT: document, resulting selection and optional clipboard. Copy/silent normalization return the input.
 *            RAISES: AudioEditError for invalid ranges, empty operations, incompatible clipboard layout or effects.
 * GUARANTEES No I/O or mutation; source buffers are shared. Split fades preserve their original sample coordinates.
 * TUNING     MAX_VOLUME_FACTOR=64; native A01 limits still apply after every edit.
 * DECISIONS  D1: Clipboard carries pieces and sources. Alternative: flattened samples would discard edit envelopes
 *            and allocate recording copies. Revisit if inter-application audio clipboard becomes required.
 *            D2: Normalize all channels against one peak to retain stereo balance; per-channel normalization
 *            would shift the stereo image. Revisit only as a separate explicit command.
 * LIMITS     No resampling: cross-project clipboard rate/channel mismatch rejects. Gain/fades are multiplicative.
 * TESTBENCH  src/audio/audio-edits.test.ts -- run with: node --import tsx --test src/audio/audio-edits.test.ts
 */
import { audioDocument, type AudioDocument } from './audio-document.ts';
import { audioSamples } from './audio-samples.ts';
export class AudioEditError extends Error { override name = 'AudioEditError'; }
type Base = { value: AudioDocument; start: number; end: number };
export type AudioEditRequest = Base & ({ operation: 'copy' | 'cut' | 'delete' | 'trim' | 'fadeIn' | 'fadeOut' }
  | { operation: 'paste'; clipboard: AudioDocument } | { operation: 'gain'; factor: number } | { operation: 'normalize'; peak: number });
type Result = { value: AudioDocument; selection: { start: number; end: number }; clipboard?: AudioDocument };
type Piece = AudioDocument['pieces'][number];
const MAX_VOLUME_FACTOR = 64;
function fail(message: string): never { throw new AudioEditError(message); }
function slice(value: AudioDocument, start: number, end: number): Piece[] {
  let position = 0; const pieces: Piece[] = [];
  for (const piece of value.pieces) {
    const from = Math.max(0, start - position), to = Math.min(piece.length, end - position);
    if (to > from) pieces.push({ ...piece, offset: piece.offset + from, length: to - from, envelopes: piece.envelopes.map(e => ({ ...e, offset: e.offset - from })) });
    position += piece.length; if (position >= end) break;
  }
  return pieces;
}
export function audioEdits(request: AudioEditRequest): Result {
  const { value, start, end, operation } = request, length = end - start;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > value.frames || end < start) fail('Choose a whole-frame range inside the recording.');
  if (operation !== 'paste' && !length) fail('Select some audio first.');
  const selected = slice(value, start, end), before = slice(value, 0, start), after = slice(value, end, value.frames);
  const make = (pieces: readonly Piece[], sources = value.sources) => {
    try { return audioDocument({ operation: 'sequence', value, pieces, sources }); }
    catch (cause) { return fail(cause instanceof Error ? cause.message : 'The edit exceeds the audio limits.'); }
  };
  if (operation === 'copy') return { value, selection: { start, end }, clipboard: make(selected) };
  if (operation === 'cut' || operation === 'delete') {
    const result = { value: make([...before, ...after]), selection: { start, end: start } };
    return operation === 'cut' ? { ...result, clipboard: make(selected) } : result;
  }
  if (operation === 'trim') return { value: make(selected), selection: { start: 0, end: length } };
  if (operation === 'paste') {
    const clip = request.clipboard;
    if (!clip || !clip.frames) fail('Copy some audio before pasting.');
    if (clip.sampleRate !== value.sampleRate || clip.channels !== value.channels) fail('Clipboard sample rate and channel count differ. Import or open compatible audio before pasting.');
    const sources = [...value.sources], ids = new Set(sources.map(s => s.id)), remap = new Map<string, string>();
    for (const source of clip.sources) {
      const known = sources.find(s => s.sample === source.sample && s.frames === source.frames);
      if (known) { remap.set(source.id, known.id); continue; }
      let id = source.id, suffix = 1;
      // Reopening a project may reuse an ID for a different source object; retain both without copying PCM.
      while (ids.has(id)) id = `${source.id.slice(0, 80)}-copy${suffix++}`;
      ids.add(id); remap.set(source.id, id); sources.push(Object.freeze({ ...source, id }));
    }
    const inserted = clip.pieces.map(p => ({ ...p, source: remap.get(p.source) ?? p.source }));
    return { value: make([...before, ...inserted, ...after], sources), selection: { start, end: start + clip.frames } };
  }
  let factor = 1;
  if (operation === 'gain') {
    if (!Number.isFinite(request.factor) || request.factor < 0 || request.factor > MAX_VOLUME_FACTOR) fail('Volume must be between 0% and 6400%.');
    factor = request.factor;
  } else if (operation === 'normalize') {
    if (!Number.isFinite(request.peak) || request.peak <= 0 || request.peak > 1) fail('Normalization peak must be greater than 0% and at most 100%.');
    const peak = audioSamples({ operation: 'peak', value, start, end });
    if (!peak) return { value, selection: { start, end } }; factor = request.peak / peak;
  } else if (operation !== 'fadeIn' && operation !== 'fadeOut') return fail('Unknown audio edit operation.');
  if ((operation === 'fadeIn' || operation === 'fadeOut') && length < 2) fail('Select at least two sample frames for a fade.');
  let offset = 0;
  const changed = selected.map(piece => {
    const envelopes = operation === 'fadeIn' || operation === 'fadeOut'
      ? [...piece.envelopes, { offset: -offset, length, from: operation === 'fadeIn' ? 0 : 1, to: operation === 'fadeIn' ? 1 : 0 }] : piece.envelopes;
    offset += piece.length; return { ...piece, gain: piece.gain * factor, envelopes };
  });
  return { value: make([...before, ...changed, ...after]), selection: { start, end } };
}
