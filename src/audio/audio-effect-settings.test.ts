import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioSettings } from './audio-effect-settings.ts';
test('AX01 preset copies, exact defaults and export validation', () => {
  assert.deepEqual(audioSettings.preset('clean'), []);
  assert.deepEqual(audioSettings.output(), { format: 'wav', bits: 16, sampleRate: 44100, channels: 'preserve', bitrate: 192, preventClipping: true });
  const a = audioSettings.preset('retro'); a[0]!.values.cutoff = 1;
  assert.equal(audioSettings.preset('retro')[0]!.values.cutoff, 9000);
  assert.deepEqual(audioSettings.chain(audioSettings.preset('dreamy')), audioSettings.preset('dreamy'));
});
test('AX01 rejects unknown keys, invalid values, excess effects and export settings', () => {
  for (const value of [null, {}, [{kind:'nope',enabled:true,values:{}}], Array(13).fill(audioSettings.effect('gain'))]) assert.throws(() => audioSettings.chain(value), RangeError);
  for (const amount of [NaN, Infinity, -1, 25000]) assert.throws(() => audioSettings.chain([{kind:'lowpass',enabled:true,values:{cutoff:amount}}]), RangeError);
  assert.throws(() => audioSettings.chain([{...audioSettings.effect('gain'), extra: 1}]), RangeError);
  assert.throws(() => audioSettings.chain([{kind:'gain',enabled:false,values:{db:NaN}}]), RangeError);
  for (const patch of [{format:'ogg'},{bits:32},{sampleRate:12345},{channels:'six'},{bitrate:0},{preventClipping:'yes'},{extra:1}]) assert.throws(() => audioSettings.output({...audioSettings.output(),...patch}), RangeError);
});
