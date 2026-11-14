import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offlineWorkerFixture } from '../../dev/offline-worker-fixture.ts';
import { offlineTestServer } from '../../dev/offline-test-server.ts';

test('S20 real client reports failed B while A stays usable, then installs B without disturbing typing', async ({ browser }) => {
  const directory = await mkdtemp(join(tmpdir(), 'gsnv-offline-client-'));
  const a = await offlineWorkerFixture(join(directory, 'a'), 'a'.repeat(64), 'offline-client');
  const b = await offlineWorkerFixture(join(directory, 'b'), 'b'.repeat(64), 'offline-client');
  const server = await offlineTestServer(a.directory), context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage(), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url); await expect(page.getByRole('status')).toHaveAttribute('data-phase', 'ready');
    await page.getByRole('textbox').fill('PENDING USER TEXT'); server.setRoot(b.directory); server.setFault({ path: '/lazy.wasm', kind: 'status' });
    await page.getByRole('button', { name: 'Check updates' }).click();
    await expect(page.getByRole('status')).toHaveAttribute('data-update', 'error'); await expect(page.getByRole('status')).toHaveAttribute('data-phase', 'ready');
    await expect(page.getByRole('textbox')).toHaveValue('PENDING USER TEXT');
    await context.setOffline(true); await page.reload(); await expect(page.getByRole('status')).toHaveAttribute('data-phase', 'ready');
    expect(await page.evaluate(() => fetch('/lazy.wasm').then(r => r.text()))).toBe('hello');
    await page.getByRole('button', { name: 'Retry offline setup' }).click();
    await expect(page.getByRole('status')).toHaveAttribute('data-update', 'error');
    await expect(page.getByRole('status')).toHaveAttribute('data-phase', 'ready');
    await context.setOffline(false); server.setFault(); await page.getByRole('textbox').fill('NEW PENDING USER TEXT');
    const next = context.waitForEvent('serviceworker'); await page.getByRole('button', { name: 'Retry offline setup' }).click(); const candidate = await next;
    await expect(page.getByRole('status')).toHaveAttribute('data-update', 'ready'); await expect(page.getByRole('status')).toHaveAttribute('data-phase', 'ready');
    await expect(page.getByRole('textbox')).toHaveValue('NEW PENDING USER TEXT');
    await page.screenshot({ path: '/tmp/gsnv-consumer-qa/offline-client-demo.png' }); await page.close();
    await expect.poll(() => candidate.evaluate(() => !(self as unknown as { registration: ServiceWorkerRegistration }).registration.waiting)).toBe(true);
    const reopened = await context.newPage(); await reopened.goto(server.url); await expect(reopened.getByRole('status')).toContainText('b'.repeat(64));
    expect(errors).toEqual([]);
  } finally { await context.close(); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
