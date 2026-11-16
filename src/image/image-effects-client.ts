/**
 * PURPOSE    Own cancellable Image effect jobs.
 * KIND       SHELL
 * CONTRACT   createImageEffects({workerFactory?}?) returns run/cancel/dispose.
 *            Injected factories may return a worker or a Promise of one.
 *            run(request) copies and transfers source pixels to a fresh worker;
 *            resolves validated owned RGBA. A newer valid run aborts old work.
 *            RAISES: RangeError for invalid requests; Error for worker/protocol
 *            failures; AbortError for cancellation, supersession or disposal.
 * GUARANTEES Caller pixels remain attached/unchanged. Workers and listeners are
 *            released on every terminal path. Stale replies never publish.
 * TUNING     60-second watchdog; raster size uses shared MAX_PIXELS.
 * DECISIONS  D1: One-shot workers make Stop interrupt CPU-bound operations.
 *            Alternative: cancellation messages, rejected because synchronous
 *            pixel loops cannot receive them. Revisit if: progressive kernels
 *            introduce explicit cooperative yields.
 *            D2: Vite inline bundles avoid WebKit COEP cache-hit worker failures.
 *            Alternative: unique query URLs, rejected because offline keys are exact.
 *            Trusted code only; isolation headers stay unchanged.
 * LIMITS     Requires Workers. Vite emits Blob/classic workers in production and
 *            module workers in dev. Caller coalesces high-frequency previews;
 *            this adapter does not queue, debounce or run effects on the UI thread.
 * TESTBENCH  node --import tsx --test src/image/image-effects-client.test.ts
 * DEMO       npm run dev; /src/image/image-effects-client.demo.html
 */
import { isRasterSize, type Raster } from './raster-ops.ts';
import { pixelPolicy, type PixelPolicy } from './image-pixel-policy.ts';

export type ImageEffectsRequest =
  | { kind: 'quantize'; raster: Raster; palette: NonNullable<PixelPolicy['palette']> }
  | { kind: 'downpixel'; raster: Raster; width: number; height: number; resize: boolean };
type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'>;
type Options = { workerFactory?: () => WorkerPort | Promise<WorkerPort> };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string) => Object.keys(v).sort().join(',') === expected;
const abort = (message: string) => new DOMException(message, 'AbortError');
const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)).slice(0, 500);
function checkRaster(value: unknown): Raster {
  if (!isRecord(value) || !keys(value, 'data,height,width')) throw new RangeError('Invalid image raster.');
  const r = value as unknown as Raster;
  if (!isRasterSize(r.width, r.height) || !(r.data instanceof Uint8ClampedArray) || r.data.length !== r.width * r.height * 4) throw new RangeError('Invalid image dimensions or pixel data.');
  return r;
}
function prepare(request: ImageEffectsRequest): ImageEffectsRequest {
  if (!isRecord(request) || !['quantize', 'downpixel'].includes(request.kind) || !keys(request, request.kind === 'quantize' ? 'kind,palette,raster' : 'height,kind,raster,resize,width')) throw new RangeError('Unknown image effect request.');
  const source = checkRaster(request.raster);
  if (request.kind === 'quantize') {
    const palette = pixelPolicy({ mode: 'pixel-art', palette: request.palette }).palette;
    if (!palette) throw new RangeError('Quantization requires a palette.');
    return { kind: 'quantize', raster: { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) }, palette };
  }
  if (!Number.isInteger(request.width) || !Number.isInteger(request.height) || request.width < 1 || request.height < 1 || request.width > source.width || request.height > source.height || typeof request.resize !== 'boolean') throw new RangeError('Down-pixel dimensions must fit inside the source image.');
  return { kind: 'downpixel', width: request.width, height: request.height, resize: request.resize, raster: { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) } };
}

export function createImageEffects(options: Options = {}): { run(request: ImageEffectsRequest): Promise<Raster>; cancel(): void; dispose(): void } {
  if (!options || (options.workerFactory !== undefined && typeof options.workerFactory !== 'function')) throw new TypeError('Image effects require a worker factory.');
  const factory = options.workerFactory;
  let disposed = false, sequence = 0, active: { id: number; cancel(cause: Error): void } | null = null;
  function cancel() { active?.cancel(abort('Image processing was cancelled.')); }
  return {
    run(request) {
      if (disposed) return Promise.reject(abort('Image processing is closed.'));
      let owned: ImageEffectsRequest;
      try { owned = prepare(request); } catch (cause) { return Promise.reject(cause); }
      active?.cancel(abort('Image processing was superseded by a newer request.'));
      const id = ++sequence, expected = owned.kind === 'downpixel' && owned.resize ? { width: owned.width, height: owned.height } : owned.raster;
      return new Promise<Raster>((resolve, reject) => {
        let worker: WorkerPort | null = null, done = false, timer: ReturnType<typeof setTimeout> | undefined;
        function finish(cause: Error | null, value?: Raster) {
          if (done) return; done = true; clearTimeout(timer);
          if (worker) { worker.removeEventListener('message', message); worker.removeEventListener('error', error); worker.removeEventListener('messageerror', error); worker.terminate(); }
          if (active?.id === id) active = null;
          if (cause) reject(cause); else resolve(value!);
        }
        function error(event: Event) {
          event.preventDefault();
          finish(new Error('message' in event && event.message ? reason(event.message) : 'The Image worker could not read its response.'));
        }
        function message(event: Event) {
          if (done || active?.id !== id) return;
          const reply = (event as MessageEvent<unknown>).data;
          if (!isRecord(reply) || !Number.isSafeInteger(reply.id)) { finish(new Error('The Image worker returned an invalid response.')); return; }
          if (reply.id !== id) return;
          if (reply.ok === false && keys(reply, 'id,message,ok') && typeof reply.message === 'string' && reply.message.trim()) { finish(new Error(reply.message.slice(0, 500))); return; }
          if (reply.ok !== true || !keys(reply, 'id,ok,value')) { finish(new Error('The Image worker returned an invalid response.')); return; }
          try {
            const value = checkRaster(reply.value);
            if (value.width !== expected.width || value.height !== expected.height) throw new RangeError('Output dimensions do not match the requested effect.');
            finish(null, { width: value.width, height: value.height, data: value.data });
          } catch (cause) { finish(new Error(`The Image worker returned an invalid result. ${reason(cause)}`)); }
        }
        active = { id, cancel: cause => finish(cause) };
        const failed = (cause: unknown) => finish(new Error(reason(cause)));
        function start(created: WorkerPort) {
          if (done) { created.terminate(); return; }
          worker = created;
          try {
            worker.addEventListener('message', message); worker.addEventListener('error', error); worker.addEventListener('messageerror', error);
            worker.postMessage({ id, request: owned }, [owned.raster.data.buffer as ArrayBuffer]);
          } catch (cause) { failed(cause); }
        }
        timer = setTimeout(() => finish(new Error('Image processing timed out. Try a smaller image or simpler effect.')), 60_000);
        try {
          if (factory) {
            const created = factory();
            if ('then' in created) void created.then(start, failed); else start(created);
          } else {
            if (typeof Worker === 'undefined') throw new Error('This browser cannot run Image processing workers.');
            void import('./image-effects.worker.ts?worker&inline').then(({ default: InlineWorker }) => {
              if (!done) start(new InlineWorker({ name: 'Paint image effects' }));
            }).catch(failed);
          }
        } catch (cause) { failed(cause); }
      });
    },
    cancel,
    dispose() { if (disposed) return; disposed = true; active?.cancel(abort('Image processing is closed.')); },
  };
}
