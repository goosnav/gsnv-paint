/**
 * PURPOSE    Deliver a cancellable STEP export through browser file access.
 * KIND       SHELL
 * CONTRACT   IN: S07 file ports, same-origin CAD asset URLs, worker factory and
 *            status callback. run receives owned C50 source plus a .step filename
 *            under user activation. OUT: run/cancel/dispose; one fresh worker per
 *            job; native picker starts before asynchronous computation, fallback
 *            download otherwise. Canceled jobs cannot save or report success;
 *            once native close starts, cancellation/replacement is refused until it settles.
 *            RAISES: TypeError for invalid ports; operational failures use onStatus.
 * GUARANTEES No model/history mutation, upload, stale download or reused faulted worker.
 * TUNING     WATCHDOG_MS=30000 limits an unresponsive export, not a performance target.
 * DECISIONS  D1: Separate export worker owns a source snapshot. Alternative: borrow
 *            the live preview worker and risk canceling edits. Revisit if: C27 unifies jobs.
 *            D2: Guard native writes, then make close an irreversible commit state.
 *            Alternative: abort an in-flight close, which can still commit the file.
 *            Revisit if: S07 accepts an AbortSignal directly.
 * LIMITS     Native picker UI requires OS-specific evidence. Fallback success means
 *            browser handoff. A native close that has started cannot be revoked;
 *            disposal suppresses late UI but lets an in-flight close settle.
 * TESTBENCH  src/cad/cad-step-export.test.ts -- run with: node --import tsx --test src/cad/cad-step-export.test.ts
 */
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import type { CADContent } from './editable-cad-content.ts';
import type { CADProtocol } from './cad-worker-client.ts';
type WorkerPort=Pick<Worker,'postMessage'|'terminate'|'addEventListener'|'removeEventListener'>;
export type STEPExportPorts={files:FilePorts;assets:CADProtocol['assets'];createWorker():WorkerPort;onStatus(state:'busy'|'ready'|'error',message:string):void};
export type STEPExportHandle={run(request:{content:CADContent;name:string}):Promise<void>;cancel():void;dispose():void};
export function cadSTEPExport(ports:STEPExportPorts):STEPExportHandle {
  if(!ports?.files||typeof ports.createWorker!=='function'||typeof ports.onStatus!=='function')throw new TypeError('STEP export needs file ports, a worker factory and status callback.');
  const WATCHDOG_MS=30000;
  type File={bytes:Uint8Array;mime:'model/step'};
  type Job={cancelled:Promise<void>;cancel():void;cleanup():void;abortWrite:(()=>Promise<void>)|null;committing:boolean};
  let active:Job|null=null,disposed=false;
  const current=(job:Job)=>!disposed&&active===job;
  const aborted=()=>new DOMException('STEP export canceled.','AbortError');
  function stop(notify:boolean){
    const job=active;if(!job)return true;
    if(job.committing){if(notify&&!disposed)ports.onStatus('busy','STEP file save is finishing…');return false;}
    active=null;job.cancel();job.cleanup();
    if(job.abortWrite)void job.abortWrite().catch(()=>{});
    if(notify&&!disposed)ports.onStatus('ready','STEP export canceled.');
    return true;
  }
  function guardedHandle(handle:FileSystemFileHandle,job:Job):FileSystemFileHandle{
    const check=()=>{if(!current(job))throw aborted();};
    return new Proxy(handle,{get(target,key){
      if(key==='createWritable')return async()=>{
        check();const writable=await target.createWritable();let finished=false;
        job.abortWrite=async()=>{if(finished)return;finished=true;await writable.abort();};
        if(!current(job)){await job.abortWrite();throw aborted();}
        return new Proxy(writable,{get(stream,method){
          if(method==='write')return async(data:Parameters<typeof stream.write>[0])=>{check();await stream.write(data);check();};
          if(method==='close')return async()=>{
            check();job.committing=true;ports.onStatus('busy','STEP file save is finishing…');
            try{await stream.close();}finally{finished=true;job.abortWrite=null;}
          };
          if(method==='abort')return job.abortWrite;
          const value=Reflect.get(stream,method,stream);return typeof value==='function'?value.bind(stream):value;
        }});
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  }
  async function run(request:{content:CADContent;name:string}):Promise<void>{
    if(disposed||!stop(true))return;
    let cancel!:()=>void;
    const job:Job={cancelled:new Promise<void>(resolve=>{cancel=resolve;}),cancel:()=>cancel(),cleanup(){},abortWrite:null,committing:false};active=job;
    try{
      const content=structuredClone(request.content);
      // Native permission UI must start in the click's activation, before worker loading/awaits.
      const picker=ports.files.showSaveFilePicker?.({suggestedName:request.name,types:[{accept:{'model/step':['.step']}}]});
      ports.onStatus('busy',picker?'Choose a STEP destination…':'Preparing STEP export…');
      const handle=picker?await Promise.race([picker,job.cancelled]):undefined;if(!current(job))return;
      ports.onStatus('busy','Exporting STEP… Esc cancels.');
      const file=await Promise.race([new Promise<File>((resolve,reject)=>{
        const worker=ports.createWorker();let stopped=false;
        const timeout=setTimeout(()=>reject(new Error('STEP export timed out. Retry or simplify the part.')),WATCHDOG_MS);
        const message=(event:Event)=>{
          if(!current(job))return;
          const data=(event as MessageEvent).data;
          if(data?.ok!==true){reject(new Error(typeof data?.message==='string'?data.message:'The STEP worker returned an invalid response.'));return;}
          if(data.file?.mime!=='model/step'||!(data.file.bytes instanceof Uint8Array)||!data.file.bytes.length){reject(new Error('The STEP worker returned an invalid or empty file.'));return;}
          resolve(data.file);
        };
        const error=(event:Event)=>{event.preventDefault();reject(new Error('message'in event?String(event.message):'The STEP worker response could not be read.'));};
        job.cleanup=()=>{if(stopped)return;stopped=true;clearTimeout(timeout);worker.removeEventListener('message',message);worker.removeEventListener('error',error);worker.removeEventListener('messageerror',error);worker.terminate();};
        worker.addEventListener('message',message);worker.addEventListener('error',error);worker.addEventListener('messageerror',error);
        worker.postMessage({content,assets:ports.assets});
      }),job.cancelled]);
      if(!current(job)||!file)return;job.cleanup();
      const result=await fileAccess({op:'save',name:request.name,mime:'model/step',bytes:file.bytes,...(handle?{handle:guardedHandle(handle,job)}:{})},ports.files);
      if(!current(job))return;
      if('cancelled'in result)ports.onStatus('ready','STEP export canceled.');
      else if(!result.ok)ports.onStatus('error',result.error.message);
      else ports.onStatus('ready',`${result.value.handle?'STEP saved':'STEP download handed to browser'}: ${result.value.name}`);
    }catch(cause){
      if(current(job))ports.onStatus(cause instanceof Error&&cause.name==='AbortError'?'ready':'error',cause instanceof Error&&cause.name==='AbortError'?'STEP export canceled.':`STEP export failed: ${cause instanceof Error?cause.message:String(cause)}`);
    }finally{job.cleanup();if(active===job)active=null;}
  }
  return{run,cancel(){stop(true);},dispose(){if(disposed)return;disposed=true;stop(false);}};
}
