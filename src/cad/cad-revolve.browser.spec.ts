import {test,expect,type Page} from '@playwright/test';
import {preview} from 'vite';
import {readFile} from 'node:fs/promises';
import {nativeContainer} from '../shared/native-container.ts';
import {editableCADContent} from './editable-cad-content.ts';
import {kernelFixture} from './kernel-test-fixture.ts';
import {stepExchange} from './step-exchange.ts';
const start=()=>preview({preview:{host:'127.0.0.1',port:4197,strictPort:true}});
const ready=(page:Page)=>expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','ready',{timeout:30000});
const volume=(page:Page,value:number)=>expect(page.locator('.cad-properties')).toContainText(`${value.toFixed(3)} mm³`,{timeout:30000});
const history=(page:Page)=>page.locator('[data-panel-history]').innerText();
const command=(page:Page,id:string)=>page.locator(`[data-command="${id}"]:visible`).first();
async function menu(page:Page,name:string,item:string){await page.getByRole('menuitem',{name,exact:true}).click();await page.getByRole('menuitem',{name:item,exact:true}).click();}
async function accept(page:Page){await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await ready(page);}
async function variable(page:Page,name:string,source:string,kind='length'){
 await page.getByRole('button',{name:'Add variable…',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Name',{exact:true}).fill(name);await dialog.getByLabel('Value or expression').fill(source);await dialog.getByLabel('Type',{exact:true}).selectOption(kind);await dialog.getByRole('button',{name:'OK',exact:true}).click();
}
async function rectangle(page:Page,width='10',height='12',x='10'){
 await command(page,'cad.rectangle').click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Width (mm)').fill(width);await dialog.getByLabel('Height (mm)').fill(height);await dialog.getByLabel('Corner X (mm)').fill(x);await dialog.getByLabel('Corner Y (mm)').fill('0');await accept(page);
}
async function save(page:Page){const waiting=page.waitForEvent('download');await page.keyboard.press('Control+s');const file=await waiting;return{name:file.suggestedFilename(),bytes:await readFile((await file.path())!)};}
const sourceOf=(bytes:Uint8Array)=>editableCADContent({operation:'read',value:nativeContainer({op:'decode',parts:[bytes]}).project.content});
test.beforeEach(async({page,context})=>{
 // Keep chooser interception enabled before any fallback upload can open a native dialog.
 page.on('filechooser',()=>{});
 await context.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined});Object.defineProperty(window,'showOpenFilePicker',{value:undefined});});
});
test('Revolve production: live signed preview, variables, undo, native reopen and recovery',async({page,context},testInfo)=>{
 test.setTimeout(150000);const server=await start(),errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4197/')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(command(page,'file.new')).toBeEnabled();await page.keyboard.press('Control+n');
  await variable(page,'outer','20');await variable(page,'sweep','360','angle');await rectangle(page,'outer - 10');
  const props=page.locator('.cad-properties'),dialog=page.getByRole('dialog'),before=await history(page);
  await props.getByRole('button',{name:'Revolve…',exact:true}).click();await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Axis',{exact:true})).toHaveValue('v');await expect(dialog.getByLabel('Axis',{exact:true}).locator('option')).toHaveCount(1);
  await expect(dialog.getByLabel('Angle (degrees or expression)')).toHaveValue('360 deg');await volume(page,3600*Math.PI);
  await dialog.getByLabel('Angle (degrees or expression)').fill('90 deg');await volume(page,900*Math.PI);await expect(props).toContainText('9.903, 6.000, -9.903 mm');
  await dialog.getByLabel('Angle (degrees or expression)').fill('-90 deg');await volume(page,900*Math.PI);await expect(props).toContainText('9.903, 6.000, 9.903 mm');
  await page.keyboard.press('Escape');await ready(page);expect(await history(page)).toBe(before);await expect(props.locator('.cad-feature-tree li')).toHaveCount(1);
  await expect(command(page,'cad.revolve')).toHaveAttribute('title',/Shift\+E/);await expect(command(page,'cad.revolve').locator('[data-icon="revolve"]')).toHaveCount(1);
  await page.keyboard.press('Shift+e');await expect(dialog).toBeVisible();await dialog.getByLabel('Angle (degrees or expression)').fill('sweep');await page.keyboard.press('Enter');await ready(page);await expect(dialog).toHaveCount(0);await volume(page,3600*Math.PI);
  await expect(command(page,'cad.extrude')).toBeDisabled();await expect(props.getByRole('button',{name:'Fillet…',exact:true})).toBeDisabled();
  await props.getByRole('button',{name:'outer = 20',exact:true}).click();await dialog.getByLabel('Value or expression').fill('25');await accept(page);await volume(page,6300*Math.PI);
  await props.getByRole('button',{name:'sweep = 360',exact:true}).click();await dialog.getByLabel('Value or expression').fill('-90');await accept(page);await volume(page,1575*Math.PI);
  await page.keyboard.press('Control+z');await volume(page,6300*Math.PI);await page.keyboard.press('Control+y');await volume(page,1575*Math.PI);
  const committed=await history(page);await props.getByRole('button',{name:'Revolve 1',exact:true}).dblclick();await expect(dialog).toHaveCount(1);await expect(dialog.getByLabel('Angle (degrees or expression)')).toHaveValue('sweep');
  for(const invalid of ['0','361','missing','10 mm']){await dialog.getByLabel('Angle (degrees or expression)').fill(invalid);await expect(dialog.getByRole('button',{name:'OK',exact:true})).toBeDisabled();}
  await page.keyboard.press('Escape');await ready(page);expect(await history(page)).toBe(committed);await volume(page,1575*Math.PI);
  const saved=await save(page),source=sourceOf(saved.bytes),feature=source.graph.features[1]!;
  expect(Object.keys(nativeContainer({op:'decode',parts:[saved.bytes]}).project).sort()).toEqual(['content','format','id','title','version']);expect(feature.kind).toBe('revolve');if(feature.kind!=='revolve')throw Error('fixture');expect(feature.definition.angle).toEqual({source:'sweep',kind:'angle'});expect(feature.definition.axis).toEqual({kind:'sketch-axis',sketchId:source.graph.features[0].id,axis:'v'});
  await page.keyboard.press('Control+n');const choosing=page.waitForEvent('filechooser');await page.keyboard.press('Control+o');await(await choosing).setFiles({name:saved.name,mimeType:'application/octet-stream',buffer:saved.bytes});await ready(page);await volume(page,1575*Math.PI);
  expect(sourceOf((await save(page)).bytes)).toEqual(source);
  await props.getByRole('button',{name:'Imperial (in)',exact:true}).click();await ready(page);await volume(page,1575*Math.PI);await props.getByRole('button',{name:'Metric (mm)',exact:true}).click();await ready(page);await volume(page,1575*Math.PI);
  const rebound=sourceOf((await save(page)).bytes),r=rebound.graph.features[1]!;if(r.kind!=='revolve')throw Error('fixture');expect(r.definition.angle.source).toBe('sweep');
  await expect(page.locator('[data-panel-recovery]')).toContainText('Local recovery enabled');await page.reload();await ready(page);await volume(page,1575*Math.PI);expect(sourceOf((await save(page)).bytes)).toEqual(rebound);
  await props.getByRole('button',{name:/^outer = /}).click();await dialog.getByLabel('Value or expression').fill('20 mm');await accept(page);await volume(page,900*Math.PI);
  await menu(page,'Solid','Solid view');await page.keyboard.press('f');await expect(page.getByLabel('CAD solid viewport')).toBeVisible();
  expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight)).toBe(true);await page.screenshot({path:'dev/evidence/CAD-revolve-production.png'});await testInfo.attach('Revolved part at 1280×720',{path:'dev/evidence/CAD-revolve-production.png',contentType:'image/png'});
  expect(errors).toEqual([]);expect(external).toEqual([]);console.log(`Revolve production Chrome ${context.browser()!.version()} ${process.platform}/${process.arch}: signed preview, editable source/recovery, undo and unit roundtrip; no external requests.`);
 }finally{await page.close();await server.close();}
});
test('Revolve production: STEP world placement, failed feature readiness, explicit replacement and removal',async({page,context})=>{
 test.setTimeout(150000);const server=await start(),fixture=await kernelFixture();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(command(page,'file.new')).toBeEnabled();await page.keyboard.press('Control+n');await rectangle(page);
  const props=page.locator('.cad-properties'),dialog=page.getByRole('dialog');await page.keyboard.press('Shift+e');await dialog.getByLabel('Angle (degrees or expression)').fill('90 deg');await accept(page);
  const centroid=280/(9*Math.PI),expectedCenters={XY:[centroid,6,-centroid],XZ:[centroid,centroid,6],YZ:[-centroid,centroid,6]};
  for(const plane of ['XY','XZ','YZ'] as const){
   await props.getByRole('button',{name:plane,exact:true}).click();await ready(page);await volume(page,900*Math.PI);
   const before=await history(page),downloading=page.waitForEvent('download');await command(page,'cad.exportSTEP').click();const download=await downloading,bytes=await readFile((await download.path())!);
   const bodies=stepExchange({action:'import',session:fixture.session,units:'mm',bytes}).bodies!;expect(bodies.shapes).toHaveLength(1);const token=bodies.shapes[0]!.token,m=fixture.measure(token);
   expect(m.volume).toBeCloseTo(900*Math.PI,6);expect(m.area).toBeCloseTo(330*Math.PI+240,6);m.center.forEach((v,i)=>expect(v).toBeCloseTo(expectedCenters[plane][i]!,6));fixture.session.release(token);expect(fixture.retained.size).toBe(0);expect(await history(page)).toBe(before);
  }
  await props.getByRole('button',{name:'Sketch 1',exact:true}).click();await page.keyboard.press('Control+a');await page.keyboard.press('Delete');await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','error',{timeout:30000});
  await expect(props.locator('.cad-feature-tree [data-failed="true"]')).toContainText('Revolve 1');await expect(page.locator('.cad-build-status')).toContainText('closed');await expect(command(page,'cad.exportSTEP')).toBeDisabled();
  await page.getByRole('menuitem',{name:'Solid',exact:true}).click();await expect(page.getByRole('menuitem',{name:'Send transparent view to Image…',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');await ready(page);await volume(page,900*Math.PI);await expect(command(page,'cad.exportSTEP')).toBeEnabled();
  await props.getByRole('button',{name:'Delete revolve',exact:true}).click();await ready(page);await expect(props.locator('.cad-feature-tree li')).toHaveCount(1);await page.keyboard.press('Control+z');await volume(page,900*Math.PI);
  await page.keyboard.press('Control+n');await rectangle(page);await page.keyboard.press('e');await accept(page);await volume(page,1200);
  const original=sourceOf((await save(page)).bytes);await props.getByRole('button',{name:'Replace extrusion with revolve…',exact:true}).click();await expect(dialog).toHaveAccessibleName('Replace extrusion with revolve…');await accept(page);await volume(page,3600*Math.PI);
  const replaced=sourceOf((await save(page)).bytes);expect(replaced.graph.features[1]!.id).toBe(original.graph.features[1]!.id);expect(replaced.graph.features[1]!.kind).toBe('revolve');await page.keyboard.press('Control+z');await volume(page,1200);expect(sourceOf((await save(page)).bytes)).toEqual(original);
  await props.getByRole('button',{name:'Fillet…',exact:true}).click();await dialog.getByLabel('Radius (mm or expression)').fill('1');await accept(page);await expect(props.getByRole('button',{name:'Replace extrusion with revolve…',exact:true})).toBeDisabled();
  expect(errors).toEqual([]);console.log(`Revolve STEP Chrome ${context.browser()!.version()} ${process.platform}/${process.arch}: native reimport at XY/XZ/YZ, failed-feature readiness and reversible explicit replacement.`);
 }finally{await page.close();await server.close();fixture.close();}
});
