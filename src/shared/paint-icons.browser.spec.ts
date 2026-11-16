import { test, expect } from '@playwright/test';

test('PIR-01/02/03/04 native Paint icons remain clear, selectable and local at DPR1/2 and touch size', async ({ browser }, info) => {
  for (const setup of [
    { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false },
    { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, hasTouch: false },
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true },
  ]) {
    const context = await browser.newContext(setup), page = await context.newPage();
    await page.goto('/');
    const palette = page.locator('.gc-palette');
    await expect(palette.locator('button')).toHaveCount(19);
    const header = await page.locator('.gc-workspaces').innerHTML();
    await expect(page.locator('.gc-workspaces image')).toHaveCount(0);
    const icons = palette.locator('svg');
    expect(await icons.evaluateAll(async elements => Promise.all(elements.map(async svg => {
      const image = svg.querySelector('image')!;
      const decoded = new Image(); decoded.src = image.getAttribute('href')!; await decoded.decode();
      return { width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height,
        naturalWidth: decoded.naturalWidth, naturalHeight: decoded.naturalHeight,
        rendering: getComputedStyle(image).imageRendering };
    })))).toEqual(Array.from({ length: 19 }, () => ({ width: 24, height: 24, naturalWidth: 24, naturalHeight: 24, rendering: 'pixelated' })));
    for (const tool of ['move', 'select', 'ellipseSelect', 'lasso', 'wand', 'pencil', 'brush', 'airbrush', 'eraser', 'clone', 'blur', 'smudge', 'fill', 'gradient', 'picker', 'text', 'line', 'rectangle', 'ellipse']) {
      const button = palette.locator(`[data-command="image.${tool}"]`);
      await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
      const box = (await button.boundingBox())!;
      expect(box.width).toBe(setup.hasTouch ? 40 : 32); expect(box.height).toBe(setup.hasTouch ? 40 : 32);
      await expect(button).toHaveAttribute('title', /.+\(.+\)/);
    }
    await expect(page.locator('.gc-standard [data-command="image.transform"] image')).toHaveAttribute('href', /^data:image\/png;base64,/);
    const name = `${setup.hasTouch ? 'touch' : 'desktop'}-dpr${setup.deviceScaleFactor}`;
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
    await info.attach(name, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
    await page.getByRole('tab', { name: 'Photo', exact: true }).click();
    await expect(palette.locator('image')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Image', exact: true }).click();
    await expect(palette.locator('image')).toHaveCount(19);
    expect(await page.locator('.gc-workspaces').innerHTML()).toBe(header);
    await page.getByRole('menubar').getByRole('menuitem', { name: 'Help', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Search Help… (F1)', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Help', exact: true });
    await dialog.getByRole('searchbox').fill('icon credits');
    await expect(dialog.getByRole('article')).toContainText('Yusuke Kamiyamane');
    await expect(dialog.getByRole('link', { name: 'Icon credits' })).toHaveAttribute('href', './icon-credits.html');
    await context.close();
  }
});

test('PIR-01 illustrated Paint artwork keeps hard pixel coverage and a clear margin without clipping', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.gc-palette image')).toHaveCount(19);
  const result = await page.locator('.gc-palette image').evaluateAll(async images => {
    let partialAlpha = 0, clippedPixels = 0; const occupied: number[] = [];
    for (const image of images) {
      const decoded = new Image(); decoded.src = image.getAttribute('href')!; await decoded.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
      const context = canvas.getContext('2d')!; context.drawImage(decoded, 0, 0);
      const data = context.getImageData(0, 0, 24, 24).data; let pixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        if (data[i + 3] !== 255) partialAlpha++;
        pixels++;
        const x = i / 4 % 24, y = Math.floor(i / 4 / 24);
        if (x === 0 || y === 0 || x === 23 || y === 23) clippedPixels++;
      }
      occupied.push(pixels);
    }
    return { partialAlpha, clippedPixels, occupied };
  });
  expect(result.partialAlpha).toBe(0);
  expect(result.clippedPixels).toBe(0);
  expect(result.occupied).toHaveLength(19);
  for (const pixels of result.occupied) expect(pixels).toBeGreaterThan(30);
});
