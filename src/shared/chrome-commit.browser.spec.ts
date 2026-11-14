import { test, expect } from '@playwright/test';
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from './native-container.ts';

test('S10 production mouse Save and File menu survive a property commit on blur', async ({ page, context }) => {
  const server = await preview({ build: { outDir: process.env.GSNV_TEST_DIST ?? 'dist' }, preview: { host: '127.0.0.1', port: 4199, strictPort: true } });
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Slides', exact: true }).click();
    await page.getByRole('button', { name: 'New blank presentation' }).click();
    await page.locator('.slides-toolbar [data-slides-command="slides.text"]').click();
    const field = page.locator('.slides-properties').getByLabel('Text', { exact: true });
    await field.fill('Save this last edit by mouse');
    let download = page.waitForEvent('download', { timeout: 5_000 });
    await page.locator('.gc-standard [data-command="file.save"]').click();
    let saved = await download;
    let pack = nativeContainer({ op: 'decode', parts: [await readFile((await saved.path())!)] });
    expect(JSON.stringify(pack.project.content)).toContain('Save this last edit by mouse');
    await field.fill('Save this second edit through File');
    await page.locator('.gc-menu-trigger[data-menu="file"]').click();
    await expect(page.locator('.gc-menu-trigger[data-menu="file"]')).toHaveAttribute('aria-expanded', 'true');
    download = page.waitForEvent('download', { timeout: 5_000 });
    await page.locator('.gc-menu-popup [data-command="file.save"]:visible').click(); saved = await download;
    pack = nativeContainer({ op: 'decode', parts: [await readFile((await saved.path())!)] });
    expect(JSON.stringify(pack.project.content)).toContain('Save this second edit through File');
    await expect(page.locator('[data-window-title]')).not.toContainText('*');
  } finally { await page.close(); await server.close(); }
});
