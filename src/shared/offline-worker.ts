/**
 * PURPOSE    Serve one complete build through the service-worker lifecycle.
 * KIND       SHELL
 * CONTRACT   IN: standard worker scope ports and a fixed embedded manifest.
 *            OUT: install/activate/fetch/message event handlers; bounded state replies.
 *            RAISES: TypeError/RangeError for invalid manifest at construction;
 *            install waitUntil rejects on failure, other operations report offline.*.
 * GUARANTEES Never skips waiting or reloads windows; claims only same-build first-load
 *            clients; unknown/opaque messages cannot fetch arbitrary URLs or mutate caches.
 * TUNING     HANDSHAKE_MS=5s and MESSAGE_BYTES=4096 bound client messages;
 *            PROGRESS_MS=250 bounds progress broadcasts without delaying lifecycle state.
 * DECISIONS  D1: Natural activation instead of skipWaiting. Alternative: coordinated
 *            hot updates; rejected because tabs can contain unflushed work. Revisit if:
 *            a separate multi-tab save protocol is reviewed. D2: Explicit inventory
 *            matching instead of a navigation fallback prevents HTML masquerading as WASM.
 * LIMITS     First install with an unknown window requires reopening. Cache eviction can
 *            require reconnection; cleanup failure never invalidates a usable generation.
 * TESTBENCH  src/shared/offline-worker.test.ts -- run with: node --import tsx --test src/shared/offline-worker.test.ts
 */
import { offlineManifest, type OfflineManifest } from './offline-manifest.ts';
import { offlineCache } from './offline-cache.ts';
type WindowClient = { id: string; type: string; url: string; postMessage(data: unknown, transfer?: Transferable[]): void };
type Lifetime = { waitUntil(promise: Promise<unknown>): void };
type Events = {
  install: Lifetime; activate: Lifetime;
  fetch: Lifetime & { request: Request; respondWith(response: Promise<Response>): void };
  message: Lifetime & { source: { id?: string } | null; data: unknown; ports: readonly MessagePort[] };
};
export type OfflineWorkerScope = {
  location: { origin: string }; registration: { scope: string; active: unknown };
  caches: Pick<CacheStorage, 'open' | 'keys' | 'delete'>; fetch: typeof fetch; crypto: Crypto;
  clients: { matchAll(options: { type: 'window'; includeUncontrolled: true }): Promise<readonly WindowClient[]>; get(id: string): Promise<WindowClient | undefined>; claim(): Promise<void> };
  addEventListener<K extends keyof Events>(type: K, listener: (event: Events[K]) => void): void;
  setTimeout(callback: () => void, milliseconds: number): unknown; clearTimeout(id: unknown): void;
};
export type OfflineWorkerReport = {
  protocol: 1; kind: 'state'; build: string; phase: 'checking' | 'installing' | 'ready' | 'reopen-required' | 'error';
  completedBytes: number; totalBytes: number; requestId?: string; error?: { code: string; message: string };
};
const HANDSHAKE_MS = 5000, MESSAGE_BYTES = 4096, PROGRESS_MS = 250;
const ISOLATION = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp', 'cross-origin-resource-policy': 'same-origin' };
function smallObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MESSAGE_BYTES; } catch { return false; }
}

export function installOfflineWorker({ scope, manifest: value }: { scope: OfflineWorkerScope; manifest: OfflineManifest }): void {
  const manifest = offlineManifest(value), origin = scope.location.origin;
  const assets = new Map(manifest.assets.map(asset => [new URL(asset.url, origin).href, asset]));
  let state: OfflineWorkerReport = { protocol: 1, kind: 'state', build: manifest.build, phase: 'checking', completedBytes: 0, totalBytes: manifest.assets.reduce((sum, a) => sum + a.bytes, 0) };
  let firstInstall = false, lastProgress = 0;
  const validWindow = (client: WindowClient | undefined): client is WindowClient => !!client && client.type === 'window' && client.url.startsWith(scope.registration.scope) && new URL(client.url).origin === origin;
  async function broadcast() {
    for (const client of await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (validWindow(client)) try { client.postMessage(state); } catch { /* A closing window needs no status. */ }
    }
  }
  const publish = () => broadcast().catch(() => {});
  function failed(error: unknown) {
    const e = error as { code?: string; message?: string };
    state = { ...state, phase: 'error', error: { code: typeof e?.code === 'string' && e.code.startsWith('offline.') ? e.code : 'offline.storage', message: (e?.message ?? 'Offline setup failed. Reconnect and retry.').slice(0, 500) } };
  }
  function phase(next: OfflineWorkerReport['phase']) { const { error: _, ...rest } = state; state = { ...rest, phase: next }; }
  const cache = offlineCache({ manifest, origin, ports: {
    storage: scope.caches, fetch: (...args) => scope.fetch(...args), random: () => scope.crypto.randomUUID(), now: Date.now, timeout: AbortSignal.timeout,
    digest: async bytes => Array.from(new Uint8Array(await scope.crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''),
    progress(done, total) { state = { ...state, completedBytes: done, totalBytes: total }; if (Date.now() - lastProgress >= PROGRESS_MS) { lastProgress = Date.now(); void publish(); } },
  } });
  async function install() {
    phase('installing'); await publish();
    try { await cache.install(); phase('ready'); await publish(); }
    catch (error) { failed(error); await publish(); throw error; }
  }
  async function audit() {
    try { await cache.audit(); if (state.phase !== 'reopen-required') phase('ready'); state.completedBytes = state.totalBytes; }
    catch (error) { failed(error); }
  }
  function identify(client: WindowClient): Promise<boolean> {
    return new Promise(resolve => {
      const channel = new MessageChannel(), requestId = scope.crypto.randomUUID();
      const finish = (ok: boolean) => { scope.clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(ok); };
      const timer = scope.setTimeout(() => finish(false), HANDSHAKE_MS);
      channel.port1.onmessage = event => {
        const d: unknown = event.data;
        finish(smallObject(d) && d.protocol === 1 && d.kind === 'build' && d.requestId === requestId && d.build === manifest.build);
      };
      try { client.postMessage({ protocol: 1, kind: 'identify', requestId, build: manifest.build }, [channel.port2]); }
      catch { finish(false); }
    });
  }
  scope.addEventListener('install', event => { firstInstall = !scope.registration.active; event.waitUntil(install()); });
  scope.addEventListener('activate', event => event.waitUntil((async () => {
    await audit(); if (state.phase === 'error') return;
    if (firstInstall) {
      const clients = (await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(validWindow);
      const answers = await Promise.all(clients.map(identify));
      const latest = (await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(validWindow);
      if (answers.every(Boolean) && latest.length === clients.length && latest.every(client => clients.some(known => known.id === client.id))) await scope.clients.claim();
      else phase('reopen-required');
    }
    await cache.retain().catch(() => {}); await publish();
  })()));
  const unavailable = () => new Response('The offline copy is unavailable. Reconnect and retry offline setup.', { status: 503, headers: { ...ISOLATION, 'content-type': 'text/plain; charset=utf-8' } });
  scope.addEventListener('fetch', event => {
    const original = event.request, url = new URL(original.url);
    if (original.method !== 'GET' || url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return;
    const navigation = original.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html');
    const request = navigation ? new Request(`${origin}/index.html`, { headers: original.headers }) : original;
    const asset = assets.get(request.url); if (!asset) return;
    event.respondWith((async () => {
      try { if (state.phase === 'checking') await audit(); const response = await cache.match(request); if (response) return response; }
      catch (error) { failed(error); event.waitUntil(publish()); }
      try {
        const response = await scope.fetch(original);
        if (response.ok && response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === asset.mime) return response;
      } catch { /* Offline requests receive an explicit non-HTML response. */ }
      return unavailable();
    })());
  });
  scope.addEventListener('message', event => {
    const d = event.data;
    if (!smallObject(d) || d.protocol !== 1 || !['status', 'retry'].includes(String(d.kind)) || typeof d.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(d.requestId) || typeof d.pageBuild !== 'string' || !/^[a-f0-9]{64}$/.test(d.pageBuild) ||
      (d.fresh !== undefined && typeof d.fresh !== 'boolean') || !event.source?.id || event.ports.length !== 1) return;
    const sourceId = event.source.id, port = event.ports[0]!;
    event.waitUntil((async () => {
      const source = await scope.clients.get(sourceId); if (!validWindow(source)) { port.close(); return; }
      if (d.kind === 'retry') {
        const pending = install();
        port.postMessage({ ...state, requestId: d.requestId }); port.close(); await pending.catch(() => {});
      } else {
        if (d.fresh || state.phase === 'checking') await audit();
        port.postMessage({ ...state, requestId: d.requestId }); port.close();
      }
    })().catch(() => { port.close(); }));
  });
}
