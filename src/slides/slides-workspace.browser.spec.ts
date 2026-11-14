import { test, expect, type Page } from '@playwright/test';
import { createServer, preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { nativeContainer } from '../shared/native-container.ts';
const tool=(page:Page,id:string)=>page.locator(`.slides-toolbar [data-slides-command="slides.${id}"]`);
const property=(page:Page,name:string)=>page.locator('.slides-properties').getByLabel(name,{exact:true});
const scene=(page:Page)=>page.locator('.slides-surface .slides-scene');
const history=(page:Page)=>page.locator('[data-panel-history] li').allTextContents();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jltUAAAAASUVORK5CYII=','base64');
const serve=async()=>{if(process.env.SLIDES_DEV==='1'){const server=await createServer({server:{host:'127.0.0.1',port:4188,strictPort:true}});await server.listen();return server;}return preview({preview:{host:'127.0.0.1',port:4188,strictPort:true}});};

test('SLIDES-APP real editing, pointer transforms, shared undo, native reopen, presentation and two-page PDF',async({page,context,browser},testInfo)=>{
  test.setTimeout(90000);const server=await serve(),errors:string[]=[],external:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1:4188'))external.push(request.url());});
  await context.addInitScript(()=>{Object.defineProperty(window,'showOpenFilePicker',{value:undefined});Object.defineProperty(window,'showSaveFilePicker',{value:undefined});});
  try{
    await page.goto(server.resolvedUrls!.local[0]!);await page.getByRole('tab',{name:'Slides',exact:true}).click();await page.getByRole('button',{name:'New blank presentation'}).click();
    await tool(page,'text').click();const text=property(page,'Text');await text.fill('Quarterly update\nLocal, editable slides');
    const immediate=page.waitForEvent('download');await text.press('Control+s');const first=await immediate;
    const firstPackage=nativeContainer({op:'decode',parts:[await readFile((await first.path())!)]});expect(JSON.stringify(firstPackage.project.content)).toContain('Quarterly update');
    await expect(text).toBeFocused();await property(page,'Font size').fill('36');await property(page,'Font size').press('Tab');
    await tool(page,'rectangle').click();await property(page,'X').fill('220');await property(page,'X').press('Tab');await property(page,'Y').fill('190');await property(page,'Y').press('Tab');
    await expect(scene(page)).toBeInViewport({ratio:1});const rectangle=scene(page).locator('[data-element-kind="rectangle"]'),box=(await rectangle.boundingBox())!,scale=(await scene(page).boundingBox())!.width/960;
    const beforeDrag=await history(page);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30*scale,box.y+box.height/2+20*scale,{steps:4});await page.mouse.up();
    await expect.poll(async()=>Number(await property(page,'X').inputValue())).toBeCloseTo(250,3);await expect.poll(async()=>Number(await property(page,'Y').inputValue())).toBeCloseTo(210,3);expect((await history(page)).length).toBe(beforeDrag.length+1);
    const resize=(await scene(page).locator('[data-resize]').boundingBox())!;await page.mouse.move(resize.x+resize.width/2,resize.y+resize.height/2);await page.mouse.down();await page.mouse.move(resize.x+resize.width/2+40*scale,resize.y+resize.height/2+30*scale,{steps:4});await page.mouse.up();
    await expect.poll(async()=>Number(await property(page,'Width').inputValue())).toBeCloseTo(280,3);await expect.poll(async()=>Number(await property(page,'Height').inputValue())).toBeCloseTo(190,3);
    await property(page,'Width').press('Control+z');await expect(property(page,'Width')).toHaveValue('240');await property(page,'Width').press('Control+y');await expect.poll(async()=>Number(await property(page,'Width').inputValue())).toBeCloseTo(280,3);
    await tool(page,'ellipse').click();await property(page,'X').fill('600');await property(page,'X').press('Tab');await property(page,'Y').fill('220');await property(page,'Y').press('Tab');
    const choosing=page.waitForEvent('filechooser');await tool(page,'image').click();await(await choosing).setFiles({name:'picture.png',mimeType:'image/png',buffer:png});
    await expect(scene(page).locator('img')).toHaveCount(1);await property(page,'Width').fill('80');await property(page,'Width').press('Tab');await property(page,'Height').fill('80');await property(page,'Height').press('Tab');await property(page,'X').fill('760');await property(page,'X').press('Tab');
    await tool(page,'duplicate').click();await expect(page.locator('.slides-list li')).toHaveCount(2);await tool(page,'up').click();await tool(page,'down').click();
    await tool(page,'add').click();await expect(page.locator('.slides-list li')).toHaveCount(3);await tool(page,'delete').click();await expect(page.locator('.slides-list li')).toHaveCount(2);
    await tool(page,'present').click();const presentation=page.getByRole('dialog',{name:'Slide presentation'});await expect(presentation).toBeVisible();await presentation.press('Home');await expect(presentation).toContainText('1 of 2');await presentation.press('ArrowRight');await expect(presentation).toContainText('2 of 2');await presentation.press('Escape');await expect(presentation).toHaveCount(0);await expect(tool(page,'present')).toBeFocused();
    for(const [ratio,height]of[['16:9',405],['4:3',540]]as const){
      await property(page,'Aspect ratio').selectOption(ratio);await tool(page,'pdf').click();const frame=page.locator('iframe.slides-print');await expect(frame).toHaveCount(1);const html=await frame.getAttribute('srcdoc');
      const printer=await browser.newPage();await printer.setContent(html!);await printer.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));const pdf=await printer.pdf({preferCSSPageSize:true,printBackground:true});await printer.close();
      const source=pdf.toString('latin1');expect(source.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);const box=/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/.exec(source)!;expect(Math.round(Number(box[1]))).toBe(720);expect(Math.round(Number(box[2]))).toBe(height);
      await testInfo.attach(`Slides ${ratio} PDF`,{body:pdf,contentType:'application/pdf'});
      await frame.evaluate(e=>(e as HTMLIFrameElement).contentWindow!.dispatchEvent(new Event('afterprint')));await expect(frame).toHaveCount(0);
    }
    await page.screenshot({path:testInfo.outputPath('slides-production.png')});await testInfo.attach('Slides production',{path:testInfo.outputPath('slides-production.png'),contentType:'image/png'});
    const saving=page.waitForEvent('download');await property(page,'Slide name').press('Control+s');const saved=await saving,bytes=await readFile((await saved.path())!),pkg=nativeContainer({op:'decode',parts:[bytes]});
    expect(pkg.project.format).toBe('gsnv-slides');expect(pkg.assets).toHaveLength(1);expect(pkg.assets[0]!.bytes).toEqual(new Uint8Array(png));const content=pkg.project.content as {slides:{elements:unknown[]}[]};expect(content.slides).toHaveLength(2);expect(content.slides[0]!.elements).toHaveLength(4);
    await property(page,'Slide name').press('Control+n');await expect(scene(page).locator('[data-element-id]')).toHaveCount(0);const opening=page.waitForEvent('filechooser');await page.keyboard.press('Control+o');await(await opening).setFiles({name:saved.suggestedFilename(),mimeType:'application/octet-stream',buffer:bytes});
    await expect(page.locator('.slides-list li')).toHaveCount(2);await expect(scene(page)).toContainText('Quarterly update');await expect(scene(page).locator('img')).toHaveCount(1);
    await tool(page,'ellipse').click();const slideHistory=await history(page);await expect(scene(page).locator('[data-element-id]')).toHaveCount(5);
    await page.getByRole('tab',{name:'Document',exact:true}).click();await page.getByRole('button',{name:'New blank document'}).click();const documentEditor=page.locator('.doc-page');await documentEditor.click();await page.keyboard.insertText('Independent document');
    const savingDocument=page.waitForEvent('download');await documentEditor.press('Control+s');const documentFile=await savingDocument,documentPackage=nativeContainer({op:'decode',parts:[await readFile((await documentFile.path())!)]});expect(documentPackage.project.format).toBe('gsnv-document');
    await documentEditor.press('Control+z');await expect(documentEditor).not.toContainText('Independent document');await documentEditor.press('Control+y');await expect(documentEditor).toContainText('Independent document');
    await page.getByRole('tab',{name:'Slides',exact:true}).click();await expect(scene(page)).toContainText('Quarterly update');expect(await history(page)).toEqual(slideHistory);await expect(scene(page).locator('[data-element-id]')).toHaveCount(5);
    await property(page,'Slide name').press('Control+z');await expect(scene(page).locator('[data-element-id]')).toHaveCount(4);await page.getByRole('tab',{name:'Document',exact:true}).click();await expect(documentEditor).toContainText('Independent document');
    expect(errors).toEqual([]);expect(external).toEqual([]);
  }finally{await server.close();}
});

test('SLIDES-APP rejected images, cancelled drags and invalid pending properties preserve editable state',async({page,context})=>{
  const server=await serve();
  await context.addInitScript(()=>{Object.defineProperty(window,'showOpenFilePicker',{value:undefined});Object.defineProperty(window,'showSaveFilePicker',{value:undefined});});
  try{
    await page.goto(server.resolvedUrls!.local[0]!);await page.getByRole('tab',{name:'Slides',exact:true}).click();await page.getByRole('button',{name:'New blank presentation'}).click();await tool(page,'rectangle').click();const before=await history(page);
    const choosing=page.waitForEvent('filechooser');await tool(page,'image').click();await(await choosing).setFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken image')});await expect(page.locator('.slides-workspace [role="alert"]')).toContainText('Could not read');expect(await history(page)).toEqual(before);await expect(scene(page).locator('img')).toHaveCount(0);
    const element=scene(page).locator('[data-element-kind="rectangle"]'),box=(await element.boundingBox())!;await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+70,box.y+50);await page.keyboard.press('Escape');await page.mouse.up();expect(await history(page)).toEqual(before);await expect(property(page,'X')).toHaveValue('60');
    await property(page,'Width').fill('0');await property(page,'Width').press('Control+s');await expect(page.locator('.slides-workspace [role="alert"]')).toContainText('finite number');expect(await history(page)).toEqual(before);
    await property(page,'Width').press('Control+s');expect(await history(page)).toEqual(before);await property(page,'Width').fill('180');await property(page,'Width').press('Tab');await expect(element).toHaveCSS('width','180px');
    await expect(page.locator('.slides-workspace [role="alert"]')).toBeHidden();
  }finally{await server.close();}
});
