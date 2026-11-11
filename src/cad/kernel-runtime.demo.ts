/** Development-only C01 UI. Worker termination owns cancellation and native-fault cleanup. */
import moduleAsset from 'replicad-opencascadejs?url';
import wasmAsset from 'replicad-opencascadejs/wasm?url';
import type { FixtureReply, FixtureRequest } from './kernel-runtime.worker.ts';

const WATCHDOG_MS = 30_000; // Harness deadline; not the future CAD job timeout policy.
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const buttons = ['ownership', 'close', 'work', 'fault'];
let worker: Worker | null = null, epoch = 0, nextId = 0, disposed = false, initialized = false;
let pending: { id: number; action: FixtureRequest['action']; timer: number } | null = null;
let working = false, frames = 0, clicks = 0, framesDuringWork = 0, clicksDuringWork = 0, navigationDuringWork = 0;
let animation = 0;
function paint() {
  element('worker-alive').textContent = worker ? 'yes' : 'no'; element('worker-epoch').textContent = String(epoch);
  element<HTMLButtonElement>('load').disabled = !!worker;
  for (const id of buttons) element<HTMLButtonElement>(id).disabled = !initialized || !!pending;
}
function terminate(reason: string) {
  if (worker) { worker.terminate(); element('termination').textContent = `Terminated worker ${epoch} ${reason}`; }
  worker = null; initialized = false; working = false;
  if (pending) clearTimeout(pending.timer); pending = null; paint();
}
function fail(result: Record<string, unknown>, action: FixtureRequest['action']) {
  element(`${action === 'fault' ? 'fault' : 'error'}-result`).textContent = JSON.stringify(result);
  terminate('after error'); element('kernel-status').textContent = action === 'fault' ? 'Faulted worker terminated' : 'Kernel failed; worker terminated';
}
function send(request: Omit<Extract<FixtureRequest, { action: 'open' }>, 'id'> | { action: Exclude<FixtureRequest['action'], 'open'> }) {
  if (!worker || pending || disposed) return;
  const id = ++nextId, action = request.action;
  pending = { id, action, timer: window.setTimeout(() => fail({ name: 'FixtureDeadlineError', message: `Kernel request exceeded ${WATCHDOG_MS} ms; worker terminated.` }, action), WATCHDOG_MS) };
  element('kernel-status').textContent = action === 'open' ? 'Loading kernel in worker' : 'Waiting for worker';
  worker.postMessage({ ...request, id }); paint();
}
function launch() {
  if (disposed) return;
  terminate(working ? 'during work' : 'before replacement'); epoch++;
  const active = new Worker(new URL('./kernel-runtime.worker.ts', import.meta.url), { type: 'module' }); worker = active;
  active.onmessage = (event: MessageEvent<FixtureReply>) => {
    if (worker !== active || !pending || event.data.id !== pending.id) return;
    if (event.data.phase === 'started') {
      working = true; framesDuringWork = 0; clicksDuringWork = 0; navigationDuringWork = 0;
      element('kernel-status').textContent = 'Working in kernel worker'; return;
    }
    const action = pending.action;
    if (event.data.phase === 'error') { fail(event.data.result, action); return; }
    clearTimeout(pending.timer); pending = null;
    const result = action === 'work' ? { ...event.data.result, framesDuringWork, clicksDuringWork, navigationDuringWork } : event.data.result;
    working = false; element(`${action}-result`).textContent = JSON.stringify(result);
    initialized = action !== 'close';
    element('kernel-status').textContent = action === 'close' ? 'Session closed; worker still owns its heap' : 'Kernel ready'; paint();
  };
  active.onerror = event => { event.preventDefault(); if (worker === active) fail({ name: 'WorkerError', message: event.message }, pending?.action ?? 'open'); };
  active.onmessageerror = () => { if (worker === active) fail({ name: 'WorkerMessageError', message: 'Worker result could not be read.' }, pending?.action ?? 'open'); };
  send({ action: 'open', config: { moduleUrl: new URL(moduleAsset, location.href).href, wasmUrl: new URL(wasmAsset, location.href).href,
    mode: 'single', tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 } } });
}
element('load').onclick = launch; element('restart').onclick = launch;
for (const action of ['ownership', 'close', 'work', 'fault'] as const) element(action).onclick = () => send({ action });
element('main-click').onclick = () => { clicks++; if (working) clicksDuringWork++; element('click-count').textContent = String(clicks); };
window.addEventListener('hashchange', () => { if (working) navigationDuringWork++; element('navigation').textContent = location.hash; });
function animate() {
  if (disposed) return;
  frames++; if (working) framesDuringWork++;
  element('frames').textContent = String(frames); element('pulse').style.transform = `translateX(${frames % 200}px)`;
  animation = requestAnimationFrame(animate);
}
element('window-isolated').textContent = String(crossOriginIsolated); paint(); animate();
window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(animation); terminate('on page disposal'); }, { once: true });
