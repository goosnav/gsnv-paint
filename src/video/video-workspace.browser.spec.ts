import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeContainer } from '../shared/native-container.ts';

const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();
const clips = (page: Page) => page.locator('.video-clip');
// Records a short coloured WebM with a tone in the page itself, so the test needs no binary fixture.
const makeWebm = (page: Page, seconds: number) => page.evaluate(async seconds => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 }), ctx = canvas.getContext('2d')!, audio = new AudioContext(), osc = audio.createOscillator(), dest = audio.createMediaStreamDestination();
  osc.connect(dest); osc.start();
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]), rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }), chunks: Blob[] = [];
  rec.ondataavailable = e => chunks.push(e.data); rec.start(100); const t0 = performance.now();
  await new Promise<void>(resolve => { const frame = () => { const t = (performance.now() - t0) / 1000; ctx.fillStyle = `hsl(${t * 120},80%,50%)`; ctx.fillRect(0, 0, 320, 180); if (t < seconds) requestAnimationFrame(frame); else resolve(); }; frame(); });
  await new Promise<void>(resolve => { rec.onstop = () => resolve(); rec.stop(); }); osc.stop(); void audio.close();
  return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
}, seconds);

test('VIDEO-APP import, split, trim, fade, title, reorder, undo, project round trip and real-time export', async ({ page, context }, testInfo) => {
  test.setTimeout(120000);
  const server = await preview({ preview: { host: '127.0.0.1', port: 4179, strictPort: true } }); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); });
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Video', exact: true }).click();
    await expect(page.locator('.video-empty')).toContainText('Edit a video');
    const dir = await mkdtemp(join(tmpdir(), 'gsnv-video-')), clip = join(dir, 'colours.webm'), still = join(dir, 'card.png');
    await writeFile(clip, Buffer.from(await makeWebm(page, 2)));
    await writeFile(still, Buffer.from(await page.evaluate(async () => { const c = Object.assign(document.createElement('canvas'), { width: 640, height: 360 }), x = c.getContext('2d')!; x.fillStyle = '#316ac5'; x.fillRect(0, 0, 640, 360); return [...new Uint8Array(await (await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'))).arrayBuffer())]; })));

    let chooser = page.waitForEvent('filechooser'); await page.locator('.video-empty .xp-button').click(); await (await chooser).setFiles(clip);
    await expect(clips(page)).toHaveCount(1, { timeout: 20000 }); await expect(page.locator('.video-empty')).toBeHidden();
    expect(await page.evaluate(() => [document.querySelector<HTMLCanvasElement>('.video-canvas')!.width, document.querySelector<HTMLCanvasElement>('.video-canvas')!.height])).toEqual([320, 180]);
    const total = Number((await page.locator('.video-time').textContent())!.split(' / ')[1]!.split(':')[1]); expect(total).toBeGreaterThan(1.5); expect(total).toBeLessThan(2.6);

    await page.waitForTimeout(1000);
    chooser = page.waitForEvent('filechooser'); await page.getByRole('menuitem', { name: 'Video', exact: true }).click(); await page.getByRole('menuitem', { name: 'Add video or image…' }).click(); await (await chooser).setFiles(still);
    await expect(clips(page)).toHaveCount(2, { timeout: 20000 }); await expect(clips(page).nth(1)).toHaveAttribute('data-kind', 'image');

    // Split the video at 1 s with the S key.
    await clips(page).first().click({ position: { x: 60, y: 10 } }); await page.keyboard.press('s');
    await expect(clips(page)).toHaveCount(3); expect((await history(page)).at(-2)).toBe('Split');
    // Fade and volume on the first part.
    await clips(page).first().click({ position: { x: 10, y: 10 } });
    await page.locator('.video-panel [data-field="fadeIn"]').fill('0.5'); await page.locator('.video-panel [data-field="fadeIn"]').press('Tab');
    await expect.poll(() => history(page)).toContain('Fade in');
    await page.locator('.video-panel input[type=number][data-field="volume"]').fill('50'); await page.locator('.video-panel input[type=number][data-field="volume"]').press('Tab');
    await expect.poll(() => history(page)).toContain('Volume');
    // Image clip: trim out to 1.5 s, then move it first.
    await clips(page).nth(2).click({ position: { x: 5, y: 10 } });
    await page.locator('.video-panel [data-field="out"]').fill('1.5'); await page.locator('.video-panel [data-field="out"]').press('Tab'); await expect.poll(() => history(page)).toContain('Trim clip');
    await page.locator('.video-panel').getByRole('button', { name: '◀ Earlier' }).click(); await page.locator('.video-panel').getByRole('button', { name: '◀ Earlier' }).click();
    await expect(clips(page).first()).toHaveAttribute('data-kind', 'image');
    // Title over the first second.
    await page.locator('.video-panel').getByRole('button', { name: 'Add title…' }).click();
    const dialog = page.getByRole('dialog'); await dialog.getByLabel('Text', { exact: true }).fill('Summer'); await dialog.getByLabel('Start (s)').fill('0'); await dialog.getByLabel('Duration (s)').fill('1');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click(); await expect(page.locator('.video-title-block')).toHaveText('Summer');
    // Undo and redo the title.
    await page.locator('.video-timeline').click({ position: { x: 30, y: 8 } }); await page.keyboard.press('Control+z'); await expect(page.locator('.video-title-block')).toHaveCount(0);
    await page.keyboard.press('Control+y'); await expect(page.locator('.video-title-block')).toHaveCount(1);
    // Playback moves the playhead.
    await page.keyboard.press('Home'); await page.keyboard.press(' '); await page.waitForTimeout(600); await page.keyboard.press(' ');
    expect(Number((await page.locator('.video-time').textContent())!.slice(3, 7))).toBeGreaterThan(0.3);
    await page.screenshot({ path: 'dev/evidence/VIDEO-APP-production.png' }); await testInfo.attach('Video production', { path: 'dev/evidence/VIDEO-APP-production.png', contentType: 'image/png' });

    // Project file keeps the original media and the edits.
    const saving = page.waitForEvent('download'); await page.keyboard.press('Control+s'); const project = await saving;
    const pkg = nativeContainer({ op: 'decode', parts: [await readFile((await project.path())!)] }), content = pkg.project.content as { clips: { out: number; fadeIn: number; volume: number }[]; titles: unknown[] };
    expect(pkg.project.format).toBe('gsnv-video'); expect(content.clips.length).toBe(3); expect(content.clips[0]!.out).toBe(1.5); expect(content.clips[1]!.fadeIn).toBe(0.5); expect(content.clips[1]!.volume).toBe(0.5); expect(content.titles.length).toBe(1);
    const original = await readFile(clip); expect(pkg.assets.some(a => Buffer.from(a.bytes).equals(original))).toBe(true);

    // Real-time export produces a playable recording.
    const exporting = page.waitForEvent('download', { timeout: 30000 }); await page.locator('.video-panel').getByRole('button', { name: 'Export video…' }).click(); const file = await exporting;
    const out = await readFile((await file.path())!); expect(out.length).toBeGreaterThan(1000);
    expect(file.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
    if (file.suggestedFilename().endsWith('.webm')) expect([...out.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);

    // Reload reopens the last session from browser storage.
    await page.waitForTimeout(1500); await page.reload(); await page.getByRole('tab', { name: 'Video', exact: true }).click();
    await expect(clips(page)).toHaveCount(3, { timeout: 20000 }); await expect(page.locator('.video-title-block')).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
