import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { recoverySession, type RecoverySessionRequest, type RecoveryPort } from './recovery-session.ts';
import { recoveryStore, type RecoveryPorts, type RecoveryRecord } from './recovery-store.ts';
import { nativeContainer } from './native-container.ts';

type Package = Extract<RecoverySessionRequest, { operation: 'save' }>['package'];
const sample: Package = {
  project: { format: 'gsnv-image', version: 1, id: 'p1', title: 'Pixels', content: { width: 1, height: 1 } },
  assets: [{ id: 'tile-0', mime: 'application/octet-stream', bytes: new Uint8Array([0, 255, 1]) }],
};
const request = (generation = 1): RecoverySessionRequest => ({ operation: 'save', workspace: 'image', generation, package: sample });
const recover = { operation: 'recover' as const, workspace: 'image' as const, generation: 0 };
const discard = { ...recover, operation: 'discard' as const };
function resources() {
  const journal = new Map<string, string>(); const calls: Parameters<RecoveryPort>[0][] = [];
  const ports: RecoveryPorts = { indexedDB: new IDBFactory(), localStorage: {
    getItem: key => journal.get(key) ?? null, setItem: (key, value) => { journal.set(key, value); }, removeItem: key => { journal.delete(key); },
  } };
  const port: RecoveryPort = async request => { calls.push(request); return recoveryStore(request, ports); };
  return { ports, port, journal, calls };
}
function errorOf(result: Awaited<ReturnType<typeof recoverySession>>) { assert.ok(!result.ok); return result.error; }
const invalid = (value: unknown, port: RecoveryPort) => recoverySession(value as RecoverySessionRequest, port);
const rawRecord = (generation: number, payload: readonly Uint8Array[]): RecoveryRecord => ({ workspace: 'image', generation, title: sample.project.title, payload });

test('S14 golden real S03/S15/S08 roundtrip returns exact package and journal metadata', async () => {
  const { port, journal, calls } = resources();
  assert.deepEqual(await recoverySession(request(7), port), { ok: true, value: sample });
  assert.deepEqual(await recoverySession(recover, port), { ok: true, value: sample });
  assert.deepEqual(calls, [
    { op: 'write', record: rawRecord(7, nativeContainer({ op: 'encode', package: sample }).parts) },
    { op: 'read', workspace: 'image' },
  ]);
  assert.deepEqual([...journal.entries()], [['gsnv-paint:recovery:image', '{"generation":7,"workspace":"image"}']]);
});

test('S14 missing recovery and serialized discard return null without touching other workspaces', async () => {
  const { port } = resources(); assert.deepEqual(await recoverySession(recover, port), { ok: true, value: null });
  for (const workspace of ['cad', 'image', 'video'] as const) {
    const packageValue: Package = { ...sample, project: { ...sample.project, format: `gsnv-${workspace}`, title: workspace } };
    assert.deepEqual(await recoverySession({ operation: 'save', workspace, generation: 1, package: packageValue }, port), { ok: true, value: packageValue });
  }
  assert.deepEqual(await recoverySession(discard, port), { ok: true, value: null });
  assert.deepEqual(await recoverySession(recover, port), { ok: true, value: null });
  for (const workspace of ['cad', 'video'] as const) {
    const result = await recoverySession({ ...recover, workspace }, port); assert.ok(result.ok && result.value); assert.equal(result.value.project.title, workspace);
  }
});

test('S14 older and equal saves return the actual newer committed package', async () => {
  const { port } = resources(); await recoverySession(request(10), port);
  const attempted = { ...sample, project: { ...sample.project, title: 'Uncommitted attempt' } };
  for (const generation of [-1, 9, 10]) {
    assert.deepEqual(await recoverySession({ operation: 'save', workspace: 'image', generation, package: attempted }, port), { ok: true, value: sample });
  }
  assert.deepEqual(await recoverySession(recover, port), { ok: true, value: sample });
});

test('S14 overlapping saves retain the highest committed generation across real S08', async () => {
  const { port } = resources();
  const results = await Promise.all([3, 1, 5, 2, 4].map(generation => recoverySession({ operation: 'save', workspace: 'image', generation,
    package: { ...sample, project: { ...sample.project, title: `Generation ${generation}` } } }, port)));
  assert.ok(results.every(result => result.ok && result.value));
  const recovered = await recoverySession(recover, port); assert.ok(recovered.ok && recovered.value);
  assert.equal(recovered.value.project.title, 'Generation 5');
});

test('S14 journal quota failure retains old valid recovery with storage code and context', async () => {
  const { port, ports } = resources(); await recoverySession(request(), port);
  ports.localStorage = { getItem: () => null, setItem() { throw new DOMException('Full', 'QuotaExceededError'); }, removeItem() {} };
  const failed = await recoverySession(request(2), port);
  assert.deepEqual(errorOf(failed), { code: 'recovery.quota', message: 'Recovery save (image): Recovery operation failed: Full' });
  assert.deepEqual(await recoverySession(recover, port), { ok: true, value: sample });
});

test('S14 simulated interrupted write recovers the previous package despite an advanced journal', async () => {
  const { port, journal } = resources(); await recoverySession(request(), port);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) { const value = original.apply(this, args); this.transaction.abort(); return value; };
  let result: Awaited<ReturnType<typeof recoverySession>>;
  try { result = await recoverySession({ operation: 'save', workspace: 'image', generation: 2, package: { ...sample, project: { ...sample.project, title: 'Interrupted' } } }, port); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.equal(errorOf(result).code, 'recovery.write');
  assert.equal(JSON.parse(journal.get('gsnv-paint:recovery:image')!).generation, 2);
  assert.deepEqual(await recoverySession(recover, port), { ok: true, value: sample });
});

test('S14 corrupt or oversized container bytes remain stored and never replace caller state', async () => {
  const encoded = nativeContainer({ op: 'encode', package: sample }); const bytes = new Uint8Array(Buffer.concat(encoded.parts));
  const broken = bytes.slice(); broken[broken.length - 1] = 7;
  const large = bytes.slice(0, 12); new DataView(large.buffer).setUint32(8, 64 * 1024 * 1024 + 1, true);
  for (const [payload, code] of [[broken, 'recovery.format'], [new Uint8Array(), 'recovery.format'], [large, 'recovery.limit']] as const) {
    const { port, ports } = resources(); const record = rawRecord(7, [payload]);
    assert.ok((await recoveryStore({ op: 'write', record }, ports)).ok);
    const current = { id: 'Existing', revision: 3 }; let document: unknown = current;
    const result = await recoverySession(recover, port); if (result.ok && result.value) document = result.value;
    assert.equal(errorOf(result).code, code); assert.equal(document, current);
    assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'image' }, ports), { ok: true, value: record });
  }
});

test('S14 common metadata errors remain distinguishable on save and recovery', async () => {
  const { port, ports, calls } = resources();
  assert.equal(errorOf(await invalid({ ...request(), package: { ...sample, project: { ...sample.project, version: 2 } } }, port)).code, 'recovery.metadata');
  assert.deepEqual(calls, []);
  const encoded = nativeContainer({ op: 'encode', package: sample }); const raw = new Uint8Array(Buffer.concat(encoded.parts));
  const length = new DataView(raw.buffer).getUint32(8, true);
  const manifest = new TextDecoder().decode(raw.subarray(12, 12 + length)).replace('"version":1', '"version":2');
  raw.set(new TextEncoder().encode(manifest), 12);
  await recoveryStore({ op: 'write', record: rawRecord(1, [raw]) }, ports);
  const recovered = await recoverySession(recover, port); assert.equal(errorOf(recovered).code, 'recovery.metadata');
  assert.match(errorOf(recovered).message, /Unsupported project version/);
});

test('S14 workspace mismatches are rejected before writes and before returning recovered content', async () => {
  const { port, ports, calls } = resources();
  assert.equal(errorOf(await recoverySession({ ...request(), workspace: 'cad' }, port)).code, 'recovery.workspace');
  assert.deepEqual(calls, []);
  const packageValue: Package = { ...sample, project: { ...sample.project, format: 'gsnv-cad' } };
  await recoveryStore({ op: 'write', record: rawRecord(4, nativeContainer({ op: 'encode', package: packageValue }).parts) }, ports);
  assert.equal(errorOf(await recoverySession(recover, port)).code, 'recovery.workspace');
  const wrongPort: RecoveryPort = async () => ({ ok: true, value: { ...rawRecord(4, []), workspace: 'video' } });
  assert.equal(errorOf(await recoverySession(recover, wrongPort)).code, 'recovery.workspace');
});

test('S14 invalid packages cannot overwrite old recovery or reach the port', async () => {
  const { port, calls } = resources(); await recoverySession(request(), port); calls.length = 0;
  const duplicate = { ...sample, assets: [sample.assets[0]!, sample.assets[0]!] };
  assert.equal(errorOf(await recoverySession({ operation: 'save', workspace: 'image', generation: 2, package: duplicate }, port)).code, 'recovery.format');
  const excessive = Array.from({ length: 20001 }, (_, index) => ({ id: String(index), mime: 'x', bytes: new Uint8Array() }));
  assert.equal(errorOf(await recoverySession({ operation: 'save', workspace: 'image', generation: 2, package: { ...sample, assets: excessive } }, port)).code, 'recovery.limit');
  assert.deepEqual(calls, []); assert.deepEqual(await recoverySession(recover, port), { ok: true, value: sample });
});

test('S14 request bounds and accessors fail without I/O; safe integer extremes are accepted', async () => {
  const { port, calls } = resources(); let getters = 0;
  for (const value of [null, {}, { ...recover, operation: 'other' }, { ...recover, workspace: 'other' },
    ...[NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'].map(generation => ({ ...recover, generation })),
    { ...recover, operation: 'save' }, { ...recover, get generation() { getters++; return 1; } },
    { ...recover, operation: 'save', get package() { getters++; return sample; } }]) {
    assert.equal(errorOf(await invalid(value, port)).code, 'recovery.request');
  }
  assert.equal(getters, 0); assert.deepEqual(calls, []);
  for (const generation of [Number.MIN_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(await recoverySession(request(generation), resources().port), { ok: true, value: sample });
  }
  assert.equal(errorOf(await recoverySession(recover, null as unknown as RecoveryPort)).code, 'recovery.request');
});

test('S14 malformed port results cannot masquerade as saved or discarded recovery', async () => {
  const payload = nativeContainer({ op: 'encode', package: sample }).parts;
  for (const value of [null, {}, { ok: true, value: undefined }, { ok: false }, { ok: true, value: { ...rawRecord(1, payload), generation: 1.5 } }]) {
    assert.equal(errorOf(await recoverySession(recover, async () => value as Awaited<ReturnType<RecoveryPort>>)).code, 'recovery.corrupt');
  }
  assert.equal(errorOf(await recoverySession(request(), async () => ({ ok: true, value: null }))).code, 'recovery.corrupt');
  assert.equal(errorOf(await recoverySession(discard, async () => ({ ok: true, value: rawRecord(1, payload) }))).code, 'recovery.corrupt');
});

test('S14 unavailable storage, port rejection and unusual codec errors become contextual results', async () => {
  const unavailable: RecoveryPort = request => recoveryStore(request, {});
  const failure = await recoverySession(recover, unavailable); assert.equal(errorOf(failure).code, 'recovery.unavailable');
  assert.match(errorOf(failure).message, /^Recovery recover \(image\):/);
  const hostile = Object.defineProperty(new Error('Hidden'), 'message', { get() { throw new Error('Accessor ran'); } });
  for (const cause of ['Offline resource', hostile]) {
    assert.equal(errorOf(await recoverySession(recover, async () => { throw cause; })).code, 'recovery.transport');
  }
  const broken = new Proxy({}, { ownKeys() { throw hostile; } });
  assert.equal(errorOf(await invalid({ ...request(), package: broken }, resources().port)).code, 'recovery.codec');
});

test('S14 an observing port retains the authoritative generation even when content is corrupt', async () => {
  const { port, ports } = resources(); await recoveryStore({ op: 'write', record: rawRecord(42, [new Uint8Array([1])]) }, ports);
  let highestObserved = 0;
  const observing: RecoveryPort = async request => {
    const result = await port(request); if (result.ok && result.value) highestObserved = Math.max(highestObserved, result.value.generation); return result;
  };
  assert.equal(errorOf(await recoverySession(recover, observing)).code, 'recovery.format'); assert.equal(highestObserved, 42);
  assert.deepEqual(await recoverySession(request(highestObserved + 1), observing), { ok: true, value: sample });
  assert.equal(highestObserved, 43);
});

test('S14 hostile error-message coercion cannot reject the adapter promise', async () => {
  const hostile = Object.defineProperty(new Error('Hidden'), 'message', { value: { toString() { throw new Error('Message coercion escaped'); } } });
  assert.equal(errorOf(await recoverySession(recover, async () => { throw hostile; })).code, 'recovery.transport');
  const broken = new Proxy({}, { ownKeys() { throw hostile; } });
  assert.equal(errorOf(await invalid({ ...request(), package: broken }, resources().port)).code, 'recovery.codec');
});

test('S14 malformed storage payload segments are corrupt responses without invoking accessors', async () => {
  let getters = 0;
  const accessor: unknown[] = [];
  Object.defineProperty(accessor, '0', { enumerable: true, get() { getters++; return new Uint8Array(); } });
  for (const payload of [new Array(1), [null], [new Uint8Array(), 'bytes'], accessor]) {
    const port: RecoveryPort = async () => ({ ok: true, value: rawRecord(1, payload as readonly Uint8Array[]) });
    assert.equal(errorOf(await recoverySession(recover, port)).code, 'recovery.corrupt');
  }
  assert.equal(getters, 0);
});
