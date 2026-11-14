/**
 * PURPOSE    Transfer explicitly selected files through browser storage APIs.
 * KIND       SHELL
 * CONTRACT   IN: FileRequest and FilePorts; caller supplies user activation and immutable
 *            byte parts. Native pickers are primary; input/download are fallback.
 *            Pick returns File/handle without payload reads; open accepts a selected File
 *            without a second picker or an associated write handle.
 *            Optional open maxBytes rejects File.size before reading any payload chunks.
 *            OUT: Promise<FileOutcome>; successful bytes are segmented Uint8Array parts,
 *            native writes resolve only after close; cancellation is explicit.
 *            RAISES: none; picker/read/write/download failures return stable file codes.
 * GUARANTEES No uploads or silent fallback after a native permission/write failure;
 *            unsuccessful native writes are aborted; object URLs and inputs are released.
 * TUNING     READ_CHUNK_BYTES=8 MiB limits individual read allocation; REVOKE_DELAY_MS=1000
 *            lets a browser begin consuming a download before its object URL is released.
 * DECISIONS  D1: Preserve segments instead of concatenating large project payloads.
 *            Alternative: one ArrayBuffer; rejected because multilayer projects may be
 *            large. Revisit if measurements justify a different bounded chunk size.
 *            D2: Treat download completion as handoff, not verified disk persistence.
 *            Alternative: claim disk save; rejected because browsers expose no download
 *            completion API to the page. Revisit if such an API becomes available.
 * LIMITS     Fallback downloads cannot confirm disk persistence. Native picker UI and OS
 *            permissions require separate smoke tests; codecs validate selected bytes.
 * TESTBENCH  src/shared/file-access.test.ts -- run with: node --import tsx --test src/shared/file-access.test.ts
 */

export type FileRequest =
  | { op: 'pick'; accept: Record<string, string[]> }
  | { op: 'open'; accept: Record<string, string[]>; maxBytes?: number; file?: File | undefined }
  | { op: 'save'; name: string; mime: string; bytes: Uint8Array | readonly Uint8Array[]; handle?: FileSystemFileHandle };
type PickerType = { accept: Record<string, string[]> };
export type FilePorts = {
  document: Pick<Document, 'createElement' | 'body'>;
  URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  showOpenFilePicker?: (options: { multiple: false; types: PickerType[] }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: { suggestedName: string; types: PickerType[] }) => Promise<FileSystemFileHandle>;
};
type FileResult = { name: string; bytes: readonly Uint8Array[]; handle?: FileSystemFileHandle };
type PickOutcome = { ok: true; value: { file: File; handle?: FileSystemFileHandle } } | { ok: false; error: { code: string; message: string } } | { cancelled: true };
type FileOutcome = { ok: true; value: FileResult } | { ok: false; error: { code: string; message: string } } | { cancelled: true };
const READ_CHUNK_BYTES = 8 * 1024 * 1024;
const REVOKE_DELAY_MS = 1000;
// The native API rejects suffixes longer than 16 code points; HTML input does not.
function pickerTypes(accept: Record<string, string[]>): PickerType[] {
  return Object.keys(accept).length && Object.values(accept).flat().every(extension => [...extension].length <= 16) ? [{ accept }] : [];
}

function inputFile(accept: Record<string, string[]>, ports: FilePorts): Promise<File | null> {
  return new Promise((resolve, reject) => {
    const input = ports.document.createElement('input');
    input.type = 'file';
    input.accept = Object.entries(accept).flatMap(([mime, extensions]) => extensions.length ? extensions : [mime]).join(',');
    input.hidden = true;
    const cleanup = () => { input.removeEventListener('change', change); input.removeEventListener('cancel', cancel); input.remove(); };
    const change = () => { const file = input.files?.[0] ?? null; cleanup(); resolve(file); };
    const cancel = () => { cleanup(); resolve(null); };
    input.addEventListener('change', change);
    input.addEventListener('cancel', cancel);
    try { ports.document.body.append(input); input.click(); }
    catch (error) { cleanup(); reject(error); }
  });
}

async function read(file: File, handle?: FileSystemFileHandle, maxBytes?: number): Promise<FileResult> {
  if (maxBytes !== undefined && file.size > maxBytes) throw new RangeError(`The selected file exceeds the limit of ${maxBytes} bytes.`);
  const bytes: Uint8Array[] = [];
  for (let offset = 0; offset < file.size; offset += READ_CHUNK_BYTES) {
    bytes.push(new Uint8Array(await file.slice(offset, Math.min(file.size, offset + READ_CHUNK_BYTES)).arrayBuffer()));
  }
  return { name: file.name, bytes, ...(handle ? { handle } : {}) };
}

function transferable(part: Uint8Array): Uint8Array<ArrayBuffer> {
  return part.buffer instanceof ArrayBuffer ? part as Uint8Array<ArrayBuffer> : part.slice();
}

function download(name: string, mime: string, bytes: readonly Uint8Array[], ports: FilePorts): void {
  const anchor = ports.document.createElement('a');
  const url = ports.URL.createObjectURL(new Blob(bytes.map(transferable), { type: mime }));
  try {
    anchor.href = url;
    anchor.download = name;
    ports.document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    ports.setTimeout(() => ports.URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

export function fileAccess(request: Extract<FileRequest, { op: 'pick' }>, ports: FilePorts): Promise<PickOutcome>;
export function fileAccess(request: Exclude<FileRequest, { op: 'pick' }>, ports: FilePorts): Promise<FileOutcome>;
export async function fileAccess(request: FileRequest, ports: FilePorts): Promise<FileOutcome | PickOutcome> {
  let stage = request.op === 'save' ? 'file.save' : 'file.open';
  let writable: FileSystemWritableFileStream | undefined;
  try {
    if (request.op !== 'save') {
      const maxBytes = request.op === 'open' ? request.maxBytes : undefined;
      if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) return { ok: false, error: { code: 'file.request', message: 'File read limits must be a nonnegative whole number of bytes.' } };
      let file = request.op === 'open' ? request.file : undefined;
      let handle: FileSystemFileHandle | undefined;
      if (!file) {
        if (ports.showOpenFilePicker) {
          [handle] = await ports.showOpenFilePicker({ multiple: false, types: pickerTypes(request.accept) });
          if (!handle) return { cancelled: true };
          stage = 'file.read'; file = await handle.getFile();
        } else file = await inputFile(request.accept, ports) ?? undefined;
      }
      if (!file) return { cancelled: true };
      if (request.op === 'pick') return { ok: true, value: { file, ...(handle ? { handle } : {}) } };
      stage = 'file.read';
      return { ok: true, value: await read(file, handle, maxBytes) };
    }
    const bytes = request.bytes instanceof Uint8Array ? [request.bytes] : request.bytes;
    let handle = request.handle;
    if (!handle && ports.showSaveFilePicker) {
      const extension = /\.[^.]+$/.exec(request.name)?.[0];
      handle = await ports.showSaveFilePicker({ suggestedName: request.name,
        types: extension ? pickerTypes({ [request.mime]: [extension] }) : [] });
    }
    if (handle) {
      stage = 'file.write';
      writable = await handle.createWritable();
      for (const part of bytes) await writable.write(transferable(part));
      await writable.close();
      writable = undefined;
      return { ok: true, value: { name: handle.name, bytes, handle } };
    }
    stage = 'file.download';
    download(request.name, request.mime, bytes, ports);
    return { ok: true, value: { name: request.name, bytes } };
  } catch (error) {
    if (writable) { try { await writable.abort(); } catch { /* The original write error is the actionable failure. */ } }
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError' && (stage === 'file.open' || stage === 'file.save')) return { cancelled: true };
    const reason = error instanceof Error ? error.message : String(error);
    const code = ['NotAllowedError', 'SecurityError'].includes(name) ? 'file.permission' : stage;
    return { ok: false, error: { code, message: `File operation failed: ${reason}` } };
  }
}
