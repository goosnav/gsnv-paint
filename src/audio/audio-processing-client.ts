/**
 * PURPOSE    Adapt local audio processing to browser capabilities.
 * KIND       SHELL
 * CONTRACT   decode(file,signal) returns owned PCM at 48kHz; run(job,signal,progress)
 *            consumes job PCM and returns processed PCM or encoded bytes. One active run.
 *            Abort/dispose rejects pending runs and terminates workers. Errors are readable.
 * GUARANTEES No network, playback or document mutation. Late decode/worker replies discarded.
 * TUNING     128MiB source/decoded limit, 30 minutes, mono/stereo. Decoder rate 48000Hz.
 * DECISIONS  D1: Inline locally bundled worker survives WebKit COEP cache variations.
 *            Alternative external module worker previously failed there; Revisit if: that browser issue is fixed.
 * LIMITS     Browser decoding cannot be interrupted mid-decode; abort discards its result.
 * TESTBENCH  node --import tsx --test src/audio/audio-processing-client.test.ts
 * DEMO       npm run dev; Audio > Effects & batch
 */
import {validatePcm,type AudioPcm} from './audio-effects.ts';
import type {AudioJob,AudioReply} from './audio-processing.worker.ts';
type Done=Extract<AudioReply,{ok:true}>;
export function createAudioProcessor(ports:{worker?:()=>Promise<Worker>;decode?:(bytes:ArrayBuffer)=>Promise<AudioBuffer>}={}) {
 let disposed=false,pending:(()=>void)|null=null;
 const check=(signal:AbortSignal)=>{if(disposed)throw new Error('Audio processor is closed.');signal.throwIfAborted();};
 return {
  async decode(file:File,signal:AbortSignal):Promise<AudioPcm>{
   check(signal);if(!file.size||file.size>128*1024*1024)throw new Error('Choose a nonempty audio file up to 128 MiB.');
   const bytes=await file.arrayBuffer();check(signal);let buffer:AudioBuffer;
   try{buffer=await(ports.decode?ports.decode(bytes):new OfflineAudioContext(2,1,48000).decodeAudioData(bytes));}
   catch{throw new Error(`Could not decode ${file.name}. Try WAV, MP3, M4A, Ogg or FLAC supported by this browser.`);}
   check(signal);if(buffer.numberOfChannels<1||buffer.numberOfChannels>2||buffer.length*buffer.numberOfChannels*4>128*1024*1024||buffer.duration>1800)throw new Error('Use mono/stereo audio up to 30 minutes and 128 MiB decoded.');
   const pcm={sampleRate:buffer.sampleRate,channels:Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c).slice())};validatePcm(pcm);return pcm;
  },
  async run(job:AudioJob,signal:AbortSignal,progress:(stage:string)=>void=()=>{}):Promise<Done>{
   check(signal);if(pending)throw new Error('Audio processing is already running.');
   return new Promise((resolve,reject)=>{
    let worker:Worker|undefined,settled=false;
    const finish=(error?:unknown,result?:Done)=>{if(settled)return;settled=true;worker?.terminate();signal.removeEventListener('abort',cancel);pending=null;if(error)reject(error);else resolve(result!);};
    const cancel=()=>finish(new DOMException('Audio processing cancelled.','AbortError'));pending=cancel;signal.addEventListener('abort',cancel,{once:true});
    const create=ports.worker??(async()=>{const{default:Worker}=await import('./audio-processing.worker.ts?worker&inline');return new Worker({name:'Audio effects and export'});});
    void create().then(w=>{if(settled||disposed){w.terminate();return;}worker=w;
     w.onerror=event=>{event.preventDefault();finish(new Error(event.message||'Audio worker failed.'));};
     w.onmessage=(event:MessageEvent<AudioReply>)=>{if(settled)return;const reply=event.data;if('stage'in reply)progress(reply.stage);else if(reply.ok)finish(undefined,reply);else finish(new Error(reply.error));};
     w.postMessage(job,job.pcm.channels.map(c=>c.buffer as ArrayBuffer));
    }).catch(finish);
   });
  },
  dispose(){if(disposed)return;disposed=true;pending?.();},
 };
}
