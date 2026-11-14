import {test,expect,type Page} from '@playwright/test';
import {preview} from 'vite';
import {readFile} from 'node:fs/promises';
import {nativeContainer} from '../shared/native-container.ts';
async function tool(page:Page,id:string){await page.locator(`button[data-command="${id}"]:visible`).first().click();}
async function ready(page:Page){await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','ready',{timeout:30000});}
async function volume(page:Page,value:string){await expect(page.locator('.cad-properties')).toContainText(`${value} mm³`,{timeout:30000});}
test('CAD-APP production: constrain, extrude, preview/cancel, rebuild, undo, files and recovery',async({page,context},testInfo)=>{
 test.setTimeout(90000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}});const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined});Object.defineProperty(window,'showOpenFilePicker',{value:undefined});});
 try{
 await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();
 await page.keyboard.press('Control+n');await tool(page,'cad.rectangle');const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();await dialog.getByLabel('Width (mm)',{exact:true}).fill('100');await dialog.getByLabel('Height (mm)',{exact:true}).fill('60');await ready(page);await dialog.getByRole('button',{name:'OK',exact:true}).click();await ready(page);
 await page.keyboard.press('e');await expect(dialog).toBeVisible();await volume(page,'60000.000');await dialog.getByRole('button',{name:'OK',exact:true}).click();await volume(page,'60000.000');
 await expect(page.getByLabel('CAD solid viewport')).toBeVisible();
 await page.getByRole('button',{name:'Width: 100',exact:true}).click();await dialog.getByLabel('Length (mm or expression)').fill('120');await volume(page,'72000.000');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await volume(page,'60000.000');
 await page.getByRole('button',{name:'Width: 100',exact:true}).click();await dialog.getByLabel('Length (mm or expression)').fill('120');await dialog.getByRole('button',{name:'OK',exact:true}).click();await volume(page,'72000.000');
 await page.keyboard.press('Control+z');await volume(page,'60000.000');await page.keyboard.press('Control+Shift+z');await volume(page,'72000.000');
 const downloading=page.waitForEvent('download');await page.keyboard.press('Control+s');const download=await downloading,bytes=await readFile((await download.path())!);
 const packageValue=nativeContainer({op:'decode',parts:[bytes]});expect(packageValue.project.format).toBe('gsnv-cad');expect(JSON.stringify(packageValue.project.content)).toContain('120');expect(packageValue.assets).toHaveLength(0);
 await page.keyboard.press('Control+n');await expect(page.locator('.cad-properties')).toContainText('Draw a closed sketch');
 await expect(page.locator('button[data-command="file.open"]:visible').first()).toBeEnabled();const choosing=page.waitForEvent('filechooser',{timeout:10000});await page.keyboard.press('Control+o');await(await choosing).setFiles({name:download.suggestedFilename(),mimeType:'application/octet-stream',buffer:bytes});
 // Replacing never prompts: the previous part is already kept in File > Recent.
 await ready(page);await tool(page,'cad.solid');await volume(page,'72000.000');
 await expect(page.locator('.gc-panel').filter({has:page.getByRole('heading',{name:'Recovery',exact:true})})).toContainText('Local recovery enabled');await page.reload();await expect(page.locator('[data-command="file.recent.0"]')).toHaveCount(1);await ready(page);await tool(page,'cad.solid');await volume(page,'72000.000');
 expect(await page.evaluate(()=>crossOriginIsolated)).toBe(true);expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight)).toBe(true);
 await page.screenshot({path:'dev/evidence/CAD-APP-production.png'});await testInfo.attach('CAD production solid',{path:'dev/evidence/CAD-APP-production.png',contentType:'image/png'});
 console.log(`CAD-APP Chrome ${context.browser()!.version()} ${process.platform}/${process.arch}: exact 60000/72000 mm3, live cancel, undo/redo, editable native file, recovery.`);
 expect(errors).toEqual([]);
 }finally{await page.close();await server.close();}
});

test('CAD-APP pointer tools and invalid sketch produce a visible failure with no stale solid',async({page})=>{
 test.setTimeout(60000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}});
 try{
 await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();await page.keyboard.press('Control+n');await page.keyboard.press('l');
 const box=(await page.locator('.cad-stage').boundingBox())!;await page.mouse.click(box.x+100,box.y+200);await page.mouse.click(box.x+300,box.y+200);await ready(page);
 await expect(page.locator('[data-entity-id]')).toHaveCount(1);await page.keyboard.press('e');await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','error');await expect(page.locator('.cad-build-status')).toContainText('closed profile');
 await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await ready(page);await tool(page,'cad.rectangle');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await ready(page);await page.keyboard.press('v');const edge=(await page.locator('[data-entity-id]').first().boundingBox())!;await page.mouse.click(edge.x+edge.width/2,edge.y+edge.height/2);
 await page.getByRole('button',{name:'Vertical',exact:true}).click();await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','error');await expect(page.locator('.cad-build-status')).toContainText('constraints');
 await page.keyboard.press('Control+z');await ready(page);await page.keyboard.press('Control+a');await page.keyboard.press('Delete');await expect(page.locator('[data-entity-id]')).toHaveCount(0);
 }finally{await page.close();await server.close();}
});

test('CAD-APP keyboard selects one or several sketch entities without losing focus on redraw',async({page})=>{
 test.setTimeout(60000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}});
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();
  await page.keyboard.press('Control+n');await tool(page,'cad.rectangle');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await ready(page);
  const lines=page.locator('.cad-sketch [data-entity-id][role="button"]');await expect(lines).toHaveCount(4);
  await lines.nth(0).focus();await page.keyboard.press('Enter');await expect(lines.nth(0)).toBeFocused();await expect(lines.nth(0)).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Tab');await expect(lines.nth(1)).toBeFocused();await page.keyboard.press('Control+Enter');
  await expect(page.locator('.cad-properties')).toContainText('Selection (2)');await expect(lines.nth(1)).toBeFocused();
  await page.keyboard.press('Control+Enter');await expect(page.locator('.cad-properties')).toContainText('Selection (1)');
  await page.keyboard.press('Space');await expect(lines.nth(0)).toHaveAttribute('aria-pressed','false');await expect(lines.nth(1)).toHaveAttribute('aria-pressed','true');
  const dimension=page.locator('.cad-sketch [data-dimension-id]').first();await dimension.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await ready(page);
  await page.keyboard.press('Escape');await ready(page);await expect(dimension).toBeFocused();
 }finally{await page.close();await server.close();}
});

test('CAD-APP exact sketch tools, H/V solving and displayed dimension editing',async({page,context})=>{
 test.setTimeout(60000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}});
 await context.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined});Object.defineProperty(window,'showOpenFilePicker',{value:undefined});});
 try{
 await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();await page.keyboard.press('Control+n');await tool(page,'cad.line');
 const box=(await page.locator('.cad-stage').boundingBox())!;const click=async(x:number,y:number)=>page.mouse.click(box.x+70+x*4,box.y+box.height-70-y*4);
 await click(0,0);await click(20,10);await ready(page);
 const save=async()=>{const result=page.waitForEvent('download');await page.keyboard.press('Control+s');const d=await result;return nativeContainer({op:'decode',parts:[await readFile((await d.path())!)]});};
 const line=await save(),content=line.project.content as any;
 expect(content.graph.features[0].definition.sketch.entities.map((e:any)=>({a:e.a,b:e.b}))).toEqual([{a:[0,0],b:[20,10]}]);
 await page.keyboard.press('v');await click(10,5);await page.getByRole('button',{name:'Horizontal',exact:true}).click();await ready(page);
 const coordinates=async()=>page.locator('[data-entity-id] line[stroke="transparent"]').first().evaluate(e=>['x1','y1','x2','y2'].map(k=>Number(e.getAttribute(k))));
 let points=await coordinates();expect(Math.abs(points[1]!-points[3]!)).toBeLessThan(4e-7);
 await page.keyboard.press('Control+z');await ready(page);await page.getByRole('button',{name:'Vertical',exact:true}).click();await ready(page);points=await coordinates();expect(Math.abs(points[0]!-points[2]!)).toBeLessThan(4e-7);
 await page.keyboard.press('r');await click(0,0);await click(30,20);await ready(page);const rectangle=await save(),s=(rectangle.project.content as any).graph.features[0].definition.sketch;
 expect(s.entities.map((e:any)=>({a:e.a,b:e.b}))).toEqual([{a:[0,0],b:[30,0]},{a:[30,0],b:[30,20]},{a:[30,20],b:[0,20]},{a:[0,20],b:[0,0]}]);
 await page.keyboard.press('e');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await volume(page,'6000.000');await page.getByRole('button',{name:'Sketch 1',exact:true}).click();await page.keyboard.press('v');
 await page.locator('[data-dimension-id]').first().dblclick();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByLabel('Length (mm or expression)').fill('40');await page.keyboard.press('Enter');await volume(page,'8000.000');
 }finally{await page.close();await server.close();}
});

test('CAD-APP plate with circular holes extrudes exact B-rep volume and exports STL',async({page,context})=>{
 test.setTimeout(60000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined});Object.defineProperty(window,'showOpenFilePicker',{value:undefined});});
 try{
 await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();await page.keyboard.press('Control+n');
 const dialog=page.getByRole('dialog');await tool(page,'cad.rectangle');await dialog.getByRole('button',{name:'OK',exact:true}).click();await ready(page);
 await page.getByRole('menuitem',{name:'Sketch',exact:true}).click();await page.getByRole('menuitem',{name:'Circle dimensions…'}).click();
 await dialog.getByLabel('Diameter (mm or expression)').fill('10');await dialog.getByLabel('Center X (mm)').fill('20');await dialog.getByLabel('Center Y (mm)').fill('30');await dialog.getByRole('button',{name:'OK',exact:true}).click();await ready(page);
 await expect(page.locator('.cad-properties')).toContainText('Diameter: 10');await expect(page.locator('.cad-properties')).toContainText('fully defined');
 await page.keyboard.press('e');await volume(page,(60000-250*Math.PI).toFixed(3));await dialog.getByRole('button',{name:'OK',exact:true}).click();
 await page.getByRole('menuitem',{name:'Sketch',exact:true}).click();await page.getByRole('menuitem',{name:'Edit sketch'}).click();await page.keyboard.press('c');await expect(page.locator('.gc-palette button[data-command="cad.circleTool"]')).toHaveAttribute('aria-pressed','true');
 const {cx,cy,pitch}=await page.locator('[data-entity-id$="-circle"] circle').nth(1).evaluate(c=>{const box=(c as unknown as SVGCircleElement).ownerSVGElement!.getBoundingClientRect(),n=(k:string)=>Number(c.getAttribute(k));return{cx:box.x+n('cx'),cy:box.y+n('cy'),pitch:n('r')/5};});
 await page.mouse.click(cx+50*pitch,cy);await page.mouse.click(cx+50*pitch+4*pitch,cy);await ready(page);
 await expect(page.locator('[data-entity-id$="-circle"]')).toHaveCount(2);
 const diameters=await page.locator('.cad-properties button[data-edit-id$="-diameter"]').allTextContents();expect(diameters).toHaveLength(2);
 const displayed=/^Diameter: ([\d.]+)$/.exec(diameters[1]!);expect(displayed).not.toBeNull();const drawn=Number(displayed![1]);expect(Math.abs(drawn-8)).toBeLessThan(0.2);
 await volume(page,((6000-25*Math.PI-Math.PI*(drawn/2)**2)*10).toFixed(3));
 await page.getByRole('menuitem',{name:'Solid',exact:true}).click();const downloading=page.waitForEvent('download');await page.getByRole('menuitem',{name:'Export STL (3D printing)'}).click();
 const download=await downloading,bytes=await readFile((await download.path())!);expect(download.suggestedFilename()).toBe('Untitled part.stl');
 const triangles=bytes.readUInt32LE(80);expect(triangles).toBeGreaterThan(100);expect(bytes.length).toBe(84+50*triangles);expect(bytes.subarray(0,14).toString()).toBe('gsnv-paint STL');
 const z=new Set<number>();for(let t=0;t<triangles;t++)for(let v=0;v<3;v++)z.add(Math.round(bytes.readFloatLE(84+t*50+12+v*12+8)*1000)/1000);expect([...z].sort((a,b)=>a-b)).toEqual([0,10]);
 await page.keyboard.press('Control+z');await volume(page,(60000-250*Math.PI).toFixed(3));
 expect(errors).toEqual([]);
 }finally{await page.close();await server.close();}
});

test('CAD-APP failing fillet is flagged, readable and editable without a stale solid',async({page})=>{
 test.setTimeout(60000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}});
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();await page.keyboard.press('Control+n');
  await tool(page,'cad.rectangle');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await ready(page);await page.keyboard.press('e');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await volume(page,'60000.000');
  await page.locator('.cad-properties').getByRole('button',{name:'Fillet…',exact:true}).click();await page.getByRole('dialog').getByLabel('Radius (mm or expression)').fill('100');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();
  await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','error');await expect(page.locator('.cad-build-status')).toContainText(/Fillet 1: .+/);await expect(page.locator('.cad-feature-tree li[data-failed="true"]')).toContainText('Fillet 1');
  await expect(page.locator('.cad-properties')).not.toContainText('60000.000 mm³');
  await page.locator('.cad-properties').getByRole('button',{name:'! Fillet 1',exact:true}).click();await page.getByRole('dialog').getByLabel('Radius (mm or expression)').fill('5');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await ready(page);await volume(page,(60000-(4-Math.PI)*250).toFixed(3));
 }finally{await page.close();await server.close();}
});

test('CAD-APP cut, fillet, chamfer, imperial units and parallel/perpendicular/equal constraints',async({page})=>{
 test.setTimeout(90000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();await page.keyboard.press('Control+n');
 const dialog=page.getByRole('dialog'),props=page.locator('.cad-properties');
 await tool(page,'cad.rectangle');await dialog.getByRole('button',{name:'OK',exact:true}).click();await ready(page);
 await page.keyboard.press('e');await dialog.getByRole('button',{name:'OK',exact:true}).click();await volume(page,'60000.000');
 await props.getByRole('button',{name:'Cut…',exact:true}).click();await ready(page);await expect(props).toContainText('Cut 1');
 await page.getByRole('menuitem',{name:'Sketch',exact:true}).click();await page.getByRole('menuitem',{name:'Circle dimensions…'}).click();
 await dialog.getByLabel('Diameter (mm or expression)').fill('10');await dialog.getByLabel('Center X (mm)').fill('20');await dialog.getByLabel('Center Y (mm)').fill('30');await dialog.getByRole('button',{name:'OK',exact:true}).click();
 await volume(page,(60000-250*Math.PI).toFixed(3));
 await props.getByRole('button',{name:'Depth…'}).click();await dialog.getByLabel('Extent').selectOption('blind');await dialog.getByLabel('Depth (mm or expression)').fill('4');await dialog.getByRole('button',{name:'OK',exact:true}).click();
 await volume(page,(60000-100*Math.PI).toFixed(3));
 await props.getByRole('button',{name:'Fillet…',exact:true}).click();await dialog.getByLabel('Radius (mm or expression)').fill('5');await dialog.getByRole('button',{name:'OK',exact:true}).click();
 await volume(page,(60000-100*Math.PI-(4-Math.PI)*250).toFixed(3));await expect(props).toContainText('Fillet 1');
 await props.getByRole('button',{name:'Chamfer…',exact:true}).click();await dialog.getByLabel('Edges').selectOption('top');await dialog.getByLabel('Distance (mm or expression)').fill('1');await dialog.getByRole('button',{name:'OK',exact:true}).click();
 await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','ready',{timeout:30000});await expect(props).toContainText('Chamfer 1');
 await props.getByRole('button',{name:'Delete',exact:true}).last().click();await volume(page,(60000-100*Math.PI-(4-Math.PI)*250).toFixed(3));
 await props.getByRole('button',{name:'Imperial (in)'}).click();await expect(props.getByRole('button',{name:'Imperial (in)'})).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Control+n');await expect(page.locator('.cad-properties').getByRole('button',{name:'Imperial (in)'})).toHaveAttribute('aria-pressed','true'); // New parts remember the choice.
 await page.keyboard.press('l');const box=(await page.locator('.cad-stage').boundingBox())!;
 await page.mouse.click(box.x+100,box.y+300);await page.mouse.click(box.x+300,box.y+300);await page.mouse.click(box.x+400,box.y+250);await page.mouse.click(box.x+450,box.y+100);await ready(page);
 await page.keyboard.press('v');const lines=page.locator('[data-entity-id]');await expect(lines).toHaveCount(2);
 const first=(await lines.nth(0).boundingBox())!,second=(await lines.nth(1).boundingBox())!;
 await page.mouse.click(first.x+first.width/2,first.y+first.height/2);await page.keyboard.down('Control');await page.mouse.click(second.x+second.width/2,second.y+second.height/2);await page.keyboard.up('Control');
 await props.getByRole('button',{name:'Perpendicular',exact:true}).click();await ready(page);await props.getByRole('button',{name:'Equal',exact:true}).click();await ready(page);
 await expect(props).toContainText('Perpendicular');await expect(props).toContainText('Equal length');
 await page.mouse.click(first.x+first.width/2,first.y+first.height/2);await props.getByRole('button',{name:'Vertical',exact:true}).click();
 await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','error');await expect(page.locator('.cad-build-status')).toContainText(/contradict each other \(.*(Vertical|Perpendicular|Equal length)/);
 expect(errors).toEqual([]);
 }finally{await page.close();await server.close();}
});
