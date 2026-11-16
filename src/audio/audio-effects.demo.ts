import { audioSettings } from './audio-effect-settings.ts';
import { processAudio } from './audio-effects.ts';
const pcm = {sampleRate:48000,channels:[Float32Array.from({length:48000},(_,i)=>.5*Math.sin(i*2*Math.PI*10000/48000))]};
for(const name of ['clean','retro','dreamy'] as const) { const out=processAudio(pcm,audioSettings.preset(name)); console.log(name,'peak',out.channels[0]!.reduce((n,x)=>Math.max(n,Math.abs(x)),0).toFixed(4),'frames',out.channels[0]!.length); }
