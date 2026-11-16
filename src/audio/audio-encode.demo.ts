import { encodeAudio } from './audio-encode.ts';
import { audioSettings } from './audio-effect-settings.ts';
for(const format of ['wav','mp3'] as const) { const out=encodeAudio({sampleRate:48000,channels:[new Float32Array(48000)]},{...audioSettings.output(),format}); console.log(format,out.bytes.length,'bytes',out.frames,'frames',out.sampleRate,'Hz'); }
