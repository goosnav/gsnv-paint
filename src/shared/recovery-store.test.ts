import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { recoveryStore, type RecoveryRecord, type RecoveryPorts } from './recovery-store.ts';

function resources() {
  const journal = new Map<string, string>();
  const ports: RecoveryPorts = { indexedDB: new IDBFactory(), localStorage: {
    getItem: key => journal.get(key) ?? null, setItem: (key, value) => { journal.set(key, value); }, removeItem: key => { journal.delete(key); },
  } };
  return { ports, journal };
}
const record = (generation = 1, workspace: RecoveryRecord['workspace'] = 'cad'): RecoveryRecord => ({
  workspace, generation, title: 'Plate', payload: [new Uint8Array([0, 127, 255]), new Uint8Array([10, 20])],
});
async function corrupt(factory: IDBFactory, value: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const opening = factory.open('gsnv-paint-recovery', 1);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('workspaces', 'readwrite');
    transaction.objectStore('workspaces').put(value);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

test('S08 golden write/read roundtrip stores only journal metadata in localStorage', async () => {
  const { ports, journal } = resources();
  const expected = { ok: true, value: record() };
  assert.deepEqual(await recoveryStore({ op: 'write', record: record() }, ports), expected);
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), expected);
  assert.equal(journal.size, 1);
  const metadata = JSON.parse([...journal.values()][0]!);
  assert.deepEqual(metadata, { generation: 1, workspace: 'cad' });
  assert.ok([...journal.values()][0]!.length < 100);
});

test('S08 missing, empty payload, independent workspaces, and remove are explicit', async () => {
  const { ports, journal } = resources();
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), { ok: true, value: null });
  for (const workspace of ['cad', 'image', 'video'] as const) {
    assert.deepEqual(await recoveryStore({ op: 'write', record: { ...record(1, workspace), payload: [] } }, ports), { ok: true, value: { ...record(1, workspace), payload: [] } });
  }
  assert.deepEqual(await recoveryStore({ op: 'remove', workspace: 'image' }, ports), { ok: true, value: null });
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'image' }, ports), { ok: true, value: null });
  assert.equal(journal.size, 2);
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), { ok: true, value: { ...record(), payload: [] } });
});

test('S08 older/equal generations cannot replace the latest complete record', async () => {
  const { ports } = resources();
  await recoveryStore({ op: 'write', record: record(10) }, ports);
  for (const generation of [9, 10, -1]) {
    assert.deepEqual(await recoveryStore({ op: 'write', record: { ...record(generation), title: 'Old' } }, ports), { ok: true, value: record(10) });
  }
});

test('S08 overlapping writes serialize and keep the highest complete generation', async () => {
  const { ports } = resources();
  const results = await Promise.all([3, 1, 5, 2, 4].map(generation => recoveryStore({ op: 'write', record: record(generation) }, ports)));
  assert.ok(results.every(result => result.ok));
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), { ok: true, value: record(5) });
});

test('S08 journal quota failure leaves previous recovery intact', async () => {
  const { ports } = resources();
  await recoveryStore({ op: 'write', record: record() }, ports);
  ports.localStorage = { getItem: () => null, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); }, removeItem() {} };
  const result = await recoveryStore({ op: 'write', record: record(2) }, ports);
  assert.ok(!result.ok);
  assert.equal(result.error.code, 'recovery.quota');
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), { ok: true, value: record() });
});

test('S08 interrupted IndexedDB write retains old generation despite advanced journal hint', async () => {
  const { ports, journal } = resources();
  await recoveryStore({ op: 'write', record: record() }, ports);
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<typeof originalPut>) {
    const request = originalPut.apply(this, args);
    this.transaction.abort();
    return request;
  };
  let result: Awaited<ReturnType<typeof recoveryStore>>;
  try { result = await recoveryStore({ op: 'write', record: record(2) }, ports); }
  finally { IDBObjectStore.prototype.put = originalPut; }
  assert.ok(!result.ok);
  assert.equal(result.error.code, 'recovery.write');
  assert.equal(JSON.parse([...journal.values()][0]!).generation, 2);
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), { ok: true, value: record() });
});

test('S08 stale/corrupt journal never hides an intact committed record', async () => {
  const { ports, journal } = resources();
  await recoveryStore({ op: 'write', record: record(7) }, ports);
  for (const key of journal.keys()) journal.set(key, 'broken JSON');
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), { ok: true, value: record(7) });
});

test('S08 corrupt database schema is a diagnostic, not an empty document', async () => {
  const { ports } = resources();
  await recoveryStore({ op: 'write', record: record() }, ports);
  await corrupt(ports.indexedDB!, { workspace: 'cad', generation: 1, title: 'Broken', payload: ['not a blob'] });
  const result = await recoveryStore({ op: 'read', workspace: 'cad' }, ports);
  assert.ok(!result.ok);
  assert.equal(result.error.code, 'recovery.corrupt');
});

test('S08 missing/denied storage reports unavailable without throwing', async () => {
  const missing = await recoveryStore({ op: 'read', workspace: 'cad' }, {});
  assert.ok(!missing.ok);
  assert.equal(missing.error.code, 'recovery.unavailable');
  const { ports } = resources();
  ports.indexedDB = { open() { throw new DOMException('Disabled', 'SecurityError'); } } as unknown as IDBFactory;
  const denied = await recoveryStore({ op: 'write', record: record() }, ports);
  assert.ok(!denied.ok);
  assert.equal(denied.error.code, 'recovery.unavailable');
});

test('S08 malformed record metadata/payload is rejected before persistence', async () => {
  for (const change of [{ workspace: 'other' }, { generation: 1.5 }, { generation: Infinity }, { title: null }, { payload: [5] }]) {
    const { ports } = resources();
    const result = await recoveryStore({ op: 'write', record: { ...record(), ...change } as RecoveryRecord }, ports);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'recovery.corrupt');
    assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), { ok: true, value: null });
  }
});

test('S08 rejects sparse input and stored payloads without replacing intact recovery', async () => {
  const { ports } = resources();
  await recoveryStore({ op: 'write', record: record() }, ports);
  const result = await recoveryStore({ op: 'write', record: { ...record(2), payload: new Array<Uint8Array>(1) } }, ports);
  assert.ok(!result.ok);
  assert.equal(result.error.code, 'recovery.corrupt');
  assert.deepEqual(await recoveryStore({ op: 'read', workspace: 'cad' }, ports), { ok: true, value: record() });
  await corrupt(ports.indexedDB!, { workspace: 'cad', generation: 3, title: 'Broken', payload: new Array<Blob>(1) });
  const recovered = await recoveryStore({ op: 'read', workspace: 'cad' }, ports);
  assert.ok(!recovered.ok);
  assert.equal(recovered.error.code, 'recovery.corrupt');
});
