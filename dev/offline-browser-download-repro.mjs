// Browser-only diagnostic: no app, service worker, CacheStorage or IndexedDB.
// DEBUG=pw:browser node dev/offline-browser-download-repro.mjs
// GSNV_DOWNLOAD_MODE=browser uses standard named downloads and keeps their files.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';

const html = `<!doctype html><input aria-label="Typing"><button>Save</button><script>
addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = ''; });
function save() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['fixture download'])); a.download = 'fixture.txt'; a.click(); }
document.querySelector('button').onclick = save;
addEventListener('keydown', e => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); } });
</script>`;
const server = createServer((_request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); response.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const profile = await mkdtemp(join(tmpdir(), 'gsnv-download-repro-')), directory = join(profile, 'downloads');
await mkdir(directory); let context;
const browserDownloads = process.env.GSNV_DOWNLOAD_MODE === 'browser';
async function launch() {
  const value = await chromium.launchPersistentContext(profile, { ...(process.env.GSNV_CHROMIUM === '1' ? { executablePath: chromium.executablePath() } : { channel: 'chrome' }), headless: process.env.GSNV_HEADED !== '1', acceptDownloads: true, downloadsPath: directory });
  console.log('Chrome', value.browser().version(), 'mode', browserDownloads ? 'browser' : 'playwright');
  if (browserDownloads) {
    const cdp = await value.browser().newBrowserCDPSession(), completed = [], pending = [];
    cdp.on('Browser.downloadProgress', event => {
      if (event.state === 'completed') { if (pending.length) pending.shift().resolve(event); else completed.push(event); }
    });
    value.on('close', () => pending.splice(0).forEach(waiter => waiter.reject(new Error('Browser closed before download completion'))));
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory, eventsEnabled: true });
    value.nextCompleted = () => completed.length ? Promise.resolve(completed.shift()) : new Promise((resolve, reject) => pending.push({ resolve, reject }));
  }
  return value;
}
async function download(page, action) {
  if (browserDownloads) {
    const [event] = await Promise.all([context.nextCompleted(), action()]); assert.equal(typeof event.filePath, 'string');
    assert.equal(await readFile(event.filePath, 'utf8'), 'fixture download'); console.log('Completed', event.filePath);
  } else {
    const [file] = await Promise.all([page.waitForEvent('download'), action()]);
    const path = await file.path(); assert.equal(await readFile(path, 'utf8'), 'fixture download'); console.log('Completed', path);
  }
}
try {
  context = await launch(); let page = context.pages()[0]; await page.goto(url);
  await download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click()); await context.close();
  context = await launch(); await context.close();
  context = await launch(); page = context.pages()[0]; await page.goto(url); await page.getByRole('textbox').fill('pending');
  const other = await context.newPage(); await other.goto(url); await other.getByRole('textbox').fill('other'); await page.getByRole('textbox').click();
  const dismissed = new Promise(resolve => page.once('dialog', async dialog => { assert.equal(dialog.type(), 'beforeunload'); await dialog.dismiss(); resolve(); }));
  await page.close({ runBeforeUnload: true }); await dismissed; assert.equal(page.isClosed(), false); await page.getByRole('textbox').click();
  await download(page, () => page.keyboard.press('Control+s')); console.log('Two completed downloads across full browser restarts and native Stay.');
} finally { await context?.close(); await new Promise(resolve => server.close(resolve)); await rm(profile, { recursive: true, force: true }); }
