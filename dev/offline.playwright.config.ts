import { defineConfig } from '@playwright/test';
const executablePath = process.env.GSNV_OFFLINE_CHROME_PATH;
export default defineConfig({ testDir: '../src/shared', testMatch: 'offline*.browser.spec.ts', outputDir: '/tmp/gsnv-consumer-qa/offline-browser-results', workers: 1,
  timeout: 90_000, reporter: 'list', use: { ...(executablePath ? { launchOptions: { executablePath } } : { channel: 'chrome' }), headless: true, viewport: { width: 1280, height: 720 }, trace: 'retain-on-failure' } });
