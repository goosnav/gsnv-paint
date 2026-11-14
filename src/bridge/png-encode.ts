/**
 * PURPOSE    Encode transfer pixels as a lossless straight-alpha PNG (D05 helper).
 * KIND       SHELL
 * CONTRACT   IN: validated RGBA8 sRGB pixels, optional AbortSignal. OUT: owned PNG
 *            bytes with RGBA8 IHDR, sRGB intent, unfiltered zlib scanlines and CRCs.
 *            RAISES: BridgeEncodeError for invalid size/unavailable compression;
 *            AbortError for cancellation. No Canvas premultiplication round trip.
 * GUARANTEES No pixel mutation, network or files. Compression input is row bounded.
 * TUNING     16,777,216 pixels, one filter byte per row; compressed output bounded
 *            by raw bytes plus conservative deflate framing overhead.
 * DECISIONS  D1: Native CompressionStream avoids a new dependency. Alternative:
 *            Canvas encoding rounds low-alpha RGB. Revisit if: a supported browser
 *            lacks CompressionStream; do not silently change representation.
 * LIMITS     PNG only, no metadata/profile preservation beyond explicit sRGB.
 * TESTBENCH  src/bridge/png-encode.test.ts; bridge production browser workflow
 */
import type { TransferRaster } from './transfer-contract.ts';
const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'BridgeEncodeError' }); };
const table = Uint32Array.from({ length: 256 }, (_, value) => { let n = value; for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function chunk(name: string, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length + 12), view = new DataView(out.buffer); view.setUint32(0, bytes.length);
  out.set(new TextEncoder().encode(name), 4); out.set(bytes, 8); let crc = 0xffffffff;
  for (let i = 4; i < out.length - 4; i++) crc = table[(crc ^ out[i]!) & 255]! ^ (crc >>> 8);
  view.setUint32(out.length - 4, (crc ^ 0xffffffff) >>> 0); return out;
}
export async function encodePng(pixels: TransferRaster['pixels'], signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted(); const { width, height, rgba } = pixels;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 16_777_216 || rgba.length !== width * height * 4 || pixels.colorSpace !== 'srgb' || pixels.alpha !== 'straight') fail('Invalid transfer pixels.');
  if (typeof CompressionStream === 'undefined') fail('Lossless PNG compression is unavailable in this browser.');
  let row = 0;
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({ pull(controller) {
    signal?.throwIfAborted();
    if (row === height) { controller.close(); return; }
    const bytes = new Uint8Array(width * 4 + 1); bytes.set(rgba.subarray(row * width * 4, ++row * width * 4), 1); controller.enqueue(bytes);
  } });
  const reader = source.pipeThrough(new CompressionStream('deflate')).getReader(), parts: Uint8Array[] = []; let total = 0;
  const cancel = () => { void reader.cancel(signal?.reason).catch(() => {}); }; signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) { signal?.throwIfAborted(); const next = await reader.read(); signal?.throwIfAborted(); if (next.done) break;
      total += next.value.length; if (total > (width * height * 4 + height) * 1.01 + 65536) fail('PNG compression exceeded its output budget.'); parts.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); signal?.removeEventListener('abort', cancel); }
  const compressed = new Uint8Array(total); let offset = 0; for (const part of parts) { compressed.set(part, offset); offset += part.length; }
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  const chunks = [new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('sRGB', new Uint8Array([0])), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(chunks.reduce((sum, bytes) => sum + bytes.length, 0)); offset = 0; for (const bytes of chunks) { out.set(bytes, offset); offset += bytes.length; } return out;
}
