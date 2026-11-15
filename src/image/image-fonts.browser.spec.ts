import { test, expect, webkit, type Page, type Locator } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import { readFile } from 'node:fs/promises';
let server: PreviewServer;
test.beforeAll(async ({ browser }) => { server = await preview({ preview: { host: '127.0.0.1', port: 4212, strictPort: true } }); console.log(`Font checks: Chrome ${browser.version()}, ${process.platform}/${process.arch}`); });
test.afterAll(async () => server.close());
const fixture = (ext: string) => `dev/fixtures/fonts/Paint Test.${ext}`;
const pixels = (page: Page, selector = '.image-canvas') => page.locator(selector).evaluate((c: HTMLCanvasElement) => c.toDataURL());
const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();
async function start(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
  });
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();
}
async function textDialog(page: Page) {
  await page.locator('.gc-palette [data-command="image.text"]').click();
  const c = (await page.locator('.image-canvas').boundingBox())!;
  await page.mouse.click(c.x + c.width * .25, c.y + c.height * .25);
  const dialog = page.getByRole('dialog', { name: 'Text', exact: true });
  await expect(dialog.getByRole('button', { name: 'Import font…', exact: true })).toBeEnabled();
  return dialog;
}
async function importFile(page: Page, dialog: Locator, ext: string) {
  const choosing = page.waitForEvent('filechooser'); await dialog.getByRole('button', { name: 'Import font…', exact: true }).click();
  const picker = await choosing; expect(await picker.element().getAttribute('accept')).toBe('.ttf,.otf');
  await picker.setFiles(fixture(ext)); await expect(dialog.getByRole('button', { name: 'Import font…', exact: true })).toBeEnabled();
}
test('FONT-01–06 TTF/OTF render, persist offline, reject bad files, and travel as pixels in saved projects', async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page); const before = await history(page), blank = await pixels(page), dialog = await textDialog(page);
  const input = dialog.getByRole('textbox', { name: 'Text (Enter for a new line)' }), font = dialog.getByRole('combobox', { name: 'Font', exact: true });
  await input.fill('A\nB'); await dialog.getByLabel('Size (px)', { exact: true }).fill('48'); await dialog.getByLabel('Color', { exact: true }).fill('#c01020');
  const fallback = await pixels(page, '.image-floating');
  const remote: string[] = []; page.on('request', r => { if (r.method() !== 'GET' || new URL(r.url()).origin !== new URL(page.url()).origin) remote.push(r.url()); });
  await importFile(page, dialog, 'ttf'); const ttf = await font.inputValue(), first = await pixels(page, '.image-floating');
  expect(first).not.toBe(fallback); expect(ttf).toMatch(/^"gsnv-font-/);
  expect(await page.evaluate(value => [...document.fonts].some(f => `"${f.family}"` === value && f.status === 'loaded'), ttf)).toBe(true);
  await expect(input).toHaveValue('A\nB'); await expect(dialog.getByLabel('Color', { exact: true })).toHaveValue('#c01020');
  await importFile(page, dialog, 'otf'); const otf = await font.inputValue(), second = await pixels(page, '.image-floating'); expect(second).not.toBe(first); expect(otf).not.toBe(ttf);
  const options = await font.locator('option').count(); await importFile(page, dialog, 'otf'); await expect(font.locator('option')).toHaveCount(options);
  const bad = page.waitForEvent('filechooser'); await dialog.getByRole('button', { name: 'Import font…' }).click();
  await (await bad).setFiles({ name: 'Broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from([0, 1, 0, 0, 99, 100, 0, 0]) });
  await expect(dialog.getByRole('status')).toContainText('could not read this font'); await expect(font).toHaveValue(otf);
  expect(await pixels(page, '.image-floating')).toBe(second); expect(await history(page)).toEqual(before);
  // Cancel the native file input while retaining the modal and all fields.
  const cancelPicker = page.waitForEvent('filechooser'); await dialog.getByRole('button', { name: 'Import font…' }).click();
  await (await cancelPicker).element().dispatchEvent('cancel'); await expect(dialog.getByRole('button', { name: 'OK', exact: true })).toBeEnabled();
  await expect(input).toHaveValue('A\nB'); await expect(font).toHaveValue(otf);
  await page.screenshot({ path: 'dev/evidence/PAINT-font-import.png' });
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Free transform' })).toBeVisible(); await page.locator('.image-stage').focus(); await page.keyboard.press('Escape');
  const painted = await pixels(page); expect(painted).not.toBe(blank);
  await page.keyboard.press('Control+z'); expect(await pixels(page)).toBe(blank); await page.keyboard.press('Control+y'); expect(await pixels(page)).toBe(painted);
  const saving = page.waitForEvent('download'); await page.keyboard.press('Control+s'); const saved = await saving, bytes = await readFile((await saved.path())!);
  const exporting = page.waitForEvent('download'); await page.getByRole('menubar').getByRole('menuitem', { name: 'Image', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export PNG…', exact: true }).click();
  const png = await readFile((await (await exporting).path())!);
  expect(await page.evaluate(async bytes => { const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' })), c = document.createElement('canvas'); c.width = image.width; c.height = image.height; c.getContext('2d')!.drawImage(image, 0, 0); image.close(); return c.toDataURL(); }, [...png])).toBe(painted);
  await expect(page.locator('.gc-offline > summary')).toHaveText('Ready offline', { timeout: 90_000 });
  await context.setOffline(true); await page.reload();
  await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click(); const restored = await textDialog(page);
  const restoredFont = restored.getByRole('combobox', { name: 'Font', exact: true }); await expect(restoredFont.locator('option')).toHaveCount(options);
  await restored.getByRole('textbox', { name: 'Text (Enter for a new line)' }).fill('A\nB'); await restored.getByLabel('Size (px)', { exact: true }).fill('48'); await restored.getByLabel('Color', { exact: true }).fill('#c01020'); await restoredFont.selectOption(otf);
  expect(await pixels(page, '.image-floating')).toBe(second); await restored.getByRole('button', { name: 'Cancel', exact: true }).click(); await context.setOffline(false);
  const freshContext = await browser.newContext(), fresh = await freshContext.newPage(); await start(fresh);
  const opening = fresh.waitForEvent('filechooser'); await fresh.locator('.gc-standard [data-command="file.open"]').click();
  await (await opening).setFiles({ name: saved.suggestedFilename(), mimeType: 'application/octet-stream', buffer: bytes });
  await expect(fresh.locator('.image-layer')).toHaveCount(2); expect(await pixels(fresh)).toBe(painted);
  expect(await fresh.evaluate(() => [...document.fonts].filter(f => f.family.startsWith('gsnv-font-')).length)).toBe(0);
  await freshContext.close(); expect(remote).toEqual([]); expect(errors).toEqual([]);
});

test('FONT-01/04 local font picker and text preview fit a phone viewport in Linux WebKit', async () => {
  const browser = await webkit.launch({ channel: '' }); console.log(`Font mobile-layout check: WebKit ${browser.version()}, ${process.platform}/${process.arch}; physical iOS untested`);
  const context = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true }), page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await start(page); const dialog = await textDialog(page); const input = dialog.getByRole('textbox', { name: 'Text (Enter for a new line)' });
    await input.fill('A'); await input.press('Enter'); await input.pressSequentially('B');
    await importFile(page, dialog, 'otf'); await expect(input).toHaveValue('A\nB');
    await expect(dialog.getByRole('combobox', { name: 'Font', exact: true })).toHaveValue(/^"gsnv-font-/);
    const rect = (await dialog.boundingBox())!; expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'dev/evidence/PAINT-font-phone-webkit.png' });
    await dialog.getByRole('button', { name: 'OK', exact: true }).tap(); await expect(page.locator('.image-layer')).toHaveCount(2); expect(errors).toEqual([]);
  } finally { await context.close(); await browser.close(); }
});
