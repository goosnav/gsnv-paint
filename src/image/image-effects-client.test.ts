import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageEffects, type ImageEffectsRequest } from './image-effects-client.ts';

type Message = { id: number; request: ImageEffectsRequest };
class FakeWorker {
  listeners = new Map<string, Set<(event: Event) => void>>();
  sent: Message[] = []; transfers: Transferable[][] = []; terminated = 0; failPost = false;
  postMessage(message: Message, options: Transferable[] | StructuredSerializeOptions = []) {
    if (this.failPost) throw new Error('Could not transfer pixels.');
    const transfer = Array.isArray(options) ? options : options.transfer ?? [];
    this.transfers.push(transfer); this.sent.push(structuredClone(message, { transfer: transfer as ArrayBuffer[] }));
  }
  addEventListener(type: string, fn: (event: Event) => void) { const set = this.listeners.get(type) ?? new Set(); set.add(fn); this.listeners.set(type, set); }
  removeEventListener(type: string, fn: (event: Event) => void) { this.listeners.get(type)?.delete(fn); }
  terminate() { this.terminated++; }
  emit(type: string, event: unknown) { for (const fn of this.listeners.get(type) ?? []) fn(event as Event); }
  reply(value: unknown, id = this.sent[0]!.id) { this.emit('message', { data: { id, ok: true, value } }); }
  get listenerCount() { return [...this.listeners.values()].reduce((n, s) => n + s.size, 0); }
}
const source = () => ({ width: 2, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255, 200, 210, 220, 255]) });
const request = (): ImageEffectsRequest => ({ kind: 'downpixel', raster: source(), width: 1, height: 1, resize: true });
const result = () => ({ width: 1, height: 1, data: new Uint8ClampedArray([200, 210, 220, 255]) });
function fixture() {
  const workers: FakeWorker[] = [], client = createImageEffects({ workerFactory() { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; } });
  return { client, workers };
}

test('Effects client transfers an owned input copy, validates success and releases its one-shot worker', async () => {
  const f = fixture(), input = request(), before = input.raster.data.slice(), promise = f.client.run(input), worker = f.workers[0]!;
  assert.deepEqual(input.raster.data, before); assert.equal(input.raster.data.byteLength, 8);
  assert.deepEqual(worker.sent[0]!.request.raster.data, before); assert.notEqual(worker.sent[0]!.request.raster.data.buffer, input.raster.data.buffer);
  assert.equal(worker.transfers[0]!.length, 1); assert.equal((worker.transfers[0]![0] as ArrayBuffer).byteLength, 0);
  input.raster.data.fill(77); assert.deepEqual(worker.sent[0]!.request.raster.data, before);
  worker.reply(result()); assert.deepEqual(await promise, result()); assert.equal(worker.terminated, 1); assert.equal(worker.listenerCount, 0);
  f.client.dispose(); assert.equal(worker.terminated, 1);
});

test('Latest run aborts and terminates old work; captured stale callbacks cannot settle the new job', async () => {
  const f = fixture(), a = f.client.run(request()), old = f.workers[0]!, stale = [...old.listeners.get('message')!][0]!;
  const rejected = assert.rejects(a, { name: 'AbortError' });
  const b = f.client.run(request()); await rejected; assert.equal(old.terminated, 1); assert.equal(old.listenerCount, 0);
  let settled = false; void b.then(() => { settled = true; });
  stale({ data: { id: old.sent[0]!.id, ok: true, value: result() } } as unknown as Event);
  const next = f.workers[1]!; next.reply(result(), old.sent[0]!.id); await Promise.resolve(); assert.equal(settled, false);
  next.reply(result()); assert.deepEqual(await b, result()); f.client.dispose();
});

test('Cancel/dispose are idempotent; disposed clients reject without creating workers', async () => {
  const f = fixture(); f.client.cancel();
  const running = f.client.run(request()), rejected = assert.rejects(running, { name: 'AbortError' }); f.client.cancel(); f.client.cancel(); await rejected;
  assert.equal(f.workers[0]!.terminated, 1);
  const second = f.client.run(request()), rejected2 = assert.rejects(second, { name: 'AbortError' }); f.client.dispose(); f.client.dispose(); await rejected2;
  await assert.rejects(f.client.run(request()), { name: 'AbortError' }); assert.equal(f.workers.length, 2);
});

test('Bad input fails before worker creation or disrupting a valid active job', async () => {
  const f = fixture(), good = f.client.run(request());
  const bad = [null, { ...request(), kind: 'script' }, { ...request(), width: 0 }, { ...request(), width: 3 }, { ...request(), extra: true }, { ...request(), raster: { ...source(), data: new Uint8Array(8) } }, { kind: 'quantize', raster: source(), palette: null }];
  for (const input of bad) await assert.rejects(f.client.run(input as ImageEffectsRequest), RangeError);
  assert.equal(f.workers.length, 1); assert.equal(f.workers[0]!.terminated, 0); f.workers[0]!.reply(result()); await good; f.client.dispose();
  assert.throws(() => createImageEffects({ workerFactory: false as unknown as () => Worker }), TypeError);
});

test('Malformed, oversized and wrong-sized replies fail visibly and release resources', async () => {
  const invalid = [null, { ...result(), width: 0 }, { ...result(), width: 2 }, { ...result(), width: 16777217 }, { ...result(), data: new Uint8Array(4) }, { ...result(), data: new Uint8ClampedArray(3) }, { ...result(), extra: true }];
  for (const value of invalid) { const f = fixture(), p = f.client.run(request()); f.workers[0]!.reply(value); await assert.rejects(p, /invalid.*result/i); assert.equal(f.workers[0]!.terminated, 1); assert.equal(f.workers[0]!.listenerCount, 0); f.client.dispose(); }
  const f = fixture(), p = f.client.run(request()), w = f.workers[0]!; w.emit('message', { data: { id: w.sent[0]!.id, ok: 'yes', value: result() } }); await assert.rejects(p, /invalid.*response/i); f.client.dispose();
});

test('Quantize replies retain source dimensions; palette metadata is copied before the worker gets it', async () => {
  const f = fixture(), colours: [number, number, number][] = [[0, 0, 0], [255, 255, 255]], input: ImageEffectsRequest = { kind: 'quantize', raster: source(), palette: { colours, dither: 'none' } };
  const p = f.client.run(input), w = f.workers[0]!; colours[0]![0] = 30;
  assert.deepEqual((w.sent[0]!.request as Extract<ImageEffectsRequest, { kind: 'quantize' }>).palette.colours[0], [0, 0, 0]);
  w.reply(source()); assert.deepEqual(await p, source()); f.client.dispose();
  const retain = fixture(), p2 = retain.client.run({ ...request(), resize: false } as ImageEffectsRequest); retain.workers[0]!.reply(source()); await p2; retain.client.dispose();
});

test('Worker load/transport/domain failures and watchdog are recoverable with a fresh worker', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const f = fixture();
  let p = f.client.run(request()), w = f.workers.at(-1)!; w.emit('error', { message: 'Module could not load.', preventDefault() {} }); await assert.rejects(p, /could not load/i); assert.equal(w.terminated, 1);
  p = f.client.run(request()); w = f.workers.at(-1)!; w.emit('messageerror', { preventDefault() {} }); await assert.rejects(p, /read.*response/i);
  p = f.client.run(request()); w = f.workers.at(-1)!; w.emit('message', { data: { id: w.sent[0]!.id, ok: false, message: 'The palette is invalid.' } }); await assert.rejects(p, /palette is invalid/i);
  p = f.client.run(request()); w = f.workers.at(-1)!; t.mock.timers.tick(60_001); await assert.rejects(p, /timed out/i); assert.equal(w.terminated, 1);
  p = f.client.run(request()); f.workers.at(-1)!.reply(result()); await p; f.client.dispose();
});

test('Worker construction/postMessage exceptions reject the run without mutating source data', async () => {
  const failing = createImageEffects({ workerFactory() { throw new Error('Worker unavailable.'); } }); await assert.rejects(failing.run(request()), /unavailable/); failing.dispose();
  const worker = new FakeWorker(); worker.failPost = true; const f = createImageEffects({ workerFactory: () => worker as unknown as Worker }), input = request(), before = input.raster.data.slice();
  await assert.rejects(f.run(input), /transfer pixels/); assert.deepEqual(input.raster.data, before); assert.equal(worker.terminated, 1); assert.equal(worker.listenerCount, 0); f.dispose();
});

test('Stop during async worker preparation rejects promptly and releases a late worker without posting pixels', async () => {
  let ready!: (worker: FakeWorker) => void;
  const worker = new FakeWorker(), client = createImageEffects({ workerFactory: () => new Promise<FakeWorker>(resolve => { ready = resolve; }) });
  const input = request(), pending = client.run(input), stopped = assert.rejects(pending, { name: 'AbortError' });
  client.cancel(); await stopped; ready(worker); await Promise.resolve(); await Promise.resolve();
  assert.equal(worker.terminated, 1); assert.equal(worker.sent.length, 0); assert.equal(worker.listenerCount, 0);
  assert.equal(input.raster.data.byteLength, 8); client.dispose();
});

test('Async factory supersession, rejection and watchdog cannot affect a newer effect', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const waiting: { resolve(worker: FakeWorker): void; reject(error: Error): void }[] = [];
  const client = createImageEffects({ workerFactory: () => new Promise<FakeWorker>((resolve, reject) => waiting.push({ resolve, reject })) });
  const first = client.run(request()), firstStopped = assert.rejects(first, { name: 'AbortError' });
  const second = client.run(request()); await firstStopped;
  waiting[0]!.reject(new Error('Old load failed.')); await Promise.resolve();
  const worker = new FakeWorker(); waiting[1]!.resolve(worker); await Promise.resolve();
  worker.reply(result()); assert.deepEqual(await second, result());
  const third = client.run(request()), expired = assert.rejects(third, /timed out/i); t.mock.timers.tick(60_001); await expired;
  const late = new FakeWorker(); waiting[2]!.resolve(late); await Promise.resolve(); assert.equal(late.terminated, 1); assert.equal(late.sent.length, 0);
  const fourth = client.run(request()); waiting[3]!.reject(new Error('Module load failed.')); await assert.rejects(fourth, /Module load failed/); client.dispose();
});
