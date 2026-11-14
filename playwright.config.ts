import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src', testMatch: '**/*.browser.spec.ts', testIgnore: '**/offline.browser.spec.ts', workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/dev/fixtures/capabilities.html', reuseExistingServer: false,
  },
});
