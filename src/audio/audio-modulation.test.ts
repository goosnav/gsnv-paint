import {test} from 'node:test';import assert from 'node:assert/strict';
import {modulateAudio} from './audio-modulation.ts';import {audioSettings} from './audio-effect-settings.ts';
const rms=(v:Float32Array)=>Math.sqrt(v.reduce((s,x)=>s+x*x,0)/v.length);
test('AG03 fixed flanger impulse golden, comb notch, exact bypass and ownership',()=>{
 const e=audioSettings.effect('flanger');Object.assign(e.values,{delay:4,depth:0,speed:0,feedback:0,mix:50});
 const impulse=new Float32Array(64);impulse[0]=1;const expected=new Float32Array(64);expected[0]=expected[32]=.5;
 assert.deepEqual(modulateAudio(impulse,8000,e),expected);assert.equal(impulse[0],1);
 const tone=Float32Array.from({length:8000},(_,i)=>.4*Math.sin(2*Math.PI*125*i/8000));assert.ok(rms(modulateAudio(tone,8000,e).subarray(100))<1e-6);
 for(const kind of ['flanger','phaser'] as const){const f=audioSettings.effect(kind);f.values.mix=0;const dry=modulateAudio(tone,8000,f);assert.deepEqual(dry,tone);assert.notEqual(dry,tone);f.values.mix=50;f.enabled=false;assert.deepEqual(modulateAudio(tone,8000,f),tone);}
});
test('AG03 stationary phaser has analytic notch and unity wet energy',()=>{
 const e=audioSettings.effect('phaser');Object.assign(e.values,{center:1000,depth:0,speed:0,mix:50});
 const rate=8000,f=rate/Math.PI*Math.atan(Math.tan(Math.PI*1000/rate)*Math.tan(Math.PI/8));
 const tone=Float32Array.from({length:rate},(_,i)=>.4*Math.sin(2*Math.PI*f*i/rate));
 assert.ok(rms(modulateAudio(tone,rate,e).subarray(500))<1e-5);
 e.values.mix=100;assert.ok(Math.abs(rms(modulateAudio(tone,rate,e).subarray(500))-rms(tone.subarray(500)))<.001);
});
test('AG03 moving modulation changes signal deterministically with bounded finite extremes',()=>{
 for(const kind of ['flanger','phaser'] as const)for(const rate of [8000,48000,192000]){
  const input=Float32Array.from({length:rate},(_,i)=>.1*Math.sin(i*.27)),e=audioSettings.effect(kind);
  const output=modulateAudio(input,rate,e);assert.equal(output.length,input.length);assert.notDeepEqual(output,input);assert.deepEqual(output,modulateAudio(input,rate,e));
  for(const p of audioSettings.catalog().find(d=>d.kind===kind)!.parameters)e.values[p.key]=p.max;
  for(const sample of modulateAudio(input,rate,e))assert.ok(Number.isFinite(sample)&&Math.abs(sample)<10);
 }
 for(const input of [new Float32Array(),Float32Array.of(NaN),Float32Array.of(Infinity)])assert.throws(()=>modulateAudio(input,8000,audioSettings.effect('phaser')),RangeError);
 assert.throws(()=>modulateAudio(Float32Array.of(1),7999,audioSettings.effect('phaser')),RangeError);
 assert.throws(()=>modulateAudio(Float32Array.of(1),48000,audioSettings.effect('gain')),RangeError);
});
