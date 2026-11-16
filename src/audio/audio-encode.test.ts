import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAudio } from './audio-encode.ts';
import { audioSettings } from './audio-effect-settings.ts';
import {audioExport} from './audio-export-profile.ts';
const pcm = {sampleRate:44100,channels:[Float32Array.from([-1,0,.5,1])]};
test('AX03 PCM16/24 golden values, headers, channels and source ownership', () => {
  const result = encodeAudio(pcm,{...audioSettings.output(),preventClipping:false}); const v=new DataView(result.bytes.buffer);
  assert.equal(new TextDecoder().decode(result.bytes.subarray(0,4)),'RIFF'); assert.equal(v.getUint32(24,true),44100);
  assert.equal(v.getUint16(34,true),16); assert.equal(v.getUint32(40,true),8);
  assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt16(44+i*2,true)),[-32768,0,16384,32767]);
  const b=encodeAudio(pcm,{...audioSettings.output(),bits:24,preventClipping:false}).bytes;
  assert.deepEqual([...b.subarray(44)],[0,0,128,0,0,0,0,0,64,255,255,127]);
  assert.deepEqual([...pcm.channels[0]!],[-1,0,.5,1]);
});
test('AX03 downmix cancels opposite channels; resampling removes above-Nyquist energy', () => {
  const input={sampleRate:48000,channels:[new Float32Array(4800).fill(.5),new Float32Array(4800).fill(-.5)]};
  const result=encodeAudio(input,{...audioSettings.output(),channels:'mono'}); assert.equal(result.frames,4410); assert.ok(result.bytes.subarray(44).every(x=>x===0));
  const tone={sampleRate:48000,channels:[Float32Array.from({length:48000},(_,i)=>.5*Math.sin(i*2*Math.PI*18000/48000))]};
  const low=encodeAudio(tone,{...audioSettings.output(),sampleRate:22050}); const v=new DataView(low.bytes.buffer); let energy=0; for(let i=100;i<low.frames-100;i++) energy+=(v.getInt16(44+2*i,true)/32768)**2;
  assert.ok(Math.sqrt(energy/(low.frames-200))<.01); assert.equal(low.frames,22050);
});
test('AX03 clipping protection, MP3 frame sync and rejection', () => {
  const hot=encodeAudio({sampleRate:44100,channels:[Float32Array.from([2,1])]},audioSettings.output()); const v=new DataView(hot.bytes.buffer); assert.ok(v.getInt16(44,true)<32767); assert.equal(Math.round(v.getInt16(44,true)/v.getInt16(46,true)),2);
  const result=encodeAudio({sampleRate:44100,channels:[Float32Array.from({length:4410},(_,i)=>.5*Math.sin(i/10))]},{...audioSettings.output(),format:'mp3',bitrate:128});
  assert.equal(result.mime,'audio/mpeg'); assert.equal(result.bytes[0],255); assert.equal(result.bytes[1]!&224,224); assert.ok(result.bytes.length>1000);
  assert.throws(()=>encodeAudio(pcm,{...audioSettings.output(),sampleRate:0} as never),RangeError);
});
test('AX03 odd-length PCM24 WAV is word padded and MP3 headers retain selected rates',()=>{
 const single=encodeAudio({sampleRate:44100,channels:[Float32Array.of(0)]},{...audioSettings.output(),bits:24});const v=new DataView(single.bytes.buffer);
 assert.equal(single.bytes.length,48);assert.equal(v.getUint32(4,true),40);assert.equal(v.getUint32(40,true),3);assert.equal(single.bytes[47],0);
 for(const sampleRate of [22050,44100,48000] as const){const encoded=encodeAudio({sampleRate,channels:[new Float32Array(5000)]},{...audioSettings.output(),format:'mp3',sampleRate,bitrate:64,channels:'mono'});const b=encoded.bytes,version=(b[1]!>>3)&3;assert.equal([44100,48000,32000][(b[2]!>>2)&3]!/(version===3?1:version===2?2:4),sampleRate);}
});

test('AG01/AX03 every supported MP3 pair retains rate, bitrate and channels in every frame',()=>{
 for(const channels of ['mono','preserve'] as const)for(const bitrate of audioExport.bitrates()){
  const base={...audioSettings.output(),format:'mp3' as const,channels,bitrate};
  for(const sampleRate of audioExport.compatibleRates(base))for(const count of (channels==='mono'?[1]:[1,2])){
   const pcm={sampleRate,channels:Array.from({length:count},(_,c)=>Float32Array.from({length:Math.max(1152,sampleRate/10)},(_,i)=>.3*Math.sin(i*.15+c)))};
   const bytes=encodeAudio(pcm,{...base,sampleRate}).bytes;let at=0,frames=0;
   while(at<bytes.length){assert.equal(bytes[at],255);assert.equal(bytes[at+1]!&224,224);const version=(bytes[at+1]!>>3)&3;
    const actualRate=[44100,48000,32000][(bytes[at+2]!>>2)&3]!/(version===3?1:version===2?2:4);
    const actualBitrate=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bytes[at+2]!>>4];
    assert.equal(actualRate,sampleRate,`${channels}/${bitrate}`);assert.equal(actualBitrate,bitrate);assert.equal((bytes[at+3]!>>6)===3?1:2,count);
    at+=Math.floor((version===3?144000:72000)*bitrate/sampleRate)+((bytes[at+2]!>>1)&1);frames++;
   }assert.equal(at,bytes.length);assert.ok(frames>1);
  }
 }
});
test('AG01/AX03 lower bitrate presets produce successively smaller MP3 files',()=>{
 const pcm={sampleRate:48000,channels:[Float32Array.from({length:96000},(_,i)=>.3*Math.sin(i*.05))]};let previous=Infinity;
 for(const preset of audioExport.presets().filter(p=>p.output.format==='mp3')){const out=encodeAudio(pcm,preset.output);assert.ok(out.bytes.length<previous,preset.id);previous=out.bytes.length;}
});
