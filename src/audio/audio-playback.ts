/**
 * PURPOSE    Adapt local PCM transport to Web Audio.
 * KIND       SHELL
 * CONTRACT   IN: lazy context factory, animation scheduling and a state callback; decode bytes or play a validated
 *            document range. OUT: decoded AudioBuffer, playback frame/status updates and stop/dispose controls.
 *            RAISES: Error for unavailable/closed audio, empty playback or Web Audio failures; A03 render errors propagate.
 * GUARANTEES Decode never plays; stop cancels pending resume and scheduled playback; dispose closes the context.
 * TUNING     None. The workspace's context factory explicitly chooses 48kHz for browser import.
 * DECISIONS  D1: Render only the requested playback range. Alternative: schedule every edit piece separately,
 *            risking different fade arithmetic. Revisit if streaming very long recordings is required.
 * LIMITS     One active source, no pause/resume transport or recording. A03 limits rendered ranges to 256MiB.
 * TESTBENCH  src/audio/audio-playback.test.ts -- run with: node --import tsx --test src/audio/audio-playback.test.ts
 */
import type { AudioDocument } from './audio-document.ts';
import { audioSamples } from './audio-samples.ts';
type State = { playing: boolean; frame: number };
type Ports = { context(): AudioContext; requestFrame(callback: FrameRequestCallback): number; cancelFrame(id: number): void; changed(state: State): void };
export function createAudioPlayback(ports: Ports): {
  decode(bytes: Uint8Array): Promise<AudioBuffer>; play(value: AudioDocument, start: number, end: number): Promise<void>;
  stop(): void; state(): State; dispose(): void;
} {
  let context: AudioContext | null = null, source: AudioBufferSourceNode | null = null, epoch = 0, raf = 0, disposed = false;
  let state: State = { playing: false, frame: 0 }, started = 0, from = 0, until = 0, rate = 48000;
  const publish = () => { if (!disposed) ports.changed({ ...state }); };
  function ensure() {
    if (disposed) throw new Error('Audio playback has closed.');
    context ??= ports.context(); if (context.state === 'closed') throw new Error('Audio output has closed. Reopen the editor to play.'); return context;
  }
  function position() { if (state.playing && context) state.frame = Math.min(until, from + Math.floor((context.currentTime - started) * rate)); }
  function stop() {
    const wasActive = state.playing || !!source; epoch++; position(); ports.cancelFrame(raf); raf = 0;
    const old = source; source = null;
    if (old) { old.onended = null; try { old.stop(); } catch { /* The browser may have ended it already. */ } old.disconnect(); }
    state.playing = false; if (wasActive) publish();
  }
  function tick() { if (!state.playing) return; position(); publish(); raf = ports.requestFrame(tick); }
  return {
    async decode(bytes) { const audio = ensure(); return audio.decodeAudioData(bytes.slice().buffer); },
    async play(value, start, end) {
      stop(); if (end <= start) throw new Error('There is no audio to play in this range.');
      const token = epoch, audio = ensure(); await audio.resume(); if (token !== epoch || disposed) return;
      const channels = audioSamples({ operation: 'render', value, start, end });
      const buffer = audio.createBuffer(value.channels, end - start, value.sampleRate);
      channels.forEach((channel, index) => buffer.getChannelData(index).set(channel));
      const node = audio.createBufferSource(); node.buffer = buffer; node.connect(audio.destination);
      node.onended = () => { if (source !== node) return; state.frame = until; state.playing = false; stop(); };
      try { node.start(); } catch (cause) { node.disconnect(); throw cause; }
      source = node; started = audio.currentTime; from = start; until = end; rate = value.sampleRate;
      state = { playing: true, frame: start }; publish(); raf = ports.requestFrame(tick);
    },
    stop, state: () => ({ ...state }),
    dispose() { if (disposed) return; stop(); disposed = true; if (context) void context.close().catch(() => {}); context = null; },
  };
}
