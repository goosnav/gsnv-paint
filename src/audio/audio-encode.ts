/**
 * PURPOSE    Encode processed PCM into a portable audio file.
 * KIND       CORE
 * CONTRACT   IN AX02 PCM + AX01 output settings; OUT owned bytes, extension, MIME,
 *            sampleRate and frames. RAISES RangeError for invalid inputs/output >128MiB.
 * GUARANTEES Pure, no source mutation; stereo downmix averages channels; resampling preserves
 *            duration within one output sample. Optional peak protection only reduces gain.
 * TUNING     32-tap windowed sinc scaled for downsampling, 1024 phases; MP3 blocks 1152 samples.
 * DECISIONS  D1: Offline LAME. Alternative: MediaRecorder requires real-time export with codec gaps.
 *            Revisit if: native encoders offer equally portable MP3. MP3 adds codec delay/padding.
 * LIMITS     No tags/artwork copied; PCM16/24 WAV or CBR MP3. No gapless MP3 metadata.
 * TESTBENCH  node --import tsx --test src/audio/audio-encode.test.ts
 * DEMO       node --import tsx src/audio/audio-encode.demo.ts
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import { audioSettings, type AudioExport } from './audio-effect-settings.ts';
import { validatePcm, type AudioPcm } from './audio-effects.ts';
export type AudioEncoded = { bytes: Uint8Array<ArrayBuffer>; mime: string; extension: 'wav' | 'mp3'; sampleRate: number; frames: number };
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input.slice();
  const output = new Float32Array(Math.max(1, Math.round(input.length * to / from))), cutoff = Math.min(1,to/from)*.94, radius = Math.ceil(16/cutoff), phases = 1024;
  const kernels = Array.from({length:phases},(_,phase)=>{
    const weights=new Float64Array(radius*2); let sum=0;
    for(let k=-radius+1;k<=radius;k++) { const x=k-phase/phases, z=Math.PI*x*cutoff, weight=(Math.abs(x)<radius ? .5+.5*Math.cos(Math.PI*x/radius) : 0)*(Math.abs(z)<1e-10 ? cutoff : Math.sin(z)/(Math.PI*x)); weights[k+radius-1]=weight; sum+=weight; }
    return weights.map(x=>x/sum);
  });
  for(let i=0;i<output.length;i++) { const position=i*from/to, at=Math.floor(position), kernel=kernels[Math.floor((position-at)*phases)]!; let sum=0;
    for(let k=-radius+1;k<=radius;k++) sum+=(input[Math.max(0,Math.min(input.length-1,at+k))]??0)*kernel[k+radius-1]!;
    output[i]=sum;
  }
  return output;
}
export function encodeAudio(pcm: AudioPcm, raw: AudioExport): AudioEncoded {
  validatePcm(pcm); const settings=audioSettings.output(raw);
  let input=pcm.channels;
  if(settings.channels==='mono' && input.length===2) input=[Float32Array.from(input[0]!, (x,i)=>(x+input[1]![i]!)/2)];
  const expectedFrames=Math.max(1,Math.round(input[0]!.length*settings.sampleRate/pcm.sampleRate));
  if(expectedFrames*input.length*4>128*1024*1024)throw new RangeError('Resampled audio exceeds 128 MiB. Choose a lower output sample rate or shorter audio.');
  const channels=input.map(c=>resample(c,pcm.sampleRate,settings.sampleRate)), frames=channels[0]!.length;
  let peak=0; for(const channel of channels) for(const sample of channel) peak=Math.max(peak,Math.abs(sample));
  const gain=settings.preventClipping && peak>.98 ? .98/peak : 1;
  const integer=(sample:number, bits:number)=>{ const x=Math.max(-1,Math.min(1,sample*gain)); return Math.round(x*(x<0 ? 2**(bits-1) : 2**(bits-1)-1)); };
  let bytes: Uint8Array<ArrayBuffer>;
  if(settings.format==='mp3') {
    const encoder=new Mp3Encoder(channels.length,settings.sampleRate,settings.bitrate), parts:Uint8Array[]= []; let total=0;
    const collect=(part:Uint8Array)=>{ const owned=Uint8Array.from(part); total+=owned.length; if(total>128*1024*1024) throw new RangeError('Encoded audio exceeds 128 MiB.'); parts.push(owned); };
    for(let at=0;at<frames;at+=1152) { const block=channels.map(c=>Int16Array.from(c.subarray(at,at+1152),x=>integer(x,16))); collect(encoder.encodeBuffer(block[0]!,block[1])); }
    collect(encoder.flush()); bytes=new Uint8Array(total); let offset=0; for(const part of parts) { bytes.set(part,offset); offset+=part.length; }
  } else {
    const stride=settings.bits/8, length=frames*channels.length*stride; if(length+44+(length%2)>128*1024*1024) throw new RangeError('WAV exceeds 128 MiB. Choose MP3 or shorter audio.');
    bytes=new Uint8Array(length+44+(length%2)); const view=new DataView(bytes.buffer), tag=(at:number,text:string)=>bytes.set(new TextEncoder().encode(text),at);
    tag(0,'RIFF'); view.setUint32(4,bytes.length-8,true); tag(8,'WAVE'); tag(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels.length,true); view.setUint32(24,settings.sampleRate,true);
    view.setUint32(28,settings.sampleRate*channels.length*stride,true); view.setUint16(32,channels.length*stride,true); view.setUint16(34,settings.bits,true); tag(36,'data'); view.setUint32(40,length,true);
    for(let i=0;i<frames;i++) for(let c=0;c<channels.length;c++) { const at=44+(i*channels.length+c)*stride, value=integer(channels[c]![i]!,settings.bits); if(stride===2) view.setInt16(at,value,true); else { bytes[at]=value&255; bytes[at+1]=(value>>8)&255; bytes[at+2]=(value>>16)&255; } }
  }
  return {bytes,mime:settings.format==='wav'?'audio/wav':'audio/mpeg',extension:settings.format,sampleRate:settings.sampleRate,frames};
}
