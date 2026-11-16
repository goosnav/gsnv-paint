import { test, expect, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
let server: PreviewServer;
test.beforeAll(async () => { server = await preview({ preview: { host: '127.0.0.1', port: 4207, strictPort: true } }); });
test.afterAll(async () => { await server.close(); });
test.beforeEach(async ({ page, context }) => {
 await context.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
 await page.goto(server.resolvedUrls!.local[0]!);
});
const canvas = (page: Page) => page.locator('.image-canvas');
const history = (page: Page) => page.locator('[data-panel-history] li').allTextContents();
async function pixels(page: Page) { return canvas(page).evaluate((c: HTMLCanvasElement) => {
 const data=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data, rgb=new Set<number>(), alpha=new Set<number>();
 for(let i=0;i<data.length;i+=4){rgb.add(data[i]!);rgb.add(data[i+1]!);rgb.add(data[i+2]!);alpha.add(data[i+3]!);}
 let mismatches=0;for(let y=0;y<c.height;y+=8)for(let x=0;x<c.width;x+=8){const first=data[(y*c.width+x)*4];for(let dy=0;dy<8&&y+dy<c.height;dy++)for(let dx=0;dx<8&&x+dx<c.width;dx++)if(data[((y+dy)*c.width+x+dx)*4]!==first)mismatches++;}
 return {rgb:[...rgb],alpha:[...alpha],mismatches,png:c.toDataURL()};
 }); }
async function stroke(page: Page) { const b=(await canvas(page).boundingBox())!; await page.mouse.move(b.x+35,b.y+45); await page.mouse.down(); await page.mouse.move(b.x+185,b.y+140,{steps:7}); await page.mouse.up(); }
async function menu(page: Page, label: string, command: string) { await page.getByRole('menuitem',{name:label,exact:true}).click(); await page.getByRole('menuitem',{name:command,exact:true}).click(); }
async function screenshotColors(page: Page) {
 await page.mouse.move(5,5);const b=(await canvas(page).boundingBox())!, png=await page.screenshot({clip:{x:Math.ceil(b.x)+1,y:Math.ceil(b.y)+1,width:Math.floor(b.width)-2,height:Math.floor(b.height)-2}});
 return page.evaluate(async bytes=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'})),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();const data=ctx.getImageData(0,0,c.width,c.height).data;return [...new Set(Array.from({length:c.width*c.height},(_,p)=>data[p*4]!))];},[...png]);
}
test('Paint defaults to binary hard strokes, offers coarse brush pixels and keeps Smooth intentional', async ({page})=>{
 await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByLabel('Preset',{exact:true}).selectOption('small-canvas'); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();
 await expect(page.getByLabel('Edges',{exact:true})).toHaveValue('pixel',{timeout:2000});
 await stroke(page);let out=await pixels(page);expect(new Set(out.rgb)).toEqual(new Set([0,255]));
 await page.locator('.image-stage').focus();await page.keyboard.press('Control+z');
 await page.getByRole('spinbutton',{name:'Pixel size (px)',exact:true}).fill('8');await page.getByRole('spinbutton',{name:'Pixel size (px)',exact:true}).press('Tab');
 await stroke(page);out=await pixels(page);
 expect(out.mismatches).toBe(0);
 const before=out.png;await page.locator('.image-stage').focus();await page.keyboard.press('Control+z');await page.keyboard.press('Control+y');expect((await pixels(page)).png).toBe(before);
 await page.getByLabel('Edges',{exact:true}).selectOption('smooth');await expect(page.getByRole('spinbutton',{name:'Pixel size (px)',exact:true})).toBeHidden();
 await page.getByRole('spinbutton',{name:'Hardness (%)',exact:true}).fill('50');await page.getByRole('spinbutton',{name:'Hardness (%)',exact:true}).press('Tab');
 const b=(await canvas(page).boundingBox())!;await page.mouse.click(b.x+250,b.y+250);out=await pixels(page);expect(out.rgb.some(v=>v>0&&v<255)).toBe(true);
});
test('Sharp canvas rendering stays binary at fractional zoom; Smooth preview is reversible and view-only', async ({page})=>{
 const bytes=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,32,32);ctx.fillStyle='black';for(let y=0;y<32;y++)ctx.fillRect(0,y,y,1);return c.toDataURL().split(',')[1]!;});
 const chooser=page.waitForEvent('filechooser');await page.locator('.gc-standard [data-command="file.open"]').click();await (await chooser).setFiles({name:'pixels.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
 await expect(canvas(page)).toHaveAttribute('width','32');const original=await pixels(page),before=await history(page);
 await menu(page,'View','View settings');await page.getByRole('spinbutton',{name:'Zoom (%)',exact:true}).fill('550');
 const rendering=page.getByLabel('Canvas rendering',{exact:true});await expect(rendering).toHaveValue('pixels',{timeout:2000});await page.getByRole('button',{name:'OK',exact:true}).click();
 expect(new Set(await screenshotColors(page))).toEqual(new Set([0,255]));
 await menu(page,'View','View settings');await rendering.selectOption('smooth');expect(await canvas(page).evaluate(c=>getComputedStyle(c).imageRendering)).toBe('auto');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(new Set(await screenshotColors(page))).toEqual(new Set([0,255]));
 await menu(page,'View','View settings');await rendering.selectOption('smooth');await page.getByRole('button',{name:'OK',exact:true}).click();expect((await screenshotColors(page)).some(v=>v>0&&v<255)).toBe(true);
 expect((await pixels(page)).png).toBe(original.png);expect(await history(page)).toEqual(before);
 await menu(page,'View','View settings');await rendering.selectOption('pixels');await page.getByRole('button',{name:'OK',exact:true}).click();await page.screenshot({path:'dev/evidence/IMAGE-sharp-pixels.png'});
});
test('Hard layer strokes and nearest free transform preserve alpha; saved PNG/project match the committed pixels',async({page})=>{
 await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByLabel('Preset',{exact:true}).selectOption('small-canvas'); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();await page.locator('.gc-standard [data-command="layer.new"]').click();await stroke(page);
 await page.locator('.image-stage').focus();await page.keyboard.press('Control+t');
 await expect(page.getByLabel('Transform sampling',{exact:true})).toHaveValue('nearest',{timeout:2000});
 await page.getByRole('spinbutton',{name:'Transform width',exact:true}).fill('1000');await page.getByRole('button',{name:'Apply transform',exact:true}).click();
 const transformed=await pixels(page);expect(new Set([...transformed.rgb,...transformed.alpha])).toEqual(new Set([0,255]));
 // Hide paper to inspect actual layer alpha through the composite.
 await page.locator('.image-layer').filter({hasText:'Background'}).locator('.image-layer-eye').click();const transparent=await pixels(page);expect(new Set(transparent.alpha)).toEqual(new Set([0,255]));
 const download=page.waitForEvent('download');await menu(page,'Image','Export PNG…');const png=await download;const data=await (await import('node:fs/promises')).readFile((await png.path())!);expect(await page.evaluate(async bytes=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'})), c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();return c.toDataURL();},[...data])).toBe(transparent.png);
 const save=page.waitForEvent('download');await page.locator('.image-stage').focus();await page.keyboard.press('Control+s');const project=await save;const saved=await (await import('node:fs/promises')).readFile((await project.path())!);
 await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByLabel('Preset',{exact:true}).selectOption('small-canvas'); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();const choose=page.waitForEvent('filechooser');await page.locator('.gc-standard [data-command="file.open"]').click();await (await choose).setFiles({name:'hard.gsnv-image',mimeType:'application/octet-stream',buffer:saved});
 await expect(page.locator('.image-layer')).toHaveCount(2);expect((await pixels(page)).png).toBe(transparent.png);
});

test('Hard brush and eraser respect selections with one history entry per stroke', async ({page}) => {
 await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByLabel('Preset',{exact:true}).selectOption('small-canvas'); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();await page.locator('.gc-standard [data-command="layer.new"]').click();
 const b=(await canvas(page).boundingBox())!, at=(x:number,y:number)=>[b.x+x*b.width/800,b.y+y*b.height/600] as const;
 await page.locator('.gc-palette [data-command="image.select"]').click();await page.mouse.move(...at(100.5,100.5));await page.mouse.down();await page.mouse.move(...at(160.5,160.5));await page.mouse.up();
 await page.locator('.gc-palette [data-command="image.brush"]').click();await page.getByRole('spinbutton',{name:'Size (px)',exact:true}).fill('200');await page.getByRole('spinbutton',{name:'Size (px)',exact:true}).press('Tab');
 const before=await history(page);await page.mouse.click(...at(130.5,130.5));expect((await history(page)).length).toBe(before.length+1);
 const painted=await pixels(page);expect(new Set(painted.rgb)).toEqual(new Set([0,255]));
 const bounds=await canvas(page).evaluate((c:HTMLCanvasElement)=>{const d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let left=Infinity,right=-1,top=Infinity,bottom=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4]===0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return {left,right,top,bottom};});
 expect(bounds).toEqual({left:100,right:160,top:100,bottom:160});
 await page.locator('.gc-palette [data-command="image.eraser"]').click();await page.getByRole('spinbutton',{name:'Size (px)',exact:true}).fill('12');await page.getByRole('spinbutton',{name:'Size (px)',exact:true}).press('Tab');await page.mouse.click(...at(130.5,130.5));
 const erased=await pixels(page);expect(new Set(erased.rgb)).toEqual(new Set([0,255]));expect(erased.png).not.toBe(painted.png);
 await page.locator('.image-stage').focus();await page.keyboard.press('Control+z');expect((await pixels(page)).png).toBe(painted.png);await page.keyboard.press('Control+y');expect((await pixels(page)).png).toBe(erased.png);
 await page.locator('.image-layer').filter({hasText:'Background'}).locator('.image-layer-eye').click();expect(new Set((await pixels(page)).alpha)).toEqual(new Set([0,255]));
});
