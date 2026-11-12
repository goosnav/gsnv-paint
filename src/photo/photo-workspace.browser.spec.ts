import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';

const RAW = 'dev/fixtures/raw/canon-eos-5d-mark-iii.dng';
const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();
const mean = (page: Page) => page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>('.photo-canvas')!, d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]! + d[i + 1]! + d[i + 2]!; return s / (d.length / 4) / 3; });
const size = (page: Page) => page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>('.photo-canvas')!; return [c.width, c.height] as [number, number]; });
const jpegSize = (bytes: Buffer): [number, number] | null => { for (let i = 2; i < bytes.length;) { const marker = bytes[i + 1]!, length = bytes.readUInt16BE(i + 2); if (marker >= 0xc0 && marker <= 0xc2) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)]; i += 2 + length; } return null; };
const settled = async (page: Page) => { const stage = page.locator('.photo-stage'); await page.waitForTimeout(150); await expect(stage).not.toHaveAttribute('aria-busy', 'true', { timeout: 60000 }); await expect(stage).not.toHaveAttribute('data-rendering', 'true', { timeout: 30000 }); };

test('PHOTO-APP RAW develop: LibRaw decode, Auto, preset, sliders, undo, before/after, crop, project and exports', async ({ page, context }, testInfo) => {
  test.setTimeout(180000);
  const server = await preview({ preview: { host: '127.0.0.1', port: 4178, strictPort: true } }); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); });
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Photo', exact: true }).click();
    await expect(page.locator('.photo-empty')).toContainText('camera RAW');
    const chooser = page.waitForEvent('filechooser'); await page.locator('.photo-import').click(); await (await chooser).setFiles(RAW);
    await expect(page.locator('.photo-surface')).toBeVisible({ timeout: 60000 }); await settled(page);
    await expect(page.locator('[data-window-title]')).toContainText('canon-eos-5d-mark-iii');
    const [w, h] = await size(page); expect(w / h).toBeCloseTo(1.5, 2); // 5760 × 3840 sensor, previewed at screen size
    const neutral = await mean(page); expect(neutral).toBeGreaterThan(60); expect(neutral).toBeLessThan(200);

    await page.locator('[data-action="photo.auto"]').click(); await expect.poll(() => history(page)).toEqual(['Auto', 'Current state']); await settled(page);
    await page.getByRole('button', { name: 'Black & White', exact: true }).click(); await settled(page);
    const mono = await page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>('.photo-canvas')!, d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let worst = 0; for (let i = 0; i < d.length; i += 400) worst = Math.max(worst, Math.abs(d[i]! - d[i + 1]!), Math.abs(d[i + 1]! - d[i + 2]!)); return worst; });
    expect(mono).toBeLessThanOrEqual(2);
    await page.getByRole('radio', { name: 'Colour', exact: true }).click(); await settled(page);
    const exposure = page.locator('#photo-exposure'); const before = await mean(page);
    await exposure.focus(); for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight'); await settled(page);
    expect(await mean(page)).toBeGreaterThan(before + 5);
    expect((await history(page)).filter(label => label === 'Exposure').length).toBeGreaterThanOrEqual(1);
    await page.locator('label[data-reset="exposure"]').dblclick(); await settled(page); await expect(page.locator('#photo-exposure')).toHaveValue('0');
    await page.locator('.photo-stage').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('Control+z'); await settled(page);
    await expect(page.locator('#photo-exposure')).not.toHaveValue('0');
    await page.keyboard.press('\\'); await expect(page.locator('.photo-badge')).toBeVisible(); await page.keyboard.press('\\'); await expect(page.locator('.photo-badge')).toBeHidden();

    await page.locator('.photo-aspect').selectOption('1 : 1'); await page.keyboard.press('r'); await expect(page.locator('.photo-crop')).toBeVisible();
    const handle = (await page.locator('.photo-crop-handle[data-handle="se"]').boundingBox())!;
    await page.mouse.move(handle.x + 7, handle.y + 7); await page.mouse.down(); await page.mouse.move(handle.x - 200, handle.y - 150, { steps: 5 }); await page.mouse.up();
    await page.keyboard.press('Enter'); await settled(page); await expect(page.locator('.photo-crop')).toBeHidden();
    const [cw, ch] = await size(page); expect(Math.abs(cw - ch)).toBeLessThanOrEqual(2);
    expect((await history(page)).at(-2)).toBe('Crop');
    await page.screenshot({ path: 'dev/evidence/PHOTO-APP-production.png' }); await testInfo.attach('Photo production', { path: 'dev/evidence/PHOTO-APP-production.png', contentType: 'image/png' });

    const saving = page.waitForEvent('download'); await page.keyboard.press('Control+s'); const project = await saving;
    const bytes = await readFile((await project.path())!), pkg = nativeContainer({ op: 'decode', parts: [bytes] }), original = await readFile(RAW);
    expect(pkg.project.format).toBe('gsnv-photo'); expect(Buffer.from(pkg.assets[0]!.bytes).equals(original)).toBe(true);
    const settings = (pkg.project.content as { settings: { crop: { width: number }; profile: string } }).settings; expect(settings.crop.width).toBeLessThan(1); expect(settings.profile).toBe('color');

    for (const [sizeChoice, longEdge] of [['2048', 2048], ['full', 3840]] as const) {
      await page.getByRole('menuitem', { name: 'Photo', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export…' }).click();
      const dialog = page.getByRole('dialog'); await dialog.getByLabel('Size').selectOption(sizeChoice);
      const exporting = page.waitForEvent('download', { timeout: 120000 }); await dialog.getByRole('button', { name: 'OK', exact: true }).click(); const jpeg = await exporting;
      const out = await readFile((await jpeg.path())!); expect([...out.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); expect(jpeg.suggestedFilename()).toBe('canon-eos-5d-mark-iii.jpg');
      const [ew, eh] = jpegSize(out)!; expect(Math.abs(ew - eh)).toBeLessThanOrEqual(2); expect(Math.max(ew, eh)).toBeLessThanOrEqual(longEdge); expect(Math.max(ew, eh)).toBeGreaterThan(longEdge * (sizeChoice === 'full' ? 0.4 : 0.99));
      if (sizeChoice === '2048') {
        await settled(page); await page.waitForTimeout(1000);
        const importing = page.waitForEvent('filechooser'); await page.getByRole('menuitem', { name: 'Photo', exact: true }).click(); await page.getByRole('menuitem', { name: 'Import photo…' }).click();
        await (await importing).setFiles({ name: 'export.jpg', mimeType: 'image/jpeg', buffer: out }); // The project was just saved, so no replacement prompt.
        await expect(page.locator('[data-window-title]')).toContainText('export'); await settled(page); expect((await size(page))[0]).toBeGreaterThan(100);
        await page.waitForTimeout(1000);
        const reopening = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o'); await (await reopening).setFiles({ name: project.suggestedFilename(), mimeType: 'application/octet-stream', buffer: bytes });
        await page.getByRole('dialog').getByLabel('Unsaved changes').selectOption('replace'); await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
        await expect(page.locator('[data-window-title]')).toContainText('canon-eos-5d-mark-iii'); await settled(page); const [rw, rh] = await size(page); expect(Math.abs(rw - rh)).toBeLessThanOrEqual(2);
      }
    }
    console.log(`PHOTO-APP Chrome ${context.browser()!.version()}: LibRaw DNG decode, Auto, B&W, slider/undo, 1:1 crop, project round trip, 2048 and full-size JPEG export, JPEG import.`);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
