import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineCache, type OfflineCachePorts, type OfflineReceipt } from './offline-cache.ts';
import { fixture, headers, memoryCaches, origin, sha } from './offline-test-fixture.ts';

const prefix = 'gsnv-paint:offline:v1:', privateKey = (name: string) => origin + '/.gsnv-offline/' + name;
const json = (value: unknown) => new Response(JSON.stringify(value));
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
function setup() {
  const memory = memoryCaches(); let serial = 0, time = 100;
  const ports: OfflineCachePorts = { storage: memory.storage,
    fetch: async input => new Response('hello', { headers: { ...headers, 'content-type': (input as Request).url.endsWith('.wasm') ? 'application/wasm' : 'text/html' } }),
    digest: async bytes => sha(bytes), random: () => `attempt${++serial}`, now: () => time,
    timeout: AbortSignal.timeout, progress() {},
  };
  const cache = (id: string) => offlineCache({ manifest: fixture(id.repeat(64)), origin, ports });
  return { ...memory, ports, cache, now(value: number) { time = value; } };
}
type Fixture = ReturnType<typeof setup>;
async function published(f: Fixture, r: OfflineReceipt, value: Record<string, unknown>) {
  await (await f.storage.open(r.generation)).put(privateKey('receipt'), json(value));
  await (await f.storage.open(prefix + 'meta')).put(privateKey(`build/${r.build}`), json(value));
}
async function manifest(f: Fixture, r: OfflineReceipt, text: string, bind = true) {
  await (await f.storage.open(r.generation)).put(privateKey('manifest'), new Response(text));
  if (bind) await published(f, r, { ...r, manifestSha256: sha(new TextEncoder().encode(text)) });
}
async function abc() {
  const f = setup(), a = f.cache('a'), ar = await a.install(); f.now(200);
  const b = f.cache('b'), br = await b.install(); f.now(300);
  const c = f.cache('c'), cr = await c.install();
  return { f, a, ar, b, br, c, cr };
}

for (const missing of ['generation', 'lazy asset']) test(`S18 retains independently verified A when newer B loses its ${missing}`, async () => {
  const { f, a, ar, br, c, cr } = await abc();
  if (missing === 'generation') await f.storage.delete(br.generation);
  else await (await f.storage.open(br.generation)).delete(origin + '/lazy.wasm');
  await a.audit(); await c.retain();
  assert.ok((await f.storage.keys()).includes(ar.generation)); await a.audit(); await c.audit();
  assert.ok((await f.storage.keys()).includes(cr.generation));
  if (missing === 'generation') assert.ok(!(await f.storage.keys()).includes(br.generation), 'inspection must not create a missing generation');
});

const invalidCandidates: [string, (f: Fixture, r: OfflineReceipt) => Promise<unknown>][] = [
  ['corrupt asset bytes', async (f, r) => (await f.storage.open(r.generation)).put(origin + '/lazy.wasm', new Response('hEllo', { headers: { ...headers, 'content-type': 'application/wasm' } }))],
  ['wrong MIME', async (f, r) => (await f.storage.open(r.generation)).put(origin + '/lazy.wasm', new Response('hello', { headers }))],
  ['missing isolation', async (f, r) => (await f.storage.open(r.generation)).put(origin + '/lazy.wasm', new Response('hello', { headers: { 'content-type': 'application/wasm' } }))],
  ['missing manifest', async (f, r) => (await f.storage.open(r.generation)).delete(privateKey('manifest'))],
  ['bad manifest digest', async (f, r) => manifest(f, r, JSON.stringify(fixture(r.build)).replace('index', 'other'), false)],
  ['invalid JSON', async (f, r) => manifest(f, r, '{')],
  ['invalid manifest schema', async (f, r) => manifest(f, r, JSON.stringify({ ...fixture(r.build), schema: 2 }))],
  ['different manifest build', async (f, r) => manifest(f, r, JSON.stringify(fixture('d'.repeat(64))))],
  ['different file count', async (f, r) => manifest(f, r, JSON.stringify({ ...fixture(r.build), assets: fixture(r.build).assets.slice(0, 1) }))],
  ['different byte count', async (f, r) => manifest(f, r, JSON.stringify(fixture(r.build, 'hello!')))],
  ['bad receipt binding', async (f, r) => (await f.storage.open(r.generation)).put(privateKey('receipt'), json({ ...r, manifestSha256: '0'.repeat(64) }))],
  ['missing completion receipt', async (f, r) => (await f.storage.open(r.generation)).delete(privateKey('receipt'))],
];
for (const [name, damage] of invalidCandidates) test(`S18 excludes ${name} from fallback selection and preserves valid A`, async () => {
  const { f, a, ar, br, c } = await abc(); await damage(f, br); await a.audit(); await c.retain();
  assert.ok((await f.storage.keys()).includes(ar.generation)); await a.audit(); await c.audit();
});

test('S18 historical manifest has a strict UTF-8 byte bound and cancels an oversized stream', async () => {
  const { f, a, ar, br, c } = await abc(); let cancelled = false;
  const open = f.storage.open.bind(f.storage);
  f.ports.storage = { ...f.storage, async open(name) {
    const cache = await open(name); if (name !== br.generation) return cache;
    return { ...cache, async match(key: RequestInfo | URL) {
      if (String(key) !== privateKey('manifest')) return cache.match(key);
      let sent = false;
      return new Response(new ReadableStream({ pull(controller) { if (!sent) { sent = true; controller.enqueue(new Uint8Array(26_214_400)); } }, cancel() { cancelled = true; } }));
    } } as Cache;
  } };
  await c.retain(); assert.equal(cancelled, true); assert.ok((await f.storage.keys()).includes(ar.generation)); await a.audit();
});

test('S18 accepts a valid manifest one UTF-8 byte below the bound and never serves its private key', async () => {
  const { f, ar, br, c } = await abc();
  await manifest(f, br, JSON.stringify(fixture(br.build)).padEnd(26_214_399, ' '));
  await c.retain(); assert.ok(!(await f.storage.keys()).includes(ar.generation));
  assert.ok((await f.storage.keys()).includes(br.generation)); assert.equal(await c.match(new Request(privateKey('manifest'))), undefined);
});

test('S18 freshly audits current C before cleanup rather than trusting its earlier install', async () => {
  const { f, ar, br, cr, c } = await abc(); await (await f.storage.open(cr.generation)).delete(origin + '/lazy.wasm');
  const names = await f.storage.keys(); await assert.rejects(c.retain(), code('offline.incomplete'));
  assert.deepEqual(await f.storage.keys(), names); assert.ok(names.includes(ar.generation) && names.includes(br.generation));
});

test('S18 deterministic equal-time fallback uses generation-name order', async () => {
  const f = setup(), a = await f.cache('a').install(), b = await f.cache('b').install(), c = f.cache('c'); await c.install(); await c.retain();
  assert.ok(!(await f.storage.keys()).includes(a.generation)); assert.ok((await f.storage.keys()).includes(b.generation));
});

test('S18 legacy published generations survive normal cleanup and absent verified fallback', async () => {
  const { f, ar, br, c } = await abc();
  const legacy = { ...ar } as Record<string, unknown>; delete legacy.manifestSha256;
  await published(f, ar, legacy); await (await f.storage.open(ar.generation)).delete(privateKey('manifest'));
  await c.retain(); assert.ok((await f.storage.keys()).includes(ar.generation));
  await (await f.storage.open(br.generation)).delete(origin + '/lazy.wasm');
  await c.retain(); assert.ok((await f.storage.keys()).includes(ar.generation)); assert.ok((await f.storage.keys()).includes(br.generation));
  await f.cache('a').audit();
});

for (const malformed of ['invalid JSON', 'bad receipt', 'mismatched build', 'oversized metadata']) test(`S18 ${malformed} public metadata never makes a published generation eligible as abandoned`, async () => {
  const { f, ar, br, c } = await abc(); f.now(700_000);
  const text = malformed === 'invalid JSON' ? '{' : malformed === 'oversized metadata' ? ' '.repeat(4097) : JSON.stringify({ ...br, ...(malformed === 'bad receipt' ? { manifestSha256: 'bad' } : { build: 'd'.repeat(64) }) });
  await (await f.storage.open(prefix + 'meta')).put(privateKey(`build/${br.build}`), new Response(text));
  const names = await f.storage.keys(); await assert.rejects(c.retain());
  assert.deepEqual(await f.storage.keys(), names); assert.ok(names.includes(ar.generation) && names.includes(br.generation));
});

for (const failure of ['open', 'completion', 'manifest', 'asset', 'stream', 'coded asset stream', 'digest', 'candidate marker']) test(`S18 ${failure} read failure aborts cleanup without deleting published generations`, async () => {
  const { f, ar, br, c } = await abc(); const open = f.storage.open.bind(f.storage);
  const abandoned = `${prefix}build:${'d'.repeat(64)}:abandoned`;
  if (failure === 'candidate marker') await (await f.storage.open(abandoned)).put(privateKey('pending'), json({ startedAt: 0 }));
  const names = await f.storage.keys(); f.now(700_000);
  if (failure === 'digest') f.ports.digest = async bytes => { if (new TextDecoder().decode(bytes).includes(br.build)) throw new DOMException('Digest unavailable', 'OperationError'); return sha(bytes); };
  f.ports.storage = { ...f.storage, async open(name) {
    if (name === br.generation && failure === 'open') throw new DOMException('Read denied', 'SecurityError');
    const cache = await open(name);
    if (name !== br.generation && name !== abandoned) return cache;
    return { ...cache, async match(key: RequestInfo | URL) {
      const url = typeof key === 'string' ? key : key instanceof URL ? key.href : key.url;
      if ((failure === 'completion' && url === privateKey('receipt')) || (failure === 'manifest' && url === privateKey('manifest')) ||
          (failure === 'asset' && url === origin + '/lazy.wasm') || (failure === 'candidate marker' && name === abandoned)) throw new DOMException('Read denied', 'SecurityError');
      if (failure === 'stream' && url === privateKey('manifest')) return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Cache body unavailable')); } }));
      if (failure === 'coded asset stream' && url === origin + '/lazy.wasm') return new Response(new ReadableStream({ start(controller) { controller.error(Object.assign(new Error('Cache body unavailable'), { code: 'offline.storage' })); } }), { headers: { ...headers, 'content-type': 'application/wasm' } });
      return cache.match(key);
    } } as Cache;
  } };
  await assert.rejects(c.retain(), code('offline.storage')); assert.deepEqual(await f.storage.keys(), names);
  assert.ok(names.includes(ar.generation));
});

test('S18 cancellation at the new manifest write leaves the existing same-build pointer and bytes intact', async () => {
  const f = setup(), a = f.cache('a'), first = await a.install(), pointer = privateKey(`build/${first.build}`);
  const meta = await f.storage.open(prefix + 'meta'), before = await (await meta.match(pointer))!.text();
  const controller = new AbortController(), open = f.storage.open.bind(f.storage);
  // An explicit reinstall is needed because the original published generation has been evicted externally.
  await (await f.storage.open(first.generation)).delete(origin + '/lazy.wasm');
  f.ports.storage = { ...f.storage, async open(name) {
    const cache = await open(name);
    return { ...cache, async put(key: RequestInfo | URL, response: Response) {
      await cache.put(key, response);
      if (String(key) === privateKey('manifest') && name !== first.generation) controller.abort();
    } } as Cache;
  } };
  await assert.rejects(a.install(controller.signal), code('offline.cancelled'));
  assert.equal(await (await meta.match(pointer))!.text(), before);
  assert.equal(await (await (await f.storage.open(first.generation)).match(origin + '/index.html'))!.text(), 'hello');
  assert.deepEqual((await f.storage.keys()).sort(), [first.generation, prefix + 'meta'].sort());
});

for (const operation of ['keys', 'pointer']) test(`S18 metadata ${operation} storage failure performs no destructive cleanup`, async () => {
  const { f, c } = await abc(), before = await f.storage.keys(), open = f.storage.open.bind(f.storage);
  f.ports.storage = { ...f.storage, async open(name) {
    const cache = await open(name); if (name !== prefix + 'meta') return cache;
    return { ...cache, async keys() { if (operation === 'keys') throw new DOMException('Read denied', 'SecurityError'); return cache.keys(); },
      async match(key: RequestInfo | URL) { if (operation === 'pointer' && typeof key !== 'string') throw new DOMException('Read denied', 'SecurityError'); return cache.match(key); },
    } as Cache;
  } };
  await assert.rejects(c.retain(), code('offline.storage')); assert.deepEqual(await f.storage.keys(), before);
});
