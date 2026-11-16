/**
 * PURPOSE    Render an ordered effect chain on owned PCM.
 * KIND       CORE
 * CONTRACT   IN mono/stereo finite Float32 PCM, equal lengths, 8–192kHz, <=128MiB,
 *            <=30 minutes and AX01 chain including flanger/phaser. OUT owned same-length/rate PCM.
 *            RAISES RangeError for invalid PCM/settings or nonfinite output.
 * GUARANTEES Pure, deterministic, no input mutation, linked dynamics preserve stereo image.
 * TUNING     MAX_PCM_BYTES=128MiB. Reverb delay bank below; no appended tail.
 * DECISIONS  D1: RBJ biquads and damped comb/all-pass reverb keep the same DSP in preview
 *            and export. Alternative: browser AudioNodes vary by engine; Revisit if: live monitoring is requested.
 * LIMITS     Digital resolution intentionally aliases at low rates. Reverb tails end at EOF.
 * TESTBENCH  node --import tsx --test src/audio/audio-effects.test.ts
 * DEMO       node --import tsx src/audio/audio-effects.demo.ts
 */
import { audioSettings, type AudioEffect } from './audio-effect-settings.ts';
import {modulateAudio} from './audio-modulation.ts';
export type AudioPcm = { sampleRate: number; channels: Float32Array[] };
export function validatePcm(pcm: AudioPcm): void {
  if (!pcm || !Number.isInteger(pcm.sampleRate) || pcm.sampleRate < 8000 || pcm.sampleRate > 192000 || !Array.isArray(pcm.channels) || pcm.channels.length < 1 || pcm.channels.length > 2) throw new RangeError('Audio needs mono or stereo PCM at 8000–192000 Hz.');
  const length = pcm.channels[0]?.length ?? 0;
  if (!length || length > pcm.sampleRate * 1800 || length * pcm.channels.length * 4 > 128 * 1024 * 1024) throw new RangeError('Choose audio up to 30 minutes and 128 MiB of decoded samples.');
  for (const channel of pcm.channels) {
    if (!(channel instanceof Float32Array) || channel.length !== length) throw new RangeError('Audio channels must have matching lengths.');
    for (const sample of channel) if (!Number.isFinite(sample) || Math.abs(sample) > 1e6) throw new RangeError('Audio contains invalid or excessive sample values.');
  }
}
function filter(data: Float32Array, rate: number, cutoff: number, high = false) {
  // Butterworth RBJ biquad. Clamp below Nyquist so low-rate sources stay stable.
  const w = 2 * Math.PI * Math.min(cutoff, rate * .45) / rate, c = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2, a0 = 1 + alpha;
  const b0 = (high ? 1 + c : 1 - c) / (2 * a0), b1 = (high ? -1 - c : 1 - c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) { const x = data[i]!, y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; data[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y; }
}
function reverb(data: Float32Array, rate: number, values: Record<string, number>, channel: number) {
  const mix = values.mix! / 100; if (!mix) return;
  const damping = 1 - Math.exp(-2 * Math.PI * Math.min(values.damping!, rate * .45) / rate);
  // Incommensurate delays spread reflections instead of creating a single audible echo.
  const banks = [.0297,.0371,.0411,.0437,.0479,.0531].map(seconds => {
    const length = Math.max(1, Math.round((seconds + channel * .0013) * rate));
    return { buffer: new Float32Array(length), pos: 0, low: 0, gain: 10 ** (-3 * length / rate / values.decay!) };
  });
  const passes = [.005,.0017].map(seconds => ({ buffer: new Float32Array(Math.max(1,Math.round(seconds*rate))), pos: 0 }));
  for (let i = 0; i < data.length; i++) {
    const dry = data[i]!; let wet = 0;
    for (const bank of banks) { const delay = bank.buffer[bank.pos]!; bank.low += damping * (delay - bank.low); bank.buffer[bank.pos] = dry + bank.low * bank.gain; bank.pos = (bank.pos + 1) % bank.buffer.length; wet += delay / banks.length; }
    for (const pass of passes) { const delayed = pass.buffer[pass.pos]!, next = delayed - .5 * wet; pass.buffer[pass.pos] = wet + .5 * next; wet = next; pass.pos = (pass.pos + 1) % pass.buffer.length; }
    data[i] = dry * (1 - mix) + wet * mix;
  }
}
export function processAudio(pcm: AudioPcm, raw: readonly AudioEffect[]): AudioPcm {
  validatePcm(pcm); const chain = audioSettings.chain(raw), channels = pcm.channels.map(c => c.slice()), rate = pcm.sampleRate;
  for (const effect of chain) {
    if (!effect.enabled) continue; const v = effect.values;
    if (effect.kind === 'compressor') {
      const attack = Math.exp(-1 / (rate * v.attack! / 1000)), release = Math.exp(-1 / (rate * v.release! / 1000)); let envelope = 0;
      for (let i = 0; i < channels[0]!.length; i++) {
        let level = 0; for (const channel of channels) level = Math.max(level,Math.abs(channel[i]!));
        const coefficient = level > envelope ? attack : release; envelope = coefficient * envelope + (1 - coefficient) * level;
        const excess = Math.max(0, 20 * Math.log10(Math.max(1e-12,envelope)) - v.threshold!);
        const gain = 10 ** ((v.makeup! - excess * (1 - 1 / v.ratio!)) / 20);
        for (const channel of channels) channel[i] = channel[i]! * gain;
      }
    } else if (effect.kind === 'normalize' || effect.kind === 'gain') {
      let peak = 0; if (effect.kind === 'normalize') for (const channel of channels) for (const sample of channel) peak = Math.max(peak,Math.abs(sample));
      const gain = effect.kind === 'gain' ? 10 ** (v.db! / 20) : peak ? 10 ** (v.peak! / 20) / peak : 1;
      for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] = channel[i]! * gain;
    } else channels.forEach((channel, index) => {
      if (effect.kind === 'lowpass' || effect.kind === 'highpass') filter(channel,rate,v.cutoff!,effect.kind === 'highpass');
      else if (effect.kind === 'reverb') reverb(channel,rate,v,index);
      else if (effect.kind === 'flanger' || effect.kind === 'phaser') channels[index]=modulateAudio(channel,rate,effect);
      else if (effect.kind === 'digital') {
        const step = Math.min(1,v.rate! / rate), levels = 2 ** (v.bits! - 1), mix = v.mix! / 100; let phase = 1, held = 0;
        for (let i = 0; i < channel.length; i++) { const dry = channel[i]!; if (phase >= 1) { held = Math.round(Math.max(-1,Math.min(1,dry))*levels)/levels; phase -= 1; } phase += step; channel[i] = dry * (1 - mix) + held * mix; }
      }
    });
  }
  const result = {sampleRate:rate,channels}; validatePcm(result); return result;
}
