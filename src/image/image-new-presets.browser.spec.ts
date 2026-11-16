import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';

const newDialog = (page: Page) => page.getByRole('dialog', { name: 'New image', exact: true });
const field = (page: Page, label: string) => newDialog(page).getByLabel(label, { exact: true });

async function demo(page: Page) {
  await page.goto('/src/image/image-settings.demo.html');
  await page.getByRole('button', { name: 'New image', exact: true }).click();
  return newDialog(page);
}

test('New image presets update all fields, swap without committing, and recover invalid custom sizes', async ({ page }) => {
  const dialog = await demo(page);
  await expect(field(page, 'Preset')).toHaveValue('letter');
  await expect(field(page, 'Width (px)')).toHaveValue('2550');
  await expect(field(page, 'Height (px)')).toHaveValue('3300');
  await expect(field(page, 'Background')).toHaveValue('white');
  await expect(field(page, 'Rendering')).toHaveValue('pixel-art');
  await expect(field(page, 'Colour limit')).toHaveValue('full');

  const swap = dialog.getByRole('button', { name: 'Swap width and height', exact: true });
  await swap.focus(); await swap.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(field(page, 'Width (px)')).toHaveValue('3300');
  await expect(field(page, 'Height (px)')).toHaveValue('2550');
  await expect(field(page, 'Preset')).toHaveValue('letter');
  await expect(page.locator('main > pre')).toBeEmpty();

  await field(page, 'Preset').selectOption('comic-64');
  await expect(field(page, 'Background')).toHaveValue('transparent');
  await expect(field(page, 'Rendering')).toHaveValue('pixel-art');
  await expect(field(page, 'Colour limit')).toHaveValue('64');
  await expect(field(page, 'Dithering')).toHaveValue('none');
  await expect(dialog.locator('figcaption')).toContainText('3300 × 2550');

  await swap.click();
  await expect(field(page, 'Preset')).toHaveValue('comic-64');
  await expect(field(page, 'Width (px)')).toHaveValue('2550');
  await expect(field(page, 'Height (px)')).toHaveValue('3300');
  await expect(field(page, 'Colour limit')).toHaveValue('64');
  await field(page, 'Preset').selectOption('custom');
  await expect(field(page, 'Width (px)')).toHaveValue('2550');
  await expect(field(page, 'Colour limit')).toHaveValue('64');

  await field(page, 'Width (px)').fill('');
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).not.toBeEmpty();
  await field(page, 'Preset').selectOption('reels');
  await expect(field(page, 'Width (px)')).toHaveValue('1080');
  await expect(field(page, 'Height (px)')).toHaveValue('1920');
  await expect(field(page, 'Rendering')).toHaveValue('smooth');
  await expect(field(page, 'Background')).toHaveValue('white');
  await expect(field(page, 'Colour limit')).toHaveValue('full');
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeEnabled();
  await field(page, 'Width (px)').fill('1000');
  await expect(field(page, 'Preset')).toHaveValue('custom');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.locator('main > pre')).toBeEmpty();
});

test('Maximum square respects the pixel budget and every named preset creates valid settings', async ({ page }) => {
  const dialog = await demo(page);
  await field(page, 'Preset').selectOption('square-max');
  await expect(field(page, 'Width (px)')).toHaveValue('8192');
  await expect(field(page, 'Height (px)')).toHaveValue('8192');
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeEnabled();
  await field(page, 'Width (px)').fill('8193');
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('67,108,864');

  const presets = await field(page, 'Preset').locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(value => value !== 'custom'));
  expect(presets).toContain('youtube-thumbnail');
  expect(presets.length).toBeGreaterThanOrEqual(8);
  for (const preset of presets) {
    await field(page, 'Preset').selectOption(preset);
    const width = Number(await field(page, 'Width (px)').inputValue());
    const height = Number(await field(page, 'Height (px)').inputValue());
    expect(width * height, preset).toBeLessThanOrEqual(8192 * 8192);
    expect(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0, preset).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeEnabled();
  }
  await field(page, 'Preset').selectOption('youtube-thumbnail');
  await expect(field(page, 'Width (px)')).toHaveValue('1280');
  await expect(field(page, 'Height (px)')).toHaveValue('720');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('main > pre')).toContainText('"width": 1280');
  await expect(page.locator('main > pre')).toContainText('"height": 720');
});

for (const width of [390, 320]) test(`New image labels, selected text and actions fit a ${width}px viewport`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 700 });
  const dialog = await demo(page);
  await field(page, 'Preset').selectOption('comic-64');
  await page.evaluate(() => document.fonts.ready);
  const geometry = await dialog.evaluate(element => {
    const dialog = element as HTMLDialogElement, box = dialog.getBoundingClientRect();
    const controls = [...dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')].map(control => {
      const rect = control.getBoundingClientRect();
      return { name: control.name, left: rect.left, right: rect.right, width: rect.width };
    });
    const colours = dialog.querySelector<HTMLSelectElement>('[name=colours]')!, style = getComputedStyle(colours);
    const context = document.createElement('canvas').getContext('2d')!; context.font = style.font;
    const textWidth = context.measureText(colours.selectedOptions[0]!.textContent!).width;
    return {
      left: box.left, right: box.right, horizontalOverflow: dialog.scrollWidth > dialog.clientWidth,
      controls, selectedWidth: colours.clientWidth, textWidth,
      padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(width);
  expect(geometry.horizontalOverflow).toBe(false);
  for (const control of geometry.controls) {
    expect(control.left, control.name).toBeGreaterThanOrEqual(geometry.left);
    expect(control.right, control.name).toBeLessThanOrEqual(geometry.right);
    expect(control.width, control.name).toBeGreaterThan(50);
  }
  expect(geometry.selectedWidth).toBeGreaterThan(geometry.textWidth + geometry.padding + 20);
  await dialog.screenshot({ path: testInfo.outputPath(`new-image-${width}.png`) });
  await dialog.getByRole('button', { name: 'Swap width and height', exact: true }).click();
  await expect(field(page, 'Width (px)')).toHaveValue('2550');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.locator('main > pre')).toContainText('"width": 2550');
});

test('File New creates Letter paper and the screenshot preset with their actual dimensions and pixel policy', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const server = await preview({ build: { outDir: process.env.GSNV_TEST_DIST ?? 'dist' }, preview: { host: '127.0.0.1', port: 4226, strictPort: true } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.resolvedUrls!.local[0]!);
    const canvas = page.locator('.image-canvas');
    await page.locator('.gc-standard [data-command="file.new"]').click();
    await expect(field(page, 'Preset')).toHaveValue('letter');
    await newDialog(page).screenshot({ path: testInfo.outputPath('new-image-letter.png') });
    await newDialog(page).getByRole('button', { name: 'Create', exact: true }).click();
    await expect(canvas).toHaveAttribute('width', '2550');
    await expect(canvas).toHaveAttribute('height', '3300');
    expect(await canvas.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data])).toEqual([255, 255, 255, 255]);

    await page.locator('.gc-standard [data-command="file.new"]').click();
    await field(page, 'Preset').selectOption('comic-64');
    await newDialog(page).screenshot({ path: testInfo.outputPath('new-image-comic-64.png') });
    await newDialog(page).getByRole('button', { name: 'Create', exact: true }).click();
    await expect(canvas).toHaveAttribute('width', '3300');
    await expect(canvas).toHaveAttribute('height', '2550');
    await expect.poll(() => canvas.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data])).toEqual([0, 0, 0, 0]);

    await page.getByRole('menubar').getByRole('menuitem', { name: 'Image', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Pixel settings…', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Pixel settings', exact: true });
    await expect(settings.getByLabel('Rendering', { exact: true })).toHaveValue('pixel-art');
    await expect(settings.getByLabel('Colour limit', { exact: true })).toHaveValue('64');
    await expect(settings.getByLabel('Dithering', { exact: true })).toHaveValue('none');
    await settings.getByRole('button', { name: 'Cancel', exact: true }).click();

    await page.locator('.gc-standard [data-command="file.new"]').click();
    await field(page, 'Preset').selectOption('square-max');
    await newDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(canvas).toHaveAttribute('width', '3300');
    await expect(canvas).toHaveAttribute('height', '2550');
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
