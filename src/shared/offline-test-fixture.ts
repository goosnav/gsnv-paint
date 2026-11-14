// CacheStorage has no Node implementation; preserve clone/consumption and exact-key semantics.
import { createHash } from 'node:crypto';
import { offlineManifest } from './offline-manifest.ts';
export const origin = 'http://localhost:4196';
export const headers = { 'content-type': 'text/html', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp', 'cross-origin-resource-policy': 'same-origin' };
export const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function fixture(build = 'a'.repeat(64), body = 'hello') {
  const bytes = new TextEncoder().encode(body);
  return offlineManifest({ schema: 1, build, assets: [
    { url: '/index.html', bytes: bytes.length, sha256: sha(bytes), mime: 'text/html' },
    { url: '/lazy.wasm', bytes: 5, sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', mime: 'application/wasm' },
  ] });
}
export function memoryCaches() {
  const data = new Map<string, Map<string, Response>>();
  let writes = 0, rejectWrite = -1;
  const key = (request: RequestInfo | URL) => typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
  const storage = {
    async open(name: string) {
      if (!data.has(name)) data.set(name, new Map());
      const values = data.get(name)!;
      return {
        async match(request: RequestInfo | URL) { return values.get(key(request))?.clone(); },
        async put(request: RequestInfo | URL, response: Response) {
          if (++writes === rejectWrite) throw new DOMException('No storage', 'QuotaExceededError');
          if (response.status === 206) throw new TypeError('Cache.put cannot store partial responses');
          values.set(key(request), new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers }));
        },
        async delete(request: RequestInfo | URL) { return values.delete(key(request)); },
        async keys() { return [...values.keys()].map(url => new Request(url)); },
      } as unknown as Cache;
    },
    async keys() { return [...data.keys()]; },
    async delete(name: string) { return data.delete(name); },
  };
  return { storage, data, failWrite(offset: number) { rejectWrite = writes + offset; }, allowWrites() { rejectWrite = -1; } };
}
