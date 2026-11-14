import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offlineWorkerFixture } from '../../dev/offline-worker-fixture.ts';
import { offlineTestServer } from '../../dev/offline-test-server.ts';

test('S19 real Chrome installs, reloads offline and defers a complete update until all tabs close', async ({ browser }) => {
  const directory = await mkdtemp(join(tmpdir(), 'gsnv-offline-worker-'));
  const a = await offlineWorkerFixture(join(directory, 'a'), 'a'.repeat(64));
  const b = await offlineWorkerFixture(join(directory, 'b'), 'b'.repeat(64));
  const server = await offlineTestServer(a.directory);
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  try {
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page); await cdp.send('ServiceWorker.enable');
    cdp.on('ServiceWorker.workerErrorReported', event => console.log('WORKER ERROR', event.errorMessage));
    await page.goto(server.url); await expect(page.getByRole('status')).toContainText('Ready offline');
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    await context.setOffline(true); await page.reload(); await expect(page.getByRole('status')).toContainText('Ready offline');
    expect(await page.evaluate(() => fetch('/lazy.wasm').then(r => r.text()))).toBe('hello');
    await context.setOffline(false); server.setRoot(b.directory);
    const nextWorker = context.waitForEvent('serviceworker');
    await page.getByRole('textbox').fill('PENDING USER TEXT'); await page.getByRole('button', { name: 'Check update' }).click();
    const waiting = await nextWorker;
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    await expect(page.getByRole('textbox')).toHaveValue('PENDING USER TEXT');
    await expect(page.getByRole('status')).toContainText('a'.repeat(64));
    const other = await context.newPage(); await other.goto(server.url); await expect(other.getByRole('status')).toContainText('a'.repeat(64));
    await page.close(); await expect(other.getByRole('status')).toContainText('a'.repeat(64)); await other.close();
    await expect.poll(() => waiting.evaluate(() => !(self as unknown as { registration: ServiceWorkerRegistration }).registration.waiting)).toBe(true);
    const reopened = await context.newPage(); await reopened.goto(server.url); await expect(reopened.getByRole('status')).toContainText('b'.repeat(64));
    await reopened.screenshot({ path: '/tmp/gsnv-consumer-qa/offline-worker-demo.png' }); expect(errors).toEqual([]);
  } finally { await context.close(); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
