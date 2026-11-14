import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offlineWorkerFixture } from '../../dev/offline-worker-fixture.ts';
import { offlineTestServer } from '../../dev/offline-test-server.ts';

test('S18 real CacheStorage cleanup preserves A after partial B eviction and C activation', async ({ browser }) => {
  const directory = await mkdtemp(join(tmpdir(), 'gsnv-offline-retain-'));
  const fixtures = [];
  for (const letter of ['a', 'b', 'c']) fixtures.push(await offlineWorkerFixture(join(directory, letter), letter.repeat(64), 'offline-client'));
  const server = await offlineTestServer(fixtures[0]!.directory, 4203), context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    let page = await context.newPage(); await page.goto(server.url); await expect(page.getByRole('status')).toHaveAttribute('data-phase', 'ready');
    const a = await page.evaluate(async () => (await caches.keys()).find(name => name.includes('a'.repeat(64)))!);
    for (const index of [1, 2]) {
      if (index === 2) await page.evaluate(async () => {
        const b = (await caches.keys()).find(name => name.includes('b'.repeat(64)))!;
        await (await caches.open(b)).delete('/lazy.wasm');
      });
      server.setRoot(fixtures[index]!.directory);
      const next = context.waitForEvent('serviceworker'); await page.getByRole('button', { name: 'Check updates' }).click(); const worker = await next;
      await expect(page.getByRole('status')).toHaveAttribute('data-update', 'ready'); await page.close();
      await expect.poll(() => worker.evaluate(() => !(self as unknown as { registration: ServiceWorkerRegistration }).registration.waiting)).toBe(true);
      page = await context.newPage(); await page.goto(server.url); await expect(page.getByRole('status')).toHaveAttribute('data-phase', 'ready');
    }
    expect(await page.evaluate(async generation => (await caches.keys()).includes(generation), a)).toBe(true);
    expect(await page.evaluate(async generation => (await (await caches.open(generation)).match('/lazy.wasm'))?.text(), a)).toBe('hello');
    await context.setOffline(true); await page.reload(); await expect(page.getByRole('status')).toHaveAttribute('data-phase', 'ready');
    await expect(page.getByRole('status')).toContainText('c'.repeat(64));
  } finally { await context.close(); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
