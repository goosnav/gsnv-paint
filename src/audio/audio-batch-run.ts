/**
 * PURPOSE    Process an immutable song selection sequentially into an isolated destination.
 * KIND       SHELL
 * CONTRACT   IN selected files, destination, process callback, validated settings and AbortSignal;
 *            OUT written/error entries and completed/stopped/failed status, optional finished output.
 *            Read/decode errors skip a song; write/finalize errors stop. Cancellation stops before next write.
 * GUARANTEES No original writes, one song in flight, names collision-safe, completed directory files retained.
 * TUNING     Existing ZIP limit 128MiB; recipe/report written as audio-batch-report.json.
 * DECISIONS  D1: Stop on output errors. Alternative: keep retrying a full disk; no benefit.
 *            Revisit if: the owner requests a retry UI.
 * LIMITS     Incomplete ZIP is discarded on cancel; cannot undo completed folder writes.
 * TESTBENCH  node --import tsx --test src/audio/audio-batch-run.test.ts
 * DEMO       npm run dev; Audio > Effects & batch > Choose folder
 */
import {batchOutputName} from '../image/image-batch-paths.ts';
import type {BatchSelection,BatchDestination,BatchResult} from '../image/image-batch-files.ts';
import {audioSettings,type AudioEffect,type AudioExport} from './audio-effect-settings.ts';
export type AudioBatchReport={status:'completed'|'stopped'|'failed';written:number;entries:{input:string;status:'written'|'error';output?:string;message?:string}[];error?:string;result?:BatchResult};
type Ports={selection:BatchSelection;destination:BatchDestination;chain:AudioEffect[];output:AudioExport;signal:AbortSignal;process(file:File,signal:AbortSignal):Promise<Blob>;progress(done:number,name:string):void};
const message=(cause:unknown)=>(cause instanceof Error?cause.message:String(cause)).slice(0,500);
export async function runAudioBatch(p:Ports):Promise<AudioBatchReport>{
 const chain=audioSettings.chain(p.chain),output=audioSettings.output(p.output),report:AudioBatchReport={status:'completed',written:0,entries:[]},used:string[]=[];
 try{
  for(const input of p.selection.inputs){
   if(p.signal.aborted){report.status='stopped';break;}p.progress(report.entries.length,input.name);let blob:Blob;
   try{const file=await input.read();p.signal.throwIfAborted();blob=await p.process(file,p.signal);}
   catch(cause){if(p.signal.aborted){report.status='stopped';break;}report.entries.push({input:input.name,status:'error',message:message(cause)});continue;}
   if(p.signal.aborted){report.status='stopped';break;}
   const name=batchOutputName({inputName:input.name,extension:output.format,used});
   try{await p.destination.write(name,blob);}catch(cause){report.entries.push({input:input.name,status:'error',message:message(cause)});throw cause;}
   used.push(name);report.written++;report.entries.push({input:input.name,status:'written',output:name});p.progress(report.entries.length,input.name);
  }
  if(p.signal.aborted)report.status='stopped';
  if(report.status==='completed'){
   await p.destination.write('audio-batch-report.json',new Blob([JSON.stringify({version:1,chain,output,entries:report.entries},null,2)],{type:'application/json'}));
   p.signal.throwIfAborted();report.result=await p.destination.finish();
  }else await p.destination.cancel();
 }catch(cause){report.status=p.signal.aborted?'stopped':'failed';report.error=message(cause);try{await p.destination.cancel();}catch{/* Original error is the actionable failure. */}}
 return report;
}
