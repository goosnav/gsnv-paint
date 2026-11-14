import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'static-host.browser.spec.ts', workers: 1, reporter: 'list',
  timeout: 120_000, outputDir: '/tmp/gsnv-consumer-qa/static-host-results',
  use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 }, trace: 'retain-on-failure' },
});
