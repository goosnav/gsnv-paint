/**
 * PURPOSE    Report verified offline readiness without interrupting live documents.
 * KIND       SHELL
 * CONTRACT   IN: browser environment, build ID, onState callback.
 *            OUT: ready Promise plus check/retry/dispose; ready settles on the initial
 *            visible outcome, including failures; state names active readiness separately
 *            from candidate-update progress/errors.
 *            RAISES: TypeError for a nonfunction callback; operational failures are states.
 * GUARANTEES No reload, skipWaiting, storage clearing or app mutation; only known workers
 *            and bounded validated messages can affect readiness; disposal cancels ports.
 *            A failed Retry update check preserves the active worker's audited result.
 * TUNING     REQUEST_MS=5s, MESSAGE_BYTES=4096, MAX_WORKERS=8 bound protocol resources.
 * DECISIONS  D1: Keep failed candidate status separate from usable active state.
 *            Alternative: one error flag; rejected because it falsely disables A after
 *            failed B. Revisit if updates gain explicit rollback UI. D2: Handshake through
 *            transferred ports instead of global reply listeners prevents reply confusion.
 * LIMITS     Initial unknown windows can require reopening; no immediate update action.
 * TESTBENCH  src/shared/offline-client.test.ts -- run with: node --import tsx --test src/shared/offline-client.test.ts
 */
import type { OfflineWorkerReport } from './offline-worker.ts';
export type OfflineState = {
  phase: 'unavailable' | 'checking' | 'installing' | 'ready' | 'reopen-required' | 'error'; pageBuild: string; readyBuild?: string;
  completedBytes: number; totalBytes: number; update: 'none' | 'checking' | 'installing' | 'ready' | 'error'; error?: { code: string; message: string };
};
type Environment = Pick<Window, 'isSecureContext' | 'location' | 'navigator' | 'crypto' | 'setTimeout' | 'clearTimeout'>;
const REQUEST_MS = 5000, MESSAGE_BYTES = 4096, MAX_WORKERS = 8;
const HEX = /^[a-f0-9]{64}$/, ID = /^[a-zA-Z0-9_-]{1,80}$/;
function bounded(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MESSAGE_BYTES; } catch { return false; }
}
function report(value: unknown, requestId?: string): value is OfflineWorkerReport {
  if (!bounded(value) || value.protocol !== 1 || value.kind !== 'state' || typeof value.build !== 'string' || !HEX.test(value.build) ||
    !['checking', 'installing', 'ready', 'reopen-required', 'error'].includes(String(value.phase)) || (requestId && value.requestId !== requestId)) return false;
  const { completedBytes: done, totalBytes: total, error } = value;
  return typeof done === 'number' && typeof total === 'number' && Number.isSafeInteger(done) && Number.isSafeInteger(total) && done >= 0 && total >= done && total <= 134_217_728 &&
    (error === undefined || (bounded(error) && typeof error.code === 'string' && /^offline\.[a-z]+$/.test(error.code) && typeof error.message === 'string' && error.message.length <= 1000));
}

export function createOfflineClient({ environment: env, buildId, onState }: { environment: Environment; buildId: string; onState(state: OfflineState): void }) {
  if (typeof onState !== 'function') throw new TypeError('Offline state callback is required.');
  let state: OfflineState = { phase: 'checking', pageBuild: buildId, completedBytes: 0, totalBytes: 0, update: 'none' };
  let disposed = false, registration: ServiceWorkerRegistration | undefined, starting: Promise<void> | undefined;
  let service: ServiceWorkerContainer | undefined, activeError: OfflineState['error'], updateError: OfflineState['error'];
  const known = new Map<ServiceWorker, { remove(): void; report?: OfflineWorkerReport }>(), pending = new Set<() => void>();
  let settle!: () => void; const ready = new Promise<void>(resolve => { settle = resolve; });
  function emit() {
    if (disposed) return;
    const { error: _, ...base } = state, error = activeError ?? updateError; state = { ...base, ...(error ? { error } : {}) };
    try { onState({ ...state, ...(state.error ? { error: { ...state.error } } : {}) }); } catch { /* A view callback cannot strand worker ports. */ }
    if (['unavailable', 'ready', 'reopen-required', 'error'].includes(state.phase)) settle();
  }
  const current = (worker: ServiceWorker) => worker === service?.controller || (!service?.controller && worker === registration?.active);
  function fault(worker: ServiceWorker | undefined, message: string, code = 'offline.network') {
    if (disposed) return;
    if (worker && !current(worker) && service?.controller) { updateError ??= { code, message }; state.update = 'error'; }
    else { activeError = { code, message }; state.phase = 'error'; delete state.readyBuild; }
    emit();
  }
  function apply(worker: ServiceWorker, value: OfflineWorkerReport) {
    if (disposed || !known.has(worker) || (worker.state === 'redundant' && value.phase !== 'error')) return;
    known.get(worker)!.report = value;
    if (current(worker)) {
      if (value.build !== buildId) { fault(worker, 'This page and its offline copy are different versions. Save your work, close all app tabs and reopen.', 'offline.version'); return; }
      activeError = value.error;
      const complete = value.phase === 'ready' || value.phase === 'reopen-required';
      state = { ...state, phase: complete ? service?.controller === worker ? 'ready' : worker.state === 'activated' ? 'reopen-required' : 'installing' : value.phase,
        completedBytes: value.completedBytes, totalBytes: value.totalBytes };
      if (state.phase === 'ready') state.readyBuild = value.build; else delete state.readyBuild;
    } else if (service?.controller) {
      updateError = value.error;
      state.update = value.phase === 'error' ? 'error' : (worker === registration?.waiting || worker.state === 'installed') && value.phase === 'ready' ? 'ready' : 'installing';
      state.completedBytes = value.completedBytes; state.totalBytes = value.totalBytes;
    } else {
      activeError = value.error; state.phase = value.phase === 'error' ? 'error' : value.phase === 'reopen-required' ? 'reopen-required' : 'installing';
      state.completedBytes = value.completedBytes; state.totalBytes = value.totalBytes;
    }
    emit();
  }
  function request(worker: ServiceWorker, kind: 'status' | 'retry', fresh = false): Promise<void> {
    if (disposed) return Promise.resolve();
    return new Promise(resolve => {
      const channel = new MessageChannel(), requestId = env.crypto.randomUUID();
      let finished = false;
      const finish = () => { if (finished) return; finished = true; env.clearTimeout(timer); channel.port1.close(); channel.port2.close(); pending.delete(finish); resolve(); };
      const timer = env.setTimeout(() => { fault(worker, 'The offline worker did not respond. Reconnect and retry offline setup.'); finish(); }, REQUEST_MS);
      pending.add(finish);
      channel.port1.onmessage = event => { if (report(event.data, requestId)) { apply(worker, event.data); finish(); } };
      try { worker.postMessage({ protocol: 1, kind, requestId, pageBuild: buildId, fresh }, [channel.port2]); }
      catch { fault(worker, 'The offline worker is unavailable. Reconnect and retry offline setup.'); finish(); }
    });
  }
  function watch(worker: ServiceWorker | null | undefined) {
    if (!worker || known.has(worker) || disposed) return;
    if (known.size >= MAX_WORKERS) for (const [old, record] of known) {
      if (old !== service?.controller && old !== registration?.active) { record.remove(); known.delete(old); break; }
    }
    const changed = () => {
      if (worker.state === 'redundant') fault(worker, 'The update did not finish. Reconnect and retry; the previous offline copy is preserved.');
      else void request(worker, 'status');
    };
    known.set(worker, { remove: () => worker.removeEventListener('statechange', changed) });
    worker.addEventListener('statechange', changed); changed();
  }
  const updateFound = () => { watch(registration?.installing); };
  const controllerChanged = () => {
    const worker = service?.controller;
    if (worker) { state.update = 'none'; updateError = undefined; watch(worker); void request(worker, 'status'); }
  };
  const message = (event: MessageEvent) => {
    const worker = event.source as ServiceWorker | null, data: unknown = event.data;
    if (!worker || !known.has(worker) || event.origin !== env.location.origin || !bounded(data)) return;
    if (data.protocol === 1 && data.kind === 'identify' && typeof data.requestId === 'string' && ID.test(data.requestId) && typeof data.build === 'string' && HEX.test(data.build) && event.ports.length === 1) {
      event.ports[0]!.postMessage({ protocol: 1, kind: 'build', requestId: data.requestId, build: buildId }); event.ports[0]!.close();
    } else if (report(data)) apply(worker, data);
  };
  async function initialize() {
    if (!service || disposed) return;
    try {
      const next = await service.register('/offline-sw.js', { scope: '/', updateViaCache: 'none' });
      if (disposed) return;
      registration?.removeEventListener('updatefound', updateFound); registration = next;
      registration.addEventListener('updatefound', updateFound);
      for (const worker of [service.controller, registration.active, registration.waiting, registration.installing]) watch(worker);
      if (!known.size) { state.phase = 'installing'; emit(); }
    } catch {
      if (service.controller) { watch(service.controller); updateError = { code: 'offline.network', message: 'Updates could not be checked. Reconnect and retry.' }; state.update = 'error'; emit(); }
      else fault(undefined, 'Offline setup could not start. Reconnect, allow service workers and retry.');
    }
  }
  function start() { if (!starting) starting = initialize().finally(() => { starting = undefined; }); return starting; }
  async function check() {
    if (disposed || !service) return;
    if (!registration) await start();
    if (!registration || disposed) return;
    updateError = undefined; state.update = 'checking'; emit();
    if (service.controller) await request(service.controller, 'status', true);
    try { await registration.update(); if (state.update === 'checking') { state.update = registration.waiting ? 'ready' : 'none'; emit(); } }
    catch { updateError = { code: 'offline.network', message: 'Updates could not be checked. Reconnect and try again.' }; state.update = 'error'; emit(); }
  }
  async function retry() {
    if (disposed || !service) return;
    activeError = undefined; updateError = undefined;
    if (!registration) { state.phase = 'checking'; emit(); if (starting) await starting; await start(); return; }
    const worker = service.controller ?? registration.active ?? registration.waiting;
    if (worker) await request(worker, 'retry');
    if (disposed) return;
    try { await registration.update(); }
    catch {
      if (!worker) fault(undefined, 'Offline setup could not reconnect. Try again when a connection is available.');
      else { updateError = { code: 'offline.network', message: 'Updates could not be checked. Reconnect and try again.' }; state.update = 'error'; emit(); }
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    service?.removeEventListener('message', message); service?.removeEventListener('controllerchange', controllerChanged);
    registration?.removeEventListener('updatefound', updateFound); for (const record of known.values()) record.remove();
    for (const cancel of pending) cancel(); known.clear(); settle();
  }
  try { service = env.navigator.serviceWorker; } catch { /* Browser policy can deny even property access. */ }
  if (!env.isSecureContext || !['http:', 'https:'].includes(env.location.protocol) || !service || !HEX.test(buildId)) {
    service = undefined; state.phase = 'unavailable'; activeError = { code: 'offline.unsupported', message: 'Offline setup needs a secure browser with service workers and site storage enabled.' }; emit();
  } else { service.addEventListener('message', message); service.addEventListener('controllerchange', controllerChanged); emit(); void start(); }
  return { ready, check, retry, dispose };
}
