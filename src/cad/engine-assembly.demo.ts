/** Development-only CAD-A1 owner. Both native engines stay in one disposable worker. */
import kernelModule from 'replicad-opencascadejs?url';
import kernelWasm from 'replicad-opencascadejs/wasm?url';
import solverModule from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.js?url';
import solverWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import type { FixtureReply, FixtureRequest } from './engine-assembly.worker.ts';

const WATCHDOG_MS = 30_000; // Fixture deadline; production CAD job policy is separate.
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const actions = ['inspect', 'close', 'work', 'fault'] as const;
type Request = Omit<Extract<FixtureRequest, { action: 'open' }>, 'id'>
  | { action: Exclude<FixtureRequest['action'], 'open'> };
let worker: Worker | null = null, epoch = 0, nextId = 0, initialized = false, disposed = false;
let pending: { id: number; action: FixtureRequest['action']; timer: number } | null = null;
let working = false, animation = 0, frames = 0, clicks = 0;
let framesDuringWork = 0, clicksDuringWork = 0, navigationDuringWork = 0;

function message(cause: unknown) {
  try { return String(cause instanceof Error ? cause.message : cause); } catch { return 'The worker operation failed.'; }
}
function paint() {
  element('worker-epoch').textContent = String(epoch); element('worker-alive').textContent = worker ? 'yes' : 'no';
  element<HTMLButtonElement>('load').disabled = disposed || !!worker;
  element<HTMLButtonElement>('restart').disabled = disposed;
  for (const action of actions) element<HTMLButtonElement>(action).disabled = disposed || !initialized || !!pending;
}
function terminate(reason: string) {
  const active = worker; worker = null; initialized = false; working = false;
  if (pending) clearTimeout(pending.timer); pending = null;
  if (active) {
    active.onmessage = null; active.onerror = null; active.onmessageerror = null;
    active.terminate(); element('termination').textContent = `Terminated worker ${epoch} ${reason}`;
  }
  paint();
}
function fail(result: Record<string, unknown>) {
  element('error-result').textContent = JSON.stringify(result, null, 2);
  terminate('after error'); element('assembly-status').textContent = 'Pair failed; worker terminated';
}
function send(request: Request) {
  const active = worker;
  if (!active || pending || disposed) return;
  const id = ++nextId, action = request.action;
  const timer = window.setTimeout(() => {
    if (worker !== active || pending?.id !== id) return;
    fail({ name: 'FixtureDeadlineError', message: `Paired worker request exceeded ${WATCHDOG_MS} ms.`, failedAction: action });
  }, WATCHDOG_MS);
  pending = { id, action, timer };
  element('assembly-status').textContent = action === 'open' ? 'Loading both engines in one worker' : 'Waiting for paired worker';
  paint();
  try { active.postMessage({ ...request, id }); }
  catch (cause) {
    if (worker === active && pending?.id === id) fail({ name: 'WorkerMessageError', message: message(cause), failedAction: action });
  }
}
function launch() {
  if (disposed) return;
  terminate(working ? 'during work' : 'before replacement'); epoch++;
  let active: Worker;
  try { active = new Worker(new URL('./engine-assembly.worker.ts', import.meta.url), { type: 'module' }); }
  catch (cause) { fail({ name: 'WorkerError', message: message(cause), failedAction: 'open' }); return; }
  worker = active;
  active.onmessage = (event: MessageEvent<FixtureReply>) => {
    if (worker !== active || !pending || event.data.id !== pending.id) return;
    const action = pending.action;
    if (event.data.phase === 'started') {
      if (action !== 'work') { fail({ name: 'WorkerProtocolError', message: 'Unexpected work receipt.', failedAction: action }); return; }
      working = true; framesDuringWork = 0; clicksDuringWork = 0; navigationDuringWork = 0;
      element('assembly-status').textContent = 'Working in paired worker'; return;
    }
    if (event.data.phase === 'error') { fail(event.data.result); return; }
    if (action === 'fault') { fail({ ...event.data.result, name: 'FixtureVerificationError', message: 'The injected fault was not rejected.', failedAction: action }); return; }
    clearTimeout(pending.timer); pending = null;
    const result = action === 'work' ? { ...event.data.result, framesDuringWork, clicksDuringWork, navigationDuringWork } : event.data.result;
    element(`${action}-result`).textContent = JSON.stringify(result, null, 2); working = false;
    if (action === 'close') {
      // A complete close receipt means both runtime disposals returned no diagnostics.
      terminate('after clean close'); element('assembly-status').textContent = 'Pair closed; worker terminated';
    } else { initialized = true; element('assembly-status').textContent = 'Both engines ready'; paint(); }
  };
  active.onerror = event => {
    event.preventDefault();
    if (worker === active) fail({ name: 'WorkerError', message: event.message, failedAction: pending?.action ?? 'open' });
  };
  active.onmessageerror = () => {
    if (worker === active) fail({ name: 'WorkerMessageError', message: 'The paired worker result could not be read.', failedAction: pending?.action ?? 'open' });
  };
  send({ action: 'open', kernel: {
    moduleUrl: new URL(kernelModule, location.href).href, wasmUrl: new URL(kernelWasm, location.href).href,
    mode: 'single', tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 },
  }, solver: { moduleUrl: new URL(solverModule, location.href).href, wasmUrl: new URL(solverWasm, location.href).href } });
}
element('load').onclick = launch; element('restart').onclick = launch;
for (const action of actions) element(action).onclick = () => send({ action });
element('main-click').onclick = () => {
  clicks++; if (working) clicksDuringWork++; element('click-count').textContent = String(clicks);
};
function navigation() { if (working) navigationDuringWork++; element('navigation').textContent = location.hash; }
window.addEventListener('hashchange', navigation);
function animate() {
  if (disposed) return;
  frames++; if (working) framesDuringWork++;
  element('frames').textContent = String(frames); element('pulse').style.transform = `translateX(${frames % 120}px)`;
  animation = requestAnimationFrame(animate);
}
element('window-isolated').textContent = String(crossOriginIsolated); paint(); animate();
window.addEventListener('pagehide', () => {
  if (disposed) return;
  disposed = true; cancelAnimationFrame(animation); window.removeEventListener('hashchange', navigation); terminate('on page disposal');
}, { once: true });
