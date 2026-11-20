/** Real editor measurements, not a synthetic canvas/GPU benchmark. */
import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { localAppPlugin, localAppPath } from '../launcher/local-app.mjs';

type Sample = { phase: string; event: string; buttons: number; start: number; handlerMs: number; nextFrameMs: number | null };
type Probe = { phase: string; samples: Sample[]; longTasks: { start: number; duration: number }[]; activePointer: number; row: Element | null };
type ProbeWindow = Window & { imagePerformanceProbe: Probe };
const WIDTH = 2550, HEIGHT = 3300;
const variants = [
  ...(process.env.GSNV_BASELINE_DIST ? [{ label: 'baseline', directory: process.env.GSNV_BASELINE_DIST, revision: process.env.GSNV_BASELINE_REV ?? 'aef6295ee470dbacff6207e699094486e8f1531f' }] : []),
  { label: 'current', directory: process.env.GSNV_TEST_DIST ?? 'dist', revision: process.env.GSNV_CURRENT_REV ?? 'working-tree' },
];
const canvas = (page: Page) => page.locator('.image-canvas');
const pixel = (page: Page, x: number, y: number) => canvas(page).evaluate((c: HTMLCanvasElement, point) => [...c.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data], { x, y });
const digest = (page: Page) => canvas(page).evaluate(async (c: HTMLCanvasElement) => {
  const bytes = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
});
const tool = (page: Page, name: string) => page.locator(`.gc-palette [data-command="image.${name}"]`).click();
async function number(page: Page, name: string, value: number) {
  await page.locator(`input[type="number"][data-option="${name}"]`).fill(String(value));
  await page.keyboard.press('Enter');
}
async function newImage(page: Page, width: number, height: number) {
  await page.locator('.gc-standard [data-command="file.new"]').click();
  const dialog = page.getByRole('dialog', { name: 'New image', exact: true });
  await dialog.getByLabel('Width (px)', { exact: true }).fill(String(width));
  await dialog.getByLabel('Height (px)', { exact: true }).fill(String(height));
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('width', String(width));
  await expect(canvas(page)).toHaveAttribute('height', String(height));
}
async function point(page: Page, x: number, y: number) {
  const box = (await canvas(page).boundingBox())!;
  const dimensions = await canvas(page).evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
  return { x: box.x + (x + .5) * box.width / dimensions.width, y: box.y + (y + .5) * box.height / dimensions.height };
}
async function draw(page: Page, a: [number, number], b: [number, number], steps = 24) {
  const start = await point(page, ...a), end = await point(page, ...b);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps }); await page.mouse.up();
}
async function localServer(directory: string, revision: string) {
  const outDir = resolve(directory), html = await readFile(resolve(outDir, 'index.html'), 'utf8');
  const buildId = html.match(/<meta\s+name="gsnv-build-id"\s+content="([a-f0-9]{64})"/)?.[1];
  if (!buildId) throw new Error(`No production build identity in ${outDir}`);
  const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 4235, strictPort: true },
    // Exercise the actual local entry; do not benchmark background offline installation.
    plugins: [localAppPlugin({ buildId, sourceId: buildId, checkoutId: buildId, revision: revision.slice(0, 12) })] });
  return { server, url: server.resolvedUrls!.local[0]!.replace(/\/$/, '') + localAppPath(buildId) };
}

for (const variant of variants) test(`${variant.label}: Letter image interaction, undo and persisted pixels`, async ({ page, browser }, testInfo) => {
  const { server, url } = await localServer(variant.directory, variant.revision), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url); await newImage(page, WIDTH, HEIGHT); await tool(page, 'pencil'); await number(page, 'size', 9);
    expect(await pixel(page, 1000, 1500)).toEqual([255, 255, 255, 255]);
    await page.evaluate(() => {
      const state: Probe = { phase: 'idle', samples: [], longTasks: [], activePointer: 0, row: null };
      (window as ProbeWindow).imagePerformanceProbe = state;
      const starts = new WeakMap<Event, { start: number; phase: string }>();
      for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
        window.addEventListener(type, event => {
          if (!(event.target instanceof Element) || !event.target.closest('.gc-viewport')) return;
          if (type === 'pointerdown') state.activePointer = (event as PointerEvent).pointerId;
          if (state.phase !== 'idle') starts.set(event, { start: performance.now(), phase: state.phase });
        }, true);
        window.addEventListener(type, event => {
          const start = starts.get(event); if (!start) return;
          const sample: Sample = { ...start, event: type, buttons: (event as PointerEvent).buttons, handlerMs: performance.now() - start.start, nextFrameMs: null };
          state.samples.push(sample);
          // Includes synchronous work and microtasks before the next animation frame.
          // It is not a claim about physical display latency or frame rate.
          requestAnimationFrame(() => { sample.nextFrameMs = performance.now() - start.start; });
        });
      }
      new PerformanceObserver(list => { for (const task of list.getEntries()) state.longTasks.push({ start: task.startTime, duration: task.duration }); }).observe({ type: 'longtask' });
    });
    const measuredStart = await page.evaluate(() => { (window as ProbeWindow).imagePerformanceProbe.phase = 'drawing'; return performance.now(); });
    for (const y of [600, 900, 1200, 1500]) await draw(page, [500, y], [1800, y]);
    const measuredEnd = await page.evaluate(() => { (window as ProbeWindow).imagePerformanceProbe.phase = 'idle'; return performance.now(); });
    for (const y of [600, 900, 1200, 1500]) expect(await pixel(page, 1000, y)).toEqual([0, 0, 0, 255]);
    await expect(page.locator('[data-panel-history] li')).toHaveText(['Pencil', 'Pencil', 'Pencil', 'Pencil', 'Current state']);

    await page.evaluate(() => { const state = (window as ProbeWindow).imagePerformanceProbe; state.row = document.querySelector('.image-layer'); state.phase = 'hover'; });
    const start = await point(page, 700, 1700), end = await point(page, 1700, 1700);
    await page.mouse.move(start.x, start.y); await page.mouse.move(end.x, end.y, { steps: 40 });
    const stableLayerRow = await page.evaluate(() => { const state = (window as ProbeWindow).imagePerformanceProbe; state.phase = 'idle'; return state.row === document.querySelector('.image-layer'); });
    if (variant.label === 'current') expect(stableLayerRow, 'Hovering must not rebuild the unchanged Layers panel').toBe(true);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const measured = await page.evaluate(() => { const { samples, longTasks } = (window as ProbeWindow).imagePerformanceProbe; return { samples, longTasks }; });
    expect(measured.samples.filter(sample => sample.phase === 'drawing' && sample.event === 'pointerup')).toHaveLength(4);
    expect(measured.samples.every(sample => sample.nextFrameMs !== null)).toBe(true);
    const report = { variant: variant.label, revision: variant.revision, browser: browser.version(), platform: `${process.platform}/${process.arch}`,
      dimensions: { width: WIDTH, height: HEIGHT, layers: 1 }, strokes: 4, stableLayerRow, measuredStart, measuredEnd,
      ...measured, measurement: 'Capture-to-bubble synchronous handler time and input-to-next-animation-frame; no network, renderer-presentation or physical-device latency claim.' };
    await writeFile(testInfo.outputPath('interaction.json'), JSON.stringify(report, null, 2));
    console.log(`IMAGE_PERFORMANCE ${JSON.stringify({ variant: variant.label, revision: variant.revision, samples: measured.samples.length, stableLayerRow })}`);

    await page.locator('.gc-standard [data-command="edit.undo"]').click(); expect(await pixel(page, 1000, 1500)).toEqual([255, 255, 255, 255]);
    await page.locator('.gc-standard [data-command="edit.redo"]').click(); expect(await pixel(page, 1000, 1500)).toEqual([0, 0, 0, 255]);
    // Wait for the last stroke's actual bytes, not a fixed autosave sleep or a stale status label.
    await expect.poll(() => page.evaluate(({ width, height }) => new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open('gsnv-paint-recent');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('projects', 'readonly'), records = tx.objectStore('projects').getAll();
        records.onsuccess = () => resolve(records.result.some((record: { parts: Uint8Array[] }) => record.parts.some(part => part.length === width * height * 4 && part[(1500 * width + 1000) * 4] === 0 && part[(1500 * width + 1000) * 4 + 3] === 255)));
        records.onerror = () => reject(records.error); tx.oncomplete = () => db.close();
      };
    }), { width: WIDTH, height: HEIGHT }), { timeout: 30_000 }).toBe(true);
    await page.reload(); await expect(canvas(page)).toHaveAttribute('width', String(WIDTH));
    for (const y of [600, 900, 1200, 1500]) expect(await pixel(page, 1000, y)).toEqual([0, 0, 0, 255]);
    if (variant.label === 'current') await page.screenshot({ path: testInfo.outputPath('letter-image.png') });
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

test('current: recorded stroke tools replay the committed pixels exactly', async ({ page }) => {
  const variant = variants.at(-1)!, { server, url } = await localServer(variant.directory, variant.revision), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const menu = async (name: string) => { await page.getByRole('menubar').getByRole('menuitem', { name: 'Automation', exact: true }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
  try {
    await page.goto(url); await newImage(page, 128, 96); await menu('Start recording');
    await tool(page, 'pencil'); await number(page, 'size', 7); await draw(page, [12, 18], [108, 18], 8);
    await tool(page, 'brush'); await page.getByLabel('Primary colour', { exact: true }).fill('#cc2040');
    await page.getByLabel('Edges', { exact: true }).selectOption('smooth'); await number(page, 'size', 16); await number(page, 'hardness', 50); await number(page, 'opacity', 65); await number(page, 'flow', 60);
    await draw(page, [15, 32], [106, 40], 12);
    await tool(page, 'eraser'); await number(page, 'size', 9); await draw(page, [35, 10], [35, 42], 8);
    await page.locator('.gc-standard [data-command="layer.new"]').click();
    await tool(page, 'brush'); await page.getByLabel('Edges', { exact: true }).selectOption('pixel'); await page.getByLabel('Primary colour', { exact: true }).fill('#2050dd'); await number(page, 'opacity', 100);
    await draw(page, [15, 58], [110, 62], 12); await tool(page, 'eraser'); await draw(page, [70, 50], [70, 70], 8);
    await tool(page, 'clone'); const from = await point(page, 35, 59);
    await page.keyboard.down('Control'); await page.mouse.click(from.x, from.y); await page.keyboard.up('Control'); await draw(page, [35, 78], [60, 78], 8);
    await tool(page, 'blur'); await draw(page, [22, 56], [56, 64], 8);
    await tool(page, 'smudge'); await draw(page, [90, 60], [105, 78], 8);
    await tool(page, 'airbrush'); await draw(page, [12, 80], [23, 80], 8);
    await menu('Stop recording'); const expected = await digest(page);
    await newImage(page, 128, 96); const blank = await digest(page);
    await menu('Actions…'); await page.getByRole('dialog', { name: 'Image actions', exact: true }).getByRole('button', { name: 'Apply once', exact: true }).click();
    await expect.poll(() => digest(page)).toBe(expected);
    await page.locator('.gc-standard [data-command="edit.undo"]').click(); expect(await digest(page)).toBe(blank);
    await page.locator('.gc-standard [data-command="edit.redo"]').click(); expect(await digest(page)).toBe(expected);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

test('current: switching tools with the pointer held records the stroke and cancels unfinished shapes', async ({ page }) => {
  const variant = variants.at(-1)!, { server, url } = await localServer(variant.directory, variant.revision), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const menu = async (name: string) => { await page.getByRole('menubar').getByRole('menuitem', { name: 'Automation', exact: true }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
  const history = page.locator('[data-panel-history] li');
  try {
    await page.goto(url); await newImage(page, 128, 96); await menu('Start recording');
    await tool(page, 'pencil'); await number(page, 'size', 7);
    const a = await point(page, 12, 18), b = await point(page, 70, 18), tail = await point(page, 100, 18);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 });
    const heldStroke = await digest(page);
    await page.keyboard.press('b');
    await expect(page.locator('.gc-palette [data-command="image.brush"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(history).toHaveText(['Pencil', 'Current state']);
    expect(await digest(page)).toBe(heldStroke);
    // Movement after the shortcut must not extend an orphaned old-tool gesture.
    await page.mouse.move(tail.x, tail.y, { steps: 4 }); await page.mouse.up();
    expect(await digest(page)).toBe(heldStroke);
    await page.getByLabel('Primary colour', { exact: true }).fill('#cc2040');
    await draw(page, [12, 38], [70, 38], 8);
    await expect(history).toHaveText(['Pencil', 'Brush', 'Current state']);

    const beforeShape = await digest(page);
    await tool(page, 'rectangle'); const top = await point(page, 30, 50), bottom = await point(page, 96, 84);
    await page.mouse.move(top.x, top.y); await page.mouse.down(); await page.mouse.move(bottom.x, bottom.y, { steps: 8 });
    expect(await digest(page)).not.toBe(beforeShape);
    await page.keyboard.press('p'); await page.mouse.up();
    expect(await digest(page)).toBe(beforeShape);
    await expect(history).toHaveText(['Pencil', 'Brush', 'Current state']);
    // The next dirty rectangle overlaps the discarded preview. No preview pixels
    // may leak into its committed tile or the recording's eventual replay.
    await draw(page, [20, 64], [110, 64], 8);
    await expect(history).toHaveText(['Pencil', 'Brush', 'Pencil', 'Current state']);

    // Document commands can arrive before pointerup too. Commit the live stroke
    // first so Select all observes the same pixels that the user just painted.
    const lowStart = await point(page, 20, 88), lowEnd = await point(page, 100, 88);
    await page.mouse.move(lowStart.x, lowStart.y); await page.mouse.down(); await page.mouse.move(lowEnd.x, lowEnd.y, { steps: 8 });
    const beforeSelectAll = await digest(page);
    await page.keyboard.press('Control+a');
    await expect(history).toHaveText(['Pencil', 'Brush', 'Pencil', 'Pencil', 'Select all', 'Current state']);
    expect(await digest(page)).toBe(beforeSelectAll);
    await page.mouse.up();
    expect(await digest(page)).toBe(beforeSelectAll);
    await expect(page.locator('.image-info')).toContainText('selection 128 × 96');
    await menu('Stop recording'); const expected = await digest(page);
    await newImage(page, 128, 96); const blank = await digest(page);
    await menu('Actions…'); await page.getByRole('dialog', { name: 'Image actions', exact: true }).getByRole('button', { name: 'Apply once', exact: true }).click();
    await expect.poll(() => digest(page)).toBe(expected);
    await expect(page.locator('.image-info')).toContainText('selection 128 × 96');
    await page.locator('.gc-standard [data-command="edit.undo"]').click(); expect(await digest(page)).toBe(blank);
    await page.locator('.gc-standard [data-command="edit.redo"]').click(); expect(await digest(page)).toBe(expected);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

test('current: nudging a selection during a held stroke commits it before lifting pixels', async ({ page }) => {
  const variant = variants.at(-1)!, { server, url } = await localServer(variant.directory, variant.revision), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const menu = async (name: string) => { await page.getByRole('menubar').getByRole('menuitem', { name: 'Automation', exact: true }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
  const history = page.locator('[data-panel-history] li');
  try {
    await page.goto(url); await newImage(page, 128, 96); await menu('Start recording');
    await tool(page, 'pencil'); await number(page, 'size', 1); await page.locator('.image-stage').focus(); await page.keyboard.press('Control+a');
    const start = await point(page, 20, 20), end = await point(page, 60, 20);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 });
    const stroke = await digest(page);
    expect(await pixel(page, 20, 20)).toEqual([0, 0, 0, 255]);
    await page.keyboard.press('ArrowRight');
    await expect(history).toHaveText(['Select all', 'Pencil', 'Current state']);
    await page.mouse.up(); await page.keyboard.press('Enter');
    await expect(history).toHaveText(['Select all', 'Pencil', 'Move', 'Current state']);
    expect(await pixel(page, 20, 20)).toEqual([255, 255, 255, 255]);
    expect(await pixel(page, 21, 20)).toEqual([0, 0, 0, 255]);
    expect(await pixel(page, 61, 20)).toEqual([0, 0, 0, 255]);
    const nudged = await digest(page);

    // The same lift seam also serves ordinary selection drags; it must not
    // cancel the new Move gesture that requested the lift.
    await tool(page, 'select'); await draw(page, [40, 20], [45, 24], 4); await page.keyboard.press('Enter');
    await expect(history).toHaveText(['Select all', 'Pencil', 'Move', 'Move', 'Current state']);
    expect(await pixel(page, 26, 24)).toEqual([0, 0, 0, 255]);
    expect(await pixel(page, 66, 24)).toEqual([0, 0, 0, 255]);
    expect(await pixel(page, 40, 20)).toEqual([255, 255, 255, 255]);
    await menu('Stop recording'); const expected = await digest(page);
    await page.locator('.gc-standard [data-command="edit.undo"]').click(); expect(await digest(page)).toBe(nudged);
    await page.locator('.gc-standard [data-command="edit.undo"]').click(); expect(await digest(page)).toBe(stroke);
    await page.locator('.gc-standard [data-command="edit.redo"]').click(); expect(await digest(page)).toBe(nudged);
    await page.locator('.gc-standard [data-command="edit.redo"]').click(); expect(await digest(page)).toBe(expected);

    await newImage(page, 128, 96); const blank = await digest(page);
    await menu('Actions…'); await page.getByRole('dialog', { name: 'Image actions', exact: true }).getByRole('button', { name: 'Apply once', exact: true }).click();
    await expect.poll(() => digest(page)).toBe(expected);
    await page.locator('.gc-standard [data-command="edit.undo"]').click(); expect(await digest(page)).toBe(blank);
    await page.locator('.gc-standard [data-command="edit.redo"]').click(); expect(await digest(page)).toBe(expected);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

test('current: adjustments settle a held stroke before changing its working pixels', async ({ page }) => {
  const variant = variants.at(-1)!, { server, url } = await localServer(variant.directory, variant.revision), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const menu = async (name: string) => { await page.getByRole('menubar').getByRole('menuitem', { name: 'Automation', exact: true }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
  const history = page.locator('[data-panel-history] li');
  try {
    await page.goto(url); await newImage(page, 128, 96); await menu('Start recording');
    await tool(page, 'pencil'); await number(page, 'size', 3);
    const start = await point(page, 20, 20), end = await point(page, 60, 20);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 });
    const stroke = await digest(page);
    await expect(history).toHaveText(['Current state']);
    // Exercise the command callback while the stroke is still live. Normal
    // menu focus emits its own interruption, so activate the real command
    // control without changing focus or releasing the pointer first.
    await page.locator('[data-command="adjust.invert"]').evaluate((button: HTMLButtonElement) => button.click());
    await expect(history).toHaveText(['Pencil', 'Invert colours', 'Current state']);
    await page.mouse.up();
    expect(await pixel(page, 40, 20)).toEqual([255, 255, 255, 255]);
    expect(await pixel(page, 40, 50)).toEqual([0, 0, 0, 255]);
    await menu('Stop recording'); const expected = await digest(page);
    await page.locator('.gc-standard [data-command="edit.undo"]').click(); expect(await digest(page)).toBe(stroke);
    await page.locator('.gc-standard [data-command="edit.redo"]').click(); expect(await digest(page)).toBe(expected);
    await newImage(page, 128, 96); const blank = await digest(page);
    await menu('Actions…'); await page.getByRole('dialog', { name: 'Image actions', exact: true }).getByRole('button', { name: 'Apply once', exact: true }).click();
    await expect.poll(() => digest(page)).toBe(expected);
    await page.locator('.gc-standard [data-command="edit.undo"]').click(); expect(await digest(page)).toBe(blank);
    await page.locator('.gc-standard [data-command="edit.redo"]').click(); expect(await digest(page)).toBe(expected);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
