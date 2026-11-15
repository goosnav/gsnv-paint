/**
 * PURPOSE    Execute one validated image recipe in a dedicated worker.
 * KIND       SHELL
 * CONTRACT   One image/recipe request; replies immutable content or bounded error.
 * GUARANTEES No filesystem, network or browser UI; delegates semantics to CORE.
 * TUNING     Caller terminates on Stop or timeout.
 * DECISIONS  D1: One request per worker avoids hidden state between batch inputs.
 *            Alternative: persistent worker, rejected to release native allocations.
 *            Revisit if: startup dominates processing time.
 * LIMITS     Termination is the cancellation mechanism.
 * TESTBENCH  src/image/image-replay.worker.test.ts
 * DEMO       /src/image/image-replay-client.demo.html
 */
import {imageRecipe} from './image-recipe.ts';
type Port={onmessage:((e:MessageEvent)=>void)|null;postMessage(value:unknown):void};
export function bindImageReplayWorker(port:Port):()=>void{
 port.onmessage=e=>{port.onmessage=null;try{const result=imageRecipe({operation:'replay',value:e.data.recipe,state:{image:e.data.image,clipboard:null}});port.postMessage({ok:true,value:result.image});}catch(cause){port.postMessage({ok:false,error:(cause instanceof Error?cause.message:String(cause)).slice(0,500)});}};
 return()=>{port.onmessage=null;};
}
if(typeof self!=='undefined'&&typeof document==='undefined')bindImageReplayWorker(self);
