import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineCache, type OfflineCachePorts } from './offline-cache.ts';
import { fixture, headers, memoryCaches, origin, sha } from './offline-test-fixture.ts';

function setup() {
  const memory = memoryCaches(), requests: Request[] = [], progress: number[] = [];
  let serial = 0, digests = 0;
  const ports: OfflineCachePorts = { storage: memory.storage,
    fetch: async input => { const request = input as Request; requests.push(request); return new Response('hello', { headers: { ...headers, 'content-type': request.url.endsWith('.wasm') ? 'application/wasm' : 'text/html' } }); },
    digest: async bytes => { digests++; return sha(bytes); }, random: () => `attempt${++serial}`, now: () => 100,
    timeout: milliseconds => AbortSignal.timeout(milliseconds), progress: done => progress.push(done),
  };
  return { ...memory, ports, requests, progress, digests: () => digests,
    cache: (build = 'a'.repeat(64), body = 'hello') => offlineCache({ manifest: fixture(build, body), origin, ports }) };
}
const request = (url = '/index.html', extra?: HeadersInit) => new Request(origin + url, { ...(extra ? { headers: extra } : {}) });
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

test('S18 publishes a complete golden build and audits only once across asset fetches', async () => {
  const f = setup(), cache = f.cache();
  const receipt = await cache.install();
  assert.deepEqual(receipt, { schema: 1, build: 'a'.repeat(64), generation: `gsnv-paint:offline:v1:build:${'a'.repeat(64)}:attempt1`, files: 2, bytes: 10, publishedAt: 100, complete: true, manifestSha256: '73146d8aca03a07a6744a1bff9a53044417bbacd19e072e7bfd4a41b3b2d8887' });
  assert.equal(f.requests.length, 2);
  for (const r of f.requests) { assert.equal(r.credentials, 'omit'); assert.equal(r.redirect, 'error'); assert.equal(r.cache, 'no-store'); }
  assert.equal(await (await cache.match(request()))?.text(), 'hello');
  for (let i = 0; i < 10; i++) await cache.match(request('/lazy.wasm'));
  assert.equal(f.digests(), 3); assert.equal(f.progress.at(-1), 10);
  const restarted = f.cache(); await restarted.audit();
  const after = f.digests(); await restarted.match(request()); await restarted.match(request('/lazy.wasm'));
  assert.equal(f.digests(), after); await restarted.install(); assert.equal(f.requests.length, 2);
});

test('S18 fetches only the HTML entry through the canonical root without following index redirects', async () => {
  const f = setup();
  f.ports.fetch = async input => {
    const request = input as Request; f.requests.push(request);
    if (request.url === origin + '/index.html') return new Response(null, { status: 307, headers: { Location: '/' } });
    assert.ok([origin + '/', origin + '/lazy.wasm'].includes(request.url)); assert.equal(request.redirect, 'error');
    return new Response('hello', { headers: { ...headers, 'content-type': request.url.endsWith('.wasm') ? 'application/wasm' : 'text/html' } });
  };
  const a = f.cache(), receipt = await a.install();
  assert.deepEqual(f.requests.map(request => request.url), [origin + '/', origin + '/lazy.wasm']);
  const stored = await f.storage.open(receipt.generation); assert.equal(await (await stored.match(origin + '/index.html'))?.text(), 'hello');
  assert.equal(await stored.match(origin + '/'), undefined); assert.equal(await (await a.match(request()))?.text(), 'hello');
  for (const response of [new Response(null, { status: 307, headers: { Location: '/elsewhere' } }), new Response('hEllo', { headers })]) {
    f.ports.fetch = async () => response.clone();
    await assert.rejects(f.cache('b'.repeat(64)).install(), code(response.status === 307 ? 'offline.network' : 'offline.integrity'));
    assert.deepEqual(await a.audit(), receipt); assert.equal(await (await a.match(request()))?.text(), 'hello');
  }
});

test('S18 every quota boundary and failed candidate preserve published A exactly', async () => {
  for (let write = 1; write <= 6; write++) {
    const f = setup(), a = f.cache(); await a.install();
    const before = await a.audit(), pointer = origin + '/.gsnv-offline/build/' + before.build;
    const meta = await f.storage.open('gsnv-paint:offline:v1:meta'), previousPointer = await (await meta.match(pointer))!.text();
    f.failWrite(write);
    await assert.rejects(f.cache('b'.repeat(64)).install(), code('offline.quota'));
    assert.deepEqual(await a.audit(), before); assert.equal(await (await a.match(request()))?.text(), 'hello');
    assert.equal(await (await meta.match(pointer))!.text(), previousPointer);
    assert.equal(await meta.match(origin + '/.gsnv-offline/build/' + 'b'.repeat(64)), undefined);
    assert.equal((await f.storage.keys()).filter(name => name.includes('b'.repeat(64))).length, 0);
  }
});

test('S18 installation rejects network, HTML fallback, missing headers, redirect and corrupt bytes', async () => {
  const cases: [() => Promise<Response>, string][] = [
    [async () => { throw new Error('offline'); }, 'offline.network'],
    [async () => new Response('no', { status: 404, headers }), 'offline.network'],
    [async () => new Response('hello', { headers: { ...headers, 'content-type': 'text/plain' } }), 'offline.integrity'],
    [async () => new Response('hello', { headers: { 'content-type': 'text/html' } }), 'offline.headers'],
    [async () => { const response = new Response('hello', { headers }); Object.defineProperty(response, 'redirected', { value: true }); return response; }, 'offline.network'],
    [async () => { const response = new Response('hello', { headers }); Object.defineProperty(response, 'type', { value: 'opaque' }); return response; }, 'offline.network'],
    [async () => new Response('hEllo', { headers }), 'offline.integrity'],
    [async () => new Response('hello!', { headers }), 'offline.limit'],
    [async () => new Response('hell', { headers }), 'offline.integrity'],
  ];
  for (const [fetch, error] of cases) {
    const f = setup(), a = f.cache(); await a.install(); f.ports.fetch = fetch;
    await assert.rejects(f.cache('b'.repeat(64)).install(), code(error));
    assert.equal(await (await a.match(request()))?.text(), 'hello');
  }
});

test('S18 stops oversized streams and cancellation before publication', async () => {
  const f = setup(); let cancelled = false;
  f.ports.fetch = async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(6)); }, cancel() { cancelled = true; } }), { headers });
  await assert.rejects(f.cache().install(), code('offline.limit')); assert.equal(cancelled, true);
  const g = setup(), controller = new AbortController(); controller.abort();
  await assert.rejects(g.cache().install(controller.signal), code('offline.cancelled')); assert.equal(g.requests.length, 0);
});

test('S18 detects eviction and corruption; repair uses a fresh generation', async () => {
  const f = setup(), cache = f.cache(), first = await cache.install();
  const stored = await f.storage.open(first.generation); await stored.delete(request('/lazy.wasm'));
  await assert.rejects(cache.match(request('/lazy.wasm')), code('offline.incomplete'));
  await assert.rejects(cache.match(request()), code('offline.incomplete'));
  const next = await cache.install(); assert.notEqual(next.generation, first.generation);
  assert.equal(await (await cache.match(request('/lazy.wasm')))?.text(), 'hello');
  await (await f.storage.open(next.generation)).put(request(), new Response('hEllo', { headers }));
  await assert.rejects(f.cache().audit(), code('offline.incomplete'));
});

test('S18 exact Request matching preserves ranges and never consumes file/blob or foreign URLs', async () => {
  const f = setup(), cache = f.cache(); await cache.install();
  for (const [range, want, content] of [['bytes=1-3', 'ell', 'bytes 1-3/5'], ['bytes=-2', 'lo', 'bytes 3-4/5'], ['bytes=3-', 'lo', 'bytes 3-4/5']]) {
    const response = await cache.match(request('/index.html', { Range: range! }));
    assert.equal(response?.status, 206); assert.equal(response?.headers.get('content-range'), content); assert.equal(response?.headers.get('content-length'), String(want!.length)); assert.equal(await response?.text(), want);
  }
  const beyond = await cache.match(request('/index.html', { Range: 'bytes=5-' }));
  assert.equal(beyond?.status, 416); assert.equal(beyond?.headers.get('content-range'), 'bytes */5');
  for (const extra of [{ Range: 'bytes=0-1,3-4' }, { Range: 'bytes=0-1', 'If-Range': '"other"' }]) {
    const response = await cache.match(request('/index.html', extra)); assert.equal(response?.status, 200); assert.equal(await response?.text(), 'hello');
  }
  for (const r of [new Request('https://other.test/index.html'), new Request('blob:' + origin + '/dummy'), request('/user.wav'), request('/lazy.wasm?q'), new Request(origin + '/index.html', { method: 'POST', body: 'user document' })]) assert.equal(await cache.match(r), undefined);
});

test('S18 cleanup retains current and newest other complete build and leaves unrelated caches', async () => {
  const f = setup(); await f.storage.open('another-app');
  const a = await f.cache().install(); f.ports.now = () => 200;
  const b = await f.cache('b'.repeat(64)).install(); f.ports.now = () => 300;
  const c = f.cache('c'.repeat(64)), receipt = await c.install(); await c.retain();
  assert.deepEqual((await f.storage.keys()).sort(), ['another-app', b.generation, receipt.generation, 'gsnv-paint:offline:v1:meta'].sort());
  assert.equal((await f.storage.keys()).includes(a.generation), false);
});

test('S18 interrupted candidates are never served and fresh concurrent candidates survive cleanup', async () => {
  const f = setup(), cache = f.cache(); await cache.install();
  const abandoned = `gsnv-paint:offline:v1:build:${'b'.repeat(64)}:interrupted`;
  const candidate = await f.storage.open(abandoned);
  await candidate.put(request(), new Response('partial candidate', { headers }));
  await candidate.put(origin + '/.gsnv-offline/pending', new Response('{"startedAt":100}'));
  await assert.rejects(f.cache('b'.repeat(64)).audit(), code('offline.incomplete'));
  await cache.retain(); assert.ok((await f.storage.keys()).includes(abandoned));
  f.ports.now = () => 600_101; await cache.retain(); assert.equal((await f.storage.keys()).includes(abandoned), false);
  assert.equal(await (await cache.match(request()))?.text(), 'hello');
});

test('S18 timeout and storage denial produce stable errors and normalize decoded transport headers', async () => {
  const f = setup(); f.ports.timeout = () => AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
  await assert.rejects(f.cache().install(), code('offline.network'));
  const g = setup(); g.ports.storage = { ...g.storage, async open() { throw new DOMException('Denied', 'SecurityError'); } };
  await assert.rejects(g.cache().audit(), code('offline.storage'));
  const h = setup(); h.ports.fetch = async input => new Response('hello', { headers: { ...headers, 'content-type': (input as Request).url.endsWith('.wasm') ? 'application/wasm' : 'text/html', 'content-encoding': 'gzip', 'content-length': '99' } });
  const cache = h.cache(); await cache.install(); const response = await cache.match(request());
  assert.equal(response?.headers.get('content-encoding'), null); assert.equal(response?.headers.get('content-length'), '5');
});
