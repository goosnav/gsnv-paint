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
 const replace=page.getByRole('dialog');await expect(replace).toBeVisible();{await replace.getByLabel('Unsaved changes').selectOption('replace');await replace.getByRole('button',{name:'OK',exact:true}).click();}
 await ready(page);await tool(page,'cad.solid');await volume(page,'72000.000');
 await expect(page.locator('.gc-panel').filter({has:page.getByRole('heading',{name:'Recovery',exact:true})})).toContainText('Local recovery enabled');await page.reload();await expect(page.getByRole('button',{name:'Restore recovery',exact:true}).last()).toBeVisible();await page.getByRole('button',{name:'Restore recovery',exact:true}).last().click();await ready(page);await tool(page,'cad.solid');await volume(page,'72000.000');
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
