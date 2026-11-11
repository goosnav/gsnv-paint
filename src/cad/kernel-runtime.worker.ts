/** Development-only C01 resource harness. No port, shape or token leaves this worker. */
import { kernelRuntime, type KernelRequest, type KernelSession } from './kernel-runtime.ts';

export type FixtureRequest = { id: number; action: 'open'; config: Extract<KernelRequest, { action: 'open' }>['config'] }
  | { id: number; action: 'ownership' | 'close' | 'work' | 'fault' };
export type FixtureReply = { id: number; phase: 'started' | 'complete' | 'error'; result: Record<string, unknown> };
const port = globalThis as unknown as { postMessage(reply: FixtureReply): void; addEventListener(type: 'message', callback: (event: MessageEvent<FixtureRequest>) => void): void };
const WORK_MS = 400; // Bounded fixture work, not a product rebuild target or job policy.
let session: KernelSession | null = null;
let retained: ReturnType<KernelSession['retain']> | null = null;

function requireSession(): KernelSession { if (!session) throw Error('Load the fixture kernel first.'); return session; }
function box(current: KernelSession) {
  const builder = new current.library.BRepPrimAPI_MakeBox(2, 3, 4);
  const shape = builder.Shape(); builder.delete();
  return current.retain(shape);
}
function inspect(current: KernelSession, token: ReturnType<KernelSession['retain']>) {
  const library = current.library, shape = current.resolve(token);
  const validator = new library.BRepCheck_Analyzer(shape, true, false), properties = new library.GProp_GProps();
  library.BRepGProp.VolumeProperties(shape, properties, true, false, false);
  const center = properties.CentreOfMass();
  const observation = { valid: validator.IsValid(), volume: properties.Mass(), center: [center.X(), center.Y(), center.Z()], heapBytes: library.wasmMemory?.buffer.byteLength ?? null };
  // An unexpected native fault skips further geometry cleanup and causes owner termination.
  center.delete(); properties.delete(); validator.delete();
  return observation;
}
function rejected(action: () => unknown) {
  try { action(); return 'NOT_REJECTED'; } catch (cause) { return cause instanceof Error ? cause.name : String(cause); }
}
async function run(request: FixtureRequest): Promise<Record<string, unknown>> {
  if (request.action === 'open') {
    const opened = await kernelRuntime({ action: 'open', config: request.config }); session = opened.session;
    const current = requireSession(), token = box(current), observation = inspect(current, token); current.release(token);
    return { ready: opened.status.ready, mode: opened.status.mode, version: opened.status.version,
      workerIsolated: globalThis.crossOriginIsolated, workerOnly: typeof document === 'undefined', ...observation };
  }
  const current = requireSession();
  if (request.action === 'ownership') {
    if (retained) current.release(retained);
    retained = box(current); const borrowed = current.resolve(retained);
    await kernelRuntime({ action: 'probe', session: current });
    const observation = inspect(current, retained), temporary = box(current); current.release(temporary);
    return { ...observation, probePreservedShape: borrowed === current.resolve(retained), releasedTokenError: rejected(() => current.resolve(temporary)) };
  }
  if (request.action === 'close') {
    const generation = current.generation, token = retained;
    const closed = await kernelRuntime({ action: 'close', session: current }); retained = null;
    return { ready: closed.status.ready, closed: current.isClosed(), generationChanged: current.generation !== generation,
      closedTokenError: token ? rejected(() => current.resolve(token)) : 'NO_RETAINED_TOKEN', diagnostics: closed.status.diagnostics };
  }
  if (request.action === 'fault') {
    // Explicit fault injection: real OCCT receives a zero-width box; C01 must convert its native exception.
    const original = current.library.BRepPrimAPI_MakeBox;
    current.library.BRepPrimAPI_MakeBox = new Proxy(original, { construct(target) { return Reflect.construct(target, [0, 3, 4]); } });
    await kernelRuntime({ action: 'probe', session: current });
    throw Error('The injected native failure was not rejected.');
  }
  port.postMessage({ id: request.id, phase: 'started', result: {} });
  const start = performance.now(); let iterations = 0, volume = NaN, valid = false;
  do {
    const token = box(current), observation = inspect(current, token); current.release(token);
    volume = observation.volume; valid = observation.valid; iterations++;
    if (!valid || Math.abs(volume - 24) > 1e-8) throw Error('The native work loop returned an invalid box.');
  } while (performance.now() - start < WORK_MS);
  return { elapsedMs: performance.now() - start, iterations, volume, valid, heapBytes: current.library.wasmMemory?.buffer.byteLength ?? null };
}
port.addEventListener('message', event => {
  void run(event.data).then(result => port.postMessage({ id: event.data.id, phase: 'complete', result }), cause => {
    port.postMessage({ id: event.data.id, phase: 'error', result: { name: cause instanceof Error ? cause.name : 'NativeFailure',
      message: cause instanceof Error ? cause.message : String(cause), closed: session?.isClosed() ?? true, faultInjection: event.data.action === 'fault' } });
  });
});
