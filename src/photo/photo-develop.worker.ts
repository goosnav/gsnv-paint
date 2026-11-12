/**
 * PHOTO-APP develop worker. Owns the decoded full-resolution photo (16-bit linear RGB), builds
 * screen-sized proxies, renders previews, computes Auto tone and encodes exports. Pixel decisions
 * belong to develop.ts and auto-tone.ts; this file only moves buffers.
 */
import { develop, toLinear, type LinearImage } from './develop.ts';
import { autoTone } from './auto-tone.ts';
import type { DevelopSettings } from './develop-settings.ts';

export type PhotoWorkerRequest =
  | { type: 'load'; id: number; kind: 'raw' | 'display'; width: number; height: number; data: Uint16Array }
  | { type: 'loadBitmap'; id: number; bitmap: ImageBitmap }
  | { type: 'render'; id: number; settings: DevelopSettings; maxEdge: number; ignoreCrop: boolean }
  | { type: 'auto'; id: number; settings: DevelopSettings }
  | { type: 'export'; id: number; settings: DevelopSettings; maxEdge: number | null; mime: 'image/jpeg' | 'image/png'; quality: number };
export type PhotoWorkerReply =
  | { id: number; ok: true; type: 'loaded'; width: number; height: number }
  | { id: number; ok: true; type: 'rendered'; width: number; height: number; rgba: Uint8ClampedArray; histogram: Uint32Array }
  | { id: number; ok: true; type: 'auto'; change: Partial<DevelopSettings> }
  | { id: number; ok: true; type: 'exported'; bytes: Uint8Array; width: number; height: number }
  | { id: number; ok: false; message: string };

const port = globalThis as unknown as { onmessage: (event: MessageEvent<PhotoWorkerRequest>) => void; postMessage(reply: PhotoWorkerReply, transfer?: Transferable[]): void };
let source: { width: number; height: number; data: Uint16Array; kind: 'raw' | 'display' } | null = null;
const proxies = new Map<number, LinearImage>();

/** Area-averaged downsample of the 16-bit source to at most maxEdge on the long side, as Float32 linear. */
function proxy(maxEdge: number | null): LinearImage {
  if (!source) throw new Error('No photo is loaded.');
  const { width: w, height: h, data } = source, f = maxEdge ? Math.max(1, Math.max(w, h) / maxEdge) : 1;
  const key = f <= 1 ? 0 : Math.round(maxEdge!);
  if (maxEdge && proxies.has(key)) return proxies.get(key)!;
  const W = Math.max(1, Math.round(w / f)), H = Math.max(1, Math.round(h / f)), out = new Float32Array(W * H * 3);
  if (f <= 1) { for (let i = 0; i < out.length; i++) out[i] = data[i]! / 65535; }
  else for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * f), y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * f)));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * f), x1 = Math.max(x0 + 1, Math.min(w, Math.floor((x + 1) * f)));
      let r = 0, g = 0, b = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 3; r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; }
      const n = (y1 - y0) * (x1 - x0) * 65535, o = (y * W + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  const image = { width: W, height: H, data: out };
  if (maxEdge) { if (proxies.size > 3) proxies.delete(proxies.keys().next().value!); proxies.set(key, image); }
  return image;
}

async function handle(request: PhotoWorkerRequest): Promise<[PhotoWorkerReply, Transferable[]]> {
  if (request.type === 'load' || request.type === 'loadBitmap') {
    proxies.clear(); source = null;
    if (request.type === 'load') source = { width: request.width, height: request.height, data: request.data, kind: request.kind };
    else {
      const { bitmap } = request, canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data, data = new Uint16Array(canvas.width * canvas.height * 3), table = new Uint16Array(256);
      for (let v = 0; v < 256; v++) table[v] = Math.round(toLinear(v / 255) * 65535);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { data[j] = table[rgba[i]!]!; data[j + 1] = table[rgba[i + 1]!]!; data[j + 2] = table[rgba[i + 2]!]!; }
      source = { width: canvas.width, height: canvas.height, data, kind: 'display' };
    }
    return [{ id: request.id, ok: true, type: 'loaded', width: source.width, height: source.height }, []];
  }
  if (!source) throw new Error('Open a photo first.');
  if (request.type === 'render') {
    const result = develop({ image: proxy(request.maxEdge), settings: request.settings, kind: source.kind, ignoreCrop: request.ignoreCrop });
    return [{ id: request.id, ok: true, type: 'rendered', ...result }, [result.rgba.buffer, result.histogram.buffer]];
  }
  if (request.type === 'auto') return [{ id: request.id, ok: true, type: 'auto', change: autoTone({ image: proxy(640), settings: request.settings, kind: source.kind }) }, []];
  // The size limit applies to the exported (cropped, oriented) image, so scale the source accordingly.
  const swap = request.settings.quarterTurns % 2 === 1, W0 = swap ? source.height : source.width, H0 = swap ? source.width : source.height, long = Math.max(source.width, source.height);
  const outputLong = Math.max(request.settings.crop.width * W0, request.settings.crop.height * H0), sourceEdge = request.maxEdge ? Math.round(request.maxEdge / outputLong * long) : null;
  const full = proxy(sourceEdge && sourceEdge < long ? sourceEdge : null), cached = sourceEdge !== null && sourceEdge < long;
  const result = develop({ image: { ...full, data: cached ? full.data.slice() : full.data }, settings: request.settings, kind: source.kind, consume: true });
  const canvas = new OffscreenCanvas(result.width, result.height);
  canvas.getContext('2d')!.putImageData(new ImageData(result.rgba as Uint8ClampedArray<ArrayBuffer>, result.width, result.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: request.mime, quality: request.quality }), bytes = new Uint8Array(await blob.arrayBuffer());
  return [{ id: request.id, ok: true, type: 'exported', bytes, width: result.width, height: result.height }, [bytes.buffer]];
}

port.onmessage = event => {
  void handle(event.data).then(([reply, transfer]) => port.postMessage(reply, transfer), cause => port.postMessage({ id: event.data.id, ok: false, message: cause instanceof Error ? cause.message : String(cause) }));
};
