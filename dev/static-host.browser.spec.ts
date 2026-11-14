/** Test the emitted build through the real local Cloudflare static-asset runtime. */
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const headers = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
};
type Manifest = { build: string; assets: { url: string; bytes: number; sha256: string; mime: string }[] };

test('Cloudflare static host installs the complete build and serves exact isolated assets offline', async ({ browser }) => {
  const output = resolve(process.env.GSNV_TEST_DIST ?? 'dist');
  const manifest = JSON.parse(await readFile(join(output, 'offline-manifest.json'), 'utf8')) as Manifest;
  const state = await mkdtemp(join(tmpdir(), 'gsnv-static-host-'));
  const origin = 'http://127.0.0.1:4198';
  const server = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--assets', output,
    '--ip', '127.0.0.1', '--port', '4198', '--inspector-port', '9294', '--persist-to', state, '--show-interactive-dev-session', 'false'],
  { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', chunk => { log += chunk; }); server.stderr.on('data', chunk => { log += chunk; });
  const stopped = new Promise<void>(resolve => server.once('close', () => resolve()));
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 720 } });
  try {
    await expect.poll(() => log.includes('Ready on http://127.0.0.1:4198'), { timeout: 30_000, message: 'Local Wrangler becomes ready' }).toBe(true);
    // Cloudflare canonicalizes the physical index path; S18 must request its root representation.
    const redirect = await context.request.get(origin + '/index.html', { maxRedirects: 0 });
    expect(redirect.status()).toBe(307); expect(redirect.headers().location).toBe('/');
    for (const asset of manifest.assets) {
      const response = await context.request.get(origin + (asset.url === '/index.html' ? '/' : asset.url), { maxRedirects: 0 });
      expect(response.status(), asset.url).toBe(200);
      expect(response.headers()['content-type']?.split(';')[0], asset.url).toBe(asset.mime);
      for (const [key, value] of Object.entries(headers)) expect(response.headers()[key], `${asset.url}: ${key}`).toBe(value);
      const bytes = await response.body(); expect(bytes.length, asset.url).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), asset.url).toBe(asset.sha256);
      await response.dispose();
    }
    for (const path of ['/', '/offline-sw.js', '/offline-manifest.json']) {
      const response = await context.request.get(origin + path);
      expect(response.headers()['cache-control'], path).toBe('no-cache'); await response.dispose();
    }
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    const summary = page.locator('.gc-offline > summary');
    await expect(summary).toHaveText('Ready offline', { timeout: 60_000 });
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    expect(await page.locator('meta[name="gsnv-build-id"]').getAttribute('content')).toBe(manifest.build);
    await summary.focus(); await page.keyboard.press('Enter'); await expect(page.locator('.gc-offline')).toHaveAttribute('open', '');
    await page.keyboard.press('Space'); await expect(page.locator('.gc-offline')).not.toHaveAttribute('open');
    await context.setOffline(true); await page.reload(); await expect(summary).toHaveText('Ready offline', { timeout: 30_000 });
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    const cached = await page.evaluate(async ({ assets, required }) => {
      const results = [];
      for (const asset of assets) {
        const response = await fetch(asset.url), bytes = await response.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
        results.push({ url: asset.url, status: response.status, bytes: bytes.byteLength, sha256: hash,
          mime: response.headers.get('content-type')?.split(';')[0], isolated: Object.entries(required).every(([key, value]) => response.headers.get(key) === value) });
      }
      return results;
    }, { assets: manifest.assets, required: headers });
    expect(cached).toEqual(manifest.assets.map(asset => ({ ...asset, status: 200, isolated: true })));
    await summary.click(); await expect(page.locator('.gc-offline-panel')).toContainText('stored for offline use');
    await page.screenshot({ path: 'dev/evidence/OFFLINE-Cloudflare-production.png' });
    expect(errors).toEqual([]);
    console.log(`Cloudflare static host: ${cached.length} exact assets; root canonicalization; isolation; cold network-disabled reload; zero page errors.`);
  } finally {
    await context.close(); server.kill('SIGINT');
    const timeout = setTimeout(() => server.kill('SIGKILL'), 10_000);
    await stopped; clearTimeout(timeout); await rm(state, { recursive: true, force: true });
    if (server.exitCode !== 0 && server.exitCode !== null) console.log(log);
  }
});
