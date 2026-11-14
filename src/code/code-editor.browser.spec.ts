import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { createCodeEditor } from './code-editor.ts';
import type { CodeDocument } from './code-document.ts';
declare global { interface Window { sourceEditor: ReturnType<typeof createCodeEditor>; sourceChanges: CodeDocument['files'][number][]; sourceCommands: string[] } }
let server: ViteDevServer, cacheDir: string;
test.beforeAll(async () => {
  cacheDir = mkdtempSync(join(process.env.CODE_RUNTIME_TEST_TMP ?? tmpdir(), 'gsnv-code-editor-'));
  server = await createServer({ configFile: false, cacheDir, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: 4190, strictPort: true }, plugins: [{ name: 'editor-fixture', configureServer(vite) { vite.middlewares.use((req, res, next) => {
    if (req.url === '/__code_editor__') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><link rel="icon" href="data:,"><div id="editor" style="height:400px;width:700px"></div><button id="outside">Controls</button>'); return; } next();
  }); } }] }); await server.listen();
});
test.afterAll(async () => { await server?.close(); if (cacheDir) rmSync(cacheDir, { recursive: true, force: true }); });
test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4190/__code_editor__');
  await page.evaluate(async () => { const module = '/src/code/code-editor.ts', { createCodeEditor } = await import(module); window.sourceChanges = []; window.sourceCommands = []; window.sourceEditor = createCodeEditor({ root: document.querySelector('#editor'), onChange: (file: CodeDocument['files'][number]) => window.sourceChanges.push(file), onCommand: (command: string) => { window.sourceCommands.push(command); if (command === 'escape') document.querySelector<HTMLButtonElement>('#outside')!.focus(); } }); window.sourceEditor.render({ path: 'main.js', language: 'javascript', text: 'const answer = 42;\n' }); });
});
test('K03 source editing, indentation, syntax and search never execute source', async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Source code' }); await expect(input).toContainText('const answer = 42;');
  expect(await page.evaluate(() => window.sourceChanges)).toEqual([]); expect(await input.locator('span').count()).toBeGreaterThan(0);
  await input.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText('window.shouldNeverRun = 42;'); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.insertText('console.log("needle");');
  expect(await page.evaluate(() => window.sourceEditor.getText())).toBe('window.shouldNeverRun = 42;\n  console.log("needle");');
  expect(await page.evaluate(() => 'shouldNeverRun' in window)).toBe(false); expect((await page.evaluate(() => window.sourceChanges)).at(-1)?.path).toBe('main.js');
  await page.keyboard.press('Control+f'); await expect(page.locator('.cm-search')).toBeVisible(); await page.locator('.cm-search input[name="search"]').pressSequentially('needle');
  await expect(page.locator('.cm-searchMatch')).toHaveCount(1); await page.keyboard.press('Escape'); await expect(page.locator('.cm-search')).toHaveCount(0);
});
test('K03 switching files retains caret; external render emits no change; keyboard exits and flushes', async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Source code' }); await input.click(); await page.keyboard.press('Control+End');
  await page.evaluate(() => { window.sourceEditor.render({ path: 'helper.py', language: 'python', text: 'print(7)\n' }); window.sourceEditor.render({ path: 'main.js', language: 'javascript', text: 'const answer = 42;\n' }); window.sourceEditor.focus(); });
  await page.keyboard.insertText('// tail'); expect(await page.evaluate(() => window.sourceEditor.getText())).toBe('const answer = 42;\n// tail');
  const count = await page.evaluate(() => window.sourceChanges.length); await page.evaluate(() => window.sourceEditor.render({ path: 'main.js', language: 'javascript', text: 'restored' })); expect(await page.evaluate(() => window.sourceChanges.length)).toBe(count);
  await page.keyboard.press('Control+s'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+Enter');
  expect(await page.evaluate(() => window.sourceCommands)).toEqual(['flush', 'flush', 'run']); expect(await page.evaluate(() => window.sourceEditor.getText())).toBe('restored');
  await page.keyboard.press('Escape'); await expect(page.locator('#outside')).toBeFocused();
  await page.evaluate(() => { window.sourceEditor.dispose(); window.sourceEditor.dispose(); }); await expect(page.locator('#editor')).toBeEmpty();
});
