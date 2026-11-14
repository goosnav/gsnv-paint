import { test, expect, type Page } from '@playwright/test';
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { stepExchange } from './step-exchange.ts';
import type { KernelSession } from './kernel-runtime.ts';
import { nativeContainer } from '../shared/native-container.ts';

const ready = (page: Page) => expect(page.locator('.cad-build-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
const ok = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();

test('CAD consumer golden: dependent holes/pocket, live variables, unit conversion, files and real STEP', async ({ page, context }, testInfo) => {
  test.setTimeout(180000);
  const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4175') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); });
  const library = await init({ wasmBinary: await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)), print: () => {} });
  const shapes = new Map<number, ReturnType<KernelSession['resolve']>>(); let sequence = 0;
  const session: KernelSession = { library, generation: 1, isClosed: () => false, retain(shape) { const id = ++sequence; shapes.set(id, shape); return { id, generation: 1 }; }, resolve(token) { return shapes.get(token.id)!; }, release(token) { shapes.get(token.id)!.delete(); shapes.delete(token.id); } };
  try {
    await page.goto(server.resolvedUrls!.local[0]!); await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled(); await page.keyboard.press('Control+n');
    const props = page.locator('.cad-properties'), dialog = page.getByRole('dialog');
    await props.getByRole('button', { name: 'Add variable…', exact: true }).click(); await dialog.getByLabel('Name', { exact: true }).fill('width'); await dialog.getByLabel('Value or expression').fill('100'); await ok(page);
    await page.locator('button[data-command="cad.rectangle"]:visible').first().click(); await dialog.getByLabel('Width (mm)', { exact: true }).fill('width'); await ok(page); await ready(page);
    await page.keyboard.press('e'); await ok(page); await ready(page);
    await props.getByRole('button', { name: 'Fillet…', exact: true }).click(); await dialog.getByLabel('Radius (mm or expression)').fill('5'); await ok(page); await ready(page);
    await props.getByRole('button', { name: 'Cut…', exact: true }).click(); await ready(page);
    for (const [x,y] of [['10','10'],['width - 10','10'],['width - 10','50'],['10','50']]) {
      await page.getByRole('menuitem', { name: 'Sketch', exact: true }).click(); await page.getByRole('menuitem', { name: 'Circle dimensions…' }).click();
      await dialog.getByLabel('Diameter (mm or expression)').fill('6'); await dialog.getByLabel('Center X (mm)').fill(x!); await dialog.getByLabel('Center Y (mm)').fill(y!); await ok(page); await ready(page);
    }
    await props.getByRole('button', { name: 'Cut…', exact: true }).click(); await ready(page);
    await page.locator('button[data-command="cad.rectangle"]:visible').first().click(); await dialog.getByLabel('Width (mm)', { exact: true }).fill('20'); await dialog.getByLabel('Height (mm)', { exact: true }).fill('20');
    await dialog.getByLabel('Corner X (mm)').fill('width / 2 - 10'); await dialog.getByLabel('Corner Y (mm)').fill('20'); await ok(page); await ready(page);
    await props.getByRole('button', { name: 'Depth…', exact: true }).last().click(); await dialog.getByLabel('Extent').selectOption('blind'); await dialog.getByLabel('Depth (mm or expression)').fill('5'); await ok(page); await ready(page);
    for (const [width,expected] of [[100,56654.424808105],[120,68654.424808105]] as const) {
      if (width === 120) { await props.getByRole('button', { name: /^width =/ }).click(); await dialog.getByLabel('Value or expression').fill('120'); await ok(page); await ready(page); }
      await expect(props).toContainText(`${expected.toFixed(3)} mm³`); await expect(props).toContainText(`Rectangle origin: ${width/2-10}, 20`);
      await props.getByRole('button', { name: 'Cut 1', exact: true }).click(); await expect(props).toContainText(`Circle center: ${width-10}, 10`); await expect(props).toContainText(`Circle center: ${width-10}, 50`);
      const downloading = page.waitForEvent('download'); await page.locator('button[data-command="cad.exportSTEP"]:visible').first().click(); const download = await downloading;
      const bytes = await readFile((await download.path())!); const imported = stepExchange({ action: 'import', session, bytes, units: 'mm' }).bodies!;
      expect(imported.shapes).toHaveLength(1); const properties = new library.GProp_GProps();
      try { library.BRepGProp.VolumeProperties(session.resolve(imported.shapes[0]!.token), properties, true, false, false); expect(Math.abs(properties.Mass()-expected)).toBeLessThan(expected*0.0001); }
      finally { properties.delete(); imported.shapes.forEach(body => session.release(body.token)); }
      if (width === 100) await props.getByRole('button', { name: 'Cut 2', exact: true }).click();
    }
    await props.getByRole('button', { name: 'Imperial (in)', exact: true }).click(); await ready(page); await expect(props).toContainText('68654.425 mm³'); await expect(props).toContainText('Circle center: 4.3307087 in, 0.39370079 in');
    await props.getByRole('button', { name: 'Metric (mm)', exact: true }).click(); await ready(page);
    const saving=page.waitForEvent('download'); await page.keyboard.press('Control+s'); const saved=await saving, bytes=await readFile((await saved.path())!);
    expect(JSON.stringify(nativeContainer({ op:'decode', parts:[bytes] }).project.content)).toContain('width');
    await page.keyboard.press('Control+n'); const choosing=page.waitForEvent('filechooser'); await page.keyboard.press('Control+o'); await (await choosing).setFiles({ name:saved.suggestedFilename(),mimeType:'application/octet-stream',buffer:bytes }); await ready(page); await expect(props).toContainText('68654.425 mm³');
    await page.getByRole('menuitem',{name:'Solid',exact:true}).click(); await page.getByRole('menuitem',{name:'Solid view',exact:true}).click();
    await page.screenshot({path:'dev/evidence/CAD-consumer-golden.png'}); await testInfo.attach('Parametric acceptance plate',{path:'dev/evidence/CAD-consumer-golden.png',contentType:'image/png'});
    expect(errors).toEqual([]); expect(external).toEqual([]); expect(shapes.size).toBe(0);
    console.log(`CAD consumer golden Chrome ${context.browser()!.version()} ${process.platform}/${process.arch}: complete UI construction, dependent placements, exact volumes, units, editable native reopen and actual STEP re-import.`);
  } finally { await page.close(); await server.close(); for(const shape of shapes.values())shape.delete(); }
});
