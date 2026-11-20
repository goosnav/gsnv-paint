import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, get } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localAppPath, localAppPlugin } from './local-app.mjs';

const meta = { buildId: 'a'.repeat(64), sourceId: 'b'.repeat(64), checkoutId: 'c'.repeat(64), revision: '0f722d2' };
const html = `<!doctype html><html><head><meta name="application-name" content="gsnv-paint"><meta name="gsnv-build-id" content="${meta.buildId}"></head><body><div id="app"></div><script type="module" src="/assets/current.js"></script></body></html>`;
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'gsnv-local-entry-'));
  let server;
  try {
    await mkdir(join(root, 'dist')); await writeFile(join(root, 'dist/index.html'), html);
    let handle;
    localAppPlugin(meta).configurePreviewServer({ config: { root, build: { outDir: 'dist' } }, middlewares: { use(listener) { handle = listener; } } });
    server = createServer((request, response) => handle(request, response, () => { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('normal static route'); }));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await run({ root, port, origin: `http://127.0.0.1:${port}` });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await rm(root, { recursive: true, force: true });
  }
}

test('local entry serves the same current bundle outside old cached roots and retains root-relative links', async () => {
  await fixture(async ({ root, origin }) => {
    const status = await fetch(`${origin}/__gsnv-local__/status`);
    assert.equal(status.status, 200); assert.deepEqual(await status.json(), { app: 'gsnv-paint', protocol: 1, ...meta });
    assert.equal(status.headers.get('x-gsnv-local-build'), meta.buildId);
    const entry = await fetch(origin + localAppPath(meta.buildId));
    assert.equal(entry.status, 200); const body = await entry.text();
    assert.match(body, /<base href="\/">/);
    assert.match(body, /<meta name="gsnv-local-runtime" content="1">/);
    assert.match(body, /<meta name="gsnv-local-revision" content="0f722d2">/);
    assert.match(body, /src="\/assets\/current\.js"/);
    assert.equal(await readFile(join(root, 'dist/index.html'), 'utf8'), html, 'the Cloudflare build is not rewritten');
    for (const response of [status, entry]) {
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
      assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
      assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(response.headers.get('clear-site-data'), null);
    }
    assert.equal(await (await fetch(origin + '/assets/current.js')).text(), 'normal static route');
    for (const path of ['/', '/index.html', '/?old-bookmark=1', localAppPath('d'.repeat(64))]) {
      const redirected = await fetch(origin + path, { redirect: 'manual' });
      assert.equal(redirected.status, 307);
      assert.equal(redirected.headers.get('location'), localAppPath(meta.buildId));
      assert.equal(redirected.headers.get('cache-control'), 'no-store');
      const current = await fetch(origin + path);
      assert.equal(current.url, origin + localAppPath(meta.buildId));
      assert.match(await current.text(), /name="gsnv-local-runtime" content="1"/);
    }
    const head = await fetch(origin + localAppPath(meta.buildId), { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
  });
});

test('local entry refuses invalid routes or output changed under a running launcher', async () => {
  await fixture(async ({ root, origin }) => {
    const stale = await fetch(origin + '/__gsnv-local__/start/not-a-build');
    assert.equal(stale.status, 409); assert.match(await stale.text(), /Save any open work/);
    await writeFile(join(root, 'dist/index.html'), html.replaceAll(meta.buildId, 'e'.repeat(64)));
    const changed = await fetch(origin + localAppPath(meta.buildId));
    assert.equal(changed.status, 409); assert.match(await changed.text(), /build changed/);
    await rm(join(root, 'dist/index.html'));
    assert.equal((await fetch(origin + localAppPath(meta.buildId))).status, 503);
  });
});

test('local endpoints reject foreign hosts and writes, and never interpolate invalid metadata', async () => {
  await fixture(async ({ origin, port }) => {
    const post = await fetch(origin + '/__gsnv-local__/status', { method: 'POST' });
    assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
    const foreign = await new Promise((resolve, reject) => get({ hostname: '127.0.0.1', port, path: '/__gsnv-local__/status', headers: { Host: 'example.com' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
    assert.equal(foreign, 403);
    const homePost = await fetch(origin + '/', { method: 'POST' }); assert.equal(homePost.status, 405);
  });
  for (const change of [{ buildId: '../index' }, { sourceId: '' }, { checkoutId: 'bad' }, { revision: '"><script>' }, { revision: 'x'.repeat(65) }])
    assert.throws(() => localAppPlugin({ ...meta, ...change }), TypeError);
});
