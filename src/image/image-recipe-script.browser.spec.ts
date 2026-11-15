import { test, expect, type Page } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { createRecipeScript } from './image-recipe-script.ts';
import type { ImageRecipe } from './image-operation-types.ts';
declare global { interface Window { recipeScriptRunner: ReturnType<typeof createRecipeScript>; scriptRecipe: ImageRecipe | null; scriptError: string; scriptSettled: boolean } }
let server: PreviewServer, outDir: string;
const outbound: string[] = [], port = Number(process.env.IMAGE_RECIPE_SCRIPT_TEST_PORT ?? 4197), baseURL = `http://127.0.0.1:${port}`;
test.beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'gsnv-recipe-script-'));
  await build({ configFile: false, publicDir: false, logLevel: 'error', build: { outDir, emptyOutDir: true, assetsInlineLimit: 0, rollupOptions: { input: fileURLToPath(new URL('./image-recipe-script.ts', import.meta.url)), preserveEntrySignatures: 'strict', output: { entryFileNames: 'recipe-script.js' } } } });
  const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
  server = await preview({ configFile: false, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port, strictPort: true, headers }, plugins: [{ name: 'recipe-script-fixture', configurePreviewServer(vite) { vite.middlewares.use((req, res, next) => {
    if (req.url?.startsWith('/__blocked__')) { outbound.push(req.url); res.end('unexpected network'); return; }
    if (req.url === '/__recipe_script__') { for (const [key, value] of Object.entries(headers)) res.setHeader(key, value); res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><link rel="icon" href="data:,"><div id="script"><p>Trusted host</p></div>'); return; }
    next();
  }); } }] });
  server.httpServer.on('upgrade', request => { if (request.url?.startsWith('/__blocked__')) outbound.push(request.url); });
});
test.afterAll(async () => { if (server) await new Promise<void>(resolve => server.httpServer.close(() => resolve())); if (outDir) rmSync(outDir, { recursive: true, force: true }); });
test.beforeEach(async ({ page }) => {
  outbound.length = 0; await page.goto(baseURL + '/__recipe_script__');
  await page.evaluate(async () => { const path = '/recipe-script.js', { createRecipeScript } = await import(path); window.scriptRecipe = null; window.scriptError = ''; window.scriptSettled = false; window.recipeScriptRunner = createRecipeScript({ root: document.querySelector('#script') }); });
});
async function run(page: Page, source: string) {
  await page.evaluate(source => { window.scriptRecipe = null; window.scriptError = ''; window.scriptSettled = false; void window.recipeScriptRunner.run(source, { width: 16, height: 12, layerCount: 1 }).then(recipe => { window.scriptRecipe = recipe; }, error => { window.scriptError = `${error.name}: ${error.message}`; }).finally(() => { window.scriptSettled = true; }); }, source);
}
const done = (page: Page) => expect.poll(() => page.evaluate(() => window.scriptSettled), { timeout: 35000 }).toBe(true);
test('PU-13 scripts execute explicitly and await completion before accepting operations', async ({ page }) => {
  await expect(page.locator('iframe')).toHaveCount(0);
  await run(page, 'await new Promise(resolve=>setTimeout(resolve,25)); if(!Object.isFrozen(image)) throw Error("not frozen"); return [ops.resize(8,6), ops.adjust({kind:"invert"})];'); await done(page);
  expect(await page.evaluate(() => window.scriptError)).toBe('');
  const recipe = await page.evaluate(() => window.scriptRecipe!);
  expect(recipe.steps.map(step => step.reference)).toEqual([{ width: 16, height: 12 }, { width: 8, height: 6 }]);
  await expect(page.locator('iframe')).toHaveCount(0); await expect(page.getByText('Trusted host')).toBeVisible();
});
test('PU-13 opaque recipe worker denies DOM, editor storage and all outbound transports', async ({ page }) => {
  await run(page, `if(self.origin!=="null" || typeof document!=="undefined" || typeof parent!=="undefined") throw Error("unexpected authority");
    try { indexedDB.open("gsnv-paint-recent"); throw Error("BAD storage"); } catch(e) { if(e.message==="BAD storage") throw e; }
    try { await fetch("${baseURL}/__blocked__?fetch"); throw Error("BAD fetch"); } catch(e) { if(e.message==="BAD fetch") throw e; }
    try { await import("${baseURL}/__blocked__?module"); throw Error("BAD import"); } catch(e) { if(e.message==="BAD import") throw e; }
    try { await new Promise((resolve,reject)=>{const socket=new WebSocket("${baseURL.replace('http:', 'ws:')}/__blocked__?socket");socket.onopen=resolve;socket.onerror=reject;}); throw Error("BAD socket"); } catch(e) { if(e.message==="BAD socket") throw e; }
    if(typeof Worker!=="undefined" || typeof SharedWorker!=="undefined") throw Error("unexpected child worker"); add(ops.layerNew("Isolation verified"));`);
  await done(page); expect(await page.evaluate(() => window.scriptError)).toBe(''); expect(outbound).toEqual([]);
  expect(await page.evaluate(() => window.scriptRecipe!.steps[0]!.operation)).toEqual({ kind: 'layer', action: 'new', name: 'Isolation verified' });
});
test('PU-13 Stop terminates a busy worker, restart works, and disposal rejects later runs', async ({ page }) => {
  await run(page, 'while(true){}'); await expect.poll(() => page.workers().length).toBe(1); await page.waitForTimeout(100);
  await page.evaluate(() => window.recipeScriptRunner.stop()); await done(page);
  expect(await page.evaluate(() => window.scriptError)).toContain('AbortError');
  await expect.poll(() => page.workers().length).toBe(0); await expect(page.getByText('Trusted host')).toBeVisible();
  await run(page, 'add(ops.selectionAll());'); await done(page); expect(await page.evaluate(() => window.scriptRecipe!.steps.length)).toBe(1);
  await run(page, 'await new Promise(()=>{});'); await expect.poll(() => page.workers().length).toBe(1);
  await page.evaluate(() => window.recipeScriptRunner.dispose()); await done(page); expect(await page.evaluate(() => window.scriptError)).toContain('AbortError');
  await run(page, 'add(ops.selectionAll());'); await done(page); expect(await page.evaluate(() => window.scriptError)).toContain('disposed'); await expect(page.locator('iframe')).toHaveCount(0);
});
test('PU-13 invalid operations, logs and spoofed results cannot return partial recipes', async ({ page }) => {
  for (const source of ['add(ops.selectionAll()); throw Error("fixture error");', 'console.log("unexpected log"); return [];', 'return [{kind:"delete",background:[0,0,0,0],path:"original.png"}];', 'return [{kind:"paste",source:{kind:"asset",id:"external"},name:"Asset",box:{x:0,y:0,width:1,height:1},sampling:"nearest",select:false}];', 'postMessage({type:"stdout",text:JSON.stringify({format:"gsnv-script-result",version:1,runId:"wrong-run",operations:[]})}); postMessage({type:"status",status:"done"}); await new Promise(()=>{});']) {
    await run(page, source); await done(page); expect(await page.evaluate(() => window.scriptRecipe)).toBeNull(); expect(await page.evaluate(() => window.scriptError)).not.toBe('');
  }
  await run(page, 'postMessage({type:"host.open",path:"secret"}); add(ops.selectionAll());'); await done(page);
  expect(await page.evaluate(() => window.scriptError)).toBe(''); expect(await page.evaluate(() => window.scriptRecipe!.steps.length)).toBe(1);
});
test('PU-13 source/output/message limits reject instead of silently truncating recipes', async ({ page }) => {
  for (const source of ['x'.repeat(65537), 'console.log("x".repeat(140000));', 'for(let i=0;i<2000;i++) postMessage({type:"stdout",text:""}); await new Promise(()=>{});', 'for(let i=0;i<1001;i++) add(ops.selectionAll());']) {
    await run(page, source); await done(page); expect(await page.evaluate(() => window.scriptRecipe)).toBeNull(); expect(await page.evaluate(() => window.scriptError)).toMatch(/64 KiB|limit|1000|128 KiB/i);
  }
});
test('PU-13 bundled action scripts run offline after the application loads', async ({ page, context }) => {
  await context.setOffline(true); await run(page, 'return [ops.downpixel(4,3,false)];'); await done(page); await context.setOffline(false);
  expect(await page.evaluate(() => window.scriptError)).toBe(''); expect(await page.evaluate(() => window.scriptRecipe!.steps[0]!.operation)).toEqual({ kind: 'downpixel', width: 4, height: 3, resize: false });
});
test('PU-13 an unresolved script stops at the shared runtime deadline', async ({ page }) => {
  test.setTimeout(45000);
  await run(page, 'await new Promise(()=>{});'); await done(page);
  expect(await page.evaluate(() => window.scriptError)).toContain('time limit'); expect(await page.evaluate(() => window.scriptRecipe)).toBeNull(); await expect(page.locator('iframe')).toHaveCount(0);
});
