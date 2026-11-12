import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';

type Box = { x: number; y: number; width: number; height: number };
const at = (box: Box, size: { width: number; height: number }, x: number, y: number) => [box.x + (x + 0.5) * box.width / size.width, box.y + (y + 0.5) * box.height / size.height] as const;
const pixel = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => { const c = document.querySelector<HTMLCanvasElement>('.image-canvas')!; return [...c.getContext('2d')!.getImageData(x!, y!, 1, 1).data]; }, [x, y]);
const size = (page: Page) => page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>('.image-canvas')!; return { width: c.width, height: c.height }; });
async function drag(page: Page, from: readonly [number, number], to: readonly [number, number], button: 'left' | 'right' = 'left') {
  await page.mouse.move(...from); await page.mouse.down({ button }); await page.mouse.move(...to, { steps: 6 }); await page.mouse.up({ button });
}
const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();

test('IMAGE-APP production: paint tools, selection, undo, native file, PNG export/import and recovery', async ({ page, context }, testInfo) => {
  test.setTimeout(90000);
  const server = await preview({ preview: { host: '127.0.0.1', port: 4177, strictPort: true } }); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); });
  try {
    await page.goto(server.resolvedUrls!.local[0]!);
    await page.getByRole('tab', { name: 'Image', exact: true }).click();
    await expect(page.locator('.image-empty')).toContainText('New (Ctrl+N)');
    await expect(page.locator('.gc-standard button[data-command="file.new"]')).toBeEnabled();
    await page.keyboard.press('Control+n');
    const canvas = page.locator('.image-canvas'); await expect(canvas).toBeVisible();
    const dims = await size(page); expect(dims).toEqual({ width: 800, height: 600 });
    const box = (await canvas.boundingBox())!, p = (x: number, y: number) => at(box, dims, x, y);
    expect(box.y + box.height).toBeLessThanOrEqual(720); // A new image that is larger than the stage is fitted.
    expect(await pixel(page, 10, 10)).toEqual([255, 255, 255, 255]);

    await page.keyboard.press('p'); await expect(page.locator('.gc-palette button[data-command="image.pencil"]')).toHaveAttribute('aria-pressed', 'true');
    await drag(page, p(20, 20), p(60, 20));
    expect(await pixel(page, 40, 20)).toEqual([0, 0, 0, 255]); expect(await pixel(page, 40, 22)).toEqual([255, 255, 255, 255]);

    await page.locator('[data-color="#ed1c24"]').click(); await page.keyboard.press('r'); await drag(page, p(100, 100), p(200, 180));
    expect(await pixel(page, 100, 140)).toEqual([237, 28, 36, 255]); expect(await pixel(page, 150, 140)).toEqual([255, 255, 255, 255]);
    await page.locator('[data-color="#00a2e8"]').click(); await page.keyboard.press('g'); await page.mouse.click(...p(150, 140));
    expect(await pixel(page, 150, 140)).toEqual([0, 162, 232, 255]); expect(await pixel(page, 250, 140)).toEqual([255, 255, 255, 255]);
    await page.keyboard.press('i'); await page.mouse.click(...p(100, 140), { button: 'right' });
    await expect(page.locator('.image-secondary')).toHaveValue('#ed1c24');
    await expect(page.locator('.gc-palette button[data-command="image.fill"]')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('s'); await drag(page, p(95, 95), p(205, 185));
    await expect(page.locator('.image-marquee')).toBeVisible();
    await drag(page, p(150, 140), p(450, 340)); await page.keyboard.press('Enter');
    expect(await pixel(page, 450, 340)).toEqual([0, 162, 232, 255]); expect(await pixel(page, 150, 140)).toEqual([237, 28, 36, 255]); // The lifted area is cleared to the secondary colour.
    expect(await history(page)).toEqual(['Pencil', 'Draw rectangle', 'Fill', 'Move selection', 'Current state']);
    await page.keyboard.press('Control+z'); expect(await pixel(page, 150, 140)).toEqual([0, 162, 232, 255]);
    await page.keyboard.press('Control+y'); expect(await pixel(page, 450, 340)).toEqual([0, 162, 232, 255]);

    await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c'); await page.keyboard.press('Escape');
    await page.keyboard.press('Control+v'); await expect(page.locator('.image-floating')).toBeVisible(); await page.keyboard.press('Escape');
    await expect(page.locator('.image-floating')).toBeHidden(); expect((await history(page)).length).toBe(5);

    await page.locator('button[data-command="image.rotateRight"]:visible').first().click(); expect(await size(page)).toEqual({ width: 600, height: 800 });
    await page.keyboard.press('Control+z'); expect(await size(page)).toEqual({ width: 800, height: 600 });

    const downloading = page.waitForEvent('download'); await page.keyboard.press('Control+s'); const download = await downloading;
    const bytes = await readFile((await download.path())!), pkg = nativeContainer({ op: 'decode', parts: [bytes] });
    expect(pkg.project.format).toBe('gsnv-image'); expect(pkg.project.content).toEqual({ width: 800, height: 600, encoding: 'rgba8', asset: 'pixels' });
    const saved = pkg.assets[0]!.bytes, offset = (340 * 800 + 450) * 4; expect([...saved.slice(offset, offset + 4)]).toEqual([0, 162, 232, 255]);

    const exporting = page.waitForEvent('download'); await page.locator('button[data-command="image.exportPNG"]:visible').first().click(); const png = await exporting;
    expect(png.suggestedFilename()).toBe('Untitled image.png'); const pngBytes = await readFile((await png.path())!);
    expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(pngBytes.readUInt32BE(16)).toBe(800); expect(pngBytes.readUInt32BE(20)).toBe(600);

    await page.keyboard.press('Control+n'); const replace = page.getByRole('dialog'); // Saved work is replaced without a prompt.
    await expect.poll(() => pixel(page, 450, 340)).toEqual([255, 255, 255, 255]);
    const choosing = page.waitForEvent('filechooser'); await page.locator('button[data-command="image.import"]:visible').first().click();
    await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: pngBytes });
    await expect(page.locator('.gc-app-header')).toContainText('photo'); await expect.poll(() => pixel(page, 450, 340)).toEqual([0, 162, 232, 255]); expect(await pixel(page, 450, 340)).toEqual([0, 162, 232, 255]);

    // Chrome ignores a second file chooser requested immediately after the previous one closed.
    await page.waitForTimeout(1000); const opening = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o'); await (await opening).setFiles({ name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer: bytes });
    await replace.getByLabel('Unsaved changes').selectOption('replace'); await replace.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.locator('.gc-app-header')).toContainText('Untitled image'); await expect.poll(() => pixel(page, 20, 20)).toEqual([0, 0, 0, 255]); expect(await pixel(page, 20, 20)).toEqual([0, 0, 0, 255]);

    await page.keyboard.press('b'); const fitted = (await canvas.boundingBox())!;
    await drag(page, at(fitted, dims, 300, 500), at(fitted, dims, 500, 500));
    await expect(page.locator('.gc-panel').filter({ has: page.getByRole('heading', { name: 'Recovery', exact: true }) })).toContainText('Local recovery enabled');
    await page.reload(); await page.getByRole('tab', { name: 'Image', exact: true }).click();
    await page.getByRole('button', { name: 'Restore recovery', exact: true }).last().click();
    await expect(canvas).toBeVisible(); await expect.poll(() => pixel(page, 400, 500)).toEqual([0, 162, 232, 255]); expect(await pixel(page, 400, 500)).toEqual([0, 162, 232, 255]);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight)).toBe(true);
    await page.screenshot({ path: 'dev/evidence/IMAGE-APP-production.png' }); await testInfo.attach('Image production', { path: 'dev/evidence/IMAGE-APP-production.png', contentType: 'image/png' });
    console.log(`IMAGE-APP Chrome ${context.browser()!.version()} ${process.platform}/${process.arch}: exact pixels for pencil/rectangle/fill/pick/move, undo/redo, native file, PNG export/import, recovery.`);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

test('IMAGE-APP text, resize, canvas size, crop and shape styles', async ({ page }) => {
  test.setTimeout(60000);
  const server = await preview({ preview: { host: '127.0.0.1', port: 4177, strictPort: true } }); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Image', exact: true }).click();
    await expect(page.locator('.gc-standard button[data-command="file.new"]')).toBeEnabled(); await page.keyboard.press('Control+n');
    const canvas = page.locator('.image-canvas'), dialog = page.getByRole('dialog'); let dims = await size(page), box = (await canvas.boundingBox())!;

    await page.keyboard.press('t'); await page.mouse.click(...at(box, dims, 50, 50));
    await expect(dialog).toBeVisible(); await dialog.getByLabel('Text', { exact: true }).fill('Hello'); await dialog.getByLabel('Size (px)').fill('40');
    await expect(page.locator('.image-floating')).toBeVisible(); await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    const inked = await page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>('.image-canvas')!, d = c.getContext('2d')!.getImageData(50, 50, 120, 50).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i]! < 128) n++; return n; });
    expect(inked).toBeGreaterThan(100); expect(await history(page)).toEqual(['Text', 'Current state']);

    await page.locator('.image-style').selectOption('both'); await page.keyboard.press('o'); await page.mouse.move(...at(box, dims, 300, 300));
    await page.mouse.down(); await page.keyboard.down('Shift'); await page.mouse.move(...at(box, dims, 400, 360), { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Shift');
    expect(await pixel(page, 350, 350)).toEqual([255, 255, 255, 255]); expect(await pixel(page, 350, 400)).toEqual([0, 0, 0, 255]);

    const menu = async (name: string) => { await page.getByRole('menuitem', { name: 'Image', exact: true }).click(); await page.getByRole('menuitem', { name }).click(); };
    await menu('Resize…');
    await dialog.getByLabel('Width (px)').fill('400'); await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    expect(await size(page)).toEqual({ width: 400, height: 300 });
    await menu('Canvas size…');
    await dialog.getByLabel('Width (px)').fill('500'); await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    expect(await size(page)).toEqual({ width: 500, height: 300 });

    dims = await size(page); box = (await canvas.boundingBox())!;
    await page.keyboard.press('s'); await drag(page, at(box, dims, 10, 10), at(box, dims, 109, 59));
    await page.locator('button[data-command="image.crop"]:visible').first().click(); expect(await size(page)).toEqual({ width: 100, height: 50 });
    expect(await history(page)).toEqual(['Text', 'Draw ellipse', 'Resize image', 'Canvas size', 'Crop', 'Current state']);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
