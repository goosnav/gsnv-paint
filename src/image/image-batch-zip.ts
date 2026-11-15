/**
 * PURPOSE    Collect bounded batch outputs into a stored ZIP.
 * KIND       SHELL
 * CONTRACT   createBatchZip({maxBytes?,now?}) returns serial add(name,Blob), idempotent
 *            finish():Blob, cancel(), and encoded bytes. Names are UTF-8 leaf names;
 *            every entry stores uncompressed bytes with CRC32 and ZIP32 records.
 *            RAISES: RangeError for names/limits; Error for closed/concurrent operations.
 * GUARANTEES No download, filesystem write or compression dependency. Failed adds leave
 *            prior entries intact; cancellation discards retained buffers and late reads.
 * TUNING     Encoded ZIP cap128MiB including headers; <=65535 entries, no ZIP64.
 * DECISIONS  D1: Store rather than compress already-compressed image outputs. Alternative:
 *            add a ZIP dependency; unnecessary for this bounded fallback. Revisit if:
 *            archive size/compression becomes a user requirement.
 * LIMITS     ZIP fallback retains outputs in memory until finish/cancel. Blob reads and
 *            final Blob allocation can temporarily coexist; cap is encoded size, not an
 *            enforceable browser heap quota. Caller owns download and sequential processing.
 * TESTBENCH  node --import tsx --test src/image/image-batch-zip.test.ts
 * DEMO       node --import tsx src/image/image-batch-zip.demo.ts
 */
import { validateBatchName } from './image-batch-paths.ts';

export const MAX_BATCH_ZIP_BYTES = 128 * 1024 * 1024;
const table = Uint32Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); return crc >>> 0; });
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255]! ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
type Entry = { name: Uint8Array<ArrayBuffer>; bytes: Uint8Array<ArrayBuffer>; crc: number; offset: number };
function header(size: number): { bytes: Uint8Array<ArrayBuffer>; view: DataView } { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }

export function createBatchZip({ maxBytes = MAX_BATCH_ZIP_BYTES, now = Date.now() }: { maxBytes?: number; now?: number } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 22 || maxBytes > MAX_BATCH_ZIP_BYTES || !Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new RangeError('ZIP limit must be 22 bytes–128 MiB and timestamp must be valid.');
  const date = new Date(Math.min(Date.UTC(2107, 11, 31, 23, 59, 58), Math.max(Date.UTC(1980, 0, 1), now)));
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1), day = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  const entries: Entry[] = [], names = new Set<string>(); let total = 22, localSize = 0, reading = false, cancelled = false, result: Blob | undefined;
  const writable = () => { if (cancelled) throw new Error('Batch ZIP was cancelled.'); if (result) throw new Error('Batch ZIP is already finished.'); if (reading) throw new Error('A ZIP write is pending; process outputs sequentially.'); };
  return {
    get bytes() { return total; },
    async add(name: string, blob: Blob): Promise<void> {
      writable(); validateBatchName(name); const key = name.normalize('NFC').toLowerCase();
      if (names.has(key)) throw new Error(`Batch ZIP already contains ${name}.`);
      if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 0 || typeof blob.arrayBuffer !== 'function') throw new TypeError('Batch ZIP needs a Blob.');
      const encoded = new TextEncoder().encode(name), addition = 76 + encoded.length * 2 + blob.size;
      if (entries.length >= 65535 || blob.size > 0xffffffff || total + addition > maxBytes) throw new RangeError(`Batch ZIP exceeds its ${maxBytes.toLocaleString()} byte limit. Process fewer files or use a writable folder.`);
      reading = true;
      try {
        const buffer = await blob.arrayBuffer(); if (cancelled) throw new Error('Batch ZIP was cancelled.');
        if (buffer.byteLength !== blob.size) throw new Error('Output size changed while preparing the ZIP.');
        const bytes = new Uint8Array(buffer); entries.push({ name: encoded, bytes, crc: crc32(bytes), offset: localSize });
        names.add(key); localSize += 30 + encoded.length + bytes.length; total += addition;
      } finally { reading = false; }
    },
    finish(): Blob {
      if (cancelled) throw new Error('Batch ZIP was cancelled.'); if (reading) throw new Error('A ZIP write is pending.'); if (result) return result;
      const locals: BlobPart[] = [], central: BlobPart[] = [];
      for (const entry of entries) {
        const local = header(30 + entry.name.length), l = local.view;
        l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(10, time, true); l.setUint16(12, day, true);
        l.setUint32(14, entry.crc, true); l.setUint32(18, entry.bytes.length, true); l.setUint32(22, entry.bytes.length, true); l.setUint16(26, entry.name.length, true); local.bytes.set(entry.name, 30);
        const directory = header(46 + entry.name.length), c = directory.view;
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(12, time, true); c.setUint16(14, day, true);
        c.setUint32(16, entry.crc, true); c.setUint32(20, entry.bytes.length, true); c.setUint32(24, entry.bytes.length, true); c.setUint16(28, entry.name.length, true); c.setUint32(42, entry.offset, true); directory.bytes.set(entry.name, 46);
        locals.push(local.bytes, entry.bytes); central.push(directory.bytes);
      }
      const end = header(22), e = end.view; e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, total - localSize - 22, true); e.setUint32(16, localSize, true);
      result = new Blob([...locals, ...central, end.bytes], { type: 'application/zip' }); entries.length = 0; names.clear(); return result;
    },
    cancel(): void { cancelled = true; entries.length = 0; names.clear(); result = undefined; total = 0; localSize = 0; },
  };
}
