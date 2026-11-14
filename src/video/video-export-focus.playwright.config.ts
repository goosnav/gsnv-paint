import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'video-export-focus.browser.spec.ts', workers: 1, reporter: 'list', timeout: 45_000,
  outputDir: '/tmp/gsnv-consumer-qa/video-focus-results', use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 }, trace: 'retain-on-failure' } });
