import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.image-canvas')).toBeVisible();
  await expect(page.locator('.image-canvas')).toHaveAttribute('width', '800');
  await expect(page.locator('.gc-standard [data-command="file.new"]')).toBeEnabled();
});

type DroppedImage = { name: string; width: number; height: number; color: string; right?: string };
async function drop(page: Page, images: DroppedImage[]) {
  await expect(page.locator('.image-canvas')).toBeVisible();
  await page.evaluate(async images => {
    const data = new DataTransfer();
    for (const image of images) {
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.fillStyle = image.color; context.fillRect(0, 0, canvas.width, canvas.height);
      if (image.right) { context.fillStyle = image.right; context.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height); }
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
      data.items.add(new File([blob], image.name, { type: 'image/png' })); canvas.width = canvas.height = 0;
    }
    const stage = document.querySelector('.image-stage')!;
    stage.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data, bubbles: true, cancelable: true }));
    stage.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
    stage.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  }, images);
}
const names = (page: Page) => page.locator('.image-layer-name').allTextContents();
const pixel = (page: Page, x: number, y: number) => page.locator('.image-canvas').evaluate((canvas: HTMLCanvasElement, { x, y }) => [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data], { x, y });

test('Paint adopts the first dropped image size; subsequent files become named ordered undoable layers', async ({ page }) => {
  await drop(page, [{ name: 'Drawing.png', width: 64, height: 48, color: '#ff0000' }]);
  await expect(page.locator('.image-canvas')).toHaveAttribute('width', '64'); await expect(page.locator('.image-canvas')).toHaveAttribute('height', '48');
  await expect(page.locator('.image-layer')).toHaveCount(1); expect(await names(page)).toEqual(['Drawing']);
  await drop(page, [{ name: 'Middle.png', width: 32, height: 24, color: '#00ff00' }, { name: 'Top.png', width: 16, height: 12, color: '#0000ff' }]);
  await expect(page.locator('.image-layer')).toHaveCount(3);
  expect(await names(page)).toEqual(['Top', 'Middle', 'Drawing']);
  await page.getByRole('button', { name: 'Apply transform', exact: true }).click();
  expect(await pixel(page, 0, 0)).toEqual([255, 0, 0, 255]); expect(await pixel(page, 17, 13)).toEqual([0, 255, 0, 255]); expect(await pixel(page, 30, 22)).toEqual([0, 0, 255, 255]);
  await page.locator('.image-stage').focus(); await page.keyboard.press('Control+z'); await expect(page.locator('.image-layer')).toHaveCount(2);
  await page.keyboard.press('Control+z'); await expect(page.locator('.image-layer')).toHaveCount(1);
  await page.keyboard.press('Control+y'); await expect(page.locator('.image-layer')).toHaveCount(2);
});

test('Paint fits an oversized drop completely inside the canvas and exposes full-source transform handles', async ({ page }) => {
  await drop(page, [{ name: 'Base.png', width: 64, height: 48, color: '#ffffff' }]);
  await expect(page.locator('.image-canvas')).toHaveAttribute('width', '64');
  await drop(page, [{ name: 'Wide.png', width: 256, height: 64, color: '#ff0000', right: '#00ff00' }]);
  await expect(page.locator('.image-layer')).toHaveCount(2);
  await expect(page.getByRole('spinbutton', { name: 'Transform width', exact: true })).toHaveValue('51');
  await expect(page.getByRole('spinbutton', { name: 'Transform height', exact: true })).toHaveValue('13');
  await page.getByRole('button', { name: 'Apply transform', exact: true }).click();
  expect(await pixel(page, 8, 22)).toEqual([255, 0, 0, 255]); expect(await pixel(page, 54, 22)).toEqual([0, 255, 0, 255]);
  await page.locator('.image-stage').focus(); await page.keyboard.press('Control+z'); await expect(page.locator('.image-layer')).toHaveCount(1);
});

test('Paint rejects project/text drops with guidance and prevents browser navigation', async ({ page }) => {
  const before = page.url();
  const prevented = await page.evaluate(() => {
    const data = new DataTransfer(); data.items.add(new File(['project'], 'Saved.gsnv-image')); data.items.add(new File(['notes'], 'Notes.txt'));
    return !document.querySelector('.image-stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  expect(prevented).toBe(true); await expect(page.locator('.image-tool-hint')).toContainText('File → Open');
  await expect(page.locator('.image-tool-hint')).toContainText('PNG, JPEG'); expect(page.url()).toBe(before);
  await expect(page.locator('.image-layer')).toHaveCount(1); await expect(page.locator('.image-canvas')).toHaveAttribute('width', '800');
});

test('Paint rejects overlapping drops and stops a delayed import after a workspace switch', async ({ page }) => {
  await page.evaluate(() => {
    const decode = window.createImageBitmap.bind(window); (window as any).dropDecodes = 0;
    window.createImageBitmap = ((blob: Blob) => { (window as any).dropDecodes++; return new Promise<ImageBitmap>((resolve, reject) => {
      (window as any).finishDropDecode = () => decode(blob).then(resolve, reject);
    }); }) as typeof createImageBitmap;
  });
  await drop(page, [{ name: 'One.png', width: 8, height: 8, color: '#ff0000' }, { name: 'Two.png', width: 8, height: 8, color: '#00ff00' }]);
  await drop(page, [{ name: 'Overlap.png', width: 8, height: 8, color: '#0000ff' }]);
  await expect(page.locator('.image-tool-hint')).toContainText('still loading');
  await page.getByRole('tab', { name: 'CAD', exact: true }).click();
  await page.evaluate(() => (window as any).finishDropDecode());
  await page.getByRole('tab', { name: 'Image', exact: true }).click();
  await expect(page.locator('.image-canvas')).toHaveAttribute('width', '800'); await expect(page.locator('.image-layer')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).dropDecodes)).toBe(1);
});

test('Paint imports a drawing above the former 16M-pixel limit at its original size', async ({ page }) => {
  test.setTimeout(90000);
  await drop(page, [{ name: 'Large drawing.png', width: 4200, height: 4000, color: '#ffffff' }]);
  await expect(page.locator('.image-canvas')).toHaveAttribute('width', '4200', { timeout: 60000 });
  await expect(page.locator('.image-canvas')).toHaveAttribute('height', '4000'); await expect(page.locator('.image-layer')).toHaveCount(1);
  expect(await names(page)).toEqual(['Large drawing']);
});
