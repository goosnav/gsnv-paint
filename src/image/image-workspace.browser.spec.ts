import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';

type Box = { x: number; y: number; width: number; height: number };
const at = (box: Box, size: { width: number; height: number }, x: number, y: number) => [box.x + (x + 0.5) * box.width / size.width, box.y + (y + 0.5) * box.height / size.height] as const;
const pixel = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => { const c = document.querySelector<HTMLCanvasElement>('.image-canvas')!; return [...c.getContext('2d')!.getImageData(x!, y!, 1, 1).data]; }, [x, y]);
const size = (page: Page) => page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>('.image-canvas')!; return { width: c.width, height: c.height }; });
async function drag(page: Page, from: readonly [number, number], to: readonly [number, number], button: 'left' | 'right' = 'left') {
  await page.mouse.move(...from); await page.mouse.down({ button }); await page.mouse.move(...to, { steps: 8 }); await page.mouse.up({ button });
}
const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();
const menu = async (page: Page, top: string, name: string) => { await page.getByRole('menuitem', { name: top, exact: true }).click(); await page.getByRole('menuitem', { name }).click(); };
async function start(page: Page) {
  await page.getByRole('tab', { name: 'Image', exact: true }).click();
  await expect(page.locator('.gc-standard button[data-command="file.new"]')).toBeEnabled(); await page.keyboard.press('Control+n');
  await expect(page.locator('.image-canvas')).toBeVisible(); const dims = await size(page), box = (await page.locator('.image-canvas').boundingBox())!;
  return { dims, p: (x: number, y: number) => at(box, dims, x, y) };
}

test('IMAGE-APP production: paint tools, selection move, undo, layered native file, PNG export/open and recovery', async ({ page, context }, testInfo) => {
  test.setTimeout(90000);
  const server = await preview({ preview: { host: '127.0.0.1', port: 4177, strictPort: true } }); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); });
  try {
    await page.goto(server.resolvedUrls!.local[0]!);
    const { dims, p } = await start(page); expect(dims).toEqual({ width: 800, height: 600 });
    expect(await pixel(page, 10, 10)).toEqual([255, 255, 255, 255]);
    await page.keyboard.press('p'); await expect(page.locator('.gc-palette button[data-command="image.pencil"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('input[type=number][data-option=size]').fill('1'); await page.keyboard.press('Enter');
    await drag(page, p(20, 20), p(60, 20)); expect(await pixel(page, 40, 20)).toEqual([0, 0, 0, 255]); expect(await pixel(page, 40, 22)).toEqual([255, 255, 255, 255]);
    await page.locator('[data-color="#ff0000"]').click(); await page.keyboard.press('r'); await drag(page, p(100, 100), p(200, 180));
    expect(await pixel(page, 100, 140)).toEqual([255, 0, 0, 255]); expect(await pixel(page, 150, 140)).toEqual([255, 255, 255, 255]);
    await page.locator('[data-color="#0000ff"]').click(); await page.keyboard.press('g'); await page.mouse.click(...p(150, 140));
    expect(await pixel(page, 150, 140)).toEqual([0, 0, 255, 255]); expect(await pixel(page, 250, 140)).toEqual([255, 255, 255, 255]);
    await page.keyboard.press('i'); await page.mouse.click(...p(100, 140), { button: 'right' }); await expect(page.locator('.image-secondary')).toHaveValue('#ff0000');
    await page.keyboard.press('s'); await drag(page, p(95, 95), p(205, 185)); await drag(page, p(150, 140), p(450, 340)); await page.keyboard.press('Enter');
    expect(await pixel(page, 450, 340)).toEqual([0, 0, 255, 255]); expect(await pixel(page, 150, 140)).toEqual([255, 0, 0, 255]); // The lifted area takes the secondary colour on the bottom layer.
    expect(await history(page)).toEqual(['Pencil', 'Draw rectangle', 'Fill', 'Move', 'Current state']);
    await page.keyboard.press('Control+z'); expect(await pixel(page, 150, 140)).toEqual([0, 0, 255, 255]);
    await page.keyboard.press('Control+y'); expect(await pixel(page, 450, 340)).toEqual([0, 0, 255, 255]);
    await page.locator('.gc-standard button[data-command="layer.new"]').click(); await expect(page.locator('.image-layer')).toHaveCount(2);

    const downloading = page.waitForEvent('download'); await page.keyboard.press('Control+s'); const download = await downloading;
    const bytes = await readFile((await download.path())!), pkg = nativeContainer({ op: 'decode', parts: [bytes] }), content = pkg.project.content as { encoding: string; layers: { name: string }[] };
    expect(pkg.project.format).toBe('gsnv-image'); expect(content.encoding).toBe('rgba8-layers'); expect(content.layers.map(l => l.name)).toEqual(['Background', 'Layer 2']);
    const offset = (340 * 800 + 450) * 4; expect([...pkg.assets[0]!.bytes.slice(offset, offset + 4)]).toEqual([0, 0, 255, 255]); expect(pkg.assets[1]!.bytes[offset + 3]).toBe(0);

    const exporting = page.waitForEvent('download'); await page.locator('.gc-standard button[data-command="image.exportPNG"]').click(); const png = await exporting;
    const pngBytes = await readFile((await png.path())!); expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(pngBytes.readUInt32BE(16)).toBe(800);
    await page.waitForTimeout(1000); const choosing = page.waitForEvent('filechooser'); await menu(page, 'Image', 'Open image…');
    await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: pngBytes });
    await expect(page.locator('[data-window-title]')).toContainText('photo'); await expect.poll(() => pixel(page, 450, 340)).toEqual([0, 0, 255, 255]);
    await expect(page.locator('.image-layer')).toHaveCount(1);
    await page.waitForTimeout(1000); const opening = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o'); await (await opening).setFiles({ name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer: bytes });
    await expect(page.locator('[data-window-title]')).toContainText('Untitled image'); await expect(page.locator('.image-layer')).toHaveCount(2); await expect.poll(() => pixel(page, 20, 20)).toEqual([0, 0, 0, 255]);

    await page.locator('[data-layer-id="background"]').click(); await page.keyboard.press('b'); await page.locator('input[type=number][data-option=size]').fill('12'); await page.keyboard.press('Enter');
    const fitted = (await page.locator('.image-canvas').boundingBox())!; await drag(page, at(fitted, dims, 300, 500), at(fitted, dims, 500, 500));
    await expect(page.locator('.gc-panel').filter({ has: page.getByRole('heading', { name: 'Recovery', exact: true }) })).toContainText('Local recovery enabled');
    await page.waitForTimeout(1500); // Let autosave finish, as a person would before closing.
    await page.reload(); await page.getByRole('tab', { name: 'Image', exact: true }).click(); // The last session reopens by itself.
    await expect(page.locator('[data-command^="file.recent."]')).not.toHaveCount(0);
    await expect(page.locator('.image-canvas')).toBeVisible(); await expect.poll(() => pixel(page, 400, 500)).toEqual([0, 0, 255, 255]);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight)).toBe(true);
    await page.screenshot({ path: 'dev/evidence/IMAGE-APP-production.png' }); await testInfo.attach('Image production', { path: 'dev/evidence/IMAGE-APP-production.png', contentType: 'image/png' });
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

test('IMAGE-APP layers, soft brush clipped to a selection, opacity/blend, adjustments, filters, text and geometry', async ({ page }) => {
  test.setTimeout(90000);
  const server = await preview({ preview: { host: '127.0.0.1', port: 4177, strictPort: true } }); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(server.resolvedUrls!.local[0]!); const { p } = await start(page); const dialog = page.getByRole('dialog');
    await menu(page, 'Layer', 'New layer'); await expect(page.locator('.image-layer[aria-selected=true] .image-layer-name')).toHaveText('Layer 2');
    await page.keyboard.press('m'); await drag(page, p(100, 100), p(300, 300));
    await page.keyboard.press('b'); await page.locator('input[type=number][data-option=size]').fill('60'); await page.keyboard.press('Enter');
    await page.locator('input[type=number][data-option=hardness]').fill('100'); await page.keyboard.press('Enter');
    await drag(page, p(60, 200), p(340, 200));
    expect(await pixel(page, 200, 200)).toEqual([0, 0, 0, 255]); expect(await pixel(page, 80, 200)).toEqual([255, 255, 255, 255]); // Outside the ellipse selection.
    await page.locator('.image-stage').click({ position: { x: 4, y: 4 }, button: 'middle' }); await page.keyboard.press('Escape'); // Deselect.
    await page.locator('input[type=number][data-layer-control=opacity]').fill('50'); await page.keyboard.press('Enter');
    await expect.poll(() => pixel(page, 200, 200)).toEqual([128, 128, 128, 255]);
    await page.locator('#image-layer-blend').selectOption('screen'); await expect.poll(() => pixel(page, 200, 200)).toEqual([255, 255, 255, 255]);
    await page.locator('#image-layer-blend').selectOption('normal');
    await menu(page, 'Adjustments', 'Invert colours'); await expect.poll(() => pixel(page, 200, 200)).toEqual([255, 255, 255, 255]);
    await page.locator('[data-layer-id="background"]').click(); await menu(page, 'Adjustments', 'Brightness/Contrast…');
    await dialog.getByLabel('Brightness').fill('-100'); await expect.poll(() => pixel(page, 600, 500)).toEqual([128, 128, 128, 255]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect.poll(() => pixel(page, 600, 500)).toEqual([255, 255, 255, 255]);
    await menu(page, 'Adjustments', 'Levels…'); await dialog.getByLabel('Output white').fill('200'); await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await expect.poll(() => pixel(page, 600, 500)).toEqual([200, 200, 200, 255]);
    await page.locator('[data-color="#000000"]').click(); await page.keyboard.press('p'); await page.locator('input[type=number][data-option=size]').fill('4'); await page.keyboard.press('Enter');
    await drag(page, p(600, 300), p(700, 300)); await menu(page, 'Filters', 'Gaussian blur…'); await dialog.getByLabel('Radius (px)').fill('4'); await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    const blurred = await pixel(page, 650, 296); expect(blurred[0]).toBeGreaterThan(20); expect(blurred[0]).toBeLessThan(200);
    await page.locator('[data-layer-id]').first().click(); await menu(page, 'Layer', 'Merge down'); await expect(page.locator('.image-layer')).toHaveCount(1);

    await page.keyboard.press('t'); await page.mouse.click(...p(50, 450)); await dialog.getByLabel('Text (Enter for a new line)').fill('Hello'); await dialog.getByLabel('Size (px)').fill('40');
    await expect(page.locator('.image-floating')).toBeVisible(); await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    const inked = await page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>('.image-canvas')!, d = c.getContext('2d')!.getImageData(50, 450, 120, 50).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i]! < 100) n++; return n; });
    expect(inked).toBeGreaterThan(100);
    await expect(page.locator('.image-layer[aria-selected=true] .image-layer-name')).toHaveText('Text: Hello');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); // Nudge the selected text 2 px.
    await page.keyboard.press('Control+t'); await dialog.getByLabel('Rotate (degrees)').fill('90'); await dialog.getByRole('button', { name: 'OK', exact: true }).click(); await page.keyboard.press('Enter');
    await menu(page, 'Image', 'Flatten image');
    await menu(page, 'Image', 'Resize…'); await dialog.getByLabel('Width (px)').fill('400'); await dialog.getByRole('button', { name: 'OK', exact: true }).click(); expect(await size(page)).toEqual({ width: 400, height: 300 });
    await menu(page, 'Image', 'Canvas size…'); await dialog.getByLabel('Width (px)').fill('500'); await dialog.getByRole('button', { name: 'OK', exact: true }).click(); expect(await size(page)).toEqual({ width: 500, height: 300 });
    const box = (await page.locator('.image-canvas').boundingBox())!, d2 = await size(page);
    await page.keyboard.press('s'); await drag(page, at(box, d2, 10, 10), at(box, d2, 109, 59)); await page.locator('.gc-standard button[data-command="image.crop"]').click(); expect(await size(page)).toEqual({ width: 100, height: 50 });
    expect(await history(page)).toEqual(['New layer', 'Brush', 'Layer opacity', 'Blend mode', 'Blend mode', 'Invert colours', 'Select layer', 'Levels', 'Pencil', 'Gaussian blur', 'Select layer', 'Merge down', 'Text', 'Move', 'Transform', 'Flatten image', 'Resize image', 'Canvas size', 'Crop', 'Current state']);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
