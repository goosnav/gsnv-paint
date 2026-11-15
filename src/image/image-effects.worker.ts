/**
 * PURPOSE    Dispatch isolated Image effect requests.
 * KIND       SHELL
 * CONTRACT   bindImageEffectsWorker(port) binds {id,request} messages; replies
 *            {id,ok:true,value:Raster} with transferred output or a readable
 *            {id,ok:false,message}. Returns idempotent unbind function.
 *            Invalid transport uses id 0; leaf modules validate pixel arguments.
 * GUARANTEES Delegates all pixel decisions to CORE leaves; no DOM or file access.
 *            Output buffers belong to the worker until transferred to its caller.
 * TUNING     Error messages bounded to 500 characters; one job per worker client.
 * DECISIONS  D1: Injectable endpoint permits transport failure tests in Node.
 *            Alternative: inline-only worker body, rejected because it obscures
 *            endpoint validation. Revisit if: the worker gains streaming jobs.
 * LIMITS     Cancellation is worker termination; operations are synchronous here.
 * TESTBENCH  node --import tsx --test src/image/image-effects.worker.test.ts
 * DEMO       npm run dev; /src/image/image-effects-client.demo.html
 */
import { quantizeImage } from './image-quantize.ts';
import { downpixelImage } from './image-downpixel.ts';
import type { ImageEffectsRequest } from './image-effects-client.ts';

type Reply = { id: number; ok: true; value: ImageEffectsRequest['raster'] } | { id: number; ok: false; message: string };
type Port = { onmessage: ((event: MessageEvent<unknown>) => void) | null; postMessage(value: Reply, transfer?: Transferable[]): void };
export function bindImageEffectsWorker(port: Port): () => void {
  if (!port || typeof port.postMessage !== 'function') throw new TypeError('An Image worker needs a message port.');
  const handle = (event: MessageEvent<unknown>) => {
    const data = event.data as { id?: unknown; request?: ImageEffectsRequest } | null;
    const id = Number.isSafeInteger(data?.id) && Number(data!.id) > 0 ? Number(data!.id) : 0;
    try {
      if (!id || !data?.request) throw new RangeError('Invalid Image worker request.');
      const request = data.request;
      const value = request.kind === 'quantize' ? quantizeImage(request.raster, request.palette)
        : request.kind === 'downpixel' ? downpixelImage(request.raster, { width: request.width, height: request.height, resize: request.resize })
          : (() => { throw new RangeError('Unknown Image effect.'); })();
      port.postMessage({ id, ok: true, value }, [value.data.buffer as ArrayBuffer]);
    } catch (cause) { port.postMessage({ id, ok: false, message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 500) }); }
  };
  port.onmessage = handle;
  return () => { if (port.onmessage === handle) port.onmessage = null; };
}

if (typeof document === 'undefined' && typeof globalThis.postMessage === 'function') bindImageEffectsWorker(globalThis as unknown as Port);
