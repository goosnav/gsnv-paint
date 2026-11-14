/**
 * PURPOSE    Stage a complete STEP import before offering project replacement.
 * KIND       SHELL
 * CONTRACT   IN: S07 file ports, C55 worker ports, ID provider and callbacks.
 *            OUT: run/cancel/dispose; onImport receives validated source/preview/base identity.
 *            RAISES: TypeError for invalid ports; operation failures use onStatus.
 * GUARANTEES No document mutation, stale publication, network upload or partial success.
 * TUNING     MAX_STEP_BYTES=64 MiB is passed to S07 before any selected-file read.
 * DECISIONS  D1: Validate in a disposable worker before host.open. Alternative: replace
 *            first and recover on failure. Revisit if: shared projects gain staged replacement.
 * LIMITS     Native picker UI may stay open after cancel, but its result is ignored.
 *            C55's 30-second watchdog bounds work; replacement consent belongs to the host.
 * TESTBENCH  src/cad/cad-step-import.test.ts -- run with: node --import tsx --test src/cad/cad-step-import.test.ts
 */
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { cadProjectSource, type CADSource } from './cad-project-source.ts';
import { cadWorkerClient, type CADProtocol, type CADBuild } from './cad-worker-client.ts';
type Ports={files:FilePorts;assets:CADProtocol['assets'];id():string;createWorker():Pick<Worker,'postMessage'|'terminate'|'addEventListener'|'removeEventListener'>;
  onStatus(state:'busy'|'ready'|'error',message:string):void;onImport(source:CADSource,preview:CADBuild,baseIdentity:string|null):void};
export function cadSTEPImport(ports:Ports):{run(request:{identity:string|null;units:'mm'|'inch'}):Promise<void>;cancel():void;dispose():void}{
  if(!ports?.files||[ports.id,ports.createWorker,ports.onStatus,ports.onImport].some(v=>typeof v!=='function'))throw new TypeError('STEP import needs file/worker ports, IDs and callbacks.');
  const MAX_STEP_BYTES=64*1024*1024;
  type Job={done:Promise<void>;finish():void;worker:ReturnType<typeof cadWorkerClient>|null};
  let active:Job|null=null,disposed=false;
  const current=(job:Job)=>!disposed&&active===job;
  function stop(notify:boolean){const job=active;if(!job)return;active=null;job.worker?.dispose();job.finish();if(notify&&!disposed)ports.onStatus('ready','STEP import canceled.');}
  async function run(request:{identity:string|null;units:'mm'|'inch'}){
    if(disposed)return;stop(false);let finish!:()=>void;
    const job:Job={done:new Promise<void>(resolve=>{finish=resolve;}),finish:()=>finish(),worker:null};active=job;
    try{
      const opening=fileAccess({op:'open',accept:{'model/step':['.step','.stp']},maxBytes:MAX_STEP_BYTES},ports.files);
      ports.onStatus('busy','Choose a STEP file…');const selected=await Promise.race([opening,job.done]);if(!current(job)||!selected)return;
      if('cancelled' in selected){ports.onStatus('ready','STEP import canceled.');return;}
      if(!selected.ok)throw new Error(selected.error.message);
      const bytes=new Uint8Array(selected.value.bytes.reduce((sum,part)=>sum+part.byteLength,0));let offset=0;
      for(const part of selected.value.bytes){bytes.set(part,offset);offset+=part.byteLength;}
      const source=cadProjectSource({operation:'import',name:selected.value.name,bytes,units:request.units,featureId:ports.id(),assetId:ports.id()});
      ports.onStatus('busy','Validating every STEP solid… Esc cancels.');
      job.worker=cadWorkerClient({assets:ports.assets,createWorker:ports.createWorker,
        onError(_identity,message){if(current(job)){ports.onStatus('error',`STEP import failed: ${message}`);stop(false);}},
        onResult(_identity,preview){
          if(!current(job))return;
          if(!preview.solid||!preview.bodies?.length){ports.onStatus('error','STEP import failed: the worker did not return a complete solid preview.');stop(false);return;}
          stop(false);ports.onStatus('ready',`Validated ${preview.bodies.length} STEP solid${preview.bodies.length===1?'':'s'}.`);
          ports.onImport(source,preview,request.identity);
        },
      });
      job.worker.submit('import',source);await job.done;
    }catch(cause){if(current(job))ports.onStatus('error',`STEP import failed: ${cause instanceof Error?cause.message:String(cause)}`);}
    finally{if(active===job)stop(false);}
  }
  return{run,cancel(){stop(true);},dispose(){if(disposed)return;stop(false);disposed=true;}};
}
