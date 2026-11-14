import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  testDir: '.', testMatch: ['code-editor.browser.spec.ts', 'code-workspace.browser.spec.ts'], workers: 1,
  reporter: 'list', timeout: 60000,
  outputDir: join(process.env.CODE_RUNTIME_TEST_TMP ?? tmpdir(), 'gsnv-code-workspace-results'),
  use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 } },
});
