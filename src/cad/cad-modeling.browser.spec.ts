import {test,expect,type Page} from '@playwright/test';
import {preview} from 'vite';
import {readFile} from 'node:fs/promises';
import {nativeContainer} from '../shared/native-container.ts';
import {editableCADContent} from './editable-cad-content.ts';
import {kernelFixture} from './kernel-test-fixture.ts';
import {stepExchange} from './step-exchange.ts';
import {evaluateDimension} from './dimension-expressions.ts';
const start=()=>preview({build:{outDir:process.env.CAD_MODELING_DIST??'dist'},preview:{host:'127.0.0.1',port:4196,strictPort:true}});
const ready=(page:Page)=>expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','ready',{timeout:30000});
async function menu(page:Page,name:string,item:string){await page.getByRole('menuitem',{name,exact:true}).click();await page.getByRole('menuitem',{name:item,exact:true}).click();}
async function accept(page:Page){await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await ready(page);}
async function newPart(page:Page){await page.keyboard.press('Control+n');await expect(page.locator('.cad-properties').getByRole('button',{name:'XY',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-entity-id]:visible')).toHaveCount(0);await expect(page.locator('[data-profile-id]')).toHaveCount(0);await expect(page.locator('[data-command="edit.undo"]:visible').first()).toBeDisabled();await expect(page.locator('[data-command="file.open"]:visible').first()).toBeEnabled();}
async function save(page:Page){const waiting=page.waitForEvent('download');await page.keyboard.press('Control+s');const file=await waiting;return{name:file.suggestedFilename(),bytes:await readFile((await file.path())!)};}
test.beforeEach(async({context})=>{await context.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined});Object.defineProperty(window,'showOpenFilePicker',{value:undefined});});});
test('CAD modeling production: centered formula profile, planes, units, editable native reopen and STEP world position',async({page},testInfo)=>{
 test.setTimeout(90000);const server=await start(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('[data-command="file.new"]:visible').first()).toBeEnabled();await newPart(page);
  const props=page.locator('.cad-properties'),dialog=page.getByRole('dialog');
  await props.getByRole('button',{name:'XZ',exact:true}).click();await expect(props.getByRole('button',{name:'XZ',exact:true})).toHaveAttribute('aria-pressed','true');
  await props.getByRole('button',{name:'Add variable…'}).click();await dialog.getByLabel('Name',{exact:true}).fill('width');await dialog.getByLabel('Value or expression').fill('30');await dialog.getByRole('button',{name:'OK',exact:true}).click();
  await menu(page,'Sketch','Centered rectangle dimensions…');await dialog.getByLabel('Width (mm or expression)').fill('width');await dialog.getByLabel('Height (mm or expression)').fill('20');await dialog.getByLabel('Center U (mm or expression)').fill('12');await dialog.getByLabel('Center V (mm or expression)').fill('18');await accept(page);
  await expect(page.getByLabel('XZ sketch',{exact:true})).toBeVisible();await expect(page.locator('[data-profile-id]')).toContainText('30 × 20');
  await page.keyboard.press('e');await dialog.getByLabel('Depth (mm or expression)').fill('5');await accept(page);await expect(props).toContainText('3000.000 mm³');
  await props.getByRole('button',{name:'width = 30',exact:true}).click();await dialog.getByLabel('Value or expression').fill('40');await accept(page);await expect(props).toContainText('4000.000 mm³');
  await props.getByRole('button',{name:'Imperial (in)',exact:true}).click();await ready(page);await expect(props).toContainText('4000.000 mm³');await props.getByRole('button',{name:'Metric (mm)',exact:true}).click();await ready(page);
  const file=await save(page),pack=nativeContainer({op:'decode',parts:[file.bytes]}),source=editableCADContent({operation:'read',value:pack.project.content});
  const profile=source.graph.features[0].definition.sketch.profiles![0]!;expect(profile.kind).toBe('center-rectangle');if(profile.kind!=='center-rectangle')throw Error('fixture');expect(profile.width.source).toBe('width');expect(profile.center.map(expression=>evaluateDimension({expression,context:{units:source.units,variables:{}}}).value)).toEqual([12,18]);profile.center.forEach(e=>expect(e.source).toContain('mm'));expect(source.graph.features[0].definition.sketch.plane).toBe('XZ');
  await newPart(page);const choosing=page.waitForEvent('filechooser');await page.keyboard.press('Control+o');await(await choosing).setFiles({name:file.name,mimeType:'application/octet-stream',buffer:file.bytes});await ready(page);
  await props.getByRole('button',{name:/^width = /}).click();await dialog.getByLabel('Value or expression').fill('50 mm');await accept(page);await expect(props).toContainText('5000.000 mm³');
  await page.locator('[data-profile-id]').click();await expect(dialog.getByLabel('Width (mm or expression)')).toHaveValue('width');await dialog.getByLabel('Center U (mm or expression)').fill('width / 2');await accept(page);await expect(props).toContainText('25.000, -2.500, 18.000 mm');
  await menu(page,'Solid','Solid view');await expect(page.getByLabel('CAD solid viewport')).toBeVisible();
  const exporting=page.waitForEvent('download');await page.locator('[data-command="cad.exportSTEP"]:visible').first().click();const exported=await exporting,bytes=await readFile((await exported.path())!);
  const fixture=await kernelFixture();try{const bodies=stepExchange({action:'import',session:fixture.session,units:'mm',bytes}).bodies!;expect(bodies.shapes).toHaveLength(1);const m=fixture.measure(bodies.shapes[0]!.token);expect(m.volume).toBeCloseTo(5000,5);m.center.forEach((v,i)=>expect(v).toBeCloseTo([25,-2.5,18][i]!,6));bodies.shapes.forEach(b=>fixture.session.release(b.token));expect(fixture.retained.size).toBe(0);}finally{fixture.close();}
  await expect(page.locator('.cad-stage')).toBeVisible();expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight)).toBe(true);
  await page.screenshot({path:'dev/evidence/CAD-modeling-production.png'});await testInfo.attach('Plane and source profile editor at 1280×720',{path:'dev/evidence/CAD-modeling-production.png',contentType:'image/png'});expect(errors).toEqual([]);
 }finally{await page.close();await server.close();}
});
test('CAD modeling production: pointer profiles, keyboard group selection, detach/undo and construction exclusion',async({page})=>{
 test.setTimeout(90000);const server=await start();
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('[data-command="file.new"]:visible').first()).toBeEnabled();await newPart(page);
  await page.locator('[data-command="cad.centerRectangleTool"]').click();
  const box=(await page.locator('.cad-stage').boundingBox())!,click=(u:number,v:number)=>page.mouse.click(box.x+70+u*4,box.y+box.height-70-v*4);
  await click(10,10);await click(25,20);await ready(page);await expect(page.locator('[data-entity-id][role="button"]')).toHaveCount(4);
  const first=page.locator('[data-entity-id][role="button"]').first();await first.focus();await page.keyboard.press('Enter');await expect(page.locator('.cad-properties')).toContainText('Selection (4)');await expect(first).toBeFocused();
  await page.keyboard.press('Control+Enter');await expect(page.locator('[data-entity-id][aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Detach profile',exact:true}).click();await ready(page);await expect(page.locator('[data-profile-id]')).toHaveCount(0);await page.keyboard.press('Control+z');await ready(page);await expect(page.locator('[data-profile-id]')).toHaveCount(1);
  await page.locator('[data-command="cad.polygonTool"]').click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Sides').fill('5');await dialog.getByRole('button',{name:'OK',exact:true}).click();await click(70,30);await click(80,30);await ready(page);
  const polygon=page.locator('.cad-profile').filter({hasText:'5-sided polygon'});await polygon.getByRole('button',{name:'Make construction',exact:true}).click();await ready(page);
  const file=await save(page),source=editableCADContent({operation:'read',value:nativeContainer({op:'decode',parts:[file.bytes]}).project.content});
  const profiles=source.graph.features[0].definition.sketch.profiles!;expect(profiles).toHaveLength(2);const rectangle=profiles[0]!,guide=profiles[1]!;expect(rectangle.center.map(e=>e.source)).toEqual(['10 mm','10 mm']);expect(rectangle.kind).toBe('center-rectangle');if(rectangle.kind!=='center-rectangle')throw Error('fixture');expect(rectangle.width.source).toBe('30 mm');expect(rectangle.height.source).toBe('20 mm');expect(guide.kind).toBe('regular-polygon');expect(guide.construction).toBe(true);
  expect(source.graph.features[0].definition.sketch.entities.slice(0,4).map(e=>e.kind==='segment'?e.a:null)).toEqual([[-5,0],[25,0],[25,20],[-5,20]]);
  await newPart(page);const choosing=page.waitForEvent('filechooser');await page.keyboard.press('Control+o');await(await choosing).setFiles({name:file.name,mimeType:'application/octet-stream',buffer:file.bytes});await ready(page);const reopened=await save(page);expect(nativeContainer({op:'decode',parts:[reopened.bytes]}).project.content).toEqual(source);
  await expect(page.locator(`[data-entity-id="${guide.entityIds[0]}"] line[stroke-dasharray="5 4"]`)).toHaveCount(1);
  await page.keyboard.press('e');await dialog.getByLabel('Depth (mm or expression)').fill('5');await accept(page);await expect(page.locator('.cad-properties')).toContainText('3000.000 mm³');
  await polygon.getByRole('button',{name:'Delete profile',exact:true}).click();await ready(page);await expect(page.locator('[data-profile-id]')).toHaveCount(1);await page.keyboard.press('Control+z');await ready(page);await expect(page.locator('[data-profile-id]')).toHaveCount(2);await expect(page.locator('.cad-properties')).toContainText('3000.000 mm³');
 }finally{await page.close();await server.close();}
});
test('CAD modeling production: numeric polygon radius/rotation edits and a circle hole on YZ',async({page})=>{
 test.setTimeout(90000);const server=await start();
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('[data-command="file.new"]:visible').first()).toBeEnabled();await newPart(page);
  const props=page.locator('.cad-properties'),dialog=page.getByRole('dialog');await props.getByRole('button',{name:'YZ',exact:true}).click();
  await menu(page,'Sketch','Regular polygon dimensions…');await dialog.getByLabel('Radius (mm or expression)').fill('10');await dialog.getByLabel('Rotation (degrees or expression)').fill('30');await accept(page);
  await menu(page,'Sketch','Circle dimensions…');await dialog.getByLabel('Diameter (mm or expression)').fill('4');await dialog.getByLabel('Center X (mm)').fill('30');await dialog.getByLabel('Center Y (mm)').fill('30');await accept(page);
  await page.keyboard.press('e');await dialog.getByLabel('Depth (mm or expression)').fill('5');await accept(page);await expect(props).toContainText(`${((3*Math.sqrt(3)*100/2-4*Math.PI)*5).toFixed(3)} mm³`);
  await page.locator('[data-profile-id]').click();await expect(dialog.getByLabel('Sides',{exact:true})).toHaveCount(0);await dialog.getByLabel('Radius (mm or expression)').fill('0');await expect(dialog.getByRole('button',{name:'OK',exact:true})).toBeDisabled();await dialog.getByLabel('Radius (mm or expression)').fill('12');await dialog.getByLabel('Rotation (degrees or expression)').fill('90');await accept(page);await expect(props).toContainText(`${((3*Math.sqrt(3)*144/2-4*Math.PI)*5).toFixed(3)} mm³`);
  const saved=await save(page),source=editableCADContent({operation:'read',value:nativeContainer({op:'decode',parts:[saved.bytes]}).project.content}),profile=source.graph.features[0].definition.sketch.profiles![0]!;expect(profile.kind).toBe('regular-polygon');if(profile.kind!=='regular-polygon')throw Error('fixture');expect(profile.radius.source).toBe('12');expect(profile.rotation.source).toBe('90');expect(profile.sides).toBe(6);expect(source.graph.features[0].definition.sketch.plane).toBe('YZ');
 }finally{await page.close();await server.close();}
});
test('CAD modeling production: exact hexagon and independent construction-line native reopen fixtures',async({page})=>{
 test.setTimeout(90000);const server=await start();
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('[data-command="file.new"]:visible').first()).toBeEnabled();await newPart(page);
  const dialog=page.getByRole('dialog');await page.locator('[data-command="cad.polygonTool"]').click();await dialog.getByLabel('Sides').fill('6');await dialog.getByRole('button',{name:'OK',exact:true}).click();
  const box=(await page.locator('.cad-stage').boundingBox())!,click=(u:number,v:number)=>page.mouse.click(box.x+70+u*4,box.y+box.height-70-v*4);await click(0,0);await click(10,0);await ready(page);
  const file=await save(page),source=editableCADContent({operation:'read',value:nativeContainer({op:'decode',parts:[file.bytes]}).project.content}),sketch=source.graph.features[0].definition.sketch;
  expect(sketch.entities).toHaveLength(6);for(let i=0;i<6;i++){const e=sketch.entities[i]!,next=sketch.entities[(i+1)%6]!;if(e.kind!=='segment'||next.kind!=='segment')throw Error('fixture');expect(e.b).toEqual(next.a);expect(Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1])).toBeCloseTo(10,8);expect(Math.hypot(...e.a)).toBeCloseTo(10,8);}
  const reopen=async(file:{name:string;bytes:Buffer})=>{await newPart(page);const choosing=page.waitForEvent('filechooser');await page.keyboard.press('Control+o');await(await choosing).setFiles({name:file.name,mimeType:'application/octet-stream',buffer:file.bytes});await ready(page);};
  await reopen(file);const saved=await save(page);expect(nativeContainer({op:'decode',parts:[saved.bytes]}).project.content).toEqual(source);
  await newPart(page);await page.keyboard.press('l');await click(0,0);await click(20,10);await ready(page);const line=page.locator('[data-entity-id][role="button"]');await line.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Make selected construction',exact:true}).click();await ready(page);
  const reference=await save(page),referenceSource=editableCADContent({operation:'read',value:nativeContainer({op:'decode',parts:[reference.bytes]}).project.content});expect(referenceSource.graph.features[0].definition.sketch.entities[0]).toMatchObject({kind:'segment',a:[0,0],b:[20,10],construction:true});
  await reopen(reference);const referenceAgain=await save(page);expect(nativeContainer({op:'decode',parts:[referenceAgain.bytes]}).project.content).toEqual(referenceSource);
  await menu(page,'Sketch','Centered rectangle dimensions…');await accept(page);await page.keyboard.press('e');await dialog.getByLabel('Depth (mm or expression)').fill('2');await accept(page);await expect(page.locator('.cad-properties')).toContainText('1600.000 mm³');
 }finally{await page.close();await server.close();}
});
