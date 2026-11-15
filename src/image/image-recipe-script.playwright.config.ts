import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({ testDir: '.', testMatch: 'image-recipe-script.browser.spec.ts', workers: 1, reporter: 'list', timeout: 60000, outputDir: join(tmpdir(), 'gsnv-recipe-script-results'), use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 720 } } });
