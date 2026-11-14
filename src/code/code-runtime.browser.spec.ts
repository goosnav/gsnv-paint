import { test, expect, type Page } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodeDocument } from './code-document.ts';
import type { createCodeRuntime, CodeRuntimeEvent } from './code-runtime.ts';
declare global { interface Window { runtime: ReturnType<typeof createCodeRuntime>; events: CodeRuntimeEvent[]; finished: boolean } }
let server: PreviewServer, outDir: string, builtBytes = 0; const outbound: string[] = [];
test.beforeAll(async () => {
  outDir = mkdtempSync(join(process.env.CODE_RUNTIME_TEST_TMP ?? tmpdir(), 'gsnv-code-runtime-'));
  await build({ configFile: false, publicDir: false, logLevel: 'error', build: { outDir, emptyOutDir: true, assetsInlineLimit: 0, rollupOptions: { input: fileURLToPath(new URL('./code-runtime.ts', import.meta.url)), preserveEntrySignatures: 'strict', output: { entryFileNames: 'runtime.js' } } } });
  builtBytes = readdirSync(outDir, { recursive: true }).map(path => statSync(join(outDir, String(path)))).filter(stat => stat.isFile()).reduce((sum, stat) => sum + stat.size, 0);
  const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
  server = await preview({ configFile: false, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port: 4189, strictPort: true, headers }, plugins: [{ name: 'runtime-fixture', configurePreviewServer(vite) { vite.middlewares.use((req, res, next) => {
    if (req.url?.startsWith('/__outbound_blocked__')) { outbound.push(req.url); res.end('unexpected network'); return; }
    if (req.url === '/__code_runtime__') { for (const [key, value] of Object.entries(headers)) res.setHeader(key, value); res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><link rel="icon" href="data:,"><div id="runtime"></div>'); return; }
    next();
  }); } }] });
  server.httpServer.on('upgrade', request => { if (request.url?.startsWith('/__outbound_blocked__')) outbound.push(request.url); });
});
test.afterAll(async () => { if (server) await new Promise<void>(resolve => server.httpServer.close(() => resolve())); if (outDir) rmSync(outDir, { recursive: true, force: true }); });
test.beforeEach(async ({ page }) => {
  outbound.length = 0; await page.goto('http://127.0.0.1:4189/__code_runtime__');
  await page.evaluate(async () => { const path = '/runtime.js'; const { createCodeRuntime } = await import(path); window.events = []; window.finished = false; window.runtime = createCodeRuntime({ root: document.querySelector('#runtime'), onEvent: (event: CodeRuntimeEvent) => window.events.push(event) }); });
});
async function run(page: Page, text: string, language: 'javascript' | 'python' | 'html', extra: CodeDocument['files'] = []) {
  const path = language === 'python' ? 'main.py' : language === 'html' ? 'index.html' : 'main.js';
  await page.evaluate(({ text, language, extra, path }) => { window.events = []; window.finished = false; void window.runtime.run([{ path, language, text }, ...extra], path, language).then(() => { window.finished = true; }); }, { text, language, extra, path });
}
const output = (page: Page) => page.evaluate(() => window.events.filter(event => event.type !== 'status').map(event => 'text' in event ? event.text : '').join(''));
const done = (page: Page) => expect.poll(() => page.evaluate(() => window.finished), { timeout: 30000 }).toBe(true);
test('K02 explicit-only JavaScript output, errors and no DOM', async ({ page }) => {
  expect(builtBytes).toBeLessThan(25 * 1024 * 1024); console.log(`K02 isolated production assets: ${builtBytes} bytes`);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.locator('iframe')).toHaveCount(0); expect(await page.evaluate(() => window.events)).toEqual([]);
  await run(page, 'console.log("answer", 6 * 7, typeof document);', 'javascript'); await done(page); expect(await output(page)).toContain('answer 42 undefined');
  console.log(`K02 demo output: ${(await output(page)).trim()}`);
  await run(page, 'throw new Error("intentional fixture");', 'javascript'); await done(page); expect(await output(page)).toContain('intentional fixture');
});
test('K02 Python stdlib/local imports, errors and repeat run', async ({ page }) => {
  await run(page, 'import math\nfrom lib.helper import answer\nprint(math.sqrt(81), answer)\n', 'python', [{ path: 'lib/helper.py', language: 'python', text: 'answer = 42\n' }]);
  await done(page); expect(await output(page)).toContain('9.0 42');
  await run(page, 'raise ValueError("python fixture")', 'python'); await done(page); expect(await output(page)).toContain('python fixture');
});
test('K02 real infinite-loop Stop remains responsive and restart works in both engines', async ({ page }) => {
  for (const language of ['javascript', 'python'] as const) {
    await run(page, language === 'python' ? 'while True: pass' : 'while (true) {}', language);
    await expect.poll(() => page.evaluate(() => window.events.some(event => event.type === 'status' && event.status === 'running')), { timeout: 30000 }).toBe(true);
    await expect.poll(() => page.workers().length).toBe(1);
    await page.waitForTimeout(100); await page.evaluate(() => window.runtime.stop()); await done(page);
    await expect.poll(() => page.workers().length).toBe(0);
    expect(await page.evaluate(() => window.events.at(-1))).toEqual({ type: 'status', status: 'stopped' });
    await run(page, language === 'python' ? 'print("restarted")' : 'console.log("restarted")', language); await done(page); expect(await output(page)).toContain('restarted');
  }
});
test('K02 opaque worker denies editor IndexedDB and network even through Python JS bridge', async ({ page }) => {
  await page.evaluate(async () => { await new Promise<void>((resolve, reject) => { const request = indexedDB.open('gsnv-paint-recent'); request.onupgradeneeded = () => request.result.createObjectStore('projects'); request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); }); });
  await run(page, `console.log("origin", self.origin); try { indexedDB.open("gsnv-paint-recent"); console.log("BAD storage"); } catch(e) { console.log("storage denied", e.name); }
    try { await fetch("http://127.0.0.1:4189/__outbound_blocked__?fetch"); console.log("BAD fetch"); } catch { console.log("fetch denied"); }
    try { await new Promise((resolve, reject) => { const socket = new WebSocket("ws://127.0.0.1:4189/__outbound_blocked__?socket"); socket.onopen = resolve; socket.onerror = reject; }); console.log("BAD socket"); } catch { console.log("socket denied"); }
    try { await import("http://127.0.0.1:4189/__outbound_blocked__?module"); console.log("BAD import"); } catch { console.log("import denied"); }`, 'javascript');
  await done(page); const text = await output(page); expect(text).toContain('origin null'); expect(text).toContain('storage denied SecurityError'); expect(text).not.toContain('BAD'); expect(outbound).toEqual([]);
  await run(page, 'import js, asyncio\ntry:\n js.indexedDB.open("gsnv-paint-recent")\n print("BAD storage")\nexcept Exception:\n print("python storage denied")\nasync def main():\n try:\n  await js.fetch("http://127.0.0.1:4189/__outbound_blocked__?python")\n  print("BAD network")\n except Exception:\n  print("python network denied")\nasyncio.run(main())', 'python');
  await done(page); expect(await output(page)).toContain('python storage denied'); expect(await output(page)).toContain('python network denied'); expect(outbound).toEqual([]);
});
test('K02 direct empty-message floods are capped and disposal settles a running promise', async ({ page }) => {
  await run(page, 'for (let i = 0; i < 3000; i++) postMessage({type:"stdout", text:""}); await new Promise(() => {});', 'javascript'); await done(page);
  expect(await output(page)).toContain('Message limit');
  await run(page, 'await new Promise(() => {});', 'javascript');
  await expect.poll(() => page.evaluate(() => window.events.some(event => event.type === 'status' && event.status === 'running'))).toBe(true);
  await page.evaluate(() => window.runtime.dispose()); await done(page); await expect(page.locator('iframe')).toHaveCount(0);
  const events = await page.evaluate(() => window.events); await run(page, 'throw Error("disposed runtime ran");', 'javascript'); await done(page); expect(await page.evaluate(() => window.events)).toEqual([]); expect(events.at(-1)).toEqual({ type: 'status', status: 'stopped' });
});
test('K02 cached local Python assets work with browser offline and console output is capped', async ({ page, context }) => {
  await run(page, 'print("warm")', 'python'); await done(page); expect(await output(page)).toContain('warm');
  await context.setOffline(true); await run(page, 'print("offline")', 'python'); await done(page); expect(await output(page)).toContain('offline'); await context.setOffline(false);
  await run(page, 'for (let i = 0; i < 100000; i++) console.log("x".repeat(1024));', 'javascript'); await done(page);
  expect((await output(page)).length).toBeLessThanOrEqual(132000); expect(await output(page)).toContain('Output limit');
});
test('K02 missing local runtime asset reports an error and retries without changing source', async ({ page }) => {
  await page.route('**/*.wasm', route => route.fulfill({ status: 503, body: 'unavailable fixture' }));
  await run(page, 'print("retry succeeded")', 'python'); await done(page);
  expect(await output(page)).toContain('Python runtime asset could not be loaded (503)'); await expect(page.locator('iframe')).toHaveCount(0);
  await page.unroute('**/*.wasm'); await run(page, 'print("retry succeeded")', 'python'); await done(page); expect(await output(page)).toContain('retry succeeded');
});
test('K02 HTML/CSS preview is script-free and blocks navigation/remote resources', async ({ page }) => {
  await run(page, '<link rel="stylesheet" href="style.css"><h1 id="hello">Preview</h1><script>parent.postMessage("BAD", "*")</script><meta http-equiv="refresh" content="0;url=/__outbound_blocked__"><img src="/__outbound_blocked__?img"><a href="/__outbound_blocked__">link</a>', 'html', [{ path: 'style.css', language: 'css', text: 'h1 {color:rgb(1, 2, 3)}\n/* </style><meta http-equiv="refresh" content="0;url=http://127.0.0.1:4189/__outbound_blocked__?css"> */\nbody{background-image:url(http://127.0.0.1:4189/__outbound_blocked__?css-image)}' }]);
  await done(page); await expect(page.getByText('HTML/CSS preview does not run scripts.')).toBeVisible();
  const preview = page.frameLocator('iframe[title="HTML/CSS preview"]'); await expect(preview.locator('h1')).toHaveCSS('color', 'rgb(1, 2, 3)');
  await expect(preview.locator('script,meta[http-equiv="refresh"],a[href],img[src]')).toHaveCount(0); await page.waitForTimeout(100); expect(outbound).toEqual([]);
});
