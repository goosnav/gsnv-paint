import {test} from 'node:test';import assert from 'node:assert/strict';
import {audioHelp} from './audio-effect-guide.ts';
test('AG02 every effect/parameter/export concept has actionable owned help',()=>{
 const ids={lowpass:['cutoff'],highpass:['cutoff'],digital:['rate','bits','mix'],compressor:['threshold','ratio','attack','release','makeup'],reverb:['mix','decay','damping'],gain:['db'],normalize:['peak'],flanger:['speed','delay','depth','feedback','mix'],phaser:['speed','center','depth','mix'],export:['format','bitrate','sampleRate','channels','bits','preventClipping']};
 for(const [kind,keys]of Object.entries(ids))for(const id of [...(kind==='export'?[]:[kind]),...keys.map(k=>`${kind}.${k}`)]){const h=audioHelp(id);for(const k of ['title','what','lower','higher','start'] as const)assert.ok(h[k].length>8,`${id}.${k}`);h.what='mutated';assert.notEqual(audioHelp(id).what,'mutated');}
 assert.match(audioHelp('compressor').what,/not file size/);assert.match(audioHelp('export.bitrate').lower,/smaller/);
 assert.throws(()=>audioHelp('unknown'),RangeError);
});
