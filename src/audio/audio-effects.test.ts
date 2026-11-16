import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAudio, validatePcm } from './audio-effects.ts';
import { audioSettings } from './audio-effect-settings.ts';
const pcm = (...a: number[]) => ({sampleRate:48000,channels:[Float32Array.from(a)]});
const effect = (kind: Parameters<typeof audioSettings.effect>[0], values = {}) => ({...audioSettings.effect(kind), values:{...audioSettings.effect(kind).values,...values}});
const rms = (a: Float32Array) => Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);
test('AX02 bypass and gain goldens are owned and immutable', () => {
  const input = pcm(-.5,0,.25,.5); const result = processAudio(input, []);
  assert.deepEqual([...result.channels[0]!], [-.5,0,.25,.5]); assert.notEqual(result.channels[0], input.channels[0]);
  assert.deepEqual([...processAudio(input,[effect('gain',{db:0})]).channels[0]!],[-.5,0,.25,.5]);
  assert.deepEqual([...processAudio(input,[{...effect('gain',{db:24}),enabled:false}]).channels[0]!],[-.5,0,.25,.5]);
  assert.deepEqual([...input.channels[0]!],[-.5,0,.25,.5]);
});
test('AX02 low-pass removes high frequencies and preserves low frequencies', () => {
  const tone=(hz:number)=>({sampleRate:48000,channels:[Float32Array.from({length:48000},(_,i)=>.5*Math.sin(i*2*Math.PI*hz/48000))]});
  assert.ok(rms(processAudio(tone(10000),[effect('lowpass',{cutoff:3000})]).channels[0]!)<.04);
  assert.ok(rms(processAudio(tone(300),[effect('lowpass',{cutoff:3000})]).channels[0]!)>.34);
  assert.ok(rms(processAudio(tone(100),[effect('highpass',{cutoff:3000})]).channels[0]!)<.005);
});
test('AX02 reverb is dry at zero and produces a finite decaying impulse tail', () => {
  const input={sampleRate:8000,channels:[new Float32Array(16000)]}; input.channels[0]![0]=1;
  assert.deepEqual(processAudio(input,[effect('reverb',{mix:0})]),input);
  const tail=processAudio(input,[effect('reverb',{mix:100,decay:.3})]).channels[0]!;
  assert.equal(tail.length,16000); assert.ok(rms(tail.subarray(200,2000))>.001); assert.ok(rms(tail.subarray(12000))<.00001); assert.ok(tail.every(Number.isFinite));
});
test('AX02 order matters, compression is linked, normalization preserves balance', () => {
  const input=pcm(...Array(10000).fill(.8));
  const a=processAudio(input,[effect('gain',{db:6}),effect('normalize',{peak:-6})]);
  const b=processAudio(input,[effect('normalize',{peak:-6}),effect('gain',{db:6})]); assert.ok(b.channels[0]![9999]! > a.channels[0]![9999]!*1.9);
  const stereo={sampleRate:48000,channels:[new Float32Array(48000).fill(.8),new Float32Array(48000).fill(.4)]};
  for (const kind of ['compressor','normalize'] as const) { const out=processAudio(stereo,[effect(kind)]); assert.ok(Math.abs(out.channels[0]![47999]!/out.channels[1]![47999]!-2)<.00001); }
  assert.ok(processAudio(stereo,[effect('compressor')]).channels[0]![47999]!<.4);
});
test('AX02 quantization golden, valid ranges and malformed PCM', () => {
  const out=processAudio(pcm(0,.1,.2,.3),[effect('digital',{rate:48000,bits:4,mix:100})]); assert.deepEqual([...out.channels[0]!],[0,.125,.25,.25]);
  for (const input of [{sampleRate:0,channels:[new Float32Array(2)]},pcm(),pcm(NaN),{sampleRate:48000,channels:[new Float32Array(2),new Float32Array(3)]}]) assert.throws(()=>validatePcm(input),RangeError);
  for(const preset of ['retro','dreamy'] as const) for(const sampleRate of [8000,48000,192000]) { const out=processAudio({sampleRate,channels:[Float32Array.from({length:1000},(_,i)=>Math.sin(i))]},audioSettings.preset(preset)); assert.ok(out.channels[0]!.every(Number.isFinite)); }
});

test('AX02 modulation engine composes in order without mutating stereo channels',async()=>{
 const {modulateAudio}=await import('./audio-modulation.ts');
 const input={sampleRate:8000,channels:[Float32Array.from({length:8000},(_,i)=>.1*Math.sin(i*.6)),Float32Array.from({length:8000},(_,i)=>.2*Math.sin(i*.3))]};
 const flanger=audioSettings.effect('flanger'),phaser=audioSettings.effect('phaser');const result=processAudio(input,[flanger,phaser]);
 for(let c=0;c<2;c++){const expected=modulateAudio(modulateAudio(input.channels[c]!,8000,flanger),8000,phaser);assert.ok(result.channels[c]!.every((sample,i)=>sample===expected[i]),'Every sample follows the ordered modulation chain');}
 assert.notDeepEqual(processAudio(input,[phaser,flanger]),result);assert.equal(result.sampleRate,input.sampleRate);
});
