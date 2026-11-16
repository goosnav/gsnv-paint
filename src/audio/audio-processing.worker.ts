/**
 * PURPOSE    Run local audio DSP/encoding off the UI thread.
 * KIND       SHELL
 * CONTRACT   Bind a message port receiving {pcm,chain,output?}; reply progress then
 *            {ok:true,pcm|encoded} or {ok:false,error}. Invalid payloads return errors.
 * GUARANTEES No files, network or playback. Output transfers ownership to caller.
 * TUNING     One job per worker; stage progress only. Cancellation terminates the worker.
 * DECISIONS  D1: Shared pure engine keeps exports reproducible. Alternative: browser graphs vary.
 *            Revisit if: streamed audio is required. Caller isolates one worker per job.
 * LIMITS     Does not interrupt synchronous DSP; host terminates on cancellation.
 * TESTBENCH  node --import tsx --test src/audio/audio-processing.worker.test.ts
 * DEMO       npm run dev; Audio > Effects & batch
 */
import {processAudio, type AudioPcm} from './audio-effects.ts';
import {encodeAudio, type AudioEncoded} from './audio-encode.ts';
import type {AudioEffect,AudioExport} from './audio-effect-settings.ts';
export type AudioJob = {pcm:AudioPcm;chain:AudioEffect[];output?:AudioExport};
export type AudioReply = {stage:string}|{ok:false;error:string}|{ok:true;pcm:AudioPcm}|{ok:true;encoded:AudioEncoded};
type Port={onmessage:((e:MessageEvent<AudioJob>)=>void)|null;postMessage(reply:AudioReply,transfer?:Transferable[]):void};
export function bindAudioProcessor(port:Port):void {
 port.onmessage=e=>{try {
  if(!e.data) throw new Error('Invalid audio processing request.');
  port.postMessage({stage:'Applying effects…'}); const pcm=processAudio(e.data.pcm,e.data.chain);
  if(e.data.output) { port.postMessage({stage:'Encoding audio…'}); const encoded=encodeAudio(pcm,e.data.output); port.postMessage({ok:true,encoded},[encoded.bytes.buffer]); }
  else port.postMessage({ok:true,pcm},pcm.channels.map(c=>c.buffer as ArrayBuffer));
 }catch(cause){port.postMessage({ok:false,error:(cause instanceof Error?cause.message:String(cause)).slice(0,500)});}};
}
if(typeof document==='undefined' && typeof globalThis.postMessage==='function') bindAudioProcessor(globalThis as unknown as Port);
