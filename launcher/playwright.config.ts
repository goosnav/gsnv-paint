import { defineConfig } from '@playwright/test';

// Use Playwright's installed Chromium unless a local verification host explicitly
// supplies another executable. Never silently substitute a different browser.
const executablePath = process.env.GSNV_LAUNCHER_CHROME_PATH;

export default defineConfig({
  testDir: '.',
  testMatch: 'app.browser.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: '../test-results/local-launchers',
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
});
