import assert from 'node:assert/strict';
import test from 'node:test';
import { installOfflineWorker, type OfflineWorkerScope } from './offline-worker.ts';
import { fixture, headers, memoryCaches, origin } from './offline-test-fixture.ts';

function setup(options: { update?: boolean; replies?: (string | null)[] } = {}) {
  const memory = memoryCaches(), listeners = new Map<string, (event: any) => void>(), messages: unknown[] = [];
  let claims = 0, calls = 0, digests = 0;
  const cryptoPort = { randomUUID: () => crypto.randomUUID(), subtle: { digest: async (...args: Parameters<SubtleCrypto['digest']>) => { digests++; return crypto.subtle.digest(...args); } } };
  const clients = (options.replies ?? ['a'.repeat(64)]).map((build, i) => ({ id: String(i), type: 'window', url: `${origin}/`,
    postMessage(data: any, transfer?: Transferable[]) {
      messages.push(data);
      if (data.kind === 'identify' && build) (transfer?.[0] as MessagePort)?.postMessage({ protocol: 1, kind: 'build', requestId: data.requestId, build });
    } }));
  const scope = {
    location: { origin }, registration: { scope: origin + '/', active: options.update ? {} : null }, caches: memory.storage, crypto: cryptoPort,
    fetch: async (input: RequestInfo | URL) => { calls++; const r = input as Request; return new Response('hello', { headers: { ...headers, 'content-type': r.url.endsWith('.wasm') ? 'application/wasm' : 'text/html' } }); },
    clients: { async matchAll() { return clients; }, async get(id: string) { return clients.find(client => client.id === id); }, async claim() { claims++; } },
    addEventListener(type: string, callback: (event: any) => void) { listeners.set(type, callback); },
    setTimeout(callback: () => void) { return setTimeout(callback, 20); }, clearTimeout(id: unknown) { clearTimeout(id as NodeJS.Timeout); },
    skipWaiting() { throw new Error('Must never skip waiting'); },
  };
  installOfflineWorker({ scope: scope as unknown as OfflineWorkerScope, manifest: fixture() });
  async function lifecycle(type: string) { let promise!: Promise<unknown>; listeners.get(type)!({ waitUntil(p: Promise<unknown>) { promise = p; } }); await promise; }
  async function fetch(request: Request) { let response: Promise<Response> | undefined; const pending: Promise<unknown>[] = [];
    listeners.get('fetch')!({ request, respondWith(r: Promise<Response>) { response = r; }, waitUntil(p: Promise<unknown>) { pending.push(p); } });
    const result = await response; await Promise.allSettled(pending); return result;
  }
  return { memory, scope, messages, clients, listeners, lifecycle, fetch, claims: () => claims, calls: () => calls, digests: () => digests,
    restart() { installOfflineWorker({ scope: scope as unknown as OfflineWorkerScope, manifest: fixture() }); } };
}

test('S19 waits for complete installation and claims only matching first-install windows', async () => {
  const f = setup(); let resolve!: () => void;
  const realFetch = f.scope.fetch;
  f.scope.fetch = async input => { if ((input as Request).url.endsWith('.wasm')) await new Promise<void>(done => { resolve = done; }); return realFetch(input); };
  let completed = false; const pending = f.lifecycle('install').then(() => { completed = true; });
  while (!resolve) await new Promise(done => setTimeout(done, 1));
  assert.equal(completed, false); assert.equal(f.claims(), 0); resolve(); await pending;
  await f.lifecycle('activate'); assert.equal(f.claims(), 1);
  assert.equal(await (await f.fetch(new Request(origin + '/lazy.wasm')))?.text(), 'hello');
});

test('S19 failed install rejects the lifecycle and cannot publish a usable candidate', async () => {
  const f = setup(); f.scope.fetch = async () => new Response('missing', { status: 404 });
  await assert.rejects(f.lifecycle('install'), (error: any) => error.code === 'offline.network');
  assert.equal(f.claims(), 0); assert.equal((await f.memory.storage.keys()).filter(name => name.includes(':build:')).length, 0);
  assert.ok(f.messages.some((message: any) => message.phase === 'error' && message.error.code === 'offline.network'));
});

test('S19 update and mismatched/unresponsive clients never cause an unsafe claim', async () => {
  for (const options of [{ update: true }, { replies: ['a'.repeat(64), 'b'.repeat(64)] }, { replies: [null] }]) {
    const f = setup(options); await f.lifecycle('install'); await f.lifecycle('activate'); assert.equal(f.claims(), 0);
  }
});

test('S19 root navigation aliases keep cached headers and exclude unknown, POST, blob and foreign URLs', async () => {
  const f = setup(); await f.lifecycle('install'); await f.lifecycle('activate');
  for (const path of ['/?session=1', '/index.html?ignored=1']) {
    const request = new Request(origin + path); Object.defineProperty(request, 'mode', { value: 'navigate' });
    const response = await f.fetch(request); assert.equal(await response?.text(), 'hello');
    assert.equal(response?.headers.get('cross-origin-embedder-policy'), 'require-corp');
  }
  for (const request of [new Request(origin + '/unknown.wasm'), new Request(origin + '/lazy.wasm?other'), new Request('https://other.test/lazy.wasm'),
    new Request('blob:' + origin + '/user'), new Request(origin + '/index.html', { method: 'POST', body: 'private user text' })]) assert.equal(await f.fetch(request), undefined);
  assert.equal(f.calls(), 2);
});

test('S19 corrupted cache falls through with the original Range Request and never returns HTML as WASM', async () => {
  const f = setup(); await f.lifecycle('install');
  const generation = (await f.memory.storage.keys()).find(name => name.includes(':build:'))!;
  await (await f.memory.storage.open(generation)).delete(origin + '/lazy.wasm');
  const request = new Request(origin + '/lazy.wasm', { headers: { Range: 'bytes=0-2' } });
  let observed: Request | undefined; f.scope.fetch = async input => { observed = input as Request; return new Response('<html>fallback', { headers }); };
  const response = await f.fetch(request); assert.equal(observed, request); assert.equal(response?.status, 503);
  assert.equal(response?.headers.get('content-type'), 'text/plain; charset=utf-8'); assert.equal(response?.headers.get('cross-origin-opener-policy'), 'same-origin');
});

test('S19 validates window source, protocol bounds and fresh checks before replying through a port', async () => {
  const f = setup(); await f.lifecycle('install');
  const channel = new MessageChannel();
  const reply = new Promise<any>(resolve => { channel.port1.onmessage = event => resolve(event.data); });
  let promise!: Promise<unknown>;
  f.listeners.get('message')!({ source: { id: '0' }, data: { protocol: 1, kind: 'status', requestId: '123', pageBuild: 'a'.repeat(64), fresh: true }, ports: [channel.port2], waitUntil(p: Promise<unknown>) { promise = p; } });
  await promise; const data = await reply; channel.port1.close(); channel.port2.close();
  assert.equal(data.phase, 'ready'); assert.equal(data.requestId, '123'); assert.equal(data.build, 'a'.repeat(64));
  for (const [source, data] of [[{ id: 'missing' }, { kind: 'retry' }], [{ id: '0' }, { kind: 'fetch', url: 'https://evil.invalid/' }],
    [{ id: '0' }, { kind: 'retry', requestId: 'x'.repeat(5000) }]]) {
    let waited: Promise<unknown> | undefined;
    f.listeners.get('message')!({ source, data: { protocol: 1, requestId: '123', pageBuild: 'a'.repeat(64), ...data }, ports: [], waitUntil(p: Promise<unknown>) { waited = p; } }); await waited;
  }
  f.clients[0]!.url = 'about:blank'; assert.equal(f.calls(), 2);
});

test('S19 startup navigation and ordinary status share one integrity audit', async () => {
  const f = setup(); await f.lifecycle('install'); f.restart(); const before = f.digests();
  await f.fetch(new Request(origin + '/index.html'));
  const channel = new MessageChannel(); let pending!: Promise<unknown>;
  channel.port1.onmessage = () => channel.port1.close();
  f.listeners.get('message')!({ source: { id: '0' }, data: { protocol: 1, kind: 'status', requestId: 'restart', pageBuild: 'a'.repeat(64) }, ports: [channel.port2], waitUntil(p: Promise<unknown>) { pending = p; } });
  await pending; channel.port1.close(); channel.port2.close();
  assert.equal(f.digests() - before, 3); // One startup audit: two assets plus the digest-bound manifest; status adds none.
});

test('S19 refuses a claim when the window set changes during identification', async () => {
  const f = setup(); await f.lifecycle('install'); let identified = false;
  const original = f.clients[0]!.postMessage;
  f.clients[0]!.postMessage = (data, transfer) => { if (data.kind === 'identify') identified = true; original(data, transfer); };
  f.scope.clients.matchAll = async () => identified ? [...f.clients, { ...f.clients[0]!, id: 'new-window' }] : f.clients;
  await f.lifecycle('activate'); assert.equal(f.claims(), 0);
});
