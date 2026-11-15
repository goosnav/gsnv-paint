/**
 * PURPOSE    Process selected images sequentially without writing originals.
 * KIND       SHELL
 * CONTRACT   Assembly: runImageBatch(ports) returns completed/stopped/failed report with each
 *            input result, successful count and optional finished destination.
 * GUARANTEES Decode/replay/encode/write one input at a time. Bad images continue;
 *            write failures stop. Abort checks separate every awaited stage.
 * TUNING     Input, pixel and output bounds live in files/recipe/codec leaves.
 * DECISIONS  D1: Commit each file before reading the next; stop retains completed
 *            directory outputs but discards incomplete ZIP. Alternative: concurrent files,
 *            rejected to bound decoded memory. Revisit if: ZIP becomes streaming.
 * LIMITS     Cancellation latency of browser decode/encode depends on that API.
 * TESTBENCH  node --import tsx --test src/image/image-batch-run.test.ts
 * DEMO       npm run dev; Automation > Batch process.
 */
import {batchOutputName} from './image-batch-paths.ts';
import {imageRecipe} from './image-recipe.ts';
import type {ImageContent} from './image-content.ts';
import type {ImageRecipe} from './image-operation-types.ts';
import type {BatchSelection,BatchDestination,BatchResult} from './image-batch-files.ts';
export type ImageBatchReport={status:'completed'|'stopped'|'failed';processed:number;written:number;errors:{name:string;message:string}[];outputs:string[];entries:{input:string;output:string|null;status:'written'|'error';message:string}[];result:BatchResult|null};
export type ImageBatchProgress={processed:number;total:number;written:number;name:string};
type Ports={selection:BatchSelection;destination:BatchDestination;recipe:ImageRecipe;decode(file:File):Promise<ImageContent>;replay(image:ImageContent,recipe:ImageRecipe):Promise<ImageContent>;encode(image:ImageContent,output:'png'|'project',name:string):Promise<Blob>;signal:AbortSignal;onProgress(value:ImageBatchProgress):void};
export async function runImageBatch(p:Ports):Promise<ImageBatchReport>{
 const recipe=imageRecipe({operation:'validate',value:p.recipe}),report:ImageBatchReport={status:'completed',processed:0,written:0,errors:[],outputs:[],entries:[],result:null};
 const abort=()=>{if(p.signal.aborted)throw new DOMException('Batch stopped.','AbortError');};
 for(const input of p.selection.inputs){
  if(p.signal.aborted){report.status='stopped';break;}
  p.onProgress({processed:report.processed,total:p.selection.inputs.length,written:report.written,name:input.name});
  let blob:Blob,name:string;
  try{abort();const file=await input.read();abort();const image=await p.decode(file);abort();const result=await p.replay(image,recipe);abort();name=batchOutputName({inputName:input.name,extension:recipe.output==='png'?'png':'gsnv-image',used:report.outputs});blob=await p.encode(result,recipe.output,name);abort();}
  catch(cause){if(p.signal.aborted){report.status='stopped';break;}report.errors.push({name:input.name,message:(cause instanceof Error?cause.message:String(cause)).slice(0,500)});report.entries.push({input:input.name,output:null,status:'error',message:report.errors.at(-1)!.message});report.processed++;continue;}
  try{await p.destination.write(name,blob);report.outputs.push(name);report.entries.push({input:input.name,output:name,status:'written',message:''});report.written++;report.processed++;}
  catch(cause){report.status=p.signal.aborted?'stopped':'failed';report.errors.push({name:input.name,message:`Output write failed: ${(cause instanceof Error?cause.message:String(cause)).slice(0,460)}`});report.entries.push({input:input.name,output:null,status:'error',message:report.errors.at(-1)!.message});break;}
 }
 if(p.signal.aborted)report.status='stopped';
 if(report.status==='completed'){try{report.result=await p.destination.finish();}catch(cause){report.status='failed';report.errors.push({name:p.destination.name,message:(cause instanceof Error?cause.message:String(cause)).slice(0,500)});await p.destination.cancel();}}
 else await p.destination.cancel();
 p.onProgress({processed:report.processed,total:p.selection.inputs.length,written:report.written,name:''});return report;
}
