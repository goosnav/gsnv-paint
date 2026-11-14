import { expect, type Page } from '@playwright/test';
import { command, download, menu, roundtrip } from './offline-journey-helpers.ts';

function wav() {
  const bytes = Buffer.alloc(44 + 48000 * 2); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(96000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(96000, 40);
  for (let i = 0; i < 48000; i++) bytes.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 48000) * 12000), 44 + i * 2); return bytes;
}
export async function mediaJourneys(page: Page, evidence: string) {
  await page.getByRole('tab', { name: 'Image', exact: true }).click(); await command(page, 'file.new').click();
  const canvas = page.locator('.image-canvas'); await expect(canvas).toHaveAttribute('width', '800');
  await page.locator('.gc-palette button[data-command="image.pencil"]').click(); await page.locator('[data-color="#ff0000"]').click();
  const bounds = (await canvas.boundingBox())!; await page.mouse.move(bounds.x + 80, bounds.y + 80); await page.mouse.down(); await page.mouse.move(bounds.x + 120, bounds.y + 100, { steps: 4 }); await page.mouse.up();
  const pixels = () => canvas.evaluate((element: HTMLCanvasElement) => [...element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data].filter((value, i, all) => i % 4 === 0 && value > 200 && all[i + 1]! < 40).length);
  expect(await pixels()).toBeGreaterThan(10); await roundtrip(page, 'gsnv-image', async () => { await expect(canvas).toHaveAttribute('width', '800'); expect(await pixels()).toBeGreaterThan(10); });
  const png = await download(page, () => menu(page, 'Image', 'Export PNG…')); expect([...png.bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await page.screenshot({ path: `${evidence}/offline-image.png` });

  await page.getByRole('tab', { name: 'Photo', exact: true }).click(); const raw = page.waitForEvent('filechooser'); await page.locator('.photo-import').click();
  await (await raw).setFiles('dev/fixtures/raw/canon-eos-5d-mark-iii.dng');
  await expect(page.locator('.photo-surface')).toBeVisible({ timeout: 60_000 });
  const settled = async () => { await expect(page.locator('.photo-stage')).not.toHaveAttribute('aria-busy', 'true', { timeout: 60_000 }); await expect(page.locator('.photo-stage')).not.toHaveAttribute('data-rendering', 'true', { timeout: 60_000 }); };
  await settled(); await page.getByRole('button', { name: 'Black & White', exact: true }).click(); await settled();
  await roundtrip(page, 'gsnv-photo', async () => { await expect(page.locator('.photo-surface')).toBeVisible(); await settled(); }, false);
  await menu(page, 'Photo', 'Export…'); const dialog = page.getByRole('dialog'); await dialog.getByLabel('Size').selectOption('2048');
  const jpeg = await download(page, () => dialog.getByRole('button', { name: 'OK', exact: true }).click(), 120_000); expect([...jpeg.bytes.subarray(0, 3)]).toEqual([255, 216, 255]);
  await page.screenshot({ path: `${evidence}/offline-photo.png` });

  await page.getByRole('tab', { name: 'Audio', exact: true }).click(); const audio = page.waitForEvent('filechooser'); await page.locator('.audio-stage').getByRole('button', { name: 'Import audio…', exact: true }).click();
  await (await audio).setFiles({ name: 'offline-marker-7391.wav', mimeType: 'audio/wav', buffer: wav() }); await expect(page.locator('.audio-info')).toContainText('48000 frames');
  await page.getByLabel('Selection start (frame)', { exact: true }).fill('0'); await page.getByLabel('Selection end (frame)', { exact: true }).fill('24000'); await page.getByLabel('Selection end (frame)', { exact: true }).press('Tab');
  await page.locator('.audio-stage').getByRole('button', { name: 'Fade in', exact: true }).click();
  await page.locator('.audio-waveform').focus(); await page.keyboard.press('Space'); await expect(page.locator('.audio-stage')).toHaveAttribute('data-playing', 'true'); await page.keyboard.press('Escape');
  await roundtrip(page, 'gsnv-audio', () => expect(page.locator('.audio-info')).toContainText('48000 frames'));
  const out = await download(page, () => page.locator('.audio-stage').getByRole('button', { name: 'Export WAV…', exact: true }).click());
  expect(out.bytes.toString('ascii', 0, 4)).toBe('RIFF'); expect(out.bytes.readUInt32LE(40)).toBe(96000); expect(out.bytes.readInt16LE(44)).toBe(0);
  await page.screenshot({ path: `${evidence}/offline-audio.png` });

  await page.getByRole('tab', { name: 'Video', exact: true }).click(); const video = page.waitForEvent('filechooser'); await page.locator('.video-empty .xp-button').click();
  await (await video).setFiles('src/bridge/fixtures/frame-colors.webm'); await expect(page.locator('.video-clip')).toHaveCount(1, { timeout: 30_000 });
  await page.locator('.video-panel').getByRole('button', { name: 'Add title…' }).click(); await page.getByRole('dialog').getByLabel('Text', { exact: true }).fill('Offline 7391');
  await page.getByRole('dialog').getByLabel('Duration (s)').fill('1'); await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.locator('.video-title-block')).toHaveText('Offline 7391'); await roundtrip(page, 'gsnv-video', () => expect(page.locator('.video-title-block')).toHaveText('Offline 7391'));
  const movie = await download(page, () => page.locator('.video-panel').getByRole('button', { name: 'Export video…' }).click()); expect(movie.bytes.length).toBeGreaterThan(1000);
  expect(movie.name).toMatch(/\.(webm|mp4)$/); await page.screenshot({ path: `${evidence}/offline-video.png` });
}
