import {test,expect,type Page} from '@playwright/test';
import {preview,type PreviewServer} from 'vite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {nativeContainer} from '../shared/native-container.ts';
let server:PreviewServer;
test.beforeAll(async({browser})=>{server=await preview({preview:{host:'127.0.0.1',port:4201,strictPort:true}});console.log(`Save/export Chrome ${browser.version()} ${process.platform}/${process.arch}, 1280×720`);});
test.afterAll(async()=>{await server.close();});
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined});Object.defineProperty(window,'showOpenFilePicker',{value:undefined});});
 await page.goto(server.resolvedUrls!.local[0]!);
});
const toolbar=(page:Page,id:string)=>page.locator(`.gc-standard [data-command="${id}"]`);
async function fileSave(page:Page){await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.locator('.gc-menubar [data-submenu-trigger="file.saveOptions"]').click();}
async function downloaded(page:Page,action:()=>Promise<unknown>){const [file]=await Promise.all([page.waitForEvent('download'),action()]);return{name:file.suggestedFilename(),bytes:await readFile((await file.path())!)};}
test('Save discovery: Image first, clear popup, real PNG/project output, reopen and keyboard submenu',async({page})=>{
 const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(page.url()).origin)external.push(r.url());});
 await expect(page.getByRole('tab').first()).toHaveAttribute('aria-label','Image');await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
 await expect(toolbar(page,'file.export')).toBeDisabled();await toolbar(page,'file.new').click();await expect(page.locator('.image-canvas')).toBeVisible();
 await page.locator('.gc-palette [data-command="image.pencil"]').click();await page.locator('input[type=number][data-option="size"]').fill('3');await page.keyboard.press('Enter');
 const canvas=page.locator('.image-canvas'),box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+80,box.y+80);await page.mouse.down();await page.mouse.move(box.x+220,box.y+160,{steps:10});await page.mouse.up();
 const pixels=await canvas.evaluate(async(c:HTMLCanvasElement)=>{const bytes=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;return{hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''),painted:bytes.some((v,i)=>i%4===0&&v===0)};});expect(pixels.painted).toBe(true);
 await expect(toolbar(page,'file.export')).toBeInViewport();await expect(page.locator('[data-window-title]')).toContainText('*');
 const palette=await page.locator('.gc-palette [data-icon^="paint"]').evaluateAll(nodes=>nodes.map(n=>({icon:n.getAttribute('data-icon'),size:n.getBoundingClientRect().width,target:n.closest('button')!.getBoundingClientRect().width})));
 expect(palette).toHaveLength(19);expect(palette.every(p=>p.size===24&&p.target===32)).toBe(true);
 await page.screenshot({path:'dev/evidence/SAVE-EXPORT-image.png'});
 await toolbar(page,'file.saveOptions').click();const dialog=page.getByRole('dialog',{name:'Save your work',exact:true});
 await expect(dialog).toContainText('keep editing later');await expect(dialog.locator('option')).toHaveText(['Save project file','Save PNG image']);await expect(dialog.getByLabel('File type')).toHaveValue('file.save');
 await page.screenshot({path:'dev/evidence/SAVE-EXPORT-popup.png'});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(toolbar(page,'file.saveOptions')).toBeFocused();
 const png=await downloaded(page,async()=>{await toolbar(page,'file.saveOptions').click();await dialog.getByLabel('File type').selectOption('image.exportPNG');await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
 expect(png.name).toMatch(/\.png$/);expect([...png.bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
 const exported=await page.evaluate(async bytes=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'})),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d')!.getImageData(0,0,c.width,c.height).data))].map(v=>v.toString(16).padStart(2,'0')).join('');},[...png.bytes]);expect(exported).toBe(pixels.hash);
 await expect(page.locator('[data-window-title]')).toContainText('*');await fileSave(page);await expect(page.locator('.gc-submenu')).toBeVisible();await page.screenshot({path:'dev/evidence/SAVE-EXPORT-menu.png'});
 const project=await downloaded(page,()=>page.locator('.gc-submenu [data-command="file.save"]').click());const pack=nativeContainer({op:'decode',parts:[project.bytes]});expect(pack.project.format).toBe('gsnv-image');expect(createHash('sha256').update(pack.assets[0]!.bytes).digest('hex')).toBe(pixels.hash);await expect(page.locator('[data-window-title]')).not.toContainText('*');
 const choosing=page.waitForEvent('filechooser');await toolbar(page,'file.open').click();await(await choosing).setFiles({name:project.name,mimeType:'application/octet-stream',buffer:project.bytes});await expect(page.locator('.image-layer')).toHaveCount(1);
 expect(await canvas.evaluate(async(c:HTMLCanvasElement)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d')!.getImageData(0,0,c.width,c.height).data))].map(v=>v.toString(16).padStart(2,'0')).join(''))).toBe(pixels.hash);
 await page.locator('.gc-viewport').focus();await page.keyboard.press('F10');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
 await expect(page.locator('.gc-menubar [data-submenu-trigger="file.saveOptions"]')).toBeFocused();await page.keyboard.press('ArrowRight');await expect(page.locator('.gc-submenu [data-command="file.save"]')).toBeFocused();await page.keyboard.press('End');await expect(page.locator('.gc-submenu [data-command="image.exportPNG"]')).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.locator('.gc-menubar [data-submenu-trigger="file.saveOptions"]')).toBeFocused();await page.keyboard.press('Escape');
 const direct=await downloaded(page,()=>page.keyboard.press('Control+s'));expect(direct.bytes.equals(project.bytes)).toBe(true);await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight)).toBe(true);expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('Save discovery: Document and Slides PDF choices reach their real printable output',async({page,browser})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Observe the document sent to print; the operating system print chooser is not automated.
 await page.evaluate(()=>{(window as unknown as {savePrints:string[]}).savePrints=[];new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n instanceof HTMLIFrameElement&&/^(doc|slides)-print$/.test(n.className))(window as unknown as {savePrints:string[]}).savePrints.push(n.srcdoc);}).observe(document,{childList:true,subtree:true});});
 for(const workspace of ['Document','Slides']){
  await page.getByRole('tab',{name:workspace,exact:true}).click();await page.getByRole('button',{name:workspace==='Document'?'New blank document':'New blank presentation',exact:true}).click();
  if(workspace==='Document'){await page.locator('.doc-page').click();await page.keyboard.insertText('Saved through the File menu');await fileSave(page);await page.locator('.gc-submenu [data-command="doc.pdf"]').click();}
  else{await toolbar(page,'file.saveOptions').click();const dialog=page.getByRole('dialog');await expect(dialog.locator('option')).toHaveText(['Save project file','Save PDF']);await dialog.getByLabel('File type').selectOption('slides.pdf');await dialog.getByRole('button',{name:'Continue',exact:true}).click();}
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {savePrints:string[]}).savePrints.length)).toBe(workspace==='Document'?1:2);
  const html=await page.evaluate(()=>(window as unknown as {savePrints:string[]}).savePrints.at(-1)!);if(workspace==='Document')expect(html).toContain('Saved through the File menu');
  const printer=await browser.newPage();try{await printer.setContent(html);const pdf=await printer.pdf({preferCSSPageSize:true,printBackground:true});expect(pdf.subarray(0,5).toString()).toBe('%PDF-');expect(pdf.length).toBeGreaterThan(500);}finally{await printer.close();}
  const frame=page.locator(`iframe.${workspace==='Document'?'doc':'slides'}-print`);if(await frame.count())await frame.evaluate(e=>(e as HTMLIFrameElement).contentWindow!.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('[data-window-title]')).toContainText('*');
 }
 expect(errors).toEqual([]);
});
