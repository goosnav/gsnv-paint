/** Development-only C02 UI. No solver implementation runs on the main thread. */
import moduleAsset from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.js?url';
import wasmAsset from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import type { FixtureReply, FixtureRequest } from './solver-runtime.worker.ts';

const WATCHDOG_MS = 30_000; // Harness deadline, not future CAD job policy.
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const actions = ['solve', 'probe', 'conflict', 'close', 'work'] as const;
let worker: Worker | null = null, epoch = 0, nextId = 0, disposed = false, initialized = false;
let pending: { id: number; action: FixtureRequest['action']; timer: number } | null = null;
let working = false, frames = 0, clicks = 0, framesDuringWork = 0, clicksDuringWork = 0, animation = 0;
function paint() {
  element('worker-alive').textContent = worker ? 'yes' : 'no'; element('worker-epoch').textContent = String(epoch);
  element<HTMLButtonElement>('load').disabled = !!worker; element<HTMLButtonElement>('terminate').disabled = !worker;
  for (const id of actions) element<HTMLButtonElement>(id).disabled = !initialized || !!pending;
}
function terminate(reason: string) {
  if (worker) { worker.terminate(); element('termination').textContent = `Terminated worker ${epoch} ${reason}`; }
  worker = null; initialized = false; working = false;
  if (pending) clearTimeout(pending.timer); pending = null; paint();
}
function fail(result: Record<string, unknown>) {
  element('error-result').textContent = JSON.stringify(result); terminate('after error');
  element('solver-status').textContent = 'Solver failed; worker terminated';
}
function send(request: Omit<Extract<FixtureRequest, { action: 'open' }>, 'id'> | { action: Exclude<FixtureRequest['action'], 'open'> }) {
  if (!worker || pending || disposed) return;
  const id = ++nextId, action = request.action;
  pending = { id, action, timer: window.setTimeout(() => fail({ name: 'FixtureDeadlineError', message: `Solver request exceeded ${WATCHDOG_MS} ms; worker terminated.` }), WATCHDOG_MS) };
  element('solver-status').textContent = action === 'open' ? 'Loading solver in worker' : 'Waiting for worker';
  try { worker.postMessage({ ...request, id }); paint(); } catch (cause) { fail({ name: 'WorkerMessageError', message: String(cause) }); }
}
function launch() {
  if (disposed) return;
  terminate(working ? 'during work' : 'before replacement'); epoch++;
  const active = new Worker(new URL('./solver-runtime.worker.ts', import.meta.url), { type: 'module' }); worker = active;
  active.onmessage = (event: MessageEvent<FixtureReply>) => {
    if (worker !== active || !pending || event.data.id !== pending.id) return;
    if (event.data.phase === 'started') {
      working = true; framesDuringWork = 0; clicksDuringWork = 0; element('solver-status').textContent = 'Working in solver worker'; return;
    }
    if (event.data.phase === 'error') { fail(event.data.result); return; }
    const action = pending.action; clearTimeout(pending.timer); pending = null;
    const result: Record<string, unknown> = action === 'work' ? { ...event.data.result, framesDuringWork, clicksDuringWork } : event.data.result;
    working = false; element(`${action}-result`).textContent = JSON.stringify(result);
    if (action === 'conflict') {
      element('contradiction').textContent = result.status === 2 && Array.isArray(result.conflicts) && result.conflicts.includes('width100') && result.conflicts.includes('width101')
        ? 'width100 (100 mm) and width101 (101 mm) conflict. The last successful corners are retained; failed output was not applied.'
        : `Unexpected contradiction result: ${JSON.stringify(result)}`;
    }
    initialized = action !== 'close'; element('solver-status').textContent = action === 'close' ? 'Session closed; worker still owns its heap' : 'Solver ready'; paint();
  };
  active.onerror = event => { event.preventDefault(); if (worker === active) fail({ name: 'WorkerError', message: event.message }); };
  active.onmessageerror = () => { if (worker === active) fail({ name: 'WorkerMessageError', message: 'Worker result could not be read.' }); };
  send({ action: 'open', moduleUrl: new URL(moduleAsset, location.href).href, wasmUrl: new URL(wasmAsset, location.href).href });
}
element('load').onclick = launch; element('restart').onclick = launch;
element('terminate').onclick = () => { terminate(working ? 'during work' : 'by user'); element('solver-status').textContent = 'Worker terminated'; };
for (const action of actions) element(action).onclick = () => send({ action });
element('main-click').onclick = () => { clicks++; if (working) clicksDuringWork++; element('click-count').textContent = String(clicks); };
function animate() {
  if (disposed) return;
  frames++; if (working) framesDuringWork++;
  element('frames').textContent = String(frames); element('pulse').style.transform = `translateX(${frames % 200}px)`;
  animation = requestAnimationFrame(animate);
}
element('window-isolated').textContent = String(crossOriginIsolated); paint(); animate();
window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(animation); terminate('on page disposal'); }, { once: true });
