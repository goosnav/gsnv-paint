/**
 * PURPOSE    Inspect every solid in a STEP source within its native worker.
 * KIND       SHELL
 * CONTRACT   IN: live C01 session, bounded STEP bytes, mm/inch display setting.
 *            OUT: complete C67 aggregate and ordered body measurements; no native handles.
 *            RAISES: propagated C37/C54/C67 validation or native errors, never partial output.
 * GUARANTEES Every imported token is consumed on success; ordinary preview failures
 *            release remaining tokens; unexpected faults make no further native calls.
 * TUNING     C54 owns display tessellation; C37 owns exact transfer and physical units.
 * DECISIONS  D1: Consume tokens one at a time. Alternative: clean all in finally, which
 *            double-releases consumed tokens and calls faulted WASM. Revisit if: C01 changes ownership.
 * LIMITS     Unexpected native errors require whole-worker termination. C54's named
 *            ExtrusionError is the only preview failure known to have cleaned its current token.
 * TESTBENCH  src/cad/step-preview.test.ts -- run with: node --import tsx --test src/cad/step-preview.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
import { stepExchange } from './step-exchange.ts';
import { extrudePreview } from './extrude-preview.ts';
import { combineSolidPreviews, type SolidGroup } from './solid-preview-group.ts';
export function stepPreview(request:{session:KernelSession;bytes:Uint8Array;units:'mm'|'inch'}):SolidGroup{
  const {session}=request;
  const pending=[...stepExchange({action:'import',...request}).bodies!.shapes],previews=[];
  while(pending.length){
    const {bodyId,token}=pending.shift()!;
    try{previews.push({id:bodyId,solid:extrudePreview({session,token})});}
    catch(cause){
      if(cause instanceof Error&&cause.name==='ExtrusionError')for(const remaining of pending)session.release(remaining.token);
      throw cause;
    }
  }
  return combineSolidPreviews(previews);
}
