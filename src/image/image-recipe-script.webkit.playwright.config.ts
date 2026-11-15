import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({ testDir: '.', testMatch: 'image-recipe-script.browser.spec.ts', workers: 1, reporter: 'list', timeout: 60000, outputDir: join(tmpdir(), 'gsnv-recipe-script-webkit-results'), use: { browserName: 'webkit', headless: true, viewport: { width: 1280, height: 720 } } });
