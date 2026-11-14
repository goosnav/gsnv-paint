import { expect, type Page } from '@playwright/test';
import { command, download, menu, roundtrip } from './offline-journey-helpers.ts';

export async function cadJourney(page: Page, evidence: string) {
  await page.getByRole('tab', { name: 'CAD', exact: true }).click(); await command(page, 'file.new').click();
  const ready = () => expect(page.locator('.cad-build-status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await command(page, 'cad.rectangle').click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Width (mm)', { exact: true }).fill('30'); await dialog.getByLabel('Height (mm)', { exact: true }).fill('20');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click(); await ready();
  await page.keyboard.press('e'); await dialog.getByLabel('Depth (mm or expression)').fill('5'); await dialog.getByRole('button', { name: 'OK', exact: true }).click(); await ready();
  await expect(page.locator('.cad-properties')).toContainText('3000.000 mm³');
  await roundtrip(page, 'gsnv-cad', async () => { await ready(); await expect(page.locator('.cad-properties')).toContainText('3000.000 mm³'); });
  const step = await download(page, () => command(page, 'cad.exportSTEP').click());
  expect(step.bytes.toString()).toContain('ISO-10303-21;'); expect(step.bytes.toString()).toContain('MANIFOLD_SOLID_BREP');
  const worker = page.workers().find(worker => worker.url().includes('cad-workspace.worker'));
  expect(worker, 'CAD worker started for the first time offline').toBeTruthy(); expect(await worker!.evaluate(() => crossOriginIsolated)).toBe(true);
  await menu(page, 'Solid', 'Solid view'); await expect(page.getByLabel('CAD solid viewport')).toBeVisible();
  await page.screenshot({ path: `${evidence}/offline-cad.png` });
}

export async function codeJourney(page: Page, evidence: string) {
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  const create = page.getByRole('button', { name: 'New JavaScript project', exact: true });
  if (await create.count()) await create.click(); else await command(page, 'file.new').click();
  const editor = page.getByRole('textbox', { name: 'Source code' }), output = page.getByLabel('Code output', { exact: true }), run = page.getByRole('button', { name: 'Run entry', exact: true });
  const source = async (text: string) => { await editor.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(text); };
  async function add(path: string, language: string, text: string) {
    await page.getByRole('button', { name: 'New file', exact: true }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('File path').fill(path); await dialog.getByLabel('Language', { exact: true }).selectOption(language); await dialog.getByRole('button', { name: 'OK', exact: true }).click(); await source(text);
  }
  await source('console.log("offline", 6*7, self.origin); try { indexedDB.open("gsnv-paint-recovery"); console.log("BAD storage"); } catch(e) { console.log("storage denied", e.name); }');
  await run.click(); await expect(output).toContainText('offline 42 null'); await expect(output).toContainText('storage denied SecurityError');
  await source('while(true){}'); await run.click(); await expect(page.locator('.code-run-status')).toContainText('Running');
  await page.getByRole('button', { name: 'Stop', exact: true }).click(); await expect(page.locator('.code-run-status')).toContainText('Stopped');
  await add('main.py', 'python', 'import json, statistics\nprint(sum(i*i for i in range(10)))\nprint(json.dumps({"mean": statistics.mean([2,4,6])}))');
  await page.getByLabel('Entry file', { exact: true }).selectOption('main.py'); await run.click(); await expect(output).toContainText('285', { timeout: 60_000 }); await expect(output).toContainText('"mean": 4');
  await roundtrip(page, 'gsnv-code', () => expect(page.getByRole('navigation', { name: 'Project files' }).getByRole('button', { name: 'main.py', exact: true })).toBeVisible());
  const exported = await download(page, () => page.getByRole('button', { name: 'Export source', exact: true }).click()); expect(exported.bytes.toString()).toContain('sum(i*i for i in range(10))');
  await add('style.css', 'css', 'h1 { color: rgb(1,2,3); }'); await add('index.html', 'html', '<link rel="stylesheet" href="style.css"><h1>Offline HTML</h1><script>parent.hacked=true</script>');
  await page.getByLabel('Entry file', { exact: true }).selectOption('index.html'); await run.click();
  await expect(page.frameLocator('iframe[title="HTML/CSS preview"]').locator('h1')).toHaveCSS('color', 'rgb(1, 2, 3)');
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false); await download(page, () => command(page, 'file.save').click()); await page.screenshot({ path: `${evidence}/offline-code.png` });
}
