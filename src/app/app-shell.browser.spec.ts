import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { nativeContainer } from '../shared/native-container.ts';

async function command(page: Page, id: string) {
  const selector = `button[data-command="${id}"]`;
  const visible = page.locator(`${selector}:visible`).first();
  if (await visible.count()) { await expect(visible).toBeEnabled(); await visible.click(); return; }
  const item = page.locator(selector).first(); await expect(item).toBeAttached();
  const menu = await item.evaluate(node => node.closest('.gc-menu-wrap')?.querySelector<HTMLElement>('[data-menu]')?.dataset.menu);
  expect(menu, `A visible menu must own command ${id}`).toBeTruthy();
  await page.locator(`button[data-menu="${menu}"]`).click(); await expect(item).toBeVisible(); await item.click();
}
const idle = (page: Page) => page.evaluate(() => window.__appShellFixture!.idle());
const snapshot = (page: Page) => page.evaluate(() => window.__appShellFixture!.snapshot());
const value = (page: Page) => page.locator('[data-fixture-value]:visible');

// Required precondition: npm run build && npm run test:browser -- src/app/app-shell.browser.spec.ts
test('A-SHELL actual window composes fixture editing, history, project files and local recovery', async ({ page, context }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dev/fixtures/app-shell.html');
  console.log(`A-SHELL browser: Chrome ${context.browser()!.version()}; runner ${process.platform}/${process.arch}; viewport ${JSON.stringify(page.viewportSize())}.`);
  await expect(page.locator('#fixture-ready')).toHaveText('Integration fixture ready'); await idle(page);
  await expect(page.locator('#fixture-notice')).toContainText('Development integration fixture');
  await expect(page.locator('.gc-window')).toHaveCount(1);
  const viewport = await page.locator('.gc-viewport').elementHandle();
  expect((await snapshot(page)).documents).toEqual({});
  for (const workspace of ['CAD', 'Image', 'Video']) {
    await page.getByRole('tab', { name: workspace, exact: true }).click();
    await command(page, 'file.new'); await idle(page);
    await expect(value(page)).toHaveText('40');
    await expect(page.locator('.gc-window')).toHaveCount(1);
    expect(await viewport!.evaluate(node => node === document.querySelector('.gc-viewport'))).toBe(true);
  }
  await page.getByRole('tab', { name: 'CAD', exact: true }).click(); await idle(page);
  const before = await snapshot(page);
  await command(page, 'fixture.edit');
  const dialog = page.getByRole('dialog', { name: 'Integration fixture value', exact: true });
  await dialog.getByLabel('Value', { exact: true }).fill('60');
  await expect(value(page)).toHaveText('60');
  expect((await snapshot(page)).documents.cad).toEqual(before.documents.cad);
  expect((await snapshot(page)).histories.cad?.past).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await idle(page);
  await expect(value(page)).toHaveText('40'); expect((await snapshot(page)).histories.cad?.past).toHaveLength(0);
  await expect(page.locator('.gc-standard button[data-command="fixture.edit"]')).toBeFocused();
  await command(page, 'fixture.edit'); await dialog.getByLabel('Value', { exact: true }).fill('60');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click(); await idle(page);
  await expect(value(page)).toHaveText('60'); expect((await snapshot(page)).histories.cad?.past).toHaveLength(1);
  await expect(page.locator('.gc-panels')).toContainText('Edit integration fixture value');
  await page.locator('.gc-viewport').focus(); await page.keyboard.press('Control+Z'); await idle(page); await expect(value(page)).toHaveText('40');
  await page.keyboard.press('Control+Shift+Z'); await idle(page); await expect(value(page)).toHaveText('60');
  const view = page.locator('[data-fixture-view]:visible');
  const bounds = (await page.locator('.gc-viewport').boundingBox())!;
  await page.mouse.move(bounds.x + 200, bounds.y + 150); await page.mouse.wheel(0, -400);
  await expect(view).toHaveAttribute('data-zoom', '2'); await expect(view).toHaveAttribute('data-pan-x', '-200'); await expect(view).toHaveAttribute('data-pan-y', '-150');
  await page.keyboard.down('Space'); await page.mouse.move(bounds.x + 400, bounds.y + 200); await page.mouse.down();
  await page.mouse.move(bounds.x + 460, bounds.y + 230); await page.mouse.up(); await page.keyboard.up('Space');
  await expect(view).toHaveAttribute('data-pan-x', '-140'); await expect(view).toHaveAttribute('data-pan-y', '-120');
  await command(page, 'view.settings');
  const viewDialog = page.getByRole('dialog', { name: 'View settings', exact: true });
  await viewDialog.getByLabel('Zoom (%)', { exact: true }).fill('125');
  await viewDialog.getByLabel('Pan X', { exact: true }).fill('20'); await viewDialog.getByLabel('Pan Y', { exact: true }).fill('10');
  await viewDialog.getByRole('button', { name: 'OK', exact: true }).click(); await idle(page);
  await expect(view).toHaveAttribute('data-zoom', '1.25'); await expect(view).toHaveAttribute('data-pan-x', '20'); await expect(view).toHaveAttribute('data-pan-y', '10');
  expect((await snapshot(page)).histories.cad?.past).toHaveLength(1);
  await page.locator('canvas[data-target-id="fixture-pixel"]:visible').click({ button: 'right' });
  await expect(page.locator('.gc-panels')).toContainText('Context target: fixture-pixel');
  console.log('A-SHELL: actual wheel/Space pan and typed 2D view settings applied through the shared seams; right-click target reached the fixture adapter.');
  const downloading = page.waitForEvent('download'); await command(page, 'file.save');
  const download = await downloading; expect(await download.failure()).toBeNull(); await idle(page);
  expect(download.suggestedFilename()).toBe('CAD integration fixture.gsnv-cad');
  const bytes = await readFile((await download.path())!);
  const packageValue = nativeContainer({ op: 'decode', parts: [new Uint8Array(bytes)] });
  expect(packageValue.project.content).toEqual({ fixture: 'gsnv-paint/a-shell-integration/v1', width: 1, height: 1, value: 60, rgba: [60, 90, 160, 255] });
  expect([...packageValue.assets[0]!.bytes]).toEqual([60, 90, 160, 255]);
  expect((await snapshot(page)).dirty.cad).toBe(false);
  const choosing = page.waitForEvent('filechooser'); await command(page, 'file.open');
  await (await choosing).setFiles({ name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer: bytes });
  await idle(page); await expect(value(page)).toHaveText('60');
  expect((await snapshot(page)).documents.cad?.value).toEqual(packageValue.project.content);
  expect((await snapshot(page)).histories.cad?.past).toHaveLength(0);
  await command(page, 'fixture.edit'); await dialog.getByLabel('Value', { exact: true }).fill('77');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click(); await idle(page);
  await expect(value(page)).toHaveText('77'); expect((await snapshot(page)).dirty.cad).toBe(true);
  await page.close();
  const reopened = await context.newPage(); reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto('/dev/fixtures/app-shell.html'); await expect(reopened.locator('#fixture-ready')).toHaveText('Integration fixture ready'); await idle(reopened);
  expect((await snapshot(reopened)).documents.cad).toBeUndefined();
  await command(reopened, 'recovery.restore'); await idle(reopened); await expect(value(reopened)).toHaveText('77');
  expect((await snapshot(reopened)).documents.cad?.value).toEqual({ fixture: 'gsnv-paint/a-shell-integration/v1', width: 1, height: 1, value: 77, rgba: [77, 90, 160, 255] });
  expect((await snapshot(reopened)).dirty.cad).toBe(true);
  expect(await reopened.evaluate(() => document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight)).toBe(true);
  await reopened.screenshot({ path: 'dev/evidence/A-SHELL.png' });
  await testInfo.attach('shared-shell-integration-1280x720', { path: 'dev/evidence/A-SHELL.png', contentType: 'image/png' });
  await readFile('dist/index.html'); // Missing emitted build is a failure, never a skipped branch.
  const built = await preview({ preview: { host: '127.0.0.1', port: 4174, strictPort: true } });
  try {
    const production = await context.newPage(); production.on('pageerror', error => errors.push(error.message));
    try {
      const url = built.resolvedUrls?.local[0]; expect(url, 'The built preview must expose its loopback URL').toBeTruthy();
      await production.goto(url!);
      const capabilitySummary = production.locator('.gc-capabilities summary');
      await expect(capabilitySummary).not.toHaveText('Capabilities not checked');
      await expect(capabilitySummary).toHaveText(/^(7 APIs detected|[1-7] capability notices?)$/);
      const capabilityRows = production.locator('.gc-capability');
      await expect(capabilityRows).toHaveCount(7);
      const capabilityLabels = ['Native file pickers', 'Background workers', 'WebAssembly', 'WebGL 2', 'Isolated execution', 'Image clipboard', 'Pen pressure API'];
      for (const [index, label] of capabilityLabels.entries()) {
        await expect(capabilityRows.nth(index)).toHaveAttribute('data-state', /^(supported|unavailable|error)$/);
        await expect(capabilityRows.nth(index)).toHaveText(new RegExp(`^${label}: \\S.+`));
      }
      console.log('A-SHELL emitted production capability results:', await capabilityRows.evaluateAll(rows => rows.map(row => ({ state: (row as HTMLElement).dataset.state, text: row.textContent }))));
      for (const workspace of ['CAD', 'Image', 'Video']) {
        await production.getByRole('tab', { name: workspace, exact: true }).click();
        await expect(production.locator('.gc-window')).toHaveCount(1);
        await expect(production.locator('button[data-command="fixture.edit"]')).toHaveCount(0);
        await expect(production.locator('button[data-command="file.new"]').first()).toBeDisabled();
        await expect(production.locator('.gc-viewport')).toContainText(`${workspace} editing is not available`);
      }
      await production.getByRole('tab', { name: 'CAD', exact: true }).click();
      await production.screenshot({ path: 'dev/evidence/A-SHELL-production.png' });
      await testInfo.attach('emitted-production-shell-1280x720', { path: 'dev/evidence/A-SHELL-production.png', contentType: 'image/png' });
    } finally { await production.close(); }
  } finally { await built.close(); }
  console.log('A-SHELL: emitted dist via Vite preview exposes one shell and explicitly unavailable CAD/Image/Video editing, without fixture tools or enabled New factories. Deployment remains untested.');
  expect(errors).toEqual([]);
  console.log('A-SHELL: one window; fixture preview/cancel/commit; undo/redo; exact downloaded container reopens; IDB recovery survives page close/reopen. Native picker interaction and product editing remain untested.');
});
