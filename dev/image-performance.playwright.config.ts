import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '..',
  testMatch: [
    'dev/image-performance.browser.spec.ts',
    'src/image/image-workspace.browser.spec.ts',
    'src/image/image-automation.browser.spec.ts',
    'src/image/image-touch.browser.spec.ts',
  ],
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  outputDir: '../test-results/image-performance',
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
