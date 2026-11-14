import { expect, type Page } from '@playwright/test';
import { command, download, menu, printPDF, roundtrip } from './offline-journey-helpers.ts';

export async function authoringJourneys(page: Page, evidence: string) {
  await page.getByRole('tab', { name: 'Document', exact: true }).click(); await page.getByRole('button', { name: 'New blank document' }).click();
  const editor = page.locator('.doc-page'); await editor.click(); await page.keyboard.insertText('Offline report marker 7391');
  await page.locator('.doc-toolbar select[aria-label="Style"]').selectOption('h1'); await expect(editor.locator('h1')).toHaveText('Offline report marker 7391');
  await roundtrip(page, 'gsnv-document', () => expect(editor.locator('h1')).toHaveText('Offline report marker 7391'));
  const html = await download(page, () => menu(page, 'Document', 'Export HTML…')); expect(html.bytes.toString()).toContain('Offline report marker 7391');
  await menu(page, 'Document', 'Export PDF…'); await printPDF(page, 'iframe.doc-print', `${evidence}/offline-document.pdf`);
  await page.screenshot({ path: `${evidence}/offline-document.png` });

  await page.getByRole('tab', { name: 'Slides', exact: true }).click(); await page.getByRole('button', { name: 'New blank presentation' }).click();
  const slideTool = (id: string) => page.locator(`.slides-toolbar [data-slides-command="slides.${id}"]`);
  await slideTool('text').click(); await page.locator('.slides-properties').getByLabel('Text', { exact: true }).fill('Offline slide marker 7391');
  await roundtrip(page, 'gsnv-slides', () => expect(page.locator('.slides-surface .slides-scene')).toContainText('Offline slide marker 7391'));
  await slideTool('present').click(); await expect(page.getByRole('dialog', { name: 'Slide presentation' })).toContainText('Offline slide marker 7391');
  await page.keyboard.press('Escape'); await expect(slideTool('present')).toBeFocused();
  await slideTool('pdf').click(); await printPDF(page, 'iframe.slides-print', `${evidence}/offline-slides.pdf`);
  await page.screenshot({ path: `${evidence}/offline-slides.png` });

  await page.getByRole('tab', { name: 'Spreadsheet', exact: true }).click(); await page.getByRole('button', { name: 'New workbook', exact: true }).click();
  async function cell(address: string, value: string) {
    await page.getByLabel('Cell address or range', { exact: true }).fill(address); await page.getByLabel('Cell address or range', { exact: true }).press('Enter');
    await page.getByLabel('Formula or value', { exact: true }).fill(value); await page.getByLabel('Formula or value', { exact: true }).press('Enter');
  }
  await cell('A1', '7'); await cell('A2', '8'); await cell('A3', '=SUM(A1:A2)');
  await expect(page.locator('[data-cell="A3"]')).toHaveText('15'); await roundtrip(page, 'gsnv-spreadsheet', () => expect(page.locator('[data-cell="A3"]')).toHaveText('15'));
  const csv = await download(page, () => menu(page, 'Workbook', 'Export active sheet as CSV…')); expect(csv.bytes.toString()).toMatch(/7\r?\n8\r?\n15/);
  const xlsx = await download(page, () => menu(page, 'Workbook', 'Export XLSX…')); expect(xlsx.bytes.subarray(0, 2).toString()).toBe('PK');
  await page.screenshot({ path: `${evidence}/offline-spreadsheet.png` }); await command(page, 'file.save').focus();
}
