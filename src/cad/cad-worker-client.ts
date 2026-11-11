/**
 * PURPOSE    Own a cancellable CAD worker request stream.
 * KIND       SHELL
 * CONTRACT   IN: worker factory, same-origin asset URLs, result/error callbacks.
 *            OUT: submit/cancel/dispose; one running plus latest pending job; stale replies
 *            never publish; cancel/error/timeout terminates native work before replacement.
 *            RAISES: TypeError for invalid ports; worker failures use onError.
 * GUARANTEES No geometry calculation or late publication after disposal.
 * TUNING     WATCHDOG_MS=30000 bounds a stalled native call, not a performance acceptance target.
 * DECISIONS  D1: Keep only latest pending request. Alternative: queue every preview;
 *            that wastes rebuilds behind typing. Revisit if: jobs become independent exports.
 * LIMITS     Browser worker required; the real smoke is the CAD-APP browser production test.
 * TESTBENCH  src/cad/cad-worker-client.test.ts -- run with: node --import tsx --test src/cad/cad-worker-client.test.ts
 */
import type { CADContent } from './editable-cad-content.ts';
import type { SolidPreview } from './extrude-preview.ts';
export type CADBuild = { entities: CADContent['graph']['features'][0]['definition']['sketch']['entities']; dof: number; solid: SolidPreview | null };
export type CADProtocol = {
  assets: { kernelModule: string; kernelWasm: string; solverModule: string; solverWasm: string };
  request: { id: number; content: CADContent; assets: CADProtocol['assets'] };
  reply: { id: number; ok: true; value: CADBuild } | { id: number; ok: false; message: string };
};
type WorkerPort = Pick<Worker,'postMessage'|'terminate'|'addEventListener'|'removeEventListener'>;
type Ports = { createWorker(): WorkerPort; assets: CADProtocol['assets']; onResult(identity:string,value:CADBuild):void; onError(identity:string,message:string):void };
export function cadWorkerClient(ports:Ports): {submit(identity:string,content:CADContent):void;cancel():void;dispose():void} {
  if(!ports||[ports.createWorker,ports.onResult,ports.onError].some(p=>typeof p!=='function'))throw new TypeError('CAD workers need a factory and result/error callbacks.');
  const WATCHDOG_MS=30000;
  type Job={id:number;identity:string;content:CADContent};
  let sequence=0,disposed=false,worker:WorkerPort|null=null,running:Job|null=null,pending:Job|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  const stop=()=>{
    clearTimeout(timer);timer=undefined;
    if(worker){worker.removeEventListener('message',message);worker.removeEventListener('error',error);worker.removeEventListener('messageerror',error);worker.terminate();worker=null;}
    running=null;
  };
  function start(job:Job){
    if(disposed)return;running=job;
    try{
      if(!worker){worker=ports.createWorker();worker.addEventListener('message',message);worker.addEventListener('error',error);worker.addEventListener('messageerror',error);}
      timer=setTimeout(()=>failure('CAD rebuild timed out. Edit the model or retry.'),WATCHDOG_MS);
      worker.postMessage({id:job.id,content:job.content,assets:ports.assets} satisfies CADProtocol['request']);
    }catch(cause){failure(cause instanceof Error?cause.message:String(cause));}
  }
  function next(){const job=pending;pending=null;if(job)start(job);}
  function failure(reason:string){
    const job=running;stop();
    if(!disposed&&job&&!pending)ports.onError(job.identity,reason);
    next();
  }
  function error(event:Event){event.preventDefault();failure('message' in event?String(event.message):'The CAD worker could not read its response.');}
  function message(event:Event){
    const reply=(event as MessageEvent<CADProtocol['reply']>).data;
    if(disposed||!running||reply?.id!==running.id)return;
    if(!reply.ok){failure(reply.message);return;}
    const job=running;running=null;clearTimeout(timer);timer=undefined;
    if(!pending)ports.onResult(job.identity,reply.value);
    next();
  }
  return{
    submit(identity,content){if(disposed)return;const job={id:++sequence,identity,content};if(running)pending=job;else start(job);},
    cancel(){pending=null;stop();},
    dispose(){if(disposed)return;disposed=true;pending=null;stop();},
  };
}
