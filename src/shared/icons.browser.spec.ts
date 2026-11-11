import { test, expect } from '@playwright/test';
import { iconCatalog } from './icons.ts';

test('S09 original glyph sheet renders local accessible SVG at desktop size', async ({ page }, testInfo) => {
  const remote: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173')) remote.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dev/fixtures/icons.html');
  await expect(page.locator('#sheet section')).toHaveCount(iconCatalog.length);
  for (const name of iconCatalog) await expect(page.getByRole('img', { name, exact: true })).toHaveCount(3);
  expect(await page.locator('#sheet svg').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().width > 0))).toBe(true);
  expect(await page.locator('#sheet image, #sheet use, #sheet script').count()).toBe(0);
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'dev/evidence/S09-glyph-sheet.png', fullPage: true });
  await testInfo.attach('original-glyph-sheet', { path: 'dev/evidence/S09-glyph-sheet.png', contentType: 'image/png' });
});
