// Test-process-only controls; the served origin has no mutation endpoint or backend API.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
export const offlineTestHeaders = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
export const fixtureMime = (path: string) => ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.zip': 'application/zip', '.woff2': 'font/woff2', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg' }[extname(path)] ?? 'application/octet-stream');
export async function offlineTestServer(directory: string, port = 4197) {
  let root = resolve(directory), fault: { path: string; kind: 'status' | 'bytes' | 'headers' } | undefined;
  const requests: { method: string; path: string }[] = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    requests.push({ method: request.method ?? '', path });
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new Error('Method');
      if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403, offlineTestHeaders); response.end('Forbidden host'); return; }
      const file = await realpath(join(root, decodeURIComponent(path === '/' ? '/index.html' : path)));
      if (!file.startsWith(root + sep)) throw new Error('Outside fixture');
      let bytes = await readFile(file);
      if (fault?.path === path && fault.kind === 'status') throw new Error('Injected download failure');
      if (fault?.path === path && fault.kind === 'bytes') { bytes = Buffer.from(bytes); bytes[0] = (bytes[0] ?? 0) ^ 255; }
      response.writeHead(200, { ...(fault?.path === path && fault.kind === 'headers' ? {} : offlineTestHeaders), 'Content-Type': fixtureMime(file), 'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(404, { ...offlineTestHeaders, 'Content-Type': 'text/plain' }); response.end('Static asset unavailable'); }
  });
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
  return { url: `http://127.0.0.1:${port}/`, requests, setRoot(path: string) { root = resolve(path); },
    setFault(value?: typeof fault) { fault = value; }, async close() { await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); } };
}
