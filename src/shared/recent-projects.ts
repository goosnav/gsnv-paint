/**
 * PURPOSE    Keep edited projects in browser storage so they can be reopened until explicitly deleted.
 * KIND       SHELL
 * CONTRACT   IN: an IndexedDB factory. OUT: RecentPort {list,save,load,remove,clear}. save stores the
 *            native container parts of one document (keyed by document id) with its title, workspace and
 *            time; list returns all metadata newest first. The caller may bound the recent menu,
 *            but records are retained until remove/clear, including projects never exported to a file.
 *            RAISES: rejects with an Error when storage is unavailable or a record is malformed.
 * GUARANTEES Each save is one transaction; a failed save leaves the previous record intact.
 * TUNING     DB name/version below; menu limits must never delete stored records.
 * DECISIONS  D1: IndexedDB rather than localStorage: projects are binary and can be megabytes.
 * LIMITS     Browser storage can be evicted; File > Save to file is the durable copy.
 * TESTBENCH  src/shared/recent-projects.test.ts -- run with: node --import tsx --test src/shared/recent-projects.test.ts
 */
export type RecentEntry = { id: string; workspace: 'cad' | 'image' | 'photo' | 'video' | 'document' | 'slides' | 'audio' | 'spreadsheet' | 'code'; title: string; updated: number };
export type RecentPort = {
  list(): Promise<RecentEntry[]>;
  save(entry: RecentEntry & { parts: readonly Uint8Array[] }): Promise<void>;
  load(id: string): Promise<Uint8Array[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
};
const DB = 'gsnv-paint-recent', STORE = 'projects';

export function recentProjects(factory: IDBFactory | undefined): RecentPort {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (!factory) { reject(new Error('Browser storage is unavailable.')); return; }
    const request = factory.open(DB, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser storage could not be opened.'));
  });
  const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode), request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve((request ? request.result : undefined) as T);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Browser storage failed.'));
    });
  };
  const meta = (r: RecentEntry): RecentEntry => ({ id: r.id, workspace: r.workspace, title: r.title, updated: r.updated });
  return {
    async list() {
      const db = await open();
      return new Promise<RecentEntry[]>((resolve, reject) => {
        const entries: RecentEntry[] = [], tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).openCursor();
        // Discard each payload before advancing instead of keeping every project's bytes in memory.
        request.onsuccess = () => { const cursor = request.result; if (cursor) { entries.push(meta(cursor.value as RecentEntry)); cursor.continue(); } };
        tx.oncomplete = () => resolve(entries.sort((a, b) => b.updated - a.updated));
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Stored projects could not be listed.'));
      });
    },
    async save(entry) {
      if (!entry.id || !['cad', 'image', 'photo', 'video', 'document', 'slides', 'audio', 'spreadsheet', 'code'].includes(entry.workspace) || !Number.isFinite(entry.updated) || !entry.parts.length) throw new Error('Invalid recent project.');
      await run('readwrite', store => { store.put({ ...meta(entry), parts: entry.parts.map(p => p.slice()) }); });
    },
    async load(id) {
      const record = await run<(RecentEntry & { parts: Uint8Array[] }) | undefined>('readonly', store => store.get(id));
      if (!record || !Array.isArray(record.parts)) throw new Error('That recent project is no longer stored in this browser.');
      return record.parts;
    },
    async remove(id) { await run('readwrite', store => { store.delete(id); }); },
    async clear() { await run('readwrite', store => { store.clear(); }); },
  };
}
