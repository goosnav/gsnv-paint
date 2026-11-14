import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';

const menu = async (page: Page, top: string, item: string) => {
  await page.getByRole('menuitem', { name: top, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
};

test('IMG-103/104 production controls match the exact golden and preserve editable layers and selection on reopen', async ({ page, context }) => {
  test.setTimeout(90000);
  const server = await preview({ build: { outDir: process.env.GSNV_TEST_DIST ?? 'dist' }, preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
  });
  try {
    const fixture = JSON.parse(await readFile(new URL('./fixtures/acceptance-rgba.json', import.meta.url), 'utf8')) as { rows: string[]; palette: Record<string, number[]> };
    const expected = fixture.rows.flatMap(row => [...row].flatMap(c => fixture.palette[c]!));
    const empty = nativeContainer({ op: 'encode', package: {
      project: { format: 'gsnv-image', version: 1, id: 'acceptance-image', title: 'Image acceptance',
        content: { width: 32, height: 24, encoding: 'rgba8', asset: 'pixels' } },
      assets: [{ id: 'pixels', mime: 'application/octet-stream', bytes: new Uint8Array(32 * 24 * 4) }],
    } });
    await page.goto(server.resolvedUrls!.local[0]!);
    await page.getByRole('tab', { name: 'Image', exact: true }).click();
    const opening = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
    await (await opening).setFiles({ name: 'acceptance.gsnv-image', mimeType: 'application/octet-stream', buffer: Buffer.concat(empty.parts) });
    const canvas = page.locator('.image-canvas'); await expect(canvas).toHaveAttribute('width', '32');
    const box = (await canvas.boundingBox())!;
    const at = (x: number, y: number) => [box.x + (x + 0.5) * box.width / 32, box.y + (y + 0.5) * box.height / 24] as const;
    const drag = async (a: readonly [number, number], b: readonly [number, number]) => {
      await page.mouse.move(...a); await page.mouse.down(); await page.mouse.move(...b, { steps: 8 }); await page.mouse.up();
    };
    await page.keyboard.press('p');
    await page.locator('input[type=number][data-option=size]').fill('1'); await page.keyboard.press('Enter');
    await page.locator('[data-color="#ff0000"]').click();
    await page.mouse.move(...at(1, 1)); await page.mouse.down();
    await page.mouse.move(...at(12, 1), { steps: 6 }); await page.mouse.move(...at(12, 8), { steps: 6 }); await page.mouse.up();
    await page.locator('.gc-standard button[data-command="layer.new"]').click(); await expect(page.locator('.image-layer')).toHaveCount(2);
    await page.keyboard.press('s'); await drag(at(4, 4), at(20, 16));
    await page.locator('.image-primary').fill('#4080c0');
    // The colour input still owns keyboard focus after exact entry; choose Fill through its tool button.
    await page.locator('.gc-palette button[data-command="image.fill"]').click();
    await expect(page.locator('.gc-palette button[data-command="image.fill"]')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(...at(8, 8));
    await page.keyboard.press('s'); await page.keyboard.down('Shift'); await drag(at(16, 12), at(28, 20)); await page.keyboard.up('Shift');
    await menu(page, 'Adjustments', 'Invert colours'); await menu(page, 'Adjustments', 'Threshold…');
    await page.getByRole('dialog').getByLabel('Level', { exact: true }).fill('128');
    await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
    await page.locator('#image-layer-blend').selectOption('multiply');
    await page.locator('input[type=number][data-layer-control=opacity]').fill('50'); await page.keyboard.press('Enter');
    const actual = await canvas.evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(0, 0, 32, 24).data]);
    expect(actual).toEqual(expected);
    const saving = page.waitForEvent('download'); await page.keyboard.press('Control+s');
    const saved = await saving, bytes = await readFile((await saved.path())!);
    const before = nativeContainer({ op: 'decode', parts: [bytes] });
    expect(before.project.content).toMatchObject({ encoding: 'rgba8-layers-v2', selection: { encoding: 'gray8', asset: 'selection' } });
    const mask = before.assets.find(a => a.id === 'selection')!.bytes;
    const expectedMask = Array.from({ length: 768 }, (_, p) => {
      const x = p % 32, y = Math.floor(p / 32);
      return ((x >= 4 && x <= 20 && y >= 4 && y <= 16) || (x >= 16 && x <= 28 && y >= 12 && y <= 20)) ? 255 : 0;
    });
    expect([...mask]).toEqual(expectedMask);
    await page.keyboard.press('Control+n'); await expect(canvas).toHaveAttribute('width', '800');
    await expect(page.locator('.gc-standard button[data-command="file.open"]')).toBeEnabled();
    expect(await page.evaluate(() => ({ inside: document.querySelector('#app')!.contains(document.activeElement), element: document.activeElement?.outerHTML.slice(0, 300) }))).toMatchObject({ inside: true });
    const choosing = page.waitForEvent('filechooser', { timeout: 5000 }); await page.keyboard.press('Control+o');
    await (await choosing).setFiles({ name: saved.suggestedFilename(), mimeType: 'application/octet-stream', buffer: bytes });
    await expect(canvas).toHaveAttribute('width', '32');
    await expect(page.locator('.image-info')).toContainText('selection 25 × 17');
    expect(await canvas.evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(0, 0, 32, 24).data])).toEqual(expected);
    const savingAgain = page.waitForEvent('download'); await page.keyboard.press('Control+s');
    const reopened = nativeContainer({ op: 'decode', parts: [await readFile((await (await savingAgain).path())!)] });
    expect(reopened.project).toEqual(before.project);
    expect(reopened.assets.map(a => ({ id: a.id, mime: a.mime, bytes: [...a.bytes] }))).toEqual(before.assets.map(a => ({ id: a.id, mime: a.mime, bytes: [...a.bytes] })));
    await menu(page, 'View', 'View settings');
    await page.getByRole('dialog').getByLabel('Zoom (%)').fill('800');
    await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
    await page.screenshot({ path: 'dev/evidence/IMG-103104-production.png' });
    await page.locator('[data-layer-id="background"]').click();
    await page.locator('[data-color="#0000ff"]').click(); await page.keyboard.press('p');
    await page.locator('input[type=number][data-option=size]').fill('1'); await page.keyboard.press('Enter');
    const reopenedBox = (await canvas.boundingBox())!;
    await page.mouse.click(reopenedBox.x + 6.5 * reopenedBox.width / 32, reopenedBox.y + 6.5 * reopenedBox.height / 24);
    expect(await canvas.evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(6, 6, 1, 1).data])).toEqual([0, 0, 255, 255]);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

test('Image selection-only edits undo, recover, cancel a floating move and clear on another legacy document', async ({ page, context }) => {
  test.setTimeout(90000);
  const server = await preview({ build: { outDir: process.env.GSNV_TEST_DIST ?? 'dist' }, preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
  await context.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const legacy = (id: string) => Buffer.concat(nativeContainer({ op: 'encode', package: {
    project: { format: 'gsnv-image', version: 1, id, title: id, content: { width: 32, height: 24, encoding: 'rgba8', asset: 'pixels' } },
    assets: [{ id: 'pixels', mime: 'application/octet-stream', bytes: new Uint8Array(3072) }],
  } }).parts);
  const open = async (id: string) => {
    const choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
    await (await choosing).setFiles({ name: `${id}.gsnv-image`, mimeType: 'application/octet-stream', buffer: legacy(id) });
    await expect(page.locator('[data-window-title]')).toContainText(id);
  };
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Image', exact: true }).click();
    await open('Selection recovery');
    const canvas = page.locator('.image-canvas'), info = page.locator('.image-info');
    await expect(canvas).toHaveAttribute('width', '32');
    const box = (await canvas.boundingBox())!;
    const at = (x: number, y: number) => [box.x + (x + 0.5) * box.width / 32, box.y + (y + 0.5) * box.height / 24] as const;
    const drag = async (a: readonly [number, number], b: readonly [number, number]) => { await page.mouse.move(...a); await page.mouse.down(); await page.mouse.move(...b, { steps: 4 }); await page.mouse.up(); };
    await page.keyboard.press('s'); await drag(at(4, 4), at(20, 16)); await expect(info).toContainText('selection 17 × 13');
    await expect(page.locator('[data-panel-history] li')).toHaveText(['Select', 'Current state']);
    await page.keyboard.press('Control+z'); await expect(info).not.toContainText('selection');
    await page.keyboard.press('Control+Shift+z'); await expect(info).toContainText('selection 17 × 13');
    await page.keyboard.press('Escape'); await expect(info).not.toContainText('selection');
    await page.keyboard.press('Control+z'); await expect(info).toContainText('selection 17 × 13');
    await page.keyboard.down('Shift'); await drag(at(16, 12), at(28, 20)); await page.keyboard.up('Shift');
    await expect(info).toContainText('selection 25 × 17');
    await page.keyboard.press('v'); await drag(at(8, 8), at(10, 10));
    await expect(page.locator('.image-floating')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('.image-floating')).toBeHidden();
    await expect(info).toContainText('selection 25 × 17');
    expect(await canvas.evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(0, 0, 32, 24).data].every(n => n === 0))).toBe(true);
    await expect(page.locator('[data-panel-history] li')).toHaveText(['Select', 'Add selection', 'Current state']);
    // Recovery is asynchronous; inspect its persisted domain record rather than sleep for a guessed interval.
    await expect.poll(async () => {
      const bytes = await page.evaluate(async () => {
        if (!(await indexedDB.databases()).some(d => d.name === 'gsnv-paint-recovery')) return null;
        const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('gsnv-paint-recovery'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        try {
          const row = await new Promise<{ payload: Blob[] } | undefined>((resolve, reject) => { const r = db.transaction('workspaces').objectStore('workspaces').get('image'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
          return row ? [...new Uint8Array(await new Blob(row.payload).arrayBuffer())] : null;
        } finally { db.close(); }
      });
      if (!bytes) return 0;
      const pkg = nativeContainer({ op: 'decode', parts: [Uint8Array.from(bytes)] });
      return pkg.assets.find(a => a.id === 'selection')?.bytes.filter(n => n === 255).length ?? 0;
    }).toBe(313);
    await page.reload(); await page.getByRole('tab', { name: 'Image', exact: true }).click();
    await expect(info).toContainText('selection 25 × 17');
    const saving = page.waitForEvent('download'); await page.keyboard.press('Control+s');
    const recovered = nativeContainer({ op: 'decode', parts: [await readFile((await (await saving).path())!)] });
    expect([...recovered.assets.find(a => a.id === 'selection')!.bytes].filter(n => n === 255)).toHaveLength(313);
    await open('Unselected legacy'); await expect(info).not.toContainText('selection');
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

test('Image typed zoom stays centered, previews and cancels, matches Fit and retains wheel anchoring', async ({ page, context }) => {
  const server = await preview({ build: { outDir: process.env.GSNV_TEST_DIST ?? 'dist' }, preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }));
  const near = (actual: number, expected: number, tolerance = 1) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Image', exact: true }).click();
    const encoded = nativeContainer({ op: 'encode', package: {
      project: { format: 'gsnv-image', version: 1, id: 'zoom-image', title: 'Zoom', content: { width: 32, height: 24, encoding: 'rgba8', asset: 'pixels' } },
      assets: [{ id: 'pixels', mime: 'application/octet-stream', bytes: new Uint8Array(32 * 24 * 4) }],
    } });
    const choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
    await (await choosing).setFiles({ name: 'zoom.gsnv-image', mimeType: 'application/octet-stream', buffer: Buffer.concat(encoded.parts) });
    const canvas = page.locator('.image-canvas'), stage = page.locator('.image-stage');
    await expect(canvas).toHaveAttribute('width', '32');
    const original = (await canvas.boundingBox())!, viewport = (await stage.boundingBox())!;
    const center = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
    const history = await page.locator('[data-panel-history] li').allTextContents();
    await menu(page, 'View', 'View settings');
    const dialog = page.getByRole('dialog', { name: 'View settings', exact: true });
    await dialog.getByLabel('Zoom (%)', { exact: true }).fill('800');
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(256);
    const enlarged = (await canvas.boundingBox())!;
    near(enlarged.x + enlarged.width / 2, center.x); near(enlarged.y + enlarged.height / 2, center.y);
    expect(enlarged.x).toBeGreaterThan(viewport.x); expect(enlarged.y).toBeGreaterThan(viewport.y);
    await page.keyboard.press('Escape'); expect(await canvas.boundingBox()).toEqual(original);
    await menu(page, 'View', 'View settings');
    await dialog.getByLabel('Zoom (%)', { exact: true }).fill('200');
    await dialog.getByLabel('Horizontal offset (px)', { exact: true }).fill('18');
    await dialog.getByLabel('Vertical offset (px)', { exact: true }).fill('-12');
    await page.keyboard.press('Enter');
    const shifted = (await canvas.boundingBox())!;
    expect(shifted.width).toBe(64); expect(shifted.height).toBe(48);
    near(shifted.x + shifted.width / 2, center.x + 18); near(shifted.y + shifted.height / 2, center.y - 12);
    const anchor = { x: shifted.x + shifted.width / 4, y: shifted.y + shifted.height / 4 };
    await page.mouse.move(anchor.x, anchor.y); await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(128);
    const wheeled = (await canvas.boundingBox())!;
    near((anchor.x - wheeled.x) * 32 / wheeled.width, 8, 0.25); near((anchor.y - wheeled.y) * 24 / wheeled.height, 6, 0.25);
    await page.keyboard.press('f'); near((await canvas.boundingBox())!.width, 32);
    await page.keyboard.press('Control+n'); await expect(canvas).toHaveAttribute('width', '800');
    const fitted = (await canvas.boundingBox())!;
    await menu(page, 'View', 'View settings');
    near(Number(await dialog.getByLabel('Zoom (%)', { exact: true }).inputValue()), fitted.width / 8, 0.1);
    await dialog.getByLabel('Zoom (%)', { exact: true }).fill('125');
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(1000);
    await page.keyboard.press('Escape'); expect(await canvas.boundingBox()).toEqual(fitted);
    expect(await page.locator('[data-panel-history] li').allTextContents()).toEqual(history);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
