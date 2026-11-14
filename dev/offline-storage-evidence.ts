// Read-only diagnostics for synthetic persistent-profile acceptance tests.
import { createHash } from 'node:crypto';
import { nativeContainer } from '../src/shared/native-container.ts';

export async function documentStorage(surface: { evaluate<R>(fn: () => Promise<R>): Promise<R> }) {
  const records = await surface.evaluate(async () => {
    const known = (await indexedDB.databases()).map(database => database.name);
    const result: { database: string; metadata: Record<string, unknown>; parts: number[][] }[] = [];
    for (const [name, store] of [['gsnv-paint-recovery', 'workspaces'], ['gsnv-paint-recent', 'projects']] as const) {
      if (!known.includes(name)) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => { request.transaction!.abort(); reject(new Error('Evidence must not create a database.')); };
      });
      let values: Record<string, unknown>[];
      try {
        values = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const transaction = database.transaction(store, 'readonly'), request = transaction.objectStore(store).getAll();
          transaction.oncomplete = () => resolve(request.result as Record<string, unknown>[]);
          transaction.onabort = transaction.onerror = () => reject(transaction.error);
        });
      } finally { database.close(); }
      for (const value of values.filter(value => value.workspace === 'document')) {
        const { payload, parts, ...metadata } = value;
        const bytes = await Promise.all(((payload ?? parts) as (Blob | Uint8Array)[]).map(async part => [...(part instanceof Blob ? new Uint8Array(await part.arrayBuffer()) : part)]));
        result.push({ database: name, metadata, parts: bytes });
      }
    }
    return result;
  });
  return records.map(record => {
    const parts = record.parts.map(part => Uint8Array.from(part));
    return { database: record.database, metadata: record.metadata, bytes: parts.reduce((total, part) => total + part.length, 0),
      sha256: createHash('sha256').update(Buffer.concat(parts)).digest('hex'), project: nativeContainer({ op: 'decode', parts }).project };
  });
}
