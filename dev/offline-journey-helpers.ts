// Production browser acceptance helpers. Only synthetic files are opened or downloaded.
import { expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { nativeContainer } from '../src/shared/native-container.ts';

export const command = (page: Page, id: string) => page.locator(`button[data-command="${id}"]:visible`).first();
export async function menu(page: Page, name: string, item: string) {
  await page.getByRole('menuitem', { name, exact: true }).click(); await page.getByRole('menuitem', { name: item, exact: true }).click();
}
export async function download(page: Page, action: () => Promise<unknown>, timeout = 60_000) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout }), action()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}
export async function roundtrip(page: Page, format: string, verify: () => Promise<unknown>, newDocument = true) {
  const file = await download(page, () => page.keyboard.press('Control+s'));
  const before = nativeContainer({ op: 'decode', parts: [file.bytes] }); expect(before.project.format).toBe(format);
  if (newDocument) await command(page, 'file.new').click();
  const choosing = page.waitForEvent('filechooser'); await command(page, 'file.open').click();
  await (await choosing).setFiles({ name: file.name, mimeType: 'application/octet-stream', buffer: file.bytes });
  await expect(page.locator('[data-panel-history] li')).toHaveText(['Current state']);
  await verify(); const again = await download(page, () => page.keyboard.press('Control+s'));
  const after = nativeContainer({ op: 'decode', parts: [again.bytes] }); expect(after.project).toEqual(before.project);
  expect(after.assets).toEqual(before.assets); return file;
}
export async function printPDF(page: Page, selector: string, path: string) {
  const frame = page.locator(selector), name = selector.split('.')[1]!;
  await expect.poll(() => page.evaluate(name => (window as unknown as { offlinePrints: Record<string, string> }).offlinePrints[name], name)).toBeTruthy();
  const html = await page.evaluate(name => (window as unknown as { offlinePrints: Record<string, string> }).offlinePrints[name]!, name);
  const printer = await page.context().newPage();
  try {
    await printer.setContent(html); await printer.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    const bytes = await printer.pdf({ preferCSSPageSize: true, printBackground: true }); expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length).toBeGreaterThan(0); await writeFile(path, bytes);
  } finally { await printer.close(); }
  if (await frame.count()) await frame.evaluate(element => (element as HTMLIFrameElement).contentWindow!.dispatchEvent(new Event('afterprint')));
}
