import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { cp, copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { offlineManifest, type OfflineManifest } from './offline-manifest.ts';
import { offlineTestServer } from '../../dev/offline-test-server.ts';
import { authoringJourneys } from '../../dev/offline-authoring-journeys.ts';
import { mediaJourneys } from '../../dev/offline-media-journeys.ts';
import { cadJourney, codeJourney } from '../../dev/offline-cad-code-journeys.ts';
import { command, download } from '../../dev/offline-journey-helpers.ts';
import { documentStorage } from '../../dev/offline-storage-evidence.ts';
import { nativeContainer } from './native-container.ts';

const candidates = resolve(process.env.GSNV_OFFLINE_CANDIDATES ?? '/tmp/gsnv-consumer-qa/offline-production');
const evidence = '/tmp/gsnv-consumer-qa/offline-production-evidence';
let a: OfflineManifest, b: OfflineManifest;
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  [a, b] = await Promise.all(['a', 'b'].map(async directory => {
    const root = join(candidates, directory), manifest = offlineManifest(JSON.parse(await readFile(join(root, 'offline-manifest.json'), 'utf8')));
    for (const asset of manifest.assets) {
      const bytes = await readFile(join(root, decodeURIComponent(asset.url))); expect(bytes.length).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    }
    return manifest;
  })) as [OfflineManifest, OfflineManifest];
  expect(a.build).not.toBe(b.build);
});
async function launch(profile: string, offline = false) {
  const executablePath = process.env.GSNV_OFFLINE_CHROME_PATH;
  const context = await chromium.launchPersistentContext(profile, { ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: true, serviceWorkers: 'allow', offline, viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  context.setDefaultTimeout(15_000); context.setDefaultNavigationTimeout(30_000);
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
    const printed: Record<string, string> = {}; (window as unknown as { offlinePrints: typeof printed }).offlinePrints = printed;
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) {
      if (node instanceof HTMLIFrameElement && (node.classList.contains('doc-print') || node.classList.contains('slides-print'))) printed[node.className] = node.srcdoc;
    } }).observe(document, { childList: true, subtree: true });
  }); return context;
}
const summary = (page: Page) => page.locator('.gc-offline > summary');
async function ready(page: Page, build: string, updateReady = false) {
  await expect(summary(page)).toHaveText(updateReady ? 'Update ready — reopen' : 'Ready offline', { timeout: 90_000 });
  expect(await page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="gsnv-build-id"]')?.content)).toBe(build);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller && crossOriginIsolated)).toBe(true);
}
async function action(page: Page, name: string) {
  const details = page.locator('details.gc-offline'); if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await summary(page).click();
  await page.getByRole('button', { name, exact: true }).click();
}
function observe(context: BrowserContext, origin: string) {
  const errors: string[] = [], consoleErrors: string[] = [], requests: { url: string; method: string; bytes: number }[] = [], responses: { url: string; fromServiceWorker: boolean; type: string | null; isolated: boolean }[] = [];
  const observePage = (page: Page) => { page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); }); };
  context.pages().forEach(observePage); context.on('page', observePage);
  context.on('request', request => { if (/^https?:/.test(request.url())) requests.push({ url: request.url(), method: request.method(), bytes: request.postDataBuffer()?.length ?? 0 }); });
  context.on('response', response => {
    const headers = response.headers(); responses.push({ url: response.url(), fromServiceWorker: response.fromServiceWorker(), type: headers['content-type'] ?? null,
      isolated: headers['cross-origin-opener-policy'] === 'same-origin' && headers['cross-origin-embedder-policy'] === 'require-corp' && headers['cross-origin-resource-policy'] === 'same-origin' });
  });
  return { errors, consoleErrors, requests, responses, verify(expectedSandboxFailures = false) {
    expect(errors).toEqual([]); expect(requests.filter(request => new URL(request.url).origin !== origin || request.method !== 'GET' || request.bytes > 0)).toEqual([]);
    expect(requests.some(request => request.url.includes('7391'))).toBe(false);
    const blockedScript = "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";
    expect(consoleErrors.filter(message => !expectedSandboxFailures || message !== blockedScript)).toEqual([]);
  } };
}

test('OFFLINE production survives complete Chrome shutdown and first-use editing/export in all nine workspaces with the server stopped', async () => {
  test.setTimeout(360_000); const profile = await mkdtemp(join(tmpdir(), 'gsnv-offline-cold-'));
  let server: Awaited<ReturnType<typeof offlineTestServer>> | undefined = await offlineTestServer(join(candidates, 'a'), 4217);
  let context = await launch(profile); const url = server.url, online = observe(context, new URL(url).origin);
  try {
    let page = context.pages()[0]!; await page.goto(url); await page.getByRole('tab', { name: 'Document', exact: true }).click(); await ready(page, a.build);
    expect(page.workers()).toHaveLength(0); // No CAD, RAW or Python warmup in this browser process.
    await summary(page).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('group', { name: 'Offline setup' })).toBeVisible();
    await page.keyboard.press('Space'); await expect(page.getByRole('group', { name: 'Offline setup' })).not.toBeVisible(); await expect(summary(page)).toBeFocused();
    expect(await page.getByRole('dialog').count()).toBe(0); online.verify();
    await context.close(); await server.close(); server = undefined;
    context = await launch(profile, true); const offline = observe(context, new URL(url).origin); page = context.pages()[0]!;
    await page.goto(url); await ready(page, a.build); expect(page.workers()).toHaveLength(0); console.log('COLD root ready after complete browser restart, server stopped.');
    await cadJourney(page, evidence); console.log('COLD CAD solver/kernel/native/STEP complete.');
    await authoringJourneys(page, evidence); console.log('COLD Document/Slides/Spreadsheet edit/native/export complete.');
    await mediaJourneys(page, evidence); console.log('COLD Image/RAW/Audio/Video edit/native/export complete.');
    await codeJourney(page, evidence); console.log('COLD JS/Python stdlib/HTML/CSS/Stop/native/export complete.');
    expect(await page.evaluate(() => document.fonts.check('12px Tahoma'))).toBe(true); expect(await page.locator('.gc-workspaces svg').count()).toBeGreaterThan(0);
    for (const family of ['replicad_single-', 'planegcs-', 'libraw-', 'pyodide.asm-', 'python_stdlib-']) {
      expect(offline.responses.some(response => response.url.includes(family) && response.fromServiceWorker && response.isolated), `First offline ${family} request must come from the verified cache`).toBe(true);
    }
    const range = await page.evaluate(async url => { const response = await fetch(url, { headers: { Range: 'bytes=0-3' } }); return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }; }, a.assets.find(asset => asset.url.includes('replicad_single-') && asset.url.endsWith('.wasm'))!.url);
    expect(range).toEqual({ status: 206, bytes: [0, 97, 115, 109] });
    expect(offline.responses.filter(response => response.fromServiceWorker && !response.isolated)).toEqual([]); offline.verify(true);
    await writeFile(join(evidence, 'cold-offline.json'), JSON.stringify({ build: a.build, browser: context.browser()!.version(), executablePath: process.env.GSNV_OFFLINE_CHROME_PATH ?? 'system Chrome', files: a.assets.length, bytes: a.assets.reduce((sum, asset) => sum + asset.bytes, 0), online, offline }, null, 2));
  } catch (error) {
    const page = context.pages()[0]; if (page && !page.isClosed()) { await page.screenshot({ path: join(evidence, 'cold-failure.png') }); await writeFile(join(evidence, 'cold-failure.html'), await page.content()); }
    throw error;
  } finally { await context.close(); await server?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('OFFLINE failed full-build updates preserve A through cold restarts; complete B waits for dirty tabs and native close warnings', async () => {
  test.setTimeout(360_000); const profile = await mkdtemp(join(tmpdir(), 'gsnv-offline-update-')); const server = await offlineTestServer(join(candidates, 'a'), 4217);
  let context = await launch(profile); const url = server.url, lazy = b.assets.find(asset => asset.url.includes('python_stdlib-'))!.url;
  try {
    let page = context.pages()[0]!; await page.goto(url); await ready(page, a.build); server.setRoot(join(candidates, 'b'));
    for (const kind of ['status', 'bytes', 'headers'] as const) {
      server.setFault({ path: lazy, kind }); await action(page, kind === 'status' ? 'Check for updates' : 'Retry offline setup');
      await expect(page.getByRole('group', { name: 'Offline setup' })).toContainText('Update failed. Your current offline copy remains ready.', { timeout: 90_000 }); await ready(page, a.build);
      await context.close(); context = await launch(profile, true); page = context.pages()[0]!; await page.goto(url); await ready(page, a.build);
      if (kind === 'status') { await cadJourney(page, evidence); await codeJourney(page, evidence); }
      expect(await page.evaluate(async url => (await fetch(url)).status, lazy)).toBe(200);
      await context.setOffline(false);
    }
    const other = await context.newPage(); await other.goto(url); await ready(other, a.build);
    await page.getByRole('tab', { name: 'Document', exact: true }).click(); await page.getByRole('button', { name: 'New blank document' }).click();
    const document = page.locator('.doc-page'); await document.click(); await page.keyboard.insertText('pending document 7391');
    await other.getByRole('tab', { name: 'Code', exact: true }).click();
    if (await other.getByRole('button', { name: 'New JavaScript project', exact: true }).count()) await other.getByRole('button', { name: 'New JavaScript project', exact: true }).click();
    const code = other.getByRole('textbox', { name: 'Source code' }); await code.click(); await other.keyboard.press('Control+a'); await other.keyboard.insertText('// pending code 7391');
    server.setFault(); const candidate = context.waitForEvent('serviceworker'); await action(page, 'Check for updates'); const waiting = await candidate;
    await document.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' during update');
    await expect(page.getByRole('group', { name: 'Offline setup' })).toContainText('Update ready.', { timeout: 90_000 }); await expect(document).toBeFocused();
    await expect(document).toHaveText('pending document 7391 during update'); await expect(code).toHaveText('// pending code 7391'); await ready(page, a.build, true); await ready(other, a.build, true);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction; (window as unknown as { offlineTransaction: typeof original }).offlineTransaction = original;
      IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) { if (args[1] === 'readwrite') throw new DOMException('Fixture storage denied', 'SecurityError'); return original.apply(this, args); };
    });
    await document.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' before close');
    let stayed = false; const dismissed = new Promise<void>(resolve => page.once('dialog', async dialog => { expect(dialog.type()).toBe('beforeunload'); stayed = true; await dialog.dismiss(); resolve(); }));
    await page.close({ runBeforeUnload: true }); await dismissed; expect(stayed).toBe(true); expect(page.isClosed()).toBe(false);
    await expect(document).toHaveText('pending document 7391 during update before close');
    await page.evaluate(() => { IDBDatabase.prototype.transaction = (window as unknown as { offlineTransaction: typeof IDBDatabase.prototype.transaction }).offlineTransaction; });
    await page.bringToFront(); await document.click(); await expect(document).toBeFocused();
    const saved = await download(page, () => page.keyboard.press('Control+s')); await code.click(); await download(other, () => other.keyboard.press('Control+s'));
    await writeFile(join(evidence, 'update-saved-A.gsnv-document'), saved.bytes);
    const savedProject = nativeContainer({ op: 'decode', parts: [saved.bytes] }).project;
    expect(JSON.stringify(savedProject.content)).toContain('pending document 7391 during update before close');
    const storageEvidence: Record<string, unknown> = { buildA: a.build, buildB: b.build, browser: context.browser()!.version(), savedProject,
      beforeSavedTabCloses: await documentStorage(page) };
    const nativeCloseWarnings: string[] = [];
    const closeSaved = async (target: Page, name: string) => {
      const handleDialog = async (dialog: import('@playwright/test').Dialog) => {
        expect(dialog.type()).toBe('beforeunload'); nativeCloseWarnings.push(name); await dialog.accept();
      };
      target.on('dialog', handleDialog);
      try { await Promise.all([target.waitForEvent('close'), target.close({ runBeforeUnload: true })]); }
      finally { target.off('dialog', handleDialog); }
    };
    await page.screenshot({ path: join(evidence, 'update-waiting.png') });
    await closeSaved(page, 'Document');
    await ready(other, a.build, true); await expect(code).toHaveText('// pending code 7391');
    storageEvidence.afterDocumentTabClose = await documentStorage(other);
    await closeSaved(other, 'Code');
    await expect.poll(() => waiting.evaluate(() => !(self as unknown as { registration: ServiceWorkerRegistration }).registration.waiting)).toBe(true);
    storageEvidence.beforeBStartup = await documentStorage(waiting);
    const reopened = await context.newPage(); await reopened.goto(url); await ready(reopened, b.build);
    await reopened.getByRole('tab', { name: 'Document', exact: true }).click();
    storageEvidence.afterBStartup = await documentStorage(reopened); storageEvidence.nativeCloseWarnings = nativeCloseWarnings;
    await writeFile(join(evidence, 'update-storage.json'), JSON.stringify(storageEvidence, null, 2));
    await expect(reopened.locator('.doc-page')).toHaveText('pending document 7391 during update before close');
    // Recovered projects are dirty; save the restored version before opening the same ID.
    const recovered = await download(reopened, () => reopened.keyboard.press('Control+s')); expect(recovered.bytes).toEqual(saved.bytes);
    const chooser = reopened.waitForEvent('filechooser'); await command(reopened, 'file.open').click(); await (await chooser).setFiles({ name: saved.name, mimeType: 'application/octet-stream', buffer: saved.bytes });
    await expect(reopened.locator('[data-panel-history] li')).toHaveText(['Current state']);
    await expect(reopened.locator('.doc-page')).toHaveText('pending document 7391 during update before close');
    await reopened.locator('.doc-page').click(); await reopened.keyboard.press('Control+End'); await reopened.keyboard.insertText(' edited in B');
    await expect(reopened.locator('.doc-page')).toHaveText('pending document 7391 during update before close edited in B');
    await writeFile(join(evidence, 'update.json'), JSON.stringify({ buildA: a.build, buildB: b.build, browser: context.browser()!.version(), executablePath: process.env.GSNV_OFFLINE_CHROME_PATH ?? 'system Chrome', faults: ['status', 'bytes', 'headers'], blockedUnload: stayed, requests: server.requests }, null, 2));
  } finally { await context.close(); await server.close(); await rm(profile, { recursive: true, force: true }); }
});

test('OFFLINE eviction and denied storage fail visibly, retry repairs, and foreign messages cannot mutate installation', async () => {
  test.setTimeout(120_000); const profile = await mkdtemp(join(tmpdir(), 'gsnv-offline-repair-')), server = await offlineTestServer(join(candidates, 'a'), 4217), context = await launch(profile);
  try {
    const page = context.pages()[0]!; await page.goto(server.url); await ready(page, a.build); const lazy = a.assets.find(asset => asset.url.includes('python_stdlib-'))!.url;
    await page.evaluate(async ({ build, lazy }) => { const name = (await caches.keys()).find(name => name.startsWith(`gsnv-paint:offline:v1:build:${build}:`))!; await (await caches.open(name)).delete(lazy); }, { build: a.build, lazy });
    await action(page, 'Check for updates'); await expect(summary(page)).toHaveText('Offline unavailable'); await expect(page.getByRole('group', { name: 'Offline setup' })).toContainText('missing or changed');
    await page.getByRole('tab', { name: 'Document', exact: true }).click(); await page.getByRole('button', { name: 'New blank document' }).click(); await page.locator('.doc-page').fill('online editing remains available 7391');
    await action(page, 'Retry offline setup'); await ready(page, a.build); await expect(page.locator('.doc-page')).toHaveText('online editing remains available 7391');
    const worker = context.serviceWorkers()[0]!;
    await worker.evaluate(() => { const cache = caches as CacheStorage & { savedOpen: CacheStorage['open'] }; cache.savedOpen = cache.open; cache.open = async () => { throw new DOMException('Fixture denial', 'SecurityError'); }; });
    await action(page, 'Check for updates'); await expect(summary(page)).toHaveText('Offline unavailable'); await expect(page.getByRole('group', { name: 'Offline setup' })).toContainText('allow site storage');
    await worker.evaluate(() => { const cache = caches as CacheStorage & { savedOpen: CacheStorage['open'] }; cache.open = cache.savedOpen; });
    await action(page, 'Retry offline setup'); await ready(page, a.build);
    const keys = await page.evaluate(() => caches.keys());
    await page.evaluate(async () => {
      const frame = document.createElement('iframe'); frame.sandbox.add('allow-scripts'); frame.srcdoc = '<script>parent.postMessage({protocol:1,type:"ready",build:"' + 'f'.repeat(64) + '"},"*")</script>'; document.body.append(frame);
      navigator.serviceWorker.controller!.postMessage({ protocol: 1, type: 'retry', requestId: 'forged', pageBuild: 'bad', urls: ['/private-source-7391'] });
      await new Promise(resolve => setTimeout(resolve, 100)); frame.remove();
    });
    expect(await page.evaluate(() => caches.keys())).toEqual(keys); await ready(page, a.build); expect(server.requests.some(request => request.path.includes('private-source-7391'))).toBe(false);
    const missing = await page.evaluate(async () => { const response = await fetch('/assets/missing-offline.js'); return { status: response.status, type: response.headers.get('content-type'), body: await response.text() }; });
    expect(missing.status).toBe(404); expect(missing.type).not.toContain('text/html'); expect(missing.body).not.toContain('<!doctype');
    await page.screenshot({ path: join(evidence, 'repair-ready.png') });
  } finally { await context.close(); await server.close(); await rm(profile, { recursive: true, force: true }); }
});

test('OFFLINE first installation refuses to claim an unresponsive existing same-origin window', async () => {
  test.setTimeout(120_000); const profile = await mkdtemp(join(tmpdir(), 'gsnv-offline-unresponsive-')), server = await offlineTestServer(join(candidates, 'a'), 4217), context = await launch(profile);
  try {
    // A plain static page cannot answer the app-build handshake. It must not be claimed.
    const unrelated = context.pages()[0]!; await unrelated.goto(server.url + 'THIRD_PARTY_NOTICES.txt');
    const page = await context.newPage(); await page.goto(server.url);
    await expect(summary(page)).toHaveText('Reopen to enable offline', { timeout: 90_000 });
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull(); expect(await unrelated.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    await unrelated.close(); await page.close(); const reopened = await context.newPage(); await reopened.goto(server.url); await ready(reopened, a.build);
  } finally { await context.close(); await server.close(); await rm(profile, { recursive: true, force: true }); }
});

test('LOCAL real launcher serves the frozen production build without duplicate offline caches and retains projects across restarts', async () => {
  test.setTimeout(120_000); const directory = await mkdtemp(join(tmpdir(), 'gsnv-offline-launcher-')), root = join(directory, 'app'), profile = join(directory, 'profile');
  const port = 4218, origin = `http://127.0.0.1:${port}`, entry = `${origin}/__gsnv-local__/start/${a.build}`;
  // The candidate was built before this suite. Copy its complete source inputs and
  // launcher modules, then record verified identities; do not rebuild shared dist
  // or substitute timestamp tricks for the launcher's current freshness contract.
  const { inspectBuild, installedDependenciesMatch, installedLockId, sourceState, writeLocalState } = await import(pathToFileURL(resolve('launcher/freshness.mjs')).href);
  let output = '';
  function startLocal() {
    const child = spawn(process.execPath, [join(root, 'launcher/start.mjs'), '--offline', '--no-browser'], {
      cwd: root, env: { ...process.env, GSNV_PAINT_PORT: String(port), GSNV_PAINT_NO_OPEN: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let current = '', error: Error | undefined;
    const record = (bytes: Buffer) => { current += bytes; output += bytes; };
    child.stdout.on('data', record); child.stderr.on('data', record); child.on('error', cause => { error = cause; });
    const exited = new Promise<void>(done => child.once('close', () => done()));
    return {
      async ready() {
        await expect.poll(() => {
          if (error) throw error;
          if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Launcher exited before serving: ${current}`);
          return current;
        }, { timeout: 30_000 }).toContain(`is running at ${entry}`);
        expect(current).not.toContain('Building gsnv-paint'); expect(current).not.toContain('Installing locked');
      },
      async stop() { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; },
    };
  }
  let context: BrowserContext | undefined, run: ReturnType<typeof startLocal> | undefined;
  try {
    await mkdir(join(root, 'dev'), { recursive: true });
    for (const path of ['src', 'public', 'launcher', 'vendor']) await cp(resolve(path), join(root, path), { recursive: true });
    for (const path of ['vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json', 'index.html',
      'dev/offline-build.ts', 'dev/prepare-planegcs.mjs', 'dev/planegcs-declarations.json']) await copyFile(resolve(path), join(root, path));
    await symlink(resolve('node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await cp(join(candidates, 'a'), join(root, 'dist'), { recursive: true });
    const state = await sourceState(root), frozen = await inspectBuild(root);
    expect(frozen?.buildId).toBe(a.build); expect(await installedDependenciesMatch(root)).toBe(true);
    await writeLocalState(root, 'build', { schema: 1, ...state, ...frozen });
    await writeLocalState(root, 'dependencies', { schema: 1, dependencyId: state.dependencyId, installedLockId: await installedLockId(root) });

    run = startLocal(); await run.ready();
    const identityResponse = await fetch(`${origin}/__gsnv-local__/status`), identity = await identityResponse.json();
    expect(identity).toMatchObject({ app: 'gsnv-paint', buildId: a.build, sourceId: state.sourceId, checkoutId: state.checkoutId });
    expect(identityResponse.headers.get('cache-control')).toBe('no-store');
    const wasm = a.assets.find(asset => asset.url.endsWith('.wasm'))!.url;
    for (const path of ['/', '/index.html', `/__gsnv-local__/start/${a.build}`, '/offline-sw.js', '/offline-manifest.json', wasm]) {
      const response = await fetch(origin + path); expect(response.status).toBe(200);
      expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin'); expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp'); expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
      if (path === '/' || path === '/index.html' || path.startsWith('/__gsnv-local__/')) {
        expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.url).toBe(entry);
      }
      else if (!path.startsWith('/assets/')) expect(response.headers.get('cache-control')).toBe('no-cache');
    }
    context = await launch(profile); let page = context.pages()[0]!; await page.goto(entry);
    const localReady = async (page: Page) => {
      await expect(summary(page)).toHaveText(`Local · ${identity.revision}`);
      expect(await page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="gsnv-build-id"]')?.content)).toBe(a.build);
      expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
      expect(await page.evaluate(async () => ({ controller: !!navigator.serviceWorker.controller,
        registrations: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }))).toEqual({ controller: false, registrations: 0, caches: [] });
    };
    await localReady(page); await expect(page.getByRole('tab')).toHaveCount(9);
    await expect(page.getByRole('tab', { name: 'Image', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Document', exact: true }).click(); await page.getByRole('button', { name: 'New blank document' }).click();
    const text = 'Local document survives a complete launcher and browser restart.';
    await page.locator('.doc-page').fill(text); const saved = await download(page, () => page.keyboard.press('Control+s'));
    expect(JSON.stringify(nativeContainer({ op: 'decode', parts: [saved.bytes] }).project.content)).toContain(text);
    await expect.poll(async () => (await documentStorage(page)).filter(record => JSON.stringify(record.project.content).includes(text))
      .map(record => record.database).sort()).toEqual(['gsnv-paint-recent', 'gsnv-paint-recovery']);
    await localReady(page);
    await context.close(); context = undefined; await run.stop(); run = undefined;

    // Local mode intentionally needs its local server; restart it at the same
    // origin so the browser's project/recovery storage stays available.
    run = startLocal(); await run.ready(); context = await launch(profile); page = context.pages()[0]!;
    await page.goto(entry); await localReady(page); await page.getByRole('tab', { name: 'Document', exact: true }).click();
    await expect(page.locator('.doc-page')).toHaveText(text);
    const restored = await download(page, () => page.keyboard.press('Control+s'));
    expect(nativeContainer({ op: 'decode', parts: [restored.bytes] })).toEqual(nativeContainer({ op: 'decode', parts: [saved.bytes] }));
    await localReady(page); expect(await inspectBuild(root)).toEqual(frozen);
    await page.screenshot({ path: join(evidence, 'launcher-local-restarted.png') });
  } finally {
    await context?.close(); await run?.stop(); await writeFile(join(evidence, 'launcher.txt'), output);
    await rm(directory, { recursive: true, force: true });
  }
});
