import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({ testDir: '.', testMatch: ['bridge-raster.browser.spec.ts', 'bridge-workspace.browser.spec.ts'], workers: 1, reporter: 'list', timeout: 60000,
  outputDir: join(process.env.BRIDGE_TEST_TMP ?? tmpdir(), 'gsnv-bridge-results'), use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 } } });
