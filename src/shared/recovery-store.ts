/**
 * PURPOSE    Persist atomic workspace recovery generations in browser storage.
 * KIND       SHELL
 * CONTRACT   IN: RecoveryRequest and injected RecoveryPorts; finite integer generation,
 *            immutable Uint8Array payload segments and a workspace/title.
 *            OUT: Promise<RecoveryOutcome>; latest fully committed generation or null.
 *            Older/equal generations cannot overwrite newer data; failed transactions
 *            retain the previous recovery; localStorage contains only journal metadata.
 *            RAISES: none; quota/corrupt/unavailable and read/write failures are results.
 * GUARANTEES No uploads, no document serialization, no partial committed replacement.
 * TUNING     DB_NAME='gsnv-paint-recovery', DB_VERSION=1, STORE='workspaces'; changes
 *            require a persistence migration. JOURNAL_PREFIX identifies metadata hints.
 * DECISIONS  D1: IndexedDB transactions are authoritative; localStorage is a hint.
 *            Alternative: journal pointer as truth; rejected because a crash between
 *            storage APIs would strand valid data. Revisit with a single atomic API.
 *            D2: Store payload segments as Blobs rather than JSON/base64. Alternative:
 *            text localStorage; rejected for synchronous quota and encoding overhead.
 *            Revisit if browser storage interoperability changes.
 * LIMITS     Container checksums and domain validation belong to consumers. Browsers can
 *            evict storage; explicit project files remain necessary for durable copies.
 * TESTBENCH  src/shared/recovery-store.test.ts -- run with: node --import tsx --test src/shared/recovery-store.test.ts
 */

type Workspace = 'cad' | 'image' | 'photo' | 'video' | 'document' | 'slides' | 'audio';
export type RecoveryRecord = { workspace: Workspace; generation: number; payload: readonly Uint8Array[]; title: string };
type RecoveryRequest = { op: 'write'; record: RecoveryRecord } | { op: 'read' | 'remove'; workspace: Workspace };
export type RecoveryPorts = { indexedDB?: IDBFactory; localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> };
type RecoveryOutcome = { ok: true; value: RecoveryRecord | null } | { ok: false; error: { code: string; message: string } };
type Stored = Omit<RecoveryRecord, 'payload'> & { payload: Blob[] };
const DB_NAME = 'gsnv-paint-recovery';
const DB_VERSION = 1;
const STORE = 'workspaces';
const JOURNAL_PREFIX = 'gsnv-paint:recovery:';
class CorruptRecovery extends Error {}

function checkRecord(value: unknown, kind: 'bytes' | 'blobs'): void {
  if (!value || typeof value !== 'object') throw new CorruptRecovery('Recovery record is missing.');
  const record = value as Record<string, unknown>;
  if (!['cad', 'image', 'photo', 'video', 'document', 'slides', 'audio'].includes(record.workspace as string) ||
      !Number.isSafeInteger(record.generation) || typeof record.title !== 'string' ||
      !Array.isArray(record.payload)) {
    throw new CorruptRecovery('Recovery metadata or payload is invalid.');
  }
  for (let index = 0; index < record.payload.length; index++) {
    const part = record.payload[index];
    if (!Object.hasOwn(record.payload, index) || !(kind === 'bytes' ? part instanceof Uint8Array : part instanceof Blob)) {
      throw new CorruptRecovery('Recovery payload must be a dense array of byte segments.');
    }
  }
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    let abandoned = false;
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'workspace' }); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      abandoned = true;
      reject(new DOMException('Close other gsnv-paint tabs to update recovery storage.', 'InvalidStateError'));
    };
    request.onsuccess = () => { if (abandoned) request.result.close(); else resolve(request.result); };
  });
}

function transaction(db: IDBDatabase, request: RecoveryRequest, workspace: Workspace,
  next: Stored | undefined, journal: RecoveryPorts['localStorage']): Promise<Stored | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, request.op === 'read' ? 'readonly' : 'readwrite');
    const store = tx.objectStore(STORE);
    let selected: Stored | null = null;
    let failure: unknown;
    const abort = (error: unknown) => { failure = error; tx.abort(); };
    tx.onerror = () => { failure ??= tx.error; };
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Recovery transaction was interrupted.'));
    tx.oncomplete = () => resolve(selected);
    try {
      if (request.op === 'remove') {
        journal!.removeItem(JOURNAL_PREFIX + workspace);
        store.delete(workspace);
        return;
      }
      const getting = store.get(workspace);
      getting.onsuccess = () => {
        try {
          const current = getting.result as Stored | undefined;
          if (current !== undefined) {
            checkRecord(current, 'blobs');
            if (current.workspace !== workspace) throw new CorruptRecovery('Recovery workspace does not match its storage key.');
          }
          selected = current ?? null;
          if (next && (!current || next.generation > current.generation)) {
            // A journal failure must occur before any replacement is committed.
            journal!.setItem(JOURNAL_PREFIX + workspace, JSON.stringify({ generation: next.generation, workspace }));
            store.put(next);
            selected = next;
          }
        } catch (error) { abort(error); }
      };
    } catch (error) { abort(error); }
  });
}

export async function recoveryStore(request: RecoveryRequest, ports: RecoveryPorts): Promise<RecoveryOutcome> {
  let db: IDBDatabase | undefined;
  try {
    if (!ports.indexedDB || (request.op !== 'read' && !ports.localStorage)) {
      throw new DOMException('Browser recovery storage is unavailable.', 'NotSupportedError');
    }
    const workspace = request.op === 'write' ? request.record.workspace : request.workspace;
    if (!['cad', 'image', 'photo', 'video', 'document', 'slides', 'audio'].includes(workspace)) throw new CorruptRecovery('Unknown recovery workspace.');
    let next: Stored | undefined;
    if (request.op === 'write') {
      checkRecord(request.record, 'bytes');
      next = { ...request.record, payload: request.record.payload.map(part =>
        new Blob([part.buffer instanceof ArrayBuffer ? part as Uint8Array<ArrayBuffer> : part.slice()])) };
    }
    db = await open(ports.indexedDB);
    const stored = await transaction(db, request, workspace, next, ports.localStorage);
    if (!stored) return { ok: true, value: null };
    if (stored === next && request.op === 'write') return { ok: true, value: request.record };
    const payload: Uint8Array[] = [];
    for (const part of stored.payload) payload.push(new Uint8Array(await part.arrayBuffer()));
    return { ok: true, value: { workspace: stored.workspace, generation: stored.generation, title: stored.title, payload } };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const code = error instanceof CorruptRecovery ? 'recovery.corrupt' : name === 'QuotaExceededError' ? 'recovery.quota'
      : ['SecurityError', 'NotSupportedError', 'InvalidStateError'].includes(name) ? 'recovery.unavailable' : `recovery.${request.op}`;
    return { ok: false, error: { code, message: `Recovery operation failed: ${error instanceof Error ? error.message : String(error)}` } };
  } finally { db?.close(); }
}
