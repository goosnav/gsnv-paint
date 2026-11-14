/**
 * PURPOSE    Validate the complete static build's offline asset identity.
 * KIND       CORE
 * CONTRACT   IN: unknown schema-1 manifest containing a root index and unique paths.
 *            OUT: owned deeply frozen OfflineManifest sorted by URL.
 *            RAISES: TypeError for schema/path/hash/MIME faults; RangeError for limits.
 * GUARANTEES Deterministic, no I/O; no caller mutation, URL aliases or reserved keys.
 * TUNING     FILE_LIMIT=25 MiB exclusive and FILE_COUNT=20,000 follow D04 hosting;
 *            TOTAL_LIMIT=128 MiB bounds complete installations; PATH_LIMIT=2048.
 * DECISIONS  D1: Inventory every emitted asset. Alternative: request observation,
 *            which misses lazy runtimes. Revisit if outputs gain explicit optional sets.
 *            D2: Reject nested escaping instead of relying on server decoding rules;
 *            revisit only with a deployment-independent canonical URL policy.
 * LIMITS     Validates metadata, not fetched bytes, hosting headers or available quota.
 * TESTBENCH  src/shared/offline-manifest.test.ts -- run with: node --import tsx --test src/shared/offline-manifest.test.ts
 */
export type OfflineAsset = Readonly<{ url: string; bytes: number; sha256: string; mime: string }>;
export type OfflineManifest = Readonly<{ schema: 1; build: string; assets: readonly OfflineAsset[] }>;
const FILE_LIMIT = 26_214_400;
const FILE_COUNT = 20_000;
const TOTAL_LIMIT = 134_217_728;
const PATH_LIMIT = 2048;
const HEX = /^[a-f0-9]{64}$/;
const MIME = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const RESERVED = new Set(['/offline-sw.js', '/offline-manifest.json', '/_headers', '/_redirects']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Offline manifest objects are required.');
  return value as Record<string, unknown>;
}
function path(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > PATH_LIMIT || /[?#\\\x00-\x20\x7f]/.test(value)) {
    throw new TypeError('Offline assets require canonical root-relative paths.');
  }
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { throw new TypeError('Invalid offline URL encoding.'); }
  if (/%(?:2f|5c)/i.test(value) || /[%\\\x00-\x1f\x7f]/.test(decoded) || decoded.split('/').slice(1).some(part => !part || part === '.' || part === '..') ||
      decoded.startsWith('/.gsnv-offline/') || RESERVED.has(decoded) || encodeURI(decoded) !== value) {
    throw new TypeError('Offline asset paths must not alias another URL or reserved cache key.');
  }
  return value;
}

export function offlineManifest(value: unknown): OfflineManifest {
  const data = record(value);
  if (data.schema !== 1 || typeof data.build !== 'string' || !HEX.test(data.build) || !Array.isArray(data.assets) || !data.assets.length) {
    throw new TypeError('A schema-1 offline manifest, build identity and asset list are required.');
  }
  if (data.assets.length > FILE_COUNT) throw new RangeError(`Offline output exceeds ${FILE_COUNT} files.`);
  const urls = new Set<string>();
  let total = 0;
  const assets: OfflineAsset[] = [];
  for (const item of data.assets) {
    const data = record(item), url = path(data.url);
    if (urls.has(url)) throw new TypeError('Duplicate offline asset URL.');
    if (typeof data.sha256 !== 'string' || !HEX.test(data.sha256) || typeof data.mime !== 'string' || data.mime.length > 128 || !MIME.test(data.mime)) {
      throw new TypeError('Offline assets require SHA-256 and a MIME essence.');
    }
    if (typeof data.bytes !== 'number' || !Number.isSafeInteger(data.bytes) || data.bytes < 0 || data.bytes >= FILE_LIMIT) {
      throw new RangeError('Every offline asset must be smaller than 25 MiB.');
    }
    total += data.bytes;
    if (total > TOTAL_LIMIT) throw new RangeError('Complete offline installation exceeds 128 MiB.');
    urls.add(url); assets.push(Object.freeze({ url, bytes: data.bytes, sha256: data.sha256, mime: data.mime }));
  }
  if (!urls.has('/index.html')) throw new TypeError('Offline output must contain /index.html.');
  assets.sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
  return Object.freeze({ schema: 1, build: data.build, assets: Object.freeze(assets) });
}
