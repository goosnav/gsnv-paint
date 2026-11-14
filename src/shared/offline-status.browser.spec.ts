import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offlineWorkerFixture } from '../../dev/offline-worker-fixture.ts';
import { offlineTestServer } from '../../dev/offline-test-server.ts';

test('S21 XP footer details stay inside 1280×720 and Escape restores summary focus', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'gsnv-offline-status-'));
  await offlineWorkerFixture(directory, 'a'.repeat(64), 'offline-status'); const server = await offlineTestServer(directory);
  try {
    await page.goto(server.url); await page.getByRole('button', { name: 'Show update ready' }).click();
    const summary = page.locator('.gc-offline > summary'); await summary.click();
    const panel = page.getByRole('group', { name: 'Offline setup' }); await expect(panel).toContainText('Save your work, close all gsnv-paint tabs, and reopen.');
    const bounds = await panel.boundingBox(); expect(bounds).toBeTruthy(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
    await page.screenshot({ path: '/tmp/gsnv-consumer-qa/offline-status-demo.png' });
    await page.getByRole('button', { name: 'Check for updates' }).focus(); await page.keyboard.press('Escape'); await expect(summary).toBeFocused(); await expect(panel).not.toBeVisible();
    const editor = page.getByRole('textbox', { name: 'Fixture text' }); await editor.fill('KEEP TYPING');
    await page.getByRole('button', { name: 'Show installing' }).evaluate((button: HTMLButtonElement) => button.click());
    await expect(editor).toBeFocused(); await expect(editor).toHaveValue('KEEP TYPING'); await expect(summary).toHaveText('Preparing offline…');
  } finally { await server.close(); await rm(directory, { recursive: true, force: true }); }
});
