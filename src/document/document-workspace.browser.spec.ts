import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';

const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();
const editor = (page: Page) => page.locator('.doc-page');
const html = (page: Page) => editor(page).evaluate(e => e.innerHTML);

test('DOCUMENT-APP type, style, lists, table, sanitized paste, undo, page setup, PDF, HTML export and project round trip', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(90000);
  const server = await preview({ preview: { host: '127.0.0.1', port: 4181, strictPort: true } }); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    // Capture what would be printed; the print dialog itself is the browser's.
    new MutationObserver(records => { for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLIFrameElement && n.classList.contains('doc-print')) (window as unknown as { printed: string[] }).printed.push(n.srcdoc); }).observe(document, { childList: true, subtree: true });
    (window as unknown as { printed: string[] }).printed = [];
  });
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Document', exact: true }).click();
    await expect(page.locator('.doc-empty')).toContainText('Write a document'); await page.getByRole('button', { name: 'New blank document' }).click();
    await expect(editor(page)).toBeVisible(); await editor(page).click();
    await page.keyboard.type('Quarterly report'); await page.locator('.doc-toolbar select[aria-label="Style"]').selectOption('h1');
    await expect.poll(() => html(page)).toContain('<h1>Quarterly report</h1>');
    await editor(page).press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('Sales grew in every region this quarter.');
    await page.keyboard.press('Control+Shift+ArrowLeft'); await page.keyboard.press('Control+Shift+ArrowLeft'); await page.keyboard.press('Control+b');
    await expect.poll(() => html(page)).toMatch(/<b>quarter\.?<\/b>|<b>this quarter/);
    await page.keyboard.press('End'); await page.keyboard.press('Control+b'); await page.keyboard.press('Enter');
    await page.locator('.doc-tool[data-doc-command="doc.bullets"]').click(); await page.keyboard.type('North'); await page.keyboard.press('Enter'); await page.keyboard.type('South');
    await expect(editor(page).locator('ul > li')).toHaveText(['North', 'South']);
    await expect(page.locator('.doc-tool[data-doc-command="doc.bullets"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await page.locator('.doc-tool[data-doc-command="doc.table"]').click(); await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(editor(page).locator('table tr')).toHaveCount(3); await expect(editor(page).locator('th')).toHaveCount(3);
    // Paste from a web page keeps formatting but loses script and handlers.
    await editor(page).locator('p').last().click();
    await editor(page).evaluate(e => { const data = new DataTransfer(); data.setData('text/html', '<p onclick="steal()">Pasted <i>italic</i><script>window.hacked=1</script><img src="x" onerror="window.hacked=2"></p>'); data.setData('text/plain', 'Pasted italic'); e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
    await expect.poll(() => html(page)).toContain('Pasted <i>italic</i>'); expect(await html(page)).not.toMatch(/onclick|script|onerror/);
    expect(await page.evaluate(() => (window as unknown as { hacked?: number }).hacked)).toBeUndefined();
    expect(await history(page)).toContain('Paste');
    // Undo and redo come from the document history while typing.
    await page.keyboard.press('Control+z'); await expect.poll(() => html(page)).not.toContain('Pasted');
    await page.keyboard.press('Control+y'); await expect.poll(() => html(page)).toContain('Pasted <i>italic</i>');
    // Page setup.
    await page.getByRole('menuitem', { name: 'Document', exact: true }).click(); await page.getByRole('menuitem', { name: 'Page setup…' }).click();
    const dialog = page.getByRole('dialog'); await dialog.getByLabel('Paper').selectOption('a4'); await dialog.getByLabel('Orientation').selectOption('landscape'); await dialog.getByLabel('Page numbers in the PDF').check();
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await expect.poll(() => editor(page).evaluate(e => Math.round(e.getBoundingClientRect().width))).toBe(Math.round(11.69 * 96));
    await expect(page.locator('.doc-info')).toContainText(/Estimated pages 1 .* words .* A4 landscape, page numbers/);
    await expect(page.locator('.doc-info')).toBeInViewport();
    await page.screenshot({ path: 'dev/evidence/DOCUMENT-APP-production.png' }); await testInfo.attach('Document production', { path: 'dev/evidence/DOCUMENT-APP-production.png', contentType: 'image/png' });

    // PDF: the print document renders to a real PDF with the chosen page size.
    await page.getByRole('menuitem', { name: 'Document', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export PDF…' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { printed: string[] }).printed.length)).toBe(1);
    const printed = await page.evaluate(() => (window as unknown as { printed: string[] }).printed[0]!);
    expect(printed).toContain('size: 11.69in 8.27in'); expect(printed).toContain('counter(page)'); expect(printed).toContain('<h1>Quarterly report</h1>');
    const printer = await browser.newPage(); await printer.setContent(printed); const pdf = await printer.pdf({ preferCSSPageSize: true }); await printer.close();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-'); const mediaBox = /MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/.exec(pdf.toString('latin1'))!; expect(Math.round(Number(mediaBox[1]))).toBe(842); expect(Math.round(Number(mediaBox[2]))).toBe(595);

    const htmlSave = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'Document', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export HTML…' }).click();
    const exported = await readFile((await (await htmlSave).path())!, 'utf8'); expect(exported).toContain('<h1>Quarterly report</h1>'); expect(exported).not.toContain('script');

    const saving = page.waitForEvent('download'); await editor(page).click(); await page.keyboard.press('Control+s'); const project = await saving;
    const pkg = nativeContainer({ op: 'decode', parts: [await readFile((await project.path())!)] }), content = pkg.project.content as { html: string; page: { size: string; orientation: string; numbers: boolean } };
    expect(pkg.project.format).toBe('gsnv-document'); expect(content.html).toMatch(/<li>(<b>)?North/); expect(content.page).toMatchObject({ size: 'a4', orientation: 'landscape', numbers: true });

    await page.keyboard.press('Control+n'); await expect(editor(page)).not.toContainText('Quarterly report');
    const choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
    await (await choosing).setFiles({ name: project.suggestedFilename(), mimeType: 'application/octet-stream', buffer: await readFile((await project.path())!) });
    await expect(editor(page).locator('h1')).toHaveText('Quarterly report');

    await page.waitForTimeout(1500); await page.reload(); await page.getByRole('tab', { name: 'Document', exact: true }).click();
    await expect(editor(page).locator('h1')).toHaveText('Quarterly report', { timeout: 20000 }); await expect(editor(page).locator('table')).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});

test('DOCUMENT-APP page estimates include forced breaks without counting unused page space twice', async ({ page, context, browser }) => {
  const server = await preview({ preview: { host: '127.0.0.1', port: 4181, strictPort: true } });
  await context.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); });
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Document', exact: true }).click();
    const lines = (n: number) => `<p style="line-height:48px">${Array.from({ length: n }, (_, i) => `Line ${i + 1}`).join('<br>')}</p>`;
    for (const [contents, count] of [
      ['<p>Page one</p><hr style="break-after:page"><p>Page two</p>', 2],
      [`${lines(12)}<hr style="break-after:page">${lines(12)}`, 2],
      [`${lines(24)}<hr style="break-after:page">${lines(12)}`, 3],
    ] as const) {
      const choosing = page.waitForEvent('filechooser');
      await page.getByRole('menuitem', { name: 'Document', exact: true }).click(); await page.getByRole('menuitem', { name: 'Import text or HTML…' }).click();
      await (await choosing).setFiles({ name: 'pages.html', mimeType: 'text/html', buffer: Buffer.from(contents) });
      await expect(page.locator('.doc-info')).toContainText(`Estimated pages ${count}`);
      // Compare against the actual print layout, including natural and explicit page breaks.
      await page.getByRole('menuitem', { name: 'Document', exact: true }).click(); await page.getByRole('menuitem', { name: 'Export PDF…' }).click();
      await expect(page.locator('iframe.doc-print')).toHaveCount(1);
      const printed = await page.locator('iframe.doc-print').getAttribute('srcdoc');
      const printer = await browser.newPage(); await printer.setContent(printed!); const pdf = await printer.pdf({ preferCSSPageSize: true }); await printer.close();
      expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(count);
      await page.locator('iframe.doc-print').evaluate(e => e.remove());
    }
  } finally { await server.close(); }
});

test('DOCUMENT-APP rejects unreadable pictures without changing content or history and keeps valid pictures on reopen', async ({ page, context }, testInfo) => {
  const server = await preview({ preview: { host: '127.0.0.1', port: 4181, strictPort: true } });
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); });
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Document', exact: true }).click(); await page.getByRole('button', { name: 'New blank document' }).click();
    await editor(page).click(); await page.keyboard.type('Keep this text'); await page.keyboard.press('Control+s');
    const before = await html(page), beforeHistory = await history(page);
    let choosing = page.waitForEvent('filechooser'); await page.locator('[data-doc-command="doc.picture"]').click();
    await (await choosing).setFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await expect(page.getByRole('alert')).toContainText(/could not.*picture|picture.*could not/i);
    expect(await html(page)).toBe(before); expect(await history(page)).toEqual(beforeHistory); await expect(editor(page).locator('img')).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeInViewport(); await expect(page.locator('.doc-info')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('document-image-error.png') });
    choosing = page.waitForEvent('filechooser'); await page.locator('[data-doc-command="doc.picture"]').click();
    await (await choosing).setFiles({ name: 'valid.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jltUAAAAASUVORK5CYII=', 'base64') });
    await expect.poll(() => editor(page).locator('img').evaluate(e => (e as HTMLImageElement).naturalWidth)).toBe(1);
    const saving = page.waitForEvent('download'); await page.keyboard.press('Control+s'); const saved = await saving;
    await page.keyboard.press('Control+n'); await expect(editor(page)).not.toContainText('Keep this text');
    await expect(page.locator('button[data-command="file.open"]:visible').first()).toBeEnabled();
    choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
    await (await choosing).setFiles({ name: saved.suggestedFilename(), mimeType: 'application/octet-stream', buffer: await readFile((await saved.path())!) });
    await expect(editor(page)).toContainText('Keep this text'); await expect.poll(() => editor(page).locator('img').evaluate(e => (e as HTMLImageElement).naturalWidth)).toBe(1);
  } finally { await server.close(); }
});

test('DOCUMENT-APP keyboard escape preserves selection and pending typing before menus and save', async ({ page, context }) => {
  const server = await preview({ preview: { host: '127.0.0.1', port: 4181, strictPort: true } });
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Document', exact: true }).click(); await page.getByRole('button', { name: 'New blank document' }).click();
    await editor(page).click(); await page.keyboard.type('Selected text'); await page.keyboard.press('Control+a'); await page.keyboard.press('Escape');
    await expect(page.locator('.doc-toolbar select[aria-label="Style"]')).toBeFocused();
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await expect(editor(page).locator('b')).toHaveText('Selected text');
    await page.keyboard.press('End'); await page.keyboard.type(' latest typing'); await page.keyboard.press('F10');
    await expect(page.getByRole('menuitem', { name: 'File', exact: true })).toBeFocused(); await page.keyboard.press('Escape');
    await editor(page).click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' immediately saved');
    const saving = page.waitForEvent('download'); await page.keyboard.press('Control+s'); const saved = await saving;
    const pkg = nativeContainer({ op: 'decode', parts: [await readFile((await saved.path())!)] });
    expect((pkg.project.content as { html: string }).html).toContain('immediately saved');
    await page.keyboard.press('Escape'); await expect(page.locator('.doc-toolbar select[aria-label="Style"]')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(editor(page)).toBeFocused();
  } finally { await server.close(); }
});

test('DOCUMENT-APP an immediate reload either keeps unpersisted typing open or restores its completed backup', async ({ page }) => {
  const server = await preview({ preview: { host: '127.0.0.1', port: 4181, strictPort: true } });
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await page.getByRole('tab', { name: 'Document', exact: true }).click(); await page.getByRole('button', { name: 'New blank document' }).click();
    const latest = 'The last typing burst must survive.';
    let stayed = false;
    let didStay!: () => void;
    const staying = new Promise<void>(resolve => { didStay = resolve; });
    page.on('dialog', async dialog => { expect(dialog.type()).toBe('beforeunload'); stayed = true; await dialog.dismiss(); didStay(); });
    await editor(page).click(); await page.keyboard.insertText(latest);
    // Chrome cancels the navigation when Stay is chosen; Playwright may keep its navigation waiter open.
    const reloading = page.reload({ timeout: 5000 }).catch(cause => { if (!stayed) throw cause; });
    await Promise.race([reloading, staying]);
    if (stayed) {
      await expect(editor(page)).toHaveText(latest);
      // The unload guard must clear after this exact revision has reached local storage.
      await expect.poll(() => page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
      page.removeAllListeners('dialog'); await page.reload();
    }
    await page.getByRole('tab', { name: 'Document', exact: true }).click(); await expect(editor(page)).toHaveText(latest);
  } finally { await server.close(); }
});
