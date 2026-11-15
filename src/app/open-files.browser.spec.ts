import { test, expect, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';
let server: PreviewServer;
test.beforeAll(async ({browser}) => { server = await preview({ preview: { host: '127.0.0.1', port: 4203, strictPort: true } }); console.log(`Open files: Chrome ${browser.version()} ${process.platform}/${process.arch}`); });
test.afterAll(async () => { await server.close(); });
test.beforeEach(async ({page}, info) => {
  if (!info.title.startsWith('Native picker')) await page.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  await page.goto(server.resolvedUrls!.local[0]!);
});
async function open(page: Page, name: string, buffer: Buffer, route: 'toolbar'|'menu'|'keyboard' = 'toolbar') {
  const choosing = page.waitForEvent('filechooser');
  if (route === 'toolbar') await page.locator('.gc-standard [data-command="file.open"]').click();
  else if (route === 'menu') { await page.getByRole('menuitem', { name: 'File', exact: true }).click(); await page.locator('.gc-menubar [data-command="file.open"]').click(); }
  else { await page.locator('.gc-viewport').focus(); await page.keyboard.press('Control+o'); }
  const chooser = await choosing; const accept = await chooser.element().getAttribute('accept');
  // setFiles bypasses the OS chooser. Check its filter before assigning anything.
  expect(accept ?? '').toBe('');
  await chooser.setFiles({ name, mimeType: 'application/octet-stream', buffer }); return accept;
}
async function picture(page: Page, mime = 'image/png') {
  return Buffer.from(await page.evaluate(async mime => { const c = document.createElement('canvas'); c.width = 32; c.height = 24; const ctx = c.getContext('2d')!; ctx.fillStyle = '#e53535'; ctx.fillRect(0, 0, 32, 24); const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), mime)); return Array.from(new Uint8Array(await blob.arrayBuffer())); }, mime));
}
async function saved(page: Page) {
  const waiting = page.waitForEvent('download'); await page.locator('.gc-viewport').focus(); await page.keyboard.press('Control+s');
  const file = await waiting, bytes = await readFile((await file.path())!); return { file, bytes, pkg: nativeContainer({ op: 'decode', parts: [bytes] }) };
}
test('Open PNG, JPEG and native Paint project through toolbar, menu and Ctrl+O', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const png = await picture(page), jpg = await picture(page, 'image/jpeg');
  await open(page, 'sample.PNG', png);
  await expect(page.locator('.image-canvas')).toHaveAttribute('width', '32'); await expect(page.locator('[data-window-title]')).toContainText('sample');
  const initial = await saved(page); expect(initial.file.suggestedFilename()).toMatch(/\.gsnv-image$/); expect(initial.pkg.project.format).toBe('gsnv-image');
  await open(page, 'camera.jpeg', jpg, 'menu'); await expect(page.locator('[data-window-title]')).toContainText('camera'); await expect(page.locator('.image-canvas')).toHaveAttribute('height', '24');
  await open(page, initial.file.suggestedFilename(), initial.bytes, 'keyboard'); await expect(page.locator('[data-window-title]')).toContainText('sample');
  const reopened = await saved(page); expect(reopened.pkg).toEqual(initial.pkg);
  await open(page, 'broken.png', Buffer.from('not an image')); await expect(page.locator('.image-tool-hint')).toContainText('could not be opened');
  await expect(page.locator('[data-window-title]')).toContainText('sample'); expect((await saved(page)).pkg).toEqual(initial.pkg); expect(errors).toEqual([]);
});
for (const [workspace, filename, format] of [
  ['Photo', 'photo.png', 'photo'], ['Video', 'scene.png', 'video'], ['Slides', 'slide.png', 'slides'],
  ['Document', 'notes.txt', 'document'], ['Spreadsheet', 'table.csv', 'spreadsheet'], ['Code', 'hello.py', 'code'], ['Audio', 'tone.wav', 'audio'],
] as const) test(`Open ordinary ${workspace} file through the shared picker`, async ({page}) => {
  let bytes: Buffer;
  if (filename.endsWith('.png')) bytes = await picture(page);
  else if (format === 'audio') { bytes = Buffer.alloc(44 + 960); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(96000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(960, 40); }
  else bytes = Buffer.from(format === 'spreadsheet' ? 'Name,Count\nPens,3\n' : format === 'code' ? 'print("Opened source")\n' : 'Opened document\n');
  await page.getByRole('tab', { name: workspace, exact: true }).click();
  await open(page, filename, bytes);
  await expect(page.locator('[data-window-title]')).toContainText(filename.split('.')[0]!);
  if (format === 'photo') { await expect(page.locator('.photo-surface')).toBeVisible(); await open(page, 'broken.png', Buffer.from('bad picture')); await expect(page.locator('.photo-hint')).toContainText('could not be opened'); await expect(page.locator('[data-window-title]')).toContainText('photo'); }
  if (format === 'video') await expect(page.locator('.video-clip')).toHaveCount(1);
  const project = await saved(page); expect(project.pkg.project.format).toBe(`gsnv-${format}`);
  if (format === 'code') expect(project.pkg.project.content).toMatchObject({ entry: 'hello.py', files: [{ path: 'hello.py', language: 'python', text: 'print("Opened source")\n' }] });
});
test('Open STEP uses the existing worker validator and preserves the last solid on failure', async ({page}) => {
  test.setTimeout(60000); await page.getByRole('tab', { name: 'CAD', exact: true }).click();
  const bytes = await readFile(new URL('../cad/fixtures/acceptance-plate-120mm.step', import.meta.url));
  await open(page, 'plate.step', bytes); await expect(page.locator('.cad-imported-properties')).toContainText('68654.425 mm³', { timeout: 30000 });
  await open(page, 'broken.step', Buffer.from('broken solid')); await expect(page.locator('.cad-import-status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('.cad-imported-properties')).toContainText('68654.425 mm³'); expect((await saved(page)).pkg.project.format).toBe('gsnv-cad');
});

test('Native picker options remain valid and an opened image handle is never a project destination', async ({page}) => {
  const bytes = await picture(page);
  await page.addInitScript(data => {
    const state = { sourceWrites: 0, picks: [] as unknown[], saves: [] as unknown[], written: [] as number[][] }; Object.assign(window, { pickerProof: state });
    const valid = (options: {types?:{accept:Record<string,string[]>}[]}) => { for (const type of options.types ?? []) for (const extension of Object.values(type.accept).flat()) if (extension.length > 16) throw new TypeError('Invalid native extension filter'); };
    Object.defineProperty(window, 'showOpenFilePicker', { value: async (options: any) => { valid(options); state.picks.push(options); return [{name:'native.png',getFile:async()=>new File([new Uint8Array(data)],'native.png',{type:'image/png'}),createWritable:async()=>{state.sourceWrites++;throw new Error('Do not overwrite raw media');}}]; } });
    Object.defineProperty(window, 'showSaveFilePicker', { value: async (options: any) => { valid(options); state.saves.push(options); return {name:options.suggestedName,createWritable:async()=>({write:async(part:Uint8Array)=>state.written.push([...part]),close:async()=>{},abort:async()=>{}})}; } });
  }, [...bytes]);
  await page.reload();
  await page.locator('.gc-standard [data-command="file.open"]').click();await expect(page.locator('[data-window-title]')).toContainText('native');await page.keyboard.press('Control+s');await expect(page.locator('[data-window-title]')).not.toContainText('*');
  await page.getByRole('tab',{name:'Spreadsheet',exact:true}).click();await page.locator('.gc-standard [data-command="file.new"]').click();await page.keyboard.press('Control+s');await expect(page.locator('[data-window-title]')).not.toContainText('*');
  const result=await page.evaluate(()=>(window as any).pickerProof);expect(result.sourceWrites).toBe(0);expect(result.picks[0].types).toEqual([]);expect(result.saves).toHaveLength(2);expect(result.saves[1].types).toEqual([]);expect(result.saves[1].suggestedName).toMatch(/\.gsnv-spreadsheet$/);expect(result.written.length).toBeGreaterThan(0);
});
