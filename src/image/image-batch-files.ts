/**
 * PURPOSE    Isolate user-selected batch files from output destinations.
 * KIND       SHELL
 * CONTRACT   pickBatchInputs({source,ports}) snapshots direct supported inputs; returns
 *            null on picker cancellation. createBatchDestination({selection,mode,now,
 *            runId,ports}) returns serial write, finish and cancel or null on cancellation.
 *            RAISES: readable errors for changed sources, permission, unsafe names or I/O.
 * GUARANTEES No picker before caller invokes; no execution, recursive discovery or input
 *            write. Only completed snapshots may create an output child. ZIP is explicit.
 * TUNING     At most10000 inputs;100 child-name attempts; ZIP cap128MiB including metadata.
 * DECISIONS  D1: Inject browser handles. Alternative: eagerly buffer every file; rejected
 *            for memory safety. Revisit if: streaming remote input becomes approved scope.
 * LIMITS     Browser filesystem API has no atomic exclusive create. A unique run ID plus
 *            collision checks protects normal runs; external concurrent edits may race.
 *            Cancellation retains completed directory files; pending writes are aborted.
 * TESTBENCH  node --import tsx --test src/image/image-batch-files.test.ts
 * DEMO       node --import tsx src/image/image-batch-files.demo.ts
 */
import { batchFolderName, validateBatchName } from './image-batch-paths.ts';
import { createBatchZip } from './image-batch-zip.ts';

export type BatchWritable = { write(blob: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
export type BatchFileHandle = { kind: 'file'; name: string; getFile(): Promise<File>; createWritable?(): Promise<BatchWritable> };
export type BatchDirectory = {
  kind: 'directory'; name: string;
  entries(): AsyncIterableIterator<[string, BatchDirectory | BatchFileHandle]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<BatchDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BatchFileHandle>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  removeEntry?(name: string): Promise<void>;
};
export type BatchFilePorts = {
  document: Document;
  showDirectoryPicker?: (options: { mode: 'read' | 'readwrite' }) => Promise<BatchDirectory>;
  showOpenFilePicker?: (options: { multiple: true; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<readonly BatchFileHandle[]>;
};
export type BatchInput = Readonly<{ name: string; size: number; lastModified: number; read(): Promise<File> }>;
export type BatchSelection = Readonly<{ kind: 'files' | 'folder'; inputs: readonly BatchInput[]; ignored: number; sourceDirectory?: BatchDirectory }>;
export type BatchResult = { kind: 'directory'; name: string; written: number } | { kind: 'zip'; name: string; written: number; blob: Blob };
export type BatchDestination = { kind: 'directory' | 'zip'; name: string; write(name: string, blob: Blob): Promise<void>; finish(): Promise<BatchResult>; cancel(): Promise<void> };
const snapshots = new WeakSet<BatchSelection>();
const extensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.gsnv-image'];
const supported = (name: string) => /\.(png|jpe?g|webp|gif|bmp|gsnv-image)$/i.test(name);
const errorName = (error: unknown) => error && typeof error === 'object' && 'name' in error ? error.name : '';

export async function pickBatchInputs({ source, ports }: { source: 'files' | 'folder'; ports: BatchFilePorts }): Promise<BatchSelection | null> {
  if (source !== 'files' && source !== 'folder') throw new TypeError('Choose files or a folder for the batch.');
  const inputs: BatchInput[] = []; let ignored = 0, sourceDirectory: BatchDirectory | undefined;
  const add = async (read: () => Promise<File>, name: string) => {
    if (!supported(name)) { ignored++; return; }
    if (inputs.length >= 10000) throw new RangeError('Batch is limited to 10,000 images. Choose a smaller folder.');
    const file = await read(), size = file.size, lastModified = file.lastModified;
    inputs.push(Object.freeze({ name, size, lastModified, read: async () => {
      const current = await read();
      if (current.name !== file.name || current.size !== size || current.lastModified !== lastModified) throw new Error(`${name} changed after selection. Select the inputs again.`);
      return current;
    } }));
  };
  try {
    if (source === 'folder' && ports.showDirectoryPicker) {
      sourceDirectory = await ports.showDirectoryPicker({ mode: 'read' });
      for await (const [name, handle] of sourceDirectory.entries()) {
        if (handle.kind === 'file') await add(() => handle.getFile(), name); else ignored++;
      }
    } else if (source === 'files' && ports.showOpenFilePicker) {
      const handles = await ports.showOpenFilePicker({ multiple: true, types: [{ description: 'Images and Paint projects', accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'], 'image/gif': ['.gif'], 'image/bmp': ['.bmp'], 'application/json': ['.gsnv-image'] } }] });
      if (!handles.length) return null;
      for (const handle of handles) await add(() => handle.getFile(), handle.name);
    } else {
      const files = await new Promise<File[] | null>((resolve, reject) => {
        const input = ports.document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = extensions.join(','); input.hidden = true;
        if (source === 'folder') input.setAttribute('webkitdirectory', '');
        const done = (files: File[] | null) => { input.remove(); resolve(files); };
        input.addEventListener('change', () => done(input.files?.length ? Array.from(input.files) : null), { once: true });
        input.addEventListener('cancel', () => done(null), { once: true }); ports.document.body.append(input);
        try { input.click(); } catch (error) { input.remove(); reject(error); }
      });
      if (!files) return null;
      for (const file of files) {
        const path = file.webkitRelativePath?.split('/');
        if (source === 'folder' && (!path || path.length !== 2 || path.some(part => !part || part === '.' || part === '..'))) { ignored++; continue; }
        await add(async () => file, file.name);
      }
    }
  } catch (error) { if (errorName(error) === 'AbortError') return null; throw error; }
  if (!inputs.length) throw new Error('No supported images were found. Choose PNG, JPEG, WebP, GIF, BMP or Paint project files directly inside the folder.');
  inputs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name));
  const selection: BatchSelection = Object.freeze({ kind: source, inputs: Object.freeze(inputs), ignored, ...(sourceDirectory ? { sourceDirectory } : {}) }); snapshots.add(selection); return selection;
}

export async function createBatchDestination({ selection, mode, now, runId, ports }: { selection: BatchSelection; mode: 'source' | 'choose' | 'zip'; now: number; runId: string; ports: BatchFilePorts }): Promise<BatchDestination | null> {
  if (!snapshots.has(selection)) throw new Error('Choose a completed input snapshot before creating a batch destination.');
  if (!['source', 'choose', 'zip'].includes(mode)) throw new Error('Choose a batch destination folder or ZIP.');
  let name = batchFolderName({ now, runId }), root: BatchDirectory | undefined;
  if (mode === 'source') {
    if (selection.kind !== 'folder') throw new Error('Choose a separate destination folder for selected files.');
    root = selection.sourceDirectory;
  } else if (mode === 'choose' && ports.showDirectoryPicker) {
    try { root = await ports.showDirectoryPicker({ mode: 'readwrite' }); } catch (error) { if (errorName(error) === 'AbortError') return null; throw error; }
  }
  if (!root) {
    const zip = createBatchZip({ now }); let written = 0; name += '.zip';
    return { kind: 'zip', name, write: async (fileName, blob) => { await zip.add(fileName, blob); written++; }, finish: async () => ({ kind: 'zip', name, written, blob: zip.finish() }), cancel: async () => zip.cancel() };
  }
  let permission = await root.queryPermission?.({ mode: 'readwrite' });
  if (permission !== 'granted' && root.requestPermission) permission = await root.requestPermission({ mode: 'readwrite' });
  if (permission && permission !== 'granted') throw new Error('Folder write permission was not granted. Choose a writable destination or ZIP.');
  let directory: BatchDirectory | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    name = batchFolderName({ now, runId, attempt });
    try { await root.getDirectoryHandle(name); continue; } catch (error) { if (errorName(error) === 'TypeMismatchError') continue; if (errorName(error) !== 'NotFoundError') throw error; }
    const child = await root.getDirectoryHandle(name, { create: true }); let occupied = false;
    for await (const _entry of child.entries()) { occupied = true; break; }
    if (!occupied) { directory = child; break; }
  }
  if (!directory) throw new Error('Could not create a unique batch folder after 100 attempts. Start a new batch.');
  const output = directory, names = new Set<string>(); let written = 0, state: 'open' | 'finished' | 'cancelled' | 'failed' = 'open', pending: Promise<void> | undefined, active: BatchWritable | undefined;
  const writable = () => { if (state !== 'open') throw new Error(`Batch destination is ${state}.`); if (pending) throw new Error('A batch write is pending; process files sequentially.'); };
  return {
    kind: 'directory', name,
    async write(fileName, blob) {
      writable(); validateBatchName(fileName); const key = fileName.normalize('NFC').toLowerCase();
      if (names.has(key)) throw new Error(`${fileName} already exists in this batch.`);
      let created = false, committed = false;
      const operation = async () => {
        try {
          try { await output.getFileHandle(fileName); throw new Error(`${fileName} already exists in the output folder.`); } catch (error) { if (errorName(error) !== 'NotFoundError') throw error; }
          if (state !== 'open') throw new Error('Batch destination was cancelled.');
          const handle = await output.getFileHandle(fileName, { create: true }); created = true;
          if (!handle.createWritable) throw new Error('This browser cannot write to the selected folder. Choose ZIP output.');
          active = await handle.createWritable();
          if (state !== 'open') throw new Error('Batch destination was cancelled.');
          await active.write(blob); if (state !== 'open') throw new Error('Batch destination was cancelled.');
          await active.close(); committed = true; written++; names.add(key);
        } catch (error) {
          if (created && !committed) { try { await active?.abort(); } catch { /* Already closed/aborted. */ } try { await output.removeEntry?.(fileName); } catch { /* Retain visible incomplete file if OS prevents cleanup. */ } }
          if (created && state === 'open') state = 'failed'; throw error;
        } finally { active = undefined; }
      };
      pending = operation(); try { await pending; } finally { pending = undefined; }
    },
    async finish() { if (state === 'finished') return { kind: 'directory', name, written }; writable(); state = 'finished'; return { kind: 'directory', name, written }; },
    async cancel() { state = 'cancelled'; try { await active?.abort(); } catch { /* Write may have completed. */ } try { await pending; } catch { /* Cancellation is represented by state. */ } },
  };
}
