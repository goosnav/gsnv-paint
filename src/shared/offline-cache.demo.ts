import { offlineCache } from './offline-cache.ts';
import { offlineManifest } from './offline-manifest.ts';
const output = document.querySelector('pre')!;
const digest = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
try {
  if (!['localhost', '127.0.0.1'].includes(location.hostname) || location.port !== '4196') throw new Error('Run this demo on its isolated test origin http://127.0.0.1:4196.');
  const bytes = new Uint8Array(await (await fetch('/index.html', { cache: 'no-store' })).arrayBuffer());
  const manifest = offlineManifest({ schema: 1, build: 'd'.repeat(64), assets: [{ url: '/index.html', bytes: bytes.length, sha256: await digest(bytes), mime: 'text/html' }] });
  const cache = offlineCache({ manifest, origin: location.origin, ports: { storage: caches, fetch: fetch.bind(globalThis), digest, random: () => crypto.randomUUID(), now: Date.now, timeout: AbortSignal.timeout,
    progress: (done, total) => { output.textContent = `Verified ${done} / ${total} bytes`; } } });
  const receipt = await cache.install(); await cache.audit();
  const restored = await cache.match(new Request(new URL('/index.html', location.origin)));
  output.textContent = `PASS: real CacheStorage install + audit + read\n${JSON.stringify(receipt, null, 2)}\nRestored ${await restored?.text().then(text => text.length)} characters.`;
} catch (error) { output.textContent = `FAIL: ${(error as Error).message}`; }
