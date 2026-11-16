import {modulateAudio} from './audio-modulation.ts';import {audioSettings} from './audio-effect-settings.ts';
const pcm=Float32Array.from({length:48000},(_,i)=>.25*Math.sin(2*Math.PI*440*i/48000));
for(const kind of ['flanger','phaser'] as const){const out=modulateAudio(pcm,48000,audioSettings.effect(kind));console.log(kind,`${out.length} samples`, `RMS ${Math.sqrt(out.reduce((s,x)=>s+x*x,0)/out.length).toFixed(5)}`);}
