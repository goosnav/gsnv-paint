import { test, expect, type Page } from '@playwright/test';
import { createServer, preview } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';
import { audioDocument } from './audio-document.ts';

let close: () => Promise<void>, url = '';
const reports = new Map<Page, { errors: string[]; external: string[]; failed: string[]; urls: Set<string> }>();
test.beforeAll(async () => {
  if (process.env.AUDIO_PRODUCTION === '1') { const server = await preview({ preview: { host: '127.0.0.1', port: 4187, strictPort: true } }); close = () => server.close(); url = server.resolvedUrls!.local[0]!; }
  else { const server = await createServer({ server: { host: '127.0.0.1', port: 4187, strictPort: true, watch: null, hmr: false } }); await server.listen(); close = () => server.close(); url = 'http://127.0.0.1:4187/src/audio/audio-demo.html'; }
});
test.afterAll(async () => { await close?.(); });
test.beforeEach(async ({ page, context }) => {
  const report = { errors: [] as string[], external: [] as string[], failed: [] as string[], urls: new Set<string>() }; reports.set(page, report);
  const observe = (tab: Page) => {
    tab.on('pageerror', error => report.errors.push(error.message)); tab.on('console', message => { if (message.type() === 'error') report.errors.push(`${message.text()} (${message.location().url})`); });
    tab.on('request', request => { const address = request.url(); if (!address.startsWith('http')) return; report.urls.add(address); if (new URL(address).origin !== new URL(url).origin) report.external.push(address); });
    tab.on('requestfailed', request => report.failed.push(`${request.url()}: ${request.failure()?.errorText}`));
  };
  observe(page); context.on('page', observe);
});
test.afterEach(async ({ page }, testInfo) => {
  const report = reports.get(page)!; const isolated = await page.evaluate(() => crossOriginIsolated);
  const path = testInfo.outputPath('audio-browser-diagnostics.json'); await writeFile(path, JSON.stringify({ ...report, urls: [...report.urls], crossOriginIsolated: isolated }, null, 2));
  await testInfo.attach('Audio browser diagnostics', { path, contentType: 'application/json' });
  expect(isolated).toBe(true); expect(report.errors).toEqual([]); expect(report.external).toEqual([]); expect(report.failed).toEqual([]); reports.delete(page);
});
const button = (page: Page, name: string) => page.locator('.audio-stage').getByRole('button', { name, exact: true });
function wav(frames: number, channels = 2, flat = false) {
  // IEEE-float WAV makes the effect golden independent of a browser's PCM16-to-float scaling convention.
  const sampleBytes = flat ? 4 : 2, bytes = Buffer.alloc(44 + frames * channels * sampleBytes); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(flat ? 3 : 1, 20); bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(48000 * channels * sampleBytes, 28); bytes.writeUInt16LE(channels * sampleBytes, 32); bytes.writeUInt16LE(sampleBytes * 8, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * channels * sampleBytes, 40);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) {
    const offset = 44 + (frame * channels + channel) * sampleBytes;
    if (flat) bytes.writeFloatLE(.5, offset); else bytes.writeInt16LE(Math.round(Math.sin(frame / 48000 * Math.PI * 2 * (channel ? 220 : 440)) * 24000), offset);
  }
  return bytes;
}
async function openAudio(page: Page, bytes: Buffer, name = 'recording.wav') {
  const choosing = page.waitForEvent('filechooser'); await button(page, 'Import audio…').click(); await (await choosing).setFiles({ name, mimeType: 'audio/wav', buffer: bytes });
}
async function select(page: Page, start: number, end: number) {
  await page.getByLabel('Selection start (frame)', { exact: true }).fill(String(start)); await page.getByLabel('Selection end (frame)', { exact: true }).fill(String(end)); await page.getByLabel('Selection end (frame)', { exact: true }).press('Tab');
  await expect(page.locator('.audio-waveform')).toHaveAttribute('data-start', String(start)); await expect(page.locator('.audio-waveform')).toHaveAttribute('data-end', String(end));
}
async function start(page: Page) { await page.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); }); await page.goto(url); await page.getByRole('tab', { name: 'Audio', exact: true }).click(); }

test('AUDIO-APP real WAV import, playback, range edits, shared undo, native reopen and recovery', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page); await openAudio(page, wav(96000));
  await expect(page.locator('.audio-info')).toContainText('48000 Hz · Stereo · 96000 frames'); await expect(page.locator('.audio-notice')).toContainText('48000 Hz');
  await page.locator('.audio-waveform').focus(); await page.keyboard.press('Space'); await expect(page.locator('.audio-stage')).toHaveAttribute('data-playing', 'true');
  await expect.poll(() => page.locator('.audio-time').getAttribute('data-frame')).not.toBe('0'); await page.keyboard.press('Escape'); await expect(page.locator('.audio-stage')).toHaveAttribute('data-playing', 'false');
  await select(page, 24000, 72000); await button(page, 'Copy').click(); await button(page, 'Delete').click(); await expect(page.locator('.audio-info')).toContainText('48000 frames');
  await button(page, 'Paste').click(); await expect(page.locator('.audio-info')).toContainText('96000 frames');
  await page.locator('.audio-waveform').focus(); await page.keyboard.press('Control+z'); await expect(page.locator('.audio-info')).toContainText('48000 frames'); await page.keyboard.press('Control+y'); await expect(page.locator('.audio-info')).toContainText('96000 frames');
  await select(page, 0, 48000); await button(page, 'Fade in').click();
  const saving = page.waitForEvent('download'); await page.locator('.audio-waveform').focus(); await page.keyboard.press('Control+s'); const saved = await saving, bytes = await readFile((await saved.path())!);
  const pkg = nativeContainer({ op: 'decode', parts: [bytes] }); expect(pkg.project.format).toBe('gsnv-audio'); expect(pkg.assets).toHaveLength(1);
  const reopened = audioDocument({ operation: 'decode', content: pkg.project.content, assets: pkg.assets }); expect(reopened.frames).toBe(96000); expect(reopened.pieces.some(p => p.envelopes.length)).toBe(true);
  await page.keyboard.press('Control+n'); await expect(page.locator('.audio-info')).toContainText('0 frames');
  const choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o'); await (await choosing).setFiles({ name: saved.suggestedFilename(), mimeType: 'application/octet-stream', buffer: bytes });
  await expect(page.locator('.audio-info')).toContainText('96000 frames'); await expect(page.locator('.audio-stage')).toHaveAttribute('data-playing', 'false');
  await expect(page.locator('.audio-range')).toBeInViewport(); await expect(page.locator('.audio-info')).toBeInViewport();
  for (const name of ['Selection start (frame)', 'Selection end (frame)']) expect((await page.getByLabel(name, { exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(120);
  await expect(page.locator('.audio-time')).toHaveAttribute('data-frame', '0');
  await page.screenshot({ path: testInfo.outputPath('audio-workspace.png') });
  await page.waitForTimeout(1200); await page.reload(); await page.getByRole('tab', { name: 'Audio', exact: true }).click(); await expect(page.locator('.audio-info')).toContainText('96000 frames'); expect(errors).toEqual([]);
});
test('AUDIO-APP effects export sample-exact PCM WAV and invalid import retains edits', async ({ page }, testInfo) => {
  await start(page); await openAudio(page, wav(8, 1, true)); await expect(page.locator('.audio-info')).toContainText('8 frames'); await select(page, 1, 5); await button(page, 'Fade in').click();
  await button(page, 'Volume…').click(); await page.getByRole('dialog').getByLabel('Volume (%)', { exact: true }).fill('200'); await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  const exporting = page.waitForEvent('download'); await button(page, 'Export WAV…').click(); const file = await exporting, bytes = await readFile((await file.path())!);
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF'); expect(bytes.readUInt32LE(24)).toBe(48000); expect(bytes.readUInt16LE(22)).toBe(1); expect(bytes.readUInt32LE(40)).toBe(16);
  expect(Array.from({ length: 8 }, (_, i) => bytes.readInt16LE(44 + i * 2))).toEqual([16384, 0, 10922, 21845, 32767, 16384, 16384, 16384]);
  const history = await page.locator('[data-panel-history] li').allTextContents(); await openAudio(page, Buffer.from('not audio'), 'broken.wav');
  await expect(page.locator('.audio-notice')).toHaveAttribute('role', 'alert'); await expect(page.locator('.audio-notice')).toContainText(/could not decode/i); await expect(page.locator('.audio-info')).toContainText('8 frames'); expect(await page.locator('[data-panel-history] li').allTextContents()).toEqual(history);
  await expect(page.locator('.audio-notice')).toBeInViewport(); await page.screenshot({ path: testInfo.outputPath('audio-import-error.png') });
  await page.getByLabel('Selection end (frame)', { exact: true }).fill('999'); await page.getByLabel('Selection end (frame)', { exact: true }).press('Tab'); await expect(page.locator('.audio-notice')).toContainText('0–8'); await expect(page.locator('.audio-waveform')).toHaveAttribute('data-end', '5');
  await test.step('Correct the invalid range and trim', async () => { await select(page, 1, 5); await button(page, 'Trim').click(); await expect(page.locator('.audio-info')).toContainText('4 frames'); });
  await test.step('Fade out and normalize the trimmed recording', async () => {
    await button(page, 'Fade out').click(); await button(page, 'Normalize…').click(); const ok = page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }); await expect(ok).toBeEnabled();
    await page.getByRole('dialog').getByLabel('Target peak (%)', { exact: true }).fill('50'); await expect(ok).toBeEnabled(); await ok.click();
  });
  await test.step('Download and verify the normalized samples', async () => {
    const normalizedDownload = page.waitForEvent('download'); await button(page, 'Export WAV…').click(); const normalized = await readFile((await (await normalizedDownload).path())!);
    expect(Array.from({ length: 4 }, (_, i) => normalized.readInt16LE(44 + i * 2))).toEqual([0, 16384, 16384, 0]);
  });
});
test('AUDIO-APP keyboard range selection and missing Web Audio are explicit', async ({ page, context }) => {
  await start(page); await openAudio(page, wav(480, 1)); await expect(page.locator('.audio-info')).toContainText('480 frames');
  const bounds = (await page.locator('.audio-waveform canvas').boundingBox())!, plotWidth = bounds.width - 60;
  await page.mouse.move(bounds.x + 48 + plotWidth * .25, bounds.y + bounds.height / 2); await page.mouse.down(); await page.mouse.move(bounds.x + 48 + plotWidth * .75, bounds.y + bounds.height / 2); await page.mouse.up();
  await expect(page.locator('.audio-waveform')).toHaveAttribute('data-start', '120'); await expect(page.locator('.audio-waveform')).toHaveAttribute('data-end', '360');
  await page.keyboard.press('Control+x'); await expect(page.locator('.audio-info')).toContainText('240 frames'); await page.keyboard.press('Control+z'); await expect(page.locator('.audio-info')).toContainText('480 frames');
  await page.locator('.audio-waveform').focus(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowRight'); await expect(page.locator('.audio-waveform')).toHaveAttribute('data-start', '0'); await expect(page.locator('.audio-waveform')).toHaveAttribute('data-end', '1');
  await page.keyboard.press('Tab'); await expect(page.getByLabel('Selection start (frame)', { exact: true })).toBeFocused();
  await context.addInitScript(() => { Object.defineProperty(window, 'AudioContext', { value: undefined }); }); const unavailable = await context.newPage(); await unavailable.goto(url); await unavailable.getByRole('tab', { name: 'Audio', exact: true }).click();
  await expect(unavailable.locator('.audio-notice')).toContainText('cannot decode or play'); await expect(button(unavailable, 'Import audio…')).toBeDisabled(); await unavailable.close();
});
