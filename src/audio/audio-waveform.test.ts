import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { audioDocument } from './audio-document.ts';
import { createAudioWaveform } from './audio-waveform.ts';
test('A04 waveform has exact keyboard ranges, focus escape and pointer selection without editing audio', () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true }), document = dom.window.document, root = document.querySelector<HTMLElement>('#root')!;
  const context = new Proxy({}, { get: () => () => {} });
  dom.window.HTMLCanvasElement.prototype.getContext = (() => context) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  const value = audioDocument({ operation: 'import', id: 'take', sampleRate: 8000, channels: [new Float32Array(100)] });
  let selected = { start: 0, end: 0 }; const commands: string[] = [];
  const wave = createAudioWaveform({ root, selected(range) { selected = range; wave.update(value, selected, range.end); }, command: id => commands.push(id) });
  wave.update(value, selected, 0); wave.focus();
  const control = root.querySelector<HTMLElement>('[tabindex="0"]')!;
  assert.equal(document.activeElement, control); assert.match(control.getAttribute('aria-label')!, /waveform/i);
  control.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
  assert.deepEqual(selected, { start: 0, end: 1 });
  control.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true })); assert.deepEqual(selected, { start: 100, end: 100 });
  control.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true })); assert.deepEqual(commands, ['audio.togglePlayback']);
  const canvas = root.querySelector('canvas')!; canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON() {} });
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  for (const [type, x] of [['pointerdown', 48], ['pointermove', 218], ['pointerup', 218]] as const) {
    const event = new dom.window.MouseEvent(type, { clientX: x, button: 0, bubbles: true }); Object.defineProperty(event, 'pointerId', { value: 1 }); canvas.dispatchEvent(event);
  }
  assert.deepEqual(selected, { start: 0, end: 50 }); assert.equal(value.frames, 100); assert.equal(value.sources[0]!.sample(0, 0), 0);
  wave.zoom('selection'); wave.zoom('all'); wave.dispose(); assert.equal(root.childElementCount, 0); dom.window.close();
});
