/**
 * PURPOSE    Validate the audio processing recipe.
 * KIND       CORE
 * CONTRACT   Validate untrusted chain/output or return fresh catalog/help/preset data. Unknown keys,
 *            nonfinite/out-of-range numbers and more than 12 effects raise RangeError.
 * GUARANTEES Pure; caller edits never alter defaults. Disabled effects are still validated.
 * TUNING     Catalog defaults and parameter bounds below; maximum chain length 12.
 * DECISIONS  D1: Explicit effect values keep settings portable. Alternative: executable recipes add risk.
 *            Revisit if: a versioned automation language is requested.
 * LIMITS     Mono/stereo WAV/MP3; reverb preserves duration; no third-party plugins.
 * TESTBENCH  node --import tsx --test src/audio/audio-effect-settings.test.ts
 * DEMO       node --import tsx src/audio/audio-effects.demo.ts
 */
import {audioExport} from './audio-export-profile.ts';
import {audioHelp} from './audio-effect-guide.ts';
export type {AudioExport} from './audio-export-profile.ts';
type Parameter = { key: string; label: string; min: number; max: number; step: number; value: number };
const parameter = (key: string, label: string, min: number, max: number, step: number, value: number): Parameter => ({ key, label, min, max, step, value });
const catalog = [
  { kind: 'lowpass', label: 'Muffle / low-pass', description: 'Cut high frequencies for a softer, bandwidth-limited sound.', parameters: [parameter('cutoff', 'Cutoff (Hz)', 200, 20000, 100, 9000)] },
  { kind: 'highpass', label: 'High-pass', description: 'Remove bass rumble below the cutoff.', parameters: [parameter('cutoff', 'Cutoff (Hz)', 20, 10000, 10, 100)] },
  { kind: 'digital', label: 'Digital resolution', description: 'Lower the sample resolution for early digital texture. Low values create deliberate grit.', parameters: [parameter('rate', 'Digital rate (Hz)', 2000, 48000, 100, 22050), parameter('bits', 'Bit depth', 4, 16, 1, 14), parameter('mix', 'Effect amount (%)', 0, 100, 1, 100)] },
  { kind: 'compressor', label: 'Compressor', description: 'Gently reduce loud peaks; this changes dynamics, not file size.', parameters: [parameter('threshold', 'Threshold (dB)', -60, 0, 1, -18), parameter('ratio', 'Ratio', 1, 20, .1, 2), parameter('attack', 'Attack (ms)', 1, 100, 1, 10), parameter('release', 'Release (ms)', 10, 1000, 10, 120), parameter('makeup', 'Make-up gain (dB)', 0, 18, .5, 0)] },
  { kind: 'reverb', label: 'Reverb', description: 'Add a diffuse room tail. Song length stays the same; the tail ends at the recording boundary.', parameters: [parameter('mix', 'Wet amount (%)', 0, 100, 1, 18), parameter('decay', 'Decay (seconds)', .1, 6, .1, 1.8), parameter('damping', 'Damping cutoff (Hz)', 500, 15000, 100, 6000)] },
  { kind: 'flanger', label: 'Flanger', description: 'A moving short delay adds a metallic, jet-like sweep.', parameters: [parameter('speed','Sweep speed (Hz)',0,5,.05,.2),parameter('delay','Base delay (ms)',.1,10,.1,2),parameter('depth','Sweep depth (ms)',0,10,.1,1.5),parameter('feedback','Feedback (%)',-90,90,1,20),parameter('mix','Wet amount (%)',0,100,1,30)] },
  { kind: 'phaser', label: 'Phaser', description: 'Swept phase filters add a hollow, swirling movement.', parameters: [parameter('speed','Sweep speed (Hz)',0,5,.05,.25),parameter('center','Center (Hz)',100,4000,25,800),parameter('depth','Sweep depth (octaves)',0,4,.1,2),parameter('mix','Wet amount (%)',0,100,1,35)] },
  { kind: 'gain', label: 'Volume', description: 'Raise or lower every sample equally.', parameters: [parameter('db', 'Gain (dB)', -60, 24, .5, 0)] },
  { kind: 'normalize', label: 'Normalize', description: 'Set the peak level while preserving stereo balance.', parameters: [parameter('peak', 'Target peak (dB)', -24, 0, .1, -1)] },
] as const;
export type AudioEffect = { kind: typeof catalog[number]['kind']; enabled: boolean; values: Record<string, number> };
const fail = (text: string): never => { throw new RangeError(text); };
function record(raw: unknown, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== keys.length || keys.some(k => !Object.hasOwn(raw, k))) return fail('Audio settings contain missing or unknown fields.');
  return raw as Record<string, unknown>;
}
function effect(kind: AudioEffect['kind']): AudioEffect {
  const definition = catalog.find(d => d.kind === kind); if (!definition) return fail('Choose a supported audio effect.');
  return { kind, enabled: true, values: Object.fromEntries(definition.parameters.map(p => [p.key, p.value])) };
}
function chain(raw: unknown): AudioEffect[] {
  if (!Array.isArray(raw) || raw.length > 12) return fail('Use up to 12 audio effects.');
  return raw.map(item => {
    const v = record(item, ['kind', 'enabled', 'values']), d = catalog.find(d => d.kind === v.kind);
    if (!d || typeof v.enabled !== 'boolean') return fail('Choose a supported audio effect and bypass state.');
    const values = record(v.values, d.parameters.map(p => p.key));
    for (const p of d.parameters) { const n = values[p.key]; if (typeof n !== 'number' || !Number.isFinite(n) || n < p.min || n > p.max || (p.key === 'bits' && !Number.isInteger(n))) fail(`${d.label}: ${p.label} must be ${p.min}–${p.max}.`); }
    return { kind: d.kind, enabled: v.enabled, values: { ...values } as Record<string, number> };
  });
}
export const audioSettings = {
  catalog: () => catalog.map(d=>({...d,help:audioHelp(d.kind),parameters:d.parameters.map(p=>({...p,help:audioHelp(`${d.kind}.${p.key}`)}))})), effect, chain, output:audioExport.validate,
  preset(name: 'clean' | 'retro' | 'dreamy' | 'ambient' | 'swirl'): AudioEffect[] {
    if (!['clean','retro','dreamy','ambient','swirl'].includes(name)) return fail('Choose a known audio preset.');
    if(name==='ambient'){const low=effect('lowpass');low.values.cutoff=8000;return [low,effect('reverb')];}
    if(name==='swirl')return [effect('phaser'),effect('reverb')];
    const result = name === 'clean' ? [] : [effect('lowpass'), effect('compressor'), effect('digital')];
    if (name === 'dreamy') result.push(effect('reverb')); return result;
  },
};
