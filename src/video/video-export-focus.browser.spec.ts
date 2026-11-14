import { test, expect, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';
import { videoTimeline } from './video-timeline.ts';

let server: PreviewServer, original: Buffer;
const errors = new WeakMap<Page, string[]>();
test.beforeAll(async ({ browser }) => {
  console.log(`VIDEO focus browser ${browser.version()}; output ${process.env.GSNV_VIDEO_FOCUS_DIST ?? 'dist'}`);
  let value = videoTimeline({ operation: 'edit', value: videoTimeline({ operation: 'new', width: 128, height: 96 }), op: { kind: 'add-media',
    media: { id: 'focus-media', name: 'Focus video', mime: 'video/webm', kind: 'video', duration: 1.5, width: 128, height: 96 },
    bytes: new Uint8Array(await readFile(new URL('../bridge/fixtures/frame-colors.webm', import.meta.url))), clipId: 'focus-clip' } });
  for (const [id, text] of [['one', 'First title'], ['two', 'Second title']]) value = videoTimeline({ operation: 'edit', value, op: { kind: 'title', title: {
    id: id!, text: text!, start: 0, duration: 1, size: 12, color: '#ffffff', position: 'bottom', background: true } } });
  const encoded = videoTimeline({ operation: 'encode', value });
  original = Buffer.concat(nativeContainer({ op: 'encode', package: { project: { format: 'gsnv-video', version: 1, id: 'focus-video', title: 'Focus video', content: encoded.content }, assets: encoded.assets } }).parts);
  server = await preview({ configFile: false, logLevel: 'error', build: { outDir: process.env.GSNV_VIDEO_FOCUS_DIST ?? 'dist' },
    preview: { host: '127.0.0.1', port: 4222, strictPort: true, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' } } });
});
test.afterAll(async () => { if (server) await new Promise<void>(resolve => server.httpServer.close(() => resolve())); });
test.beforeEach(async ({ page, context }) => {
  const failures: string[] = []; errors.set(page, failures); page.on('pageerror', error => failures.push(error.message));
  await context.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  await page.goto('http://127.0.0.1:4222/');
  const chooser = page.waitForEvent('filechooser'); await page.locator('.gc-standard [data-command="file.open"]').click();
  await (await chooser).setFiles({ name: 'focus.gsnv-video', mimeType: 'application/octet-stream', buffer: original });
  await expect(page.locator('.video-clip')).toHaveCount(1);
  await page.evaluate(() => {
    (window as unknown as { videoFocusKeys: unknown[] }).videoFocusKeys = [];
    document.addEventListener('keydown', event => { if (event.ctrlKey && ['n', 's'].includes(event.key))
      (window as unknown as { videoFocusKeys: unknown[] }).videoFocusKeys.push({ key: event.key, prevented: event.defaultPrevented, inApp: event.composedPath().includes(document.querySelector('#app')!) }); });
  });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function download(page: Page, action: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), action()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}
const inspectorExport = (page: Page) => page.locator('.video-panel [data-video-command="video.export"]');
async function playable(page: Page, movie: { name: string; bytes: Buffer }) {
  expect(movie.bytes.length).toBeGreaterThan(1000); expect(movie.name).toMatch(/\.(webm|mp4)$/);
  const dimensions = await page.evaluate(async ({ bytes, mime }) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })), video = document.createElement('video'); video.muted = true;
    try {
      const loaded = new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('Exported video did not decode')); });
      video.src = url; await loaded; await video.play(); video.pause(); return [video.videoWidth, video.videoHeight];
    } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
  }, { bytes: [...movie.bytes], mime: movie.name.endsWith('.mp4') ? 'video/mp4' : 'video/webm' });
  expect(dimensions).toEqual([128, 96]);
}

for (const surface of ['inspector', 'toolbar'] as const) for (const activation of ['mouse', 'keyboard'] as const)
  test(`VIDEO focus ${surface} ${activation} Export retains immediate native Save and New shortcuts`, async ({ page }) => {
    const button = surface === 'inspector' ? inspectorExport(page) : page.locator('.gc-standard [data-command="video.export"]');
    const movie = await download(page, async () => { if (activation === 'keyboard') { await button.focus(); await page.keyboard.press('Enter'); } else await button.click(); });
    expect(await page.evaluate(() => document.querySelector('#app')!.contains(document.activeElement))).toBe(true);
    const saved = await download(page, () => page.keyboard.press('Control+s')); expect(saved.bytes).toEqual(original);
    await page.keyboard.press('Control+n'); await expect(page.locator('.video-clip')).toHaveCount(0); await expect(page.locator('.video-empty')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { videoFocusKeys: unknown[] }).videoFocusKeys)).toEqual([
      { key: 's', prevented: true, inApp: true }, { key: 'n', prevented: true, inApp: true },
    ]);
    await playable(page, movie);
  });

test('VIDEO focus export refresh preserves a pending field value and the exact number control', async ({ page }) => {
  const exporting = download(page, () => inspectorExport(page).click()); await expect(page.locator('.video-stage')).toHaveAttribute('aria-busy', 'true');
  const field = page.locator('.video-panel input[type="number"][data-field="volume"]'); await field.fill('73'); await exporting;
  await expect(field).toBeFocused(); await expect(field).toHaveValue('73');
  const saved = await download(page, () => page.keyboard.press('Control+s'));
  expect((nativeContainer({ op: 'decode', parts: [saved.bytes] }).project.content as { clips: { volume: number }[] }).clips[0]!.volume).toBe(.73);
});

test('VIDEO focus export refresh keeps an outside menu focused and open', async ({ page }) => {
  const exporting = download(page, () => inspectorExport(page).click()); await expect(page.locator('.video-stage')).toHaveAttribute('aria-busy', 'true');
  const file = page.getByRole('menuitem', { name: 'File', exact: true }); await file.click(); await exporting;
  await expect(file).toBeFocused(); await expect(file).toHaveAttribute('aria-expanded', 'true');
});

test('VIDEO focus refresh restores the same title control and removed controls hand focus to the timeline', async ({ page }) => {
  const exporting = download(page, () => inspectorExport(page).click()); await expect(page.locator('.video-stage')).toHaveAttribute('aria-busy', 'true');
  const edit = page.locator('.video-panel [data-edit-title="two"]'); await edit.focus(); await exporting; await expect(edit).toBeFocused();
  await page.locator('.video-panel [data-delete-title="two"]').click(); await expect(page.locator('.video-title-block')).toHaveText(['First title']);
  await expect(page.locator('.video-timeline')).toBeFocused();
});
