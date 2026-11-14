import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioPlayback } from './audio-playback.ts';
import { audioDocument } from './audio-document.ts';
const value = audioDocument({ operation: 'import', id: 'take', sampleRate: 48000, channels: [new Float32Array([0, .5, -1, 1])] });
function rig(resume: () => Promise<void> = async () => {}) {
  const log: string[] = [], states: { playing: boolean; frame: number }[] = []; let tick: FrameRequestCallback = () => {};
  let channel = new Float32Array(0);
  const source = { buffer: null, onended: null as (() => void) | null, connect: () => log.push('connect'), disconnect: () => log.push('disconnect'), start: () => log.push('start'), stop: () => log.push('stop') };
  const context = { state: 'suspended', currentTime: 0, destination: {}, resume,
    createBuffer: (_channels: number, frames: number) => { channel = new Float32Array(frames); return { getChannelData: () => channel }; },
    createBufferSource: () => source, close: async () => { log.push('close'); }, decodeAudioData: async () => ({ sampleRate: 48000 }) };
  const player = createAudioPlayback({ context: () => context as unknown as AudioContext, requestFrame: fn => { tick = fn; return 1; }, cancelFrame: () => log.push('cancel'), changed: state => states.push(state) });
  return { player, log, states, context, source, tick: () => tick(0), samples: () => [...channel] };
}
test('A04 transport decodes without autoplay and plays the exact selected rendered samples', async () => {
  const r = rig(); await r.player.decode(new Uint8Array([1])); assert.equal(r.log.includes('start'), false);
  await r.player.play(value, 1, 4); assert.deepEqual(r.samples(), [.5, -1, 1]); assert.deepEqual(r.player.state(), { playing: true, frame: 1 });
  r.context.currentTime = 2 / 48000; r.tick(); assert.equal(r.player.state().frame, 3);
  r.source.onended?.(); assert.deepEqual(r.player.state(), { playing: false, frame: 4 });
  r.player.dispose(); assert.equal(r.log.at(-1), 'close');
});
test('A04 stop invalidates a pending audio resume and failures do not report playing', async () => {
  let release!: () => void; const r = rig(() => new Promise<void>(resolve => { release = resolve; }));
  const pending = r.player.play(value, 0, 4); r.player.stop(); release(); await pending; assert.equal(r.log.includes('start'), false);
  assert.equal(r.player.state().playing, false); r.player.dispose();
  const bad = rig(async () => { throw new Error('Audio output denied'); });
  await assert.rejects(bad.player.play(value, 0, 4), /denied/); assert.equal(bad.player.state().playing, false); bad.player.dispose();
});
