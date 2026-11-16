import { test, expect, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';
let server: PreviewServer;
test.beforeAll(async () => { server = await preview({ preview: { host: '127.0.0.1', port: 4205, strictPort: true } }); });
test.afterAll(async () => { await server.close(); });
const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();
async function textDialog(page: Page) {
  await page.locator('.gc-palette [data-command="image.text"]').click();
  const canvas = (await page.locator('.image-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 80, canvas.y + 80);
  return page.getByRole('dialog', { name: 'Text', exact: true });
}
async function pinkPixels(page: Page, selector: string) {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let pixels = 0; const rows = new Set<number>();
    for (let i = 0; i < data.length; i += 4) if (data[i] === 223 && data[i + 1] === 37 && data[i + 2] === 138 && data[i + 3]! > 200) { pixels++; rows.add(Math.floor(i / 4 / canvas.width)); }
    return { pixels, rows: [...rows] };
  });
}
test('Paint text supports color preview, native newlines, cancel and graphical scaling with undo and reopen', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
  });
  await page.goto(server.resolvedUrls!.local[0]!); await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByLabel('Preset',{exact:true}).selectOption('small-canvas'); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();
  const zoom = page.getByRole('spinbutton', { name: 'Zoom percent', exact: true }); await zoom.fill('100'); await zoom.press('Enter');
  const before = await history(page), dialog = await textDialog(page);
  const input = dialog.getByRole('textbox', { name: 'Text (Enter for a new line)' });
  await input.fill('Hello'); await input.press('Enter'); await input.pressSequentially('World');
  await expect(input).toHaveValue('Hello\nWorld'); await expect(dialog).toBeVisible();
  const color = dialog.getByLabel('Color', { exact: true }); await expect(color).toHaveValue('#000000'); await color.fill('#df258a');
  await expect.poll(async () => (await pinkPixels(page, '.image-floating')).pixels).toBeGreaterThan(30);
  expect(await history(page)).toEqual(before);
  await page.screenshot({ path: 'dev/evidence/IMAGE-text-color.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.image-floating')).toBeHidden(); expect(await history(page)).toEqual(before); await expect(page.locator('.image-layer')).toHaveCount(1);
  await textDialog(page); await input.fill('Hi'); await input.press('Shift+Enter'); await input.pressSequentially('Go');
  await expect(input).toHaveValue('Hi\nGo'); await color.fill('#df258a'); await input.press('Control+Enter');
  await expect(dialog).toHaveCount(0); await expect(page.locator('.image-layer')).toHaveCount(2);
  await expect(page.getByRole('form', { name: 'Free transform' })).toBeVisible();
  const textHistory = await history(page);
  await page.locator('.image-stage').focus(); await page.keyboard.press('Escape');
  await expect(page.getByRole('form', { name: 'Free transform' })).toBeHidden();
  expect((await pinkPixels(page, '.image-canvas')).pixels).toBeGreaterThan(10); expect(await history(page)).toEqual(textHistory);
  const textRaster = await page.locator('.image-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.keyboard.press('Control+t');
  const width = page.getByRole('spinbutton', { name: 'Transform width', exact: true }), height = page.getByRole('spinbutton', { name: 'Transform height', exact: true });
  const originalWidth = Number(await width.inputValue()), originalHeight = Number(await height.inputValue());
  const placed = await history(page); await page.getByRole('checkbox', { name: 'Keep transform proportions' }).check();
  const handle = (await page.getByRole('button', { name: 'Resize bottom right', exact: true }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 70, handle.y + handle.height / 2 + 80, { steps: 10 }); await page.mouse.up();
  expect(Number(await width.inputValue())).toBeGreaterThan(originalWidth * 1.4); expect(await history(page)).toEqual(placed);
  await width.fill(String(originalWidth * 2)); await height.focus();
  expect(Number(await height.inputValue())).toBeCloseTo(originalHeight * 2, 1);
  await page.screenshot({ path: 'dev/evidence/IMAGE-text-transform.png' });
  await page.getByRole('button', { name: 'Apply transform', exact: true }).click();
  const scaled = await pinkPixels(page, '.image-canvas'); expect(scaled.pixels).toBeGreaterThan(60);
  expect(scaled.rows.at(-1)! - scaled.rows[0]!).toBeGreaterThan(originalHeight);
  expect((await history(page)).length).toBe(placed.length + 1);
  await page.locator('.image-stage').focus(); await page.keyboard.press('Control+z');
  expect(await page.locator('.image-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(textRaster);
  await page.keyboard.press('Control+y'); expect(await pinkPixels(page, '.image-canvas')).toEqual(scaled);
  const downloading = page.waitForEvent('download'); await page.keyboard.press('Control+s'); const saved = await downloading;
  const buffer = await readFile((await saved.path())!); expect(nativeContainer({ op: 'decode', parts: [buffer] }).project.format).toBe('gsnv-image');
  await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByLabel('Preset',{exact:true}).selectOption('small-canvas'); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();
  const choosing = page.waitForEvent('filechooser'); await page.locator('.gc-standard [data-command="file.open"]').click();
  await (await choosing).setFiles({ name: saved.suggestedFilename(), mimeType: 'application/octet-stream', buffer });
  await expect(page.locator('.image-layer')).toHaveCount(2); expect(await pinkPixels(page, '.image-canvas')).toEqual(scaled);
  expect(errors).toEqual([]);
});
