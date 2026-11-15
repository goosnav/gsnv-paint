import { test, expect, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
let server: PreviewServer;
test.beforeAll(async () => { server = await preview({ preview: { host: '127.0.0.1', port: 4206, strictPort: true } }); });
test.afterAll(async () => { await server.close(); });
test.beforeEach(async ({ page, context }) => { await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.goto(server.resolvedUrls!.local[0]!); });
const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();
async function seed(page: Page, width: number, height: number, transparent = false) {
  await page.evaluate(async ({ width, height, transparent }) => {
    const c = document.createElement('canvas'); c.width = width; c.height = height; const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, width / 2, height); ctx.fillStyle = '#00ff00'; ctx.fillRect(width / 2, 0, width / 2, height);
    if (transparent) ctx.clearRect(0, 0, 4, 4);
    const blob = await new Promise<Blob>(resolve => c.toBlob(b => resolve(b!), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }, { width, height, transparent });
}
async function clipboardPixels(page: Page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read(), bitmap = await createImageBitmap(await items[0]!.getType('image/png'));
    const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; const ctx = c.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return { width: c.width, height: c.height, bytes: [...ctx.getImageData(0, 0, c.width, c.height).data] };
  });
}
test('Paint native paste opens an image and Copy canvas writes the full transparent composite', async ({ page }) => {
  await expect(page.locator('.image-canvas')).toHaveAttribute('width','800'); await seed(page, 32, 24, true);
  await page.locator('.gc-viewport').focus(); await page.keyboard.press('Control+v');
  await expect(page.locator('.image-canvas')).toHaveAttribute('width', '32'); await expect(page.locator('.image-canvas')).toHaveAttribute('height', '24');
  await expect(page.locator('.image-layer')).toHaveCount(1);
  await seed(page, 16, 8); await page.locator('.gc-standard [data-command="edit.paste"]').click();
  await expect(page.locator('.image-layer')).toHaveCount(2); await expect(page.getByRole('form', { name: 'Free transform' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Transform x', exact: true }).fill('0');
  await page.getByRole('spinbutton', { name: 'Transform y', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Apply transform', exact: true }).click();
  const before = await history(page); await page.locator('.gc-standard [data-command="image.copyCanvas"]').click();
  await expect(page.locator('.image-tool-hint')).toContainText('Canvas copied');
  const copied = await clipboardPixels(page); expect([copied.width, copied.height]).toEqual([32, 24]);
  const pixel = (x: number, y: number) => copied.bytes.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
  expect(pixel(0, 0)).toEqual([0, 0, 0, 0]); expect(pixel(12, 10)).toEqual([0, 255, 0, 255]);
  expect(pixel(12, 20)).toEqual([255, 0, 0, 255]); expect(pixel(31, 23)).toEqual([0, 255, 0, 255]);
  expect(await history(page)).toEqual(before);
  const copyButton = (await page.locator('.gc-standard [data-command="image.copyCanvas"]').boundingBox())!;
  expect(copyButton.x).toBeGreaterThanOrEqual(0); expect(copyButton.x + copyButton.width).toBeLessThanOrEqual(1280);
  await page.screenshot({ path: 'dev/evidence/IMAGE-clipboard.png' });
});
test('Paint oversized paste exposes a whole-source transform, cancel and undo; text paste stays native', async ({ page }) => {
  await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click(); await seed(page, 1600, 400);
  const before = await history(page); await page.locator('.gc-standard [data-command="edit.paste"]').click();
  await expect(page.locator('.image-layer')).toHaveCount(2); await expect(page.getByRole('form', { name: 'Free transform' })).toBeVisible();
  await expect(page.locator('.image-floating')).toHaveAttribute('width', '640');
  await expect(page.getByRole('spinbutton', { name: 'Transform width', exact: true })).toHaveValue('640');
  await expect(page.getByRole('spinbutton', { name: 'Transform height', exact: true })).toHaveValue('160');
  await page.getByRole('button', { name: 'Cancel transform', exact: true }).click(); await expect(page.locator('.image-layer')).toHaveCount(2);
  const right = await page.locator('.image-canvas').evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(710, 230, 1, 1).data]);
  expect(right).toEqual([0, 255, 0, 255]);
  await page.locator('.image-stage').focus(); await page.keyboard.press('Control+z'); await expect(page.locator('.image-layer')).toHaveCount(1);
  expect((await history(page)).filter(row => !row.startsWith('Redo:'))).toEqual(before);
  await page.locator('.gc-palette [data-command="image.text"]').click(); const c = (await page.locator('.image-canvas').boundingBox())!;
  await page.mouse.click(c.x + 40, c.y + 40); const text = page.getByRole('textbox', { name: 'Text (Enter for a new line)' });
  await text.fill('hello '); await page.evaluate(() => navigator.clipboard.writeText('world')); await text.press('Control+v');
  await expect(text).toHaveValue('hello world'); await expect(page.locator('.image-layer')).toHaveCount(1);
});
test('Paint clipboard denial is honest and a late read cannot replace another workspace', async ({ page }) => {
  await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click(); const before = await history(page);
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: async () => { throw new DOMException('denied', 'NotAllowedError'); } }); });
  await page.locator('.gc-standard [data-command="image.copyCanvas"]').click();
  await expect(page.locator('.image-tool-hint')).toContainText('Export PNG'); expect(await history(page)).toEqual(before);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'read', { configurable: true, value: () => new Promise(resolve => {
      (window as any).releaseClipboard = () => {
        const c = document.createElement('canvas'); c.width = 8; c.height = 8;
        c.toBlob(blob => resolve([{ types: ['image/png'], getType: async () => blob }]), 'image/png');
      };
    }) });
  });
  await page.locator('.gc-standard [data-command="edit.paste"]').click(); await page.getByRole('tab', { name: 'CAD', exact: true }).click();
  await page.evaluate(() => (window as any).releaseClipboard());
  await expect(page.locator('.image-tool-hint')).toContainText('changed');
  await expect(page.getByRole('tab', { name: 'CAD', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Image', exact: true }).click(); await expect(page.locator('.image-layer')).toHaveCount(1); expect(await history(page)).toEqual(before);
});
test('Paint ignores non-image clipboard contents and rejects invalid images without changing the canvas', async ({ page }) => {
  await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();
  await page.locator('.gc-standard [data-command="image.copyCanvas"]').click();
  await expect(page.locator('.image-tool-hint')).toContainText('Canvas copied');
  const before = await history(page);
  await page.evaluate(() => navigator.clipboard.writeText('plain text'));
  await page.locator('.gc-standard [data-command="edit.paste"]').click();
  await expect(page.locator('.image-tool-hint')).toContainText('no image on the clipboard');
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'read', { configurable: true, value: async () => [{ types: ['image/png'], getType: async () => new Blob(['not a png'], { type: 'image/png' }) }] }); });
  await page.locator('.gc-standard [data-command="edit.paste"]').click();
  await expect(page.locator('.image-tool-hint')).toContainText('could not be pasted');
  await expect(page.locator('.image-layer')).toHaveCount(1); expect(await history(page)).toEqual(before);
  await expect(page.getByRole('form', { name: 'Free transform' })).toBeHidden();
});
test('PU-07 system clipboard PNG matches the strict palette viewport including transparency',async({page})=>{
 await seed(page,32,24,true);await page.locator('.image-stage').focus();await page.keyboard.press('Control+v');await expect(page.locator('.image-canvas')).toHaveAttribute('width','32');await page.getByRole('menubar').getByRole('menuitem',{name:'Image',exact:true}).click();await page.getByRole('menuitem',{name:'Pixel settings…',exact:true}).click();const d=page.getByRole('dialog',{name:'Pixel settings',exact:true});await d.getByLabel('Colour limit',{exact:true}).selectOption('2');await d.getByLabel('Dithering',{exact:true}).selectOption('bayer');await d.getByRole('button',{name:'OK',exact:true}).click();const expected=await page.locator('.image-canvas').evaluate((c:HTMLCanvasElement)=>[...c.getContext('2d')!.getImageData(0,0,c.width,c.height).data]);await page.locator('.gc-standard [data-command="image.copyCanvas"]').click();await expect(page.locator('.image-tool-hint')).toContainText('Canvas copied');const copied=await clipboardPixels(page);expect(copied.bytes).toEqual(expected);expect(copied.bytes.every(n=>n===0||n===255)).toBe(true);expect(copied.bytes[3]).toBe(0);
});
