import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('S07 actual browser fallback open/download/reopen preserves exact binary bytes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dev/fixtures/file-access.html');
  const source = Buffer.from([0, 1, 2, 127, 128, 201, 254, 255]);
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open fallback file' }).click();
  await (await choosing).setFiles({ name: 'roundtrip.bin', mimeType: 'application/octet-stream', buffer: source });
  await expect(page.locator('#result')).toHaveText('Opened roundtrip.bin (8 bytes)');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download fallback file' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('roundtrip.bin');
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(await readFile(path!)).toEqual(source);
  await expect(page.locator('#result')).toHaveText('Download handed to browser');
  const reopening = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open fallback file' }).click();
  await (await reopening).setFiles({ name: 'roundtrip.bin', mimeType: 'application/octet-stream', buffer: await readFile(path!) });
  await expect(page.locator('#result')).toHaveText('Opened roundtrip.bin (8 bytes)');
  expect(errors).toEqual([]);
  console.log('S07: 8 binary bytes matched after browser upload, download, and reopen; native picker interaction untested.');
});
