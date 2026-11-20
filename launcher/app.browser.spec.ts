/** Real OS wrapper, production bundle, and a browser carrying an obsolete cache. */
import { test, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const legacyHtml = `<!doctype html><html><head><title>gsnv-paint</title></head><body>
  <div role="tablist" aria-label="Workspace"><button role="tab">CAD</button>
  <button role="tab">Image</button><button role="tab">Video</button></div>
  <p>CAD editing is not available in this development build.</p></body></html>`;
// This isolated test worker reproduces the old app's exact root/index caching
// behavior. Unknown URLs pass through, as they do in the real offline worker.
const legacyWorker = `
  self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open('gsnv-launcher-legacy-test');
    await cache.put('/index.html', new Response(${JSON.stringify(legacyHtml)}, {
      headers: ${JSON.stringify({ ...isolation, 'Content-Type': 'text/html; charset=utf-8' })}
    }));
    await self.skipWaiting();
  })()));
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.mode === 'navigate' && url.origin === self.location.origin &&
        (url.pathname === '/' || url.pathname === '/index.html')) {
      event.respondWith(caches.open('gsnv-launcher-legacy-test').then(cache => cache.match('/index.html')));
    }
  });`;

async function closeServer(server: Server) {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

function launch(port: number, cwd: string) {
  const wrapper = join(root, process.platform === 'win32' ? 'run.cmd' : process.platform === 'darwin' ? 'run.command' : 'run.sh');
  const windows = process.platform === 'win32';
  // cmd.exe requires its outer quotes around a quoted .cmd path with spaces.
  const command = windows ? process.env.ComSpec ?? 'cmd.exe' : wrapper;
  const args = windows ? ['/d', '/s', '/c', `""${wrapper}" --offline --no-browser"`] : ['--offline', '--no-browser'];
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, GSNV_PAINT_PORT: String(port), GSNV_PAINT_NO_OPEN: '1', GSNV_PAINT_NO_PAUSE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !windows,
    windowsVerbatimArguments: windows,
  });
  let output = '', launchError: Error | undefined;
  child.stdout!.on('data', bytes => { output += bytes; });
  child.stderr!.on('data', bytes => { output += bytes; });
  child.on('error', error => { launchError = error; });
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  return {
    output: () => output,
    async ready() {
      let entry = '';
      await expect.poll(() => {
        if (launchError) throw launchError;
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Native launcher exited (${child.exitCode ?? child.signalCode}):\n${output}`);
        entry = output.match(/gsnv-paint is running at (http:\/\/127\.0\.0\.1:\d+\/__gsnv-local__\/start\/[a-f0-9]{64})/)?.[1] ?? '';
        return entry;
      }, { timeout: 180_000, message: `Waiting for ${wrapper} to build and serve the current app`, intervals: [100, 250, 1000] }).not.toBe('');
      return entry;
    },
    async stop() {
      if (child.pid && child.exitCode === null) {
        if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', timeout: 10_000 });
        else {
          try { process.kill(-child.pid, 'SIGTERM'); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
        }
      }
      await closed;
    },
  };
}

test('native launcher replaces the cached MVP with the full local editor while retaining stored work', async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Exercise ordinary download export on all three OSes, without a system picker.
  await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  const cwd = await mkdtemp(join(tmpdir(), 'gsnv launcher outside folder '));
  const legacy = createServer((request, response) => {
    const worker = request.url === '/legacy-sw.js';
    response.writeHead(200, { ...isolation, 'Cache-Control': 'no-store',
      'Content-Type': worker ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
    response.end(worker ? legacyWorker : legacyHtml);
  });
  let run: ReturnType<typeof launch> | undefined;
  try {
    await new Promise<void>(resolve => legacy.listen(0, '127.0.0.1', resolve));
    const address = legacy.address();
    if (!address || typeof address === 'string') throw new Error('Legacy fixture did not bind a TCP port.');
    const origin = `http://127.0.0.1:${address.port}`;
    await page.goto(origin + '/legacy-setup');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/legacy-sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      localStorage.setItem('gsnv-launcher-saved-work', 'preserve this project');
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('gsnv-launcher-saved-work', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('projects');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, transaction = db.transaction('projects', 'readwrite');
          transaction.objectStore('projects').put({ title: 'Saved drawing', pixels: [1, 2, 3, 255] }, 'sentinel');
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
      });
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const obsolete = await page.goto(origin + '/');
    expect(obsolete?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('tab')).toHaveCount(3);
    await expect(page.getByText('CAD editing is not available in this development build.')).toBeVisible();
    await closeServer(legacy);

    // A different cwd proves that each wrapper resolves its own repository. CI
    // additionally checks out the entire repository under a path with spaces.
    run = launch(address.port, cwd);
    const entry = await run.ready();
    expect(entry.startsWith(origin + '/__gsnv-local__/start/')).toBe(true);
    // The stale worker really remains capable of serving the MVP at the root.
    const stillObsolete = await page.goto(origin + '/');
    expect(stillObsolete?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('tab')).toHaveCount(3);

    const current = await page.goto(entry);
    expect(current?.fromServiceWorker()).toBe(false);
    await expect(page.getByRole('tablist', { name: 'Workspace' }).getByRole('tab')).toHaveCount(9);
    for (const name of ['Image', 'CAD', 'Photo', 'Video', 'Document', 'Slides', 'Audio', 'Spreadsheet', 'Code']) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Image', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.gc-local-runtime summary')).toContainText('Local ·');
    await expect(page.getByText(/editing is not available in this development build/)).not.toBeVisible();
    const canvas = page.locator('.image-canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('width', '800');
    await expect(canvas).toHaveAttribute('height', '600');
    await page.locator('.gc-palette [data-command="image.pencil"]').click();
    await page.locator('[data-color="#000000"]').click();
    await page.locator('input[type="number"][data-option="size"]').fill('5');
    await page.keyboard.press('Enter');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('The initial image canvas has no visible bounds.');
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => [...element.getContext('2d')!.getImageData(400, 300, 1, 1).data])).toEqual([0, 0, 0, 255]);
    const downloading = page.waitForEvent('download');
    await page.locator('.gc-standard [data-command="file.export"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    const downloaded = await downloading, downloadPath = await downloaded.path();
    if (!downloadPath) throw new Error('PNG export did not produce a local download.');
    const png = await readFile(downloadPath);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(800);
    expect(png.readUInt32BE(20)).toBe(600);

    const storage = await page.evaluate(async () => ({
      local: localStorage.getItem('gsnv-launcher-saved-work'),
      caches: await caches.keys(),
      worker: (await navigator.serviceWorker.getRegistration('/'))?.active?.scriptURL,
      project: await new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('gsnv-launcher-saved-work', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, transaction = db.transaction('projects', 'readonly');
          const value = transaction.objectStore('projects').get('sentinel');
          value.onsuccess = () => resolve(value.result);
          value.onerror = () => reject(value.error);
          transaction.oncomplete = () => db.close();
        };
      }),
    }));
    expect(storage.local).toBe('preserve this project');
    expect(storage.project).toEqual({ title: 'Saved drawing', pixels: [1, 2, 3, 255] });
    expect(storage.caches).toEqual(['gsnv-launcher-legacy-test']);
    expect(storage.worker).toBe(origin + '/legacy-sw.js');
    expect(errors).toEqual([]);
    await testInfo.attach('Current local Paint', { body: await page.screenshot(), contentType: 'image/png' });
  } finally {
    if (run) await testInfo.attach('Native launcher log', { body: run.output(), contentType: 'text/plain' });
    await page.close();
    if (run) await run.stop();
    await closeServer(legacy);
    await rm(cwd, { recursive: true, force: true });
  }
});
