import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'chrome-commit.browser.spec.ts', workers: 1, reporter: 'list',
  outputDir: '/tmp/gsnv-consumer-qa/chrome-commit-results', use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 } } });
