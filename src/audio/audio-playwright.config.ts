import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({ testDir: '.', testMatch: 'audio-workspace.browser.spec.ts', outputDir: join(tmpdir(), 'gsnv-consumer-qa', 'audio-browser-results'), workers: 1, reporter: 'list', use: { channel: 'chrome', headless: true, trace: 'retain-on-failure', viewport: { width: 1280, height: 720 } } });
