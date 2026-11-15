import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { fontLibrary } from './font-library.ts';
const ttf = () => new Uint8Array([0, 1, 0, 0, 1, 2, 3, 4]);
function fixture(storage: IDBFactory | undefined = new IDBFactory()) {
  const faces = new Set<FontFace>(); let loads = 0, rejectFont = false;
  class FakeFace {
    constructor(public family: string, public source: ArrayBuffer) {}
    async load() { loads++; if (rejectFont) throw new Error('bad font'); return this; }
  }
  const ports = { fonts: faces as unknown as FontFaceSet, FontFace: FakeFace as unknown as typeof FontFace, crypto: webcrypto as unknown as Crypto, storage };
  return { ports, faces, get loads() { return loads; }, reject() { rejectFont = true; }, library: fontLibrary(ports) };
}
test('FONT-01/02 loads distinct local faces, deduplicates bytes and restores from device storage', async () => {
  const f = fixture(); const first = await f.library.import('My Font.TTF', ttf());
  assert.equal(first.label, 'My Font'); assert.match(first.value, /^"gsnv-font-[a-f0-9]{64}"$/);
  assert.equal((await f.library.import('Renamed.ttf', ttf())).value, first.value); assert.equal(f.loads, 1);
  const other = ttf(); other[7] = 9;
  const second = await f.library.import('My Font.ttf', other); assert.notEqual(first.value, second.value);
  assert.notEqual(first.label, second.label); assert.equal(f.faces.size, 2);
  f.library.dispose(); assert.equal(f.faces.size, 0);
  const reopened = fontLibrary(f.ports); const restored = await reopened.choices();
  assert.equal(restored.choices.length, 2); assert.equal(restored.notice, undefined);
  assert.deepEqual(new Map(restored.choices.map(c => [c.value, c.label])), new Map([first, second].map(c => [c.value, c.label])));
  assert.deepEqual(new Set(restored.choices.map(c => c.value)), new Set([first.value, second.value])); reopened.dispose();
});
test('FONT-03 rejects invalid extensions, signatures, oversized sources and parser failures', async () => {
  const f = fixture();
  for (const [name, bytes] of [['a.woff', ttf()], ['a.ttf', new Uint8Array(0)], ['a.otf', new Uint8Array([1, 2, 3, 4])], ['a.ttf', new Uint8Array(32 * 1024 * 1024 + 1)]] as const) {
    await assert.rejects(f.library.import(name, bytes), /TTF|OTF|32 MiB|valid/i);
  }
  f.reject(); await assert.rejects(f.library.import('bad.ttf', ttf()), /could not read/i);
  assert.equal(f.faces.size, 0); assert.equal((await f.library.choices()).choices.length, 0); f.library.dispose();
});
test('FONT-03 unavailable storage retains a usable session font with an explicit notice', async () => {
  const f = fixture(); const library = fontLibrary({ ...f.ports, storage: undefined });
  const choice = await library.import('Session.ttf', ttf()); assert.match(choice.notice!, /session|reimport/i);
  assert.equal(f.faces.size, 1); assert.equal((await library.choices()).choices.length, 1); library.dispose();
});
test('FONT-04 disposing during a font load prevents late registration', async () => {
  const f = fixture(); let finish!: (v: FontFace) => void, started!: () => void;
  const began = new Promise<void>(r => { started = r; });
  const library = fontLibrary({ ...f.ports, FontFace: class {
    load() { started(); return new Promise<FontFace>(r => { finish = r; }); }
  } as unknown as typeof FontFace });
  const adding = library.import('Late.ttf', ttf()); await began; library.dispose(); finish({} as FontFace);
  await assert.rejects(adding, /closed/i); assert.equal(f.faces.size, 0);
});
test('FONT-03 quota failure never makes a loaded face unusable', async () => {
  const f = fixture(); const storage = new IDBFactory();
  const original = storage.open.bind(storage);
  storage.open = ((...args: Parameters<IDBFactory['open']>) => {
    const request = original(...args);
    request.addEventListener('success', () => {
      const db = request.result, transaction = db.transaction.bind(db);
      db.transaction = ((names: string, mode: IDBTransactionMode) => { if (mode === 'readwrite') throw new DOMException('full', 'QuotaExceededError'); return transaction(names, mode); }) as typeof db.transaction;
    }); return request;
  }) as IDBFactory['open'];
  const library = fontLibrary({ ...f.ports, storage }); const result = await library.import('Full.ttf', ttf());
  assert.match(result.notice!, /session/i); assert.equal(f.faces.size, 1); library.dispose();
});
test('FONT-02 same-name font labels remain stable when storage returns a different order', async () => {
  const f = fixture(), a = ttf(), b = ttf(); b[7] = 9;
  const hash = async (v: Uint8Array) => Buffer.from(await webcrypto.subtle.digest('SHA-256', v)).toString('hex');
  const ordered = (await hash(a)) > (await hash(b)) ? [a, b] : [b, a];
  const initial = [];
  for (const bytes of ordered) initial.push(await f.library.import('Version.ttf', bytes));
  f.library.dispose(); const again = fontLibrary(f.ports), restored = await again.choices();
  assert.deepEqual(new Map(restored.choices.map(c => [c.value, c.label])), new Map(initial.map(c => [c.value, c.label]))); again.dispose();
});
test('FONT-03 a malformed stored font cannot hide a healthy saved font', async () => {
  const f = fixture(); const choice = await f.library.import('Good.ttf', ttf()); f.library.dispose();
  await new Promise<void>((resolve, reject) => {
    const open = f.ports.storage!.open('gsnv-paint-fonts', 1);
    open.onsuccess = () => { const db = open.result, tx = db.transaction('fonts', 'readwrite'); tx.objectStore('fonts').put({ id: 'broken', name: 'Broken.ttf', bytes: new Uint8Array([1]) }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  });
  const again = fontLibrary(f.ports), result = await again.choices();
  assert.deepEqual(result.choices, [choice]); assert.match(result.notice!, /Some saved fonts/); again.dispose();
});
