/**
 * PURPOSE    Publish verified static assets through atomic per-build cache pointers.
 * KIND       SHELL
 * CONTRACT   IN: validated manifest, origin and browser-compatible cache/fetch/clock ports.
 *            OUT: install/audit receipts, matching full or ranged responses, owned cleanup.
 *            RAISES: Error with offline.* code for network, bytes, headers, limits,
 *            cancellation, quota, storage or incomplete published generations.
 * GUARANTEES A failed attempt never replaces a published pointer; no project or blob
 *            request enters the cache; audit work is shared and absent from warm fetches.
 *            Only /index.html downloads from canonical /; its exact cache key and
 *            all content/header checks remain unchanged (OFFLINE-ROOT-ROUTE.md).
 *            Cleanup freshly audits current/fallback content and protects uncertain
 *            or legacy publications; all inspection precedes destructive cleanup.
 * TUNING     ASSET_MS=90s, INSTALL_MS=10min; MANIFEST_LIMIT=25MiB exclusive,
 *            METADATA_LIMIT=4096 bytes. One fetch at a time bounds peak memory.
 * DECISIONS  D1: Separate generations plus one pointer write. Alternative: overwrite
 *            live keys; rejected because interruption mixes builds. Revisit for a
 *            transactional multi-entry cache API. D2: Audit on startup/explicit checks,
 *            not each fetch; revisit if browser integrity enforcement replaces hashing.
 *            D3: Digest-bound historical manifests prove fallback completeness instead
 *            of trusting receipts. Legacy/uncertain copies stay protected; revisit only
 *            with a migration that proves their content (OFFLINE-RETAIN-REPAIR.md).
 * LIMITS     Browser eviction is external; range support is single-part, with legal full
 *            responses otherwise. Callers provide standard abort-aware fetch semantics.
 * TESTBENCH  src/shared/offline-cache.test.ts -- run with: node --import tsx --test src/shared/offline-cache.test.ts
 */
import { offlineManifest, type OfflineAsset, type OfflineManifest } from './offline-manifest.ts';
export type OfflineReceipt = { schema: 1; build: string; generation: string; files: number; bytes: number; publishedAt: number; complete: true; manifestSha256?: string };
export type OfflineCachePorts = {
  storage: Pick<CacheStorage, 'open' | 'keys' | 'delete'>; fetch: typeof fetch;
  digest(bytes: Uint8Array<ArrayBuffer>): Promise<string>; random(): string; now(): number;
  timeout(milliseconds: number): AbortSignal; progress(completed: number, total: number): void;
};
const PREFIX = 'gsnv-paint:offline:v1:';
const ASSET_MS = 90_000, INSTALL_MS = 600_000;
const MANIFEST_LIMIT = 26_214_400, METADATA_LIMIT = 4096;
const ISOLATION = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp', 'cross-origin-resource-policy': 'same-origin' };
const fail = (code: string, message: string) => Object.assign(new Error(message), { code: `offline.${code}` });
const errorCode = (error: unknown) => (error as { code?: unknown })?.code;
const storageError = (error: unknown) => typeof errorCode(error) === 'string' ? error : fail((error as Error)?.name === 'QuotaExceededError' ? 'quota' : 'storage', 'Offline storage is unavailable. Free space or allow site storage, then retry.');

async function content(response: Response, asset: OfflineAsset, digest: OfflineCachePorts['digest']): Promise<Uint8Array<ArrayBuffer>> {
  if (response.status !== 200 || response.redirected || response.type === 'opaque') throw fail('network', 'An offline asset could not be downloaded. Reconnect and retry.');
  if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== asset.mime) throw fail('integrity', 'An offline asset has the wrong file type. Reconnect and retry.');
  for (const [key, value] of Object.entries(ISOLATION)) if (response.headers.get(key) !== value) throw fail('headers', 'The server is missing required isolation headers. Offline setup cannot finish.');
  const bytes = new Uint8Array(asset.bytes), reader = response.body?.getReader();
  let length = 0;
  if (reader) {
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        if (length + next.value.byteLength > bytes.length) throw fail('limit', 'An offline asset exceeds its declared size. Reconnect and retry.');
        bytes.set(next.value, length); length += next.value.byteLength;
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  }
  if (length !== asset.bytes || await digest(bytes) !== asset.sha256) throw fail('integrity', 'An offline asset is incomplete or changed. Reconnect and retry.');
  return bytes;
}

async function boundedBytes(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let length = 0;
  if (reader) try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length >= limit) throw fail('limit', 'Offline metadata exceeds its size limit. Reconnect and retry.');
      chunks.push(next.value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function metadata(response?: Response): Promise<unknown> {
  if (!response) return undefined;
  let bytes: Uint8Array;
  try { bytes = await boundedBytes(response, METADATA_LIMIT + 1); }
  catch (error) { if (errorCode(error) === 'offline.limit') return undefined; throw error; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return undefined; }
}
function receipt(value: unknown): OfflineReceipt | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as OfflineReceipt;
  return r.schema === 1 && r.complete === true && /^[a-f0-9]{64}$/.test(r.build) &&
    typeof r.generation === 'string' && new RegExp(`^${PREFIX}build:${r.build}:[a-zA-Z0-9_-]{1,80}$`).test(r.generation) &&
    Number.isSafeInteger(r.files) && r.files > 0 && r.files <= 20_000 && Number.isSafeInteger(r.bytes) && r.bytes >= 0 && r.bytes <= 134_217_728 &&
    Number.isFinite(r.publishedAt) && r.publishedAt >= 0 &&
    (r.manifestSha256 === undefined || (typeof r.manifestSha256 === 'string' && /^[a-f0-9]{64}$/.test(r.manifestSha256))) ? r : undefined;
}
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

async function ranged(response: Response, request: Request): Promise<Response> {
  const range = request.headers.get('range'), condition = request.headers.get('if-range');
  if (!range || (condition && (condition.startsWith('W/') || condition !== response.headers.get('etag')))) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer(), size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  const headers = new Headers(response.headers); headers.set('accept-ranges', 'bytes');
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    headers.set('content-range', `bytes */${size}`); headers.set('content-length', '0');
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`); headers.set('content-length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

export function offlineCache(input: { manifest: OfflineManifest; origin: string; ports: OfflineCachePorts }) {
  const manifest = offlineManifest(input.manifest), { ports } = input, origin = new URL(input.origin).origin;
  const total = manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const assets = new Map(manifest.assets.map(asset => [new URL(asset.url, origin).href, asset]));
  const internal = (name: string) => `${origin}/.gsnv-offline/${name}`;
  const pointer = internal(`build/${manifest.build}`), complete = internal('receipt'), pending = internal('pending'), storedManifest = internal('manifest');
  let verified: OfflineReceipt | undefined, checked = false;
  let auditing: Promise<OfflineReceipt> | undefined, installing: Promise<OfflineReceipt> | undefined;
  const incomplete = () => fail('incomplete', 'The offline copy is missing or changed. Reconnect and retry offline setup.');

  async function verifyGeneration(r: OfflineReceipt, expected?: OfflineManifest): Promise<void> {
    if (!(await ports.storage.keys()).includes(r.generation)) throw incomplete();
    const cache = await ports.storage.open(r.generation);
    if (JSON.stringify(await metadata(await cache.match(complete))) !== JSON.stringify(r)) throw incomplete();
    let source = expected;
    if (r.manifestSha256) {
      const response = await cache.match(storedManifest); if (!response || response.status !== 200) throw incomplete();
      let bytes: Uint8Array<ArrayBuffer>;
      try { bytes = await boundedBytes(response, MANIFEST_LIMIT); }
      catch (error) { if (errorCode(error) === 'offline.limit') throw incomplete(); throw error; }
      if (await ports.digest(bytes) !== r.manifestSha256) throw incomplete();
      try { source = offlineManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
      catch { throw incomplete(); }
      if (expected && JSON.stringify(source) !== JSON.stringify(expected)) throw incomplete();
    }
    if (!source || source.build !== r.build || source.assets.length !== r.files || source.assets.reduce((sum, asset) => sum + asset.bytes, 0) !== r.bytes) throw incomplete();
    for (const asset of source.assets) {
      const response = await cache.match(new URL(asset.url, origin).href); if (!response) throw incomplete();
      try { await content(response, asset, ports.digest); }
      catch (error) { if (['offline.network', 'offline.integrity', 'offline.headers', 'offline.limit'].includes(String(errorCode(error)))) throw incomplete(); throw error; }
    }
  }
  async function inspect(): Promise<OfflineReceipt> {
    verified = undefined;
    try {
      const meta = await ports.storage.open(`${PREFIX}meta`), r = receipt(await metadata(await meta.match(pointer)));
      if (!r || r.build !== manifest.build) throw incomplete();
      await verifyGeneration(r, manifest);
      verified = r; return r;
    } catch (error) { throw storageError(error); }
    finally { checked = true; }
  }
  function audit(): Promise<OfflineReceipt> {
    if (!auditing) auditing = inspect().finally(() => { auditing = undefined; });
    return auditing;
  }
  async function installNow(signal?: AbortSignal): Promise<OfflineReceipt> {
    const combined = AbortSignal.any([ports.timeout(INSTALL_MS), ...(signal ? [signal] : [])]);
    const check = () => { if (combined.aborted) throw fail(signal?.aborted ? 'cancelled' : 'network', 'Offline setup was interrupted. Reconnect and retry.'); };
    check();
    try { const previous = await audit(); ports.progress(total, total); return previous; }
    catch (error) { if (errorCode(error) !== 'offline.incomplete') throw error; }
    const attempt = ports.random();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(attempt)) throw fail('storage', 'Offline cache identity is unavailable. Retry setup.');
    const generation = `${PREFIX}build:${manifest.build}:${attempt}`;
    // Refuse a reused identity so injected randomness cannot overwrite live responses.
    if ((await ports.storage.keys()).includes(generation)) throw fail('storage', 'Offline cache identity was reused. Retry setup.');
    try {
      const cache = await ports.storage.open(generation);
      await cache.put(pending, json({ startedAt: ports.now() }));
      let done = 0; ports.progress(0, total);
      for (const [url, asset] of assets) {
        check();
        const download = asset.url === '/index.html' ? new URL('/', origin).href : url;
        const request = new Request(download, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.any([combined, ports.timeout(ASSET_MS)]) });
        let response: Response, bytes: Uint8Array<ArrayBuffer>;
        try { response = await ports.fetch(request); bytes = await content(response, asset, ports.digest); }
        catch (error) { check(); throw typeof errorCode(error) === 'string' ? error : fail('network', 'An offline asset could not be downloaded. Reconnect and retry.'); }
        check();
        const headers = new Headers(response.headers);
        // Fetch decodes transport compression; cached metadata must describe these bytes.
        headers.delete('content-encoding'); headers.set('content-length', String(bytes.byteLength));
        await cache.put(url, new Response(bytes, { headers }));
        done += asset.bytes; ports.progress(done, total);
      }
      check();
      const bytes = new TextEncoder().encode(JSON.stringify(manifest));
      if (bytes.byteLength >= MANIFEST_LIMIT) throw fail('limit', 'The offline manifest exceeds its size limit.');
      const r: OfflineReceipt = { schema: 1, build: manifest.build, generation, files: assets.size, bytes: total, publishedAt: ports.now(), complete: true, manifestSha256: await ports.digest(bytes) };
      if (!receipt(r)) throw fail('storage', 'Offline cache completion metadata is invalid.');
      check(); await cache.put(storedManifest, new Response(bytes, { headers: { 'content-type': 'application/json' } })); check();
      await cache.put(complete, json(r)); check();
      await (await ports.storage.open(`${PREFIX}meta`)).put(pointer, json(r));
      verified = r; checked = true; return r;
    } catch (error) { await ports.storage.delete(generation).catch(() => {}); throw storageError(error); }
  }
  function install(signal?: AbortSignal): Promise<OfflineReceipt> {
    if (!installing) installing = installNow(signal).finally(() => { installing = undefined; });
    return installing;
  }
  async function match(request: Request): Promise<Response | undefined> {
    if (request.method !== 'GET' || !assets.has(request.url)) return undefined;
    if (!checked) await audit();
    if (!verified) throw incomplete();
    try {
      const response = await (await ports.storage.open(verified.generation)).match(request.url);
      if (!response) { verified = undefined; throw incomplete(); }
      return ranged(response, request);
    } catch (error) { verified = undefined; throw storageError(error); }
  }
  async function retain(): Promise<void> {
    try {
      const current = await audit(), meta = await ports.storage.open(`${PREFIX}meta`);
      const published: OfflineReceipt[] = [];
      for (const key of await meta.keys()) {
        if (!key.url.startsWith(internal('build/'))) continue;
        const r = receipt(await metadata(await meta.match(key)));
        // A malformed pointer cannot safely reclassify a published cache as abandoned.
        if (!r || key.url !== internal(`build/${r.build}`)) throw incomplete();
        published.push(r);
      }
      published.sort((a, b) => b.publishedAt - a.publishedAt || b.generation.localeCompare(a.generation));
      const keep = new Set([current.generation, ...published.filter(r => !r.manifestSha256).map(r => r.generation)]);
      let fallback = false;
      for (const r of published) {
        if (r.build === manifest.build || !r.manifestSha256) continue;
        try { await verifyGeneration(r); keep.add(r.generation); fallback = true; break; }
        catch (error) { if (errorCode(error) !== 'offline.incomplete') throw error; keep.add(r.generation); }
      }
      if (!fallback) for (const r of published) keep.add(r.generation);
      const remove: string[] = [];
      for (const name of await ports.storage.keys()) {
        if (!name.startsWith(`${PREFIX}build:`) || keep.has(name)) continue;
        const wasPublished = published.some(r => r.generation === name);
        if (wasPublished) { remove.push(name); continue; }
        const cache = await ports.storage.open(name), marker = await metadata(await cache.match(pending)) as { startedAt?: number } | undefined;
        // A different worker may still be installing; never delete a fresh candidate.
        if (Number.isFinite(marker?.startedAt) && ports.now() - marker!.startedAt! > INSTALL_MS) remove.push(name);
      }
      for (const name of remove) await ports.storage.delete(name);
      for (const r of published) if (remove.includes(r.generation)) await meta.delete(internal(`build/${r.build}`));
    } catch (error) { throw storageError(error); }
  }
  return { install, audit, match, retain };
}
