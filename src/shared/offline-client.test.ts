import assert from 'node:assert/strict';
import test from 'node:test';
import { createOfflineClient, type OfflineState } from './offline-client.ts';

const A = 'a'.repeat(64), B = 'b'.repeat(64);
class Worker extends EventTarget {
  state = 'activated'; silent = false; messages: Record<string, any>[] = [];
  report = { protocol: 1, kind: 'state', build: A, phase: 'ready', completedBytes: 10, totalBytes: 10 } as Record<string, any>;
  postMessage(data: Record<string, any>, ports: MessagePort[]) {
    this.messages.push(data);
    if (!this.silent) queueMicrotask(() => { ports[0]?.postMessage({ ...this.report, requestId: data.requestId }); ports[0]?.close(); });
  }
}
function setup(options: { controlled?: boolean; secure?: boolean; registrationFailure?: boolean; silent?: boolean; noWorkers?: boolean } = {}) {
  const active = new Worker(); active.silent = options.silent ?? false;
  const registration = Object.assign(new EventTarget(), { active: options.noWorkers ? null as Worker | null : active, installing: null as Worker | null, waiting: null as Worker | null, updates: 0,
    async update() { registration.updates++; return registration; } });
  const container = Object.assign(new EventTarget(), { controller: options.controlled === false || options.noWorkers ? null as Worker | null : active, registrations: 0,
    async register(url: string, settings: unknown) { container.registrations++; assert.equal(url, '/offline-sw.js'); assert.deepEqual(settings, { scope: '/', updateViaCache: 'none' }); if (options.registrationFailure) throw new Error('network'); return registration; } });
  const states: OfflineState[] = [];
  const environment = { isSecureContext: options.secure !== false, location: { origin: 'http://localhost:4197', protocol: 'http:' }, navigator: { serviceWorker: container }, crypto,
    setTimeout(callback: () => void) { return setTimeout(callback, 20); }, clearTimeout(id: NodeJS.Timeout) { clearTimeout(id); } };
  const client = createOfflineClient({ environment: environment as unknown as Window, buildId: A, onState: state => states.push(state) });
  function send(worker: Worker, data: unknown, ports: MessagePort[] = []) {
    const event = new Event('message'); Object.assign(event, { data, source: worker, origin: 'http://localhost:4197', ports }); container.dispatchEvent(event);
  }
  return { client, active, registration, container, states, options, send, latest: () => states.at(-1)! };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 1000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(predicate(), true, 'State did not settle before deadline');
}

test('S20 ready requires the matching controlling worker; unsupported setup settles visibly', async () => {
  const f = setup(); await f.client.ready;
  assert.equal(f.latest().phase, 'ready'); assert.equal(f.latest().readyBuild, A); assert.equal(f.latest().update, 'none'); f.client.dispose();
  const unsupported = setup({ secure: false }); await unsupported.client.ready;
  assert.equal(unsupported.latest().phase, 'unavailable'); await unsupported.client.check(); await unsupported.client.retry(); assert.equal(unsupported.container.registrations, 0); unsupported.client.dispose();
  const uncontrolled = setup({ controlled: false }); await uncontrolled.client.ready;
  assert.equal(uncontrolled.latest().phase, 'reopen-required'); assert.equal(uncontrolled.latest().readyBuild, undefined); uncontrolled.client.dispose();
});

test('S20 failed candidate retains active A readiness and waiting B cannot reload or replace it', async () => {
  const f = setup(); await f.client.ready;
  const candidate = new Worker(); candidate.report = { ...candidate.report, build: B, phase: 'installing', completedBytes: 0 }; candidate.state = 'installing';
  f.registration.installing = candidate; f.registration.dispatchEvent(new Event('updatefound')); await tick();
  f.send(candidate, { ...candidate.report, phase: 'error', error: { code: 'offline.integrity', message: 'Asset changed; reconnect and retry.' } });
  candidate.state = 'redundant'; candidate.dispatchEvent(new Event('statechange')); await tick();
  assert.equal(f.latest().phase, 'ready'); assert.equal(f.latest().readyBuild, A); assert.equal(f.latest().update, 'error'); assert.equal(f.latest().error?.code, 'offline.integrity');
  f.send(f.active, f.active.report); assert.equal(f.latest().update, 'error'); assert.equal(f.latest().error?.code, 'offline.integrity');
  candidate.state = 'installed'; candidate.report = { ...candidate.report, phase: 'ready', completedBytes: 10 };
  f.registration.waiting = candidate; f.registration.installing = null; candidate.dispatchEvent(new Event('statechange')); await until(() => f.latest().update === 'ready');
  assert.equal(f.latest().phase, 'ready'); assert.equal(f.latest().update, 'ready'); assert.equal(f.container.controller, f.active);
  assert.ok(candidate.messages.every(message => ['status', 'retry'].includes(message.kind))); f.client.dispose();
});

test('S20 rejects wrong build identity, malformed progress and unregistered message sources', async () => {
  const f = setup(); await f.client.ready;
  f.send(new Worker(), { ...f.active.report, phase: 'error' }); assert.equal(f.latest().phase, 'ready');
  f.send(f.active, { ...f.active.report, totalBytes: Infinity }); assert.equal(f.latest().phase, 'ready');
  f.send(f.active, { ...f.active.report, build: B }); assert.equal(f.latest().phase, 'error'); assert.equal(f.latest().error?.code, 'offline.version'); f.client.dispose();
});

test('S20 answers only known worker identity handshakes and readiness follows controllerchange', async () => {
  const f = setup({ controlled: false }); await f.client.ready;
  const channel = new MessageChannel(), reply = new Promise<any>(resolve => { channel.port1.onmessage = event => resolve(event.data); });
  f.send(f.active, { protocol: 1, kind: 'identify', requestId: 'identity', build: A }, [channel.port2]);
  assert.deepEqual(await reply, { protocol: 1, kind: 'build', requestId: 'identity', build: A }); channel.port1.close(); channel.port2.close();
  f.container.controller = f.active; f.container.dispatchEvent(new Event('controllerchange')); await until(() => f.latest().phase === 'ready');
  assert.equal(f.latest().phase, 'ready'); f.client.dispose();
});

test('S20 registration failure and request timeout settle with actionable errors; retry can recover', async () => {
  const f = setup({ registrationFailure: true, controlled: false }); await f.client.ready; assert.equal(f.latest().phase, 'error');
  f.options.registrationFailure = false; f.container.controller = f.active; await f.client.retry(); await until(() => f.latest().phase === 'ready'); f.client.dispose();
  const silent = setup({ silent: true }); await silent.client.ready; assert.equal(silent.latest().phase, 'error'); assert.match(silent.latest().error!.message, /respond|retry/i); silent.client.dispose();
});

test('S20 check audits explicitly and disposal ends ports/listeners without late state delivery', async () => {
  const f = setup(); await f.client.ready; await f.client.check();
  assert.equal(f.registration.updates, 1); assert.ok(f.active.messages.some(message => message.fresh === true));
  const length = f.states.length; f.client.dispose();
  f.send(f.active, { ...f.active.report, phase: 'error' }); f.container.dispatchEvent(new Event('controllerchange')); await tick();
  assert.equal(f.states.length, length);
  const pending = setup({ silent: true }); pending.client.dispose(); await pending.client.ready; const count = pending.states.length; await tick(); assert.equal(pending.states.length, count);
});

test('S20 Retry preserves freshly verified A when the subsequent update request rejects', async () => {
  const f = setup(); await f.client.ready;
  f.registration.update = async () => { throw new TypeError('Network offline'); };
  await f.client.check(); assert.equal(f.latest().phase, 'ready'); assert.equal(f.latest().update, 'error');
  await f.client.retry();
  assert.equal(f.latest().phase, 'ready'); assert.equal(f.latest().readyBuild, A);
  assert.equal(f.latest().update, 'error'); assert.equal(f.latest().error?.code, 'offline.network');
  assert.equal(f.active.messages.at(-1)?.kind, 'retry'); f.client.dispose();
});

test('S20 Retry preserves the actual active audit failure alongside a failed update check', async () => {
  const f = setup(); await f.client.ready;
  f.active.report = { ...f.active.report, phase: 'error', error: { code: 'offline.incomplete', message: 'The offline copy is missing.' } };
  f.registration.update = async () => { throw new TypeError('Network offline'); };
  await f.client.retry();
  assert.equal(f.latest().phase, 'error'); assert.equal(f.latest().readyBuild, undefined);
  assert.equal(f.latest().error?.code, 'offline.incomplete'); assert.equal(f.latest().update, 'error'); f.client.dispose();
});

test('S20 failed Retry update with waiting B preserves A and never requests activation', async () => {
  const f = setup(); await f.client.ready;
  const b = new Worker(); b.state = 'installed'; b.report = { ...b.report, build: B };
  f.registration.waiting = b; f.registration.installing = b; f.registration.dispatchEvent(new Event('updatefound'));
  await until(() => f.latest().update === 'ready');
  f.registration.update = async () => { throw new TypeError('Network offline'); }; await f.client.retry();
  assert.equal(f.latest().phase, 'ready'); assert.equal(f.latest().readyBuild, A); assert.equal(f.latest().update, 'error');
  assert.equal(f.container.controller, f.active); assert.ok(b.messages.every(message => message.kind === 'status')); f.client.dispose();
});

test('S20 initial Retry failure does not invent readiness and disposal suppresses a late rejection', async () => {
  const initial = setup({ controlled: false, registrationFailure: true }); await initial.client.ready;
  await initial.client.retry(); assert.equal(initial.latest().phase, 'error'); assert.equal(initial.latest().readyBuild, undefined); initial.client.dispose();
  const f = setup(); await f.client.ready;
  let reject!: (reason: unknown) => void;
  f.registration.update = () => new Promise((_, no) => { reject = no; });
  const retry = f.client.retry(); await until(() => !!reject); f.client.dispose(); const count = f.states.length;
  reject(new TypeError('Network offline')); await retry; assert.equal(f.states.length, count);
});

test('S20 Retry update failure without any installed worker reports initial setup failure', async () => {
  const f = setup({ noWorkers: true }); await tick();
  f.registration.update = async () => { throw new TypeError('Network offline'); };
  await f.client.retry(); assert.equal(f.latest().phase, 'error'); assert.equal(f.latest().readyBuild, undefined);
  assert.equal(f.latest().error?.code, 'offline.network'); await f.client.ready; f.client.dispose();
});
