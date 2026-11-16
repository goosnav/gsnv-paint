import {test} from 'node:test';
import assert from 'node:assert/strict';
import {audioExport} from './audio-export-profile.ts';
test('AG01 named quality ladder covers 8..192 with exact phone golden and owned copies',()=>{
 const presets=audioExport.presets();assert.deepEqual(presets.filter(p=>p.output.format==='mp3').map(p=>p.output.bitrate),[192,128,96,64,48,32,24,16,8]);
 assert.deepEqual(audioExport.preset('phone').output,{format:'mp3',bits:16,sampleRate:22050,channels:'mono',bitrate:32,preventClipping:true});
 const a=audioExport.preset('phone');a.output.bitrate=8;assert.equal(audioExport.preset('phone').output.bitrate,32);
 for(const p of presets)assert.deepEqual(audioExport.validate(p.output),p.output);
 assert.throws(()=>audioExport.preset('missing'),RangeError);
});
test('AG01 low-rate compatibility is explicit and repair only adjusts sample rate',()=>{
 const base=audioExport.preset('web').output;
 assert.deepEqual(audioExport.compatibleRates({...base,bitrate:8}),[8000]);
 assert.deepEqual(audioExport.compatibleRates({...base,bitrate:16,channels:'mono'}),[8000,11025,12000,16000]);
 const old={...base,sampleRate:44100};assert.throws(()=>audioExport.validate(old),/sample rate/);
 assert.deepEqual(audioExport.repair(old).output,{...old,sampleRate:24000});
 assert.match(audioExport.repair(old).notice,/44100.*24000/);
 assert.equal(audioExport.repair(base).notice,'');
 assert.deepEqual(audioExport.validate({...base,bitrate:320,sampleRate:44100}),{...base,bitrate:320,sampleRate:44100});
 for(const patch of [{bitrate:0},{bitrate:17},{sampleRate:12345},{format:'aac'},{bits:8},{channels:'stereo'},{preventClipping:0},{extra:true},{sampleRate:NaN}])assert.throws(()=>audioExport.validate({...base,...patch}),RangeError);
 for(const bad of [null,[],{},'mp3'])assert.throws(()=>audioExport.validate(bad),RangeError);
});
test('AG01 size estimates use total MP3 bitrate, including mono, and expose WAV channel range',()=>{
 const mono=audioExport.preset('tiny16').output;
 assert.match(audioExport.describe(mono),/120 kB\/min/);
 assert.match(audioExport.describe({...mono,channels:'preserve',sampleRate:8000}),/120 kB\/min/);
 assert.match(audioExport.describe(audioExport.preset('web').output),/480 kB\/min/);
 assert.match(audioExport.describe(audioExport.preset('wav').output),/5.29–10.58 MB\/min/);
 assert.match(audioExport.describe({...audioExport.preset('wav').output,channels:'mono'}),/5.29 MB\/min/);
});
