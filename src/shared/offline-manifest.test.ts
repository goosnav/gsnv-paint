import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineManifest } from './offline-manifest.ts';

const hash = 'a'.repeat(64);
const build = 'b'.repeat(64);
const asset = (url = '/index.html', bytes = 5, mime = 'text/html') => ({ url, bytes, sha256: hash, mime });
const input = (assets: unknown[] = [asset()]) => ({ schema: 1, build, assets });

test('S16 owns and freezes the complete sorted static manifest', () => {
  const value = input([asset('/worker.js', 8, 'text/javascript'), asset(), asset('/runtime.wasm', 9, 'application/wasm'),
    asset('/stdlib.zip', 4, 'application/zip'), asset('/font.woff2', 1, 'font/woff2'), asset('/NOTICE.txt', 0, 'text/plain')]);
  const result = offlineManifest(value);
  assert.deepEqual(result, { schema: 1, build, assets: [asset('/NOTICE.txt', 0, 'text/plain'), asset('/font.woff2', 1, 'font/woff2'), asset(),
    asset('/runtime.wasm', 9, 'application/wasm'), asset('/stdlib.zip', 4, 'application/zip'), asset('/worker.js', 8, 'text/javascript')] });
  value.assets.splice(0); assert.equal(result.assets.length, 6);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.assets) && result.assets.every(Object.isFrozen));
});

test('S16 rejects noncanonical paths before a request or cache key can be constructed', () => {
  for (const url of ['index.html', '//host/a', 'https://x/a', '/a/../b', '/./a', '/a//b', '/a\\b', '/a?b', '/a#b', '/a\0b', '/a\nb',
    '/%2e%2e/a', '/a%2fb', '/a%5Cb', '/a%00b', '/a%252fb', '/bad%ff', '/.gsnv-offline/receipt', '/offline-sw.js', '/offline-manifest.json', '/_headers', '/_redirects']) {
    assert.throws(() => offlineManifest(input([asset(), asset(url)])), TypeError, url);
  }
  assert.equal(offlineManifest(input([asset(), asset('/a%20b.txt')])).assets.length, 2);
});

test('S16 rejects malformed schema, sparse arrays and ambiguous identity', () => {
  for (const value of [null, {}, [], { ...input(), schema: 2 }, { ...input(), build: hash.toUpperCase() },
    input([]), input([asset(), asset()]), input([asset('/other')]), input(new Array(2)),
    input([{ ...asset(), sha256: '0'.repeat(63) }]), input([{ ...asset(), mime: 'text/html; charset=utf-8' }]),
    input([{ ...asset(), mime: 'text/html\r\nx: bad' }])]) assert.throws(() => offlineManifest(value), TypeError);
  for (const bytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 26_214_400]) {
    assert.throws(() => offlineManifest(input([asset('/index.html', bytes)])), RangeError);
  }
});

test('S16 enforces independent file count, per-file and aggregate byte boundaries', () => {
  assert.equal(offlineManifest(input([asset('/index.html', 26_214_399)])).assets[0]?.bytes, 26_214_399);
  const full = [asset('/index.html', 0), ...Array.from({ length: 5 }, (_, i) => asset(`/part${i}`, 26_214_399)), asset('/last', 3_145_733)];
  assert.equal(full.reduce((n, a) => n + a.bytes, 0), 134_217_728);
  assert.equal(offlineManifest(input(full)).assets.length, 7);
  assert.throws(() => offlineManifest(input([...full, asset('/over', 1)])), RangeError);
  const many = [asset(), ...Array.from({ length: 19_999 }, (_, i) => asset(`/part-${i}`, 0))];
  assert.equal(offlineManifest(input(many)).assets.length, 20_000);
  assert.throws(() => offlineManifest(input([...many, asset('/extra')])), RangeError);
});
