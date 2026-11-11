import { test, expect } from '@playwright/test';
import type { Capability } from './capability-probe.ts';

test('S06 actual Chromium API probe matches this isolated browser session', async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dev/fixtures/capabilities.html');
  await expect(page.locator('#results')).not.toHaveText('Probing…');
  const results = JSON.parse(await page.locator('#results').innerText()) as Capability[];
  expect(results.map(item => item.id)).toEqual(['file-access', 'workers', 'wasm', 'webgl2', 'cross-origin-isolation', 'clipboard', 'pressure']);
  expect(results.filter(item => item.status === 'error')).toEqual([]);
  expect(results.find(item => item.id === 'wasm')?.status).toBe('supported');
  expect(results.find(item => item.id === 'workers')?.status).toBe('supported');
  expect(results.find(item => item.id === 'cross-origin-isolation')?.status).toBe('supported');
  expect(errors).toEqual([]);
  const actual = await page.evaluate(() => ({
    isolation: crossOriginIsolated,
    pressure: 'pressure' in PointerEvent.prototype,
    clipboard: typeof navigator.clipboard?.read === 'function' && typeof navigator.clipboard?.write === 'function',
  }));
  expect(results.find(item => item.id === 'pressure')?.status).toBe(actual.pressure ? 'supported' : 'unavailable');
  expect(results.find(item => item.id === 'clipboard')?.status).toBe(actual.clipboard ? 'supported' : 'unavailable');
  const evidence = { browser: browser.version(), platform: process.platform, arch: process.arch, headless: true, viewport: page.viewportSize(), results };
  console.log(JSON.stringify(evidence, null, 2));
  await testInfo.attach('capabilities', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});
