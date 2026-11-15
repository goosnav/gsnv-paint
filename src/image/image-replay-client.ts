/**
 * PURPOSE    Run cancellable recipes away from the editor thread.
 * KIND       SHELL
 * CONTRACT   createImageReplay({workerFactory?}) returns run(image,recipe),cancel,dispose.
 *            Injected factories may return a worker or a Promise of one.
 *            Resolves canonical immutable ImageContent; rejects failed jobs visibly.
 *            RAISES: AbortError for Stop/supersession; Error for timeout or bad output.
 * GUARANTEES Fresh worker, owned structured copies, input tiles never transferred away.
 * TUNING     60s execution deadline, 256 MiB decoded layer pixels per job.
 * DECISIONS  D1: Hard termination makes Stop work during synchronous CORE loops.
 *            Alternative: main-thread replay, rejected because Stop could not interrupt.
 *            Revisit if: streaming operations introduce cooperative cancellation.
 *            D2: Locally bundled inline workers avoid WebKit external-worker cache
 *            COEP failures without relaxing isolation or adding offline cache keys.
 * LIMITS     Browser processes have no hard per-worker memory quota. Vite emits
 *            Blob/classic workers in production, module workers in dev.
 * TESTBENCH  node --import tsx --test src/image/image-replay-client.test.ts
 * DEMO       npm run dev; /src/image/image-replay-client.demo.html
 */
import {imageContent,type ImageContent} from './image-content.ts';
import {imageRecipe} from './image-recipe.ts';
import type {ImageRecipe} from './image-operation-types.ts';
type WorkerPort=Pick<Worker,'postMessage'|'terminate'|'addEventListener'|'removeEventListener'>;
function canonical(value:ImageContent):ImageContent{
 if(!value||!Array.isArray(value.layers)||value.layers.reduce((sum,l)=>sum+(Array.isArray(l.tiles)?l.tiles.reduce((n:number,t:Uint8ClampedArray)=>n+t.byteLength,0):Infinity),0)>256*1024*1024)throw new RangeError('Recipe processing supports up to 256 MiB of decoded layer pixels.');
 const encoded=imageContent({operation:'encode',value});return imageContent({operation:'decode',...encoded});
}
export function createImageReplay({workerFactory}:{workerFactory?:()=>WorkerPort|Promise<WorkerPort>}={}){
 let active:((error:Error)=>void)|null=null,disposed=false;
 const cancel=()=>active?.(new DOMException('Recipe processing stopped.','AbortError'));
 return{run(image:ImageContent,recipe:ImageRecipe):Promise<ImageContent>{if(disposed)return Promise.reject(new DOMException('Recipe runner closed.','AbortError'));cancel();
 return new Promise((resolve,reject)=>{let worker:WorkerPort|null=null,done=false,timer:ReturnType<typeof setTimeout>|undefined;
 const finish=(error:Error|null,value?:ImageContent)=>{if(done)return;done=true;clearTimeout(timer);if(worker){worker.removeEventListener('message',message);worker.removeEventListener('error',errorEvent);worker.removeEventListener('messageerror',errorEvent);worker.terminate();}active=null;if(error)reject(error);else resolve(value!);};
 const errorEvent=(e:Event)=>{e.preventDefault();finish(new Error('The recipe worker failed. No changes were applied.'));};
 const message=(e:Event)=>{try{const reply=(e as MessageEvent).data;if(reply?.ok!==true)throw new Error(typeof reply?.error==='string'?reply.error.slice(0,500):'Invalid recipe response.');finish(null,canonical(reply.value));}catch(cause){finish(cause instanceof Error?cause:new Error(String(cause)));}};
 active=error=>finish(error);
 const failed=(cause:unknown)=>finish(cause instanceof Error?cause:new Error(String(cause)));
 try{
  const validated=imageRecipe({operation:'validate',value:recipe}),owned=canonical(image);
  const start=(created:WorkerPort)=>{
   if(done){created.terminate();return;}
   worker=created;
   try{worker.addEventListener('message',message);worker.addEventListener('error',errorEvent);worker.addEventListener('messageerror',errorEvent);worker.postMessage({image:owned,recipe:validated});}catch(cause){failed(cause);}
  };
  timer=setTimeout(()=>finish(new Error('Recipe exceeded 60 seconds. Try smaller images or fewer steps.')),60000);
  if(workerFactory){const created=workerFactory();if('then'in created)void created.then(start,failed);else start(created);}
  else{
   if(typeof Worker==='undefined')throw new Error('This browser cannot run Image recipe workers.');
   void import('./image-replay.worker.ts?worker&inline').then(({default:InlineWorker})=>{if(!done)start(new InlineWorker({name:'Paint image recipe'}));}).catch(failed);
  }
 }catch(cause){failed(cause);}
 });},cancel,dispose(){disposed=true;cancel();}};
}
