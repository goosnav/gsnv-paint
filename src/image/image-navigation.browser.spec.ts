import {test,expect,type Page} from '@playwright/test';
import {preview,type PreviewServer} from 'vite';
import {readFile} from 'node:fs/promises';
import {nativeContainer} from '../shared/native-container.ts';
import {imageContent} from './image-content.ts';
let server:PreviewServer;
test.beforeAll(async({browser})=>{server=await preview({preview:{host:'127.0.0.1',port:4204,strictPort:true}});console.log(`Paint navigation/transform: Chrome ${browser.version()} ${process.platform}/${process.arch}`);});
test.afterAll(async()=>{await server.close();});
const history=(page:Page)=>page.locator('[data-panel-history] li').allTextContents();
const pixels=(page:Page)=>page.locator('.image-canvas').evaluate(async(c:HTMLCanvasElement)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d')!.getImageData(0,0,c.width,c.height).data))).join(','));
async function start(page:Page){await page.goto(server.resolvedUrls!.local[0]!);await page.locator('.gc-standard [data-command="file.new"]').click(); await page.getByRole('dialog',{name:'New image',exact:true}).getByLabel('Preset',{exact:true}).selectOption('small-canvas'); await page.getByRole('dialog',{name:'New image',exact:true}).getByRole('button',{name:'Create',exact:true}).click();await expect(page.locator('.image-canvas')).toBeVisible();}
async function percent(page:Page,value:string){await page.getByRole('spinbutton',{name:'Zoom percent',exact:true}).fill(value);await page.getByRole('spinbutton',{name:'Zoom percent',exact:true}).press('Enter');}
async function drag(page:Page,from:{x:number;y:number},to:{x:number;y:number}){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();}
async function select(page:Page){await page.locator('.gc-palette [data-command="image.select"]').click();const b=(await page.locator('.image-canvas').boundingBox())!;await drag(page,{x:b.x+100,y:b.y+110},{x:b.x+200,y:b.y+170});await expect(page.locator('[data-transform-handle=se]')).toBeVisible();}
test('Expanded colours share XP controls and the next stroke uses the exact chosen RGB',async({page})=>{
 await start(page);const before=await history(page),palette=page.locator('.image-palette'),more=palette.locator('.image-more-colours');
 await expect(more).not.toHaveAttribute('open','');await more.locator('summary').click();
 const red=palette.getByRole('slider',{name:'Red',exact:true}),green=palette.getByRole('spinbutton',{name:'Green value',exact:true}),blue=palette.getByRole('spinbutton',{name:'Blue value',exact:true}),hex=palette.getByRole('textbox',{name:'Hex colour',exact:true});
 await red.fill('36');await green.fill('125');await green.press('Enter');await blue.fill('198');await blue.press('Tab');await expect(hex).toHaveValue('#247dc6');
 await expect(palette.locator('.image-primary')).toHaveValue('#247dc6');
 for(const selector of ['.navigator-controls input[type=range]','.image-more-colours input[type=range]'])expect(await page.locator(selector).first().evaluate(e=>getComputedStyle(e).appearance)).toBe('none');
 const layer=page.locator('.image-layers input[type=range]');
 expect(await red.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(await layer.evaluate(e=>getComputedStyle(e).backgroundColor));
 await hex.fill('oops');await hex.press('Enter');await expect(hex).toHaveAttribute('aria-invalid','true');await hex.press('Escape');await expect(hex).toHaveValue('#247dc6');
 await palette.getByLabel('Colour to edit').selectOption('secondary');await hex.fill('#f0e0d0');await hex.press('Enter');await expect(palette.locator('.image-secondary')).toHaveValue('#f0e0d0');
 await palette.locator('.image-swap').click();await expect(palette.locator('.image-primary')).toHaveValue('#f0e0d0');await expect(hex).toHaveValue('#247dc6');await palette.locator('.image-swap').click();
 await palette.getByLabel('Colour to edit').selectOption('primary');await expect(hex).toHaveValue('#247dc6');expect(await history(page)).toEqual(before);
 await page.locator('.gc-palette [data-command="image.pencil"]').click();const canvas=(await page.locator('.image-canvas').boundingBox())!;
 await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
 expect(await page.locator('.image-canvas').evaluate((c:HTMLCanvasElement)=>Array.from(c.getContext('2d')!.getImageData(c.width/2,c.height/2,1,1).data))).toEqual([36,125,198,255]);
 expect((await history(page)).length).toBe(before.length+1);
 await page.screenshot({path:'dev/evidence/IMAGE-consistent-controls.png'});
 await more.locator('summary').click();await expect(hex).toBeHidden();await expect(page.locator('.image-swatches')).toBeVisible();
});
test('Paint has an arrow cursor and compact wheel-independent navigator with view-only controls',async({page})=>{
 await start(page);expect(await page.locator('.image-stage').evaluate(e=>getComputedStyle(e).cursor===getComputedStyle(document.body).cursor)).toBe(true);
 const before=await history(page),data=await pixels(page);await percent(page,'100');await expect(page.getByRole('slider',{name:'Canvas zoom'})).toHaveAttribute('aria-valuetext','100 percent');
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Zoom percent',exact:true})).toHaveValue('125');
 await page.getByRole('button',{name:'Zoom out',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Zoom percent',exact:true})).toHaveValue('100');
 await percent(page,'200');const preview=page.getByRole('button',{name:'Pan canvas preview'}),box=(await preview.boundingBox())!;
 await drag(page,{x:box.x+box.width/2,y:box.y+box.height/2},{x:box.x+box.width*.75,y:box.y+box.height*.7});
 const transformed=await page.locator('.image-canvas').boundingBox(),viewport=(await page.locator('.image-stage').boundingBox())!;expect(transformed!.x).toBeLessThan(viewport.x-400);
 await page.locator('.image-stage').focus();await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);await page.mouse.wheel(0,-100);await expect.poll(async()=>Number(await page.getByRole('spinbutton',{name:'Zoom percent',exact:true}).inputValue())).toBeGreaterThan(200);
 await page.getByRole('slider',{name:'Canvas zoom'}).fill('500');await expect(page.getByRole('slider',{name:'Canvas zoom'})).toHaveAttribute('aria-valuetext','80 percent');
 await page.getByRole('button',{name:'Fit image',exact:true}).click();await page.locator('.image-navigator summary').click();await expect(preview).toBeHidden();await expect(page.getByRole('button',{name:'Zoom in',exact:true})).toBeVisible();
 expect(await pixels(page)).toEqual(data);expect(await history(page)).toEqual(before);
 expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight)).toBe(true);
});
test('Selection handles resize visually, cancel restores pixels and apply supports one-step undo/redo',async({page})=>{
 await start(page);await percent(page,'100');await page.locator('.gc-palette [data-command="image.rectangle"]').click();const canvas=(await page.locator('.image-canvas').boundingBox())!;
 await drag(page,{x:canvas.x+110,y:canvas.y+120},{x:canvas.x+180,y:canvas.y+160});await select(page);const original=await pixels(page),before=await history(page);
 const handle=page.locator('[data-transform-handle=se]'),h=(await handle.boundingBox())!;await drag(page,{x:h.x+h.width/2,y:h.y+h.height/2},{x:h.x+h.width/2+100,y:h.y+h.height/2+60});
 await expect(page.getByRole('spinbutton',{name:'Transform width',exact:true})).toHaveValue('201');await expect(page.getByRole('spinbutton',{name:'Transform height',exact:true})).toHaveValue('121');expect(await history(page)).toEqual(before);
 await page.screenshot({path:'dev/evidence/IMAGE-free-transform.png'});await page.keyboard.press('Escape');expect(await pixels(page)).toEqual(original);expect(await history(page)).toEqual(before);
 await page.locator('.gc-standard [data-command="image.transform"]').click();await page.getByRole('spinbutton',{name:'Transform width',exact:true}).fill('200');await page.getByRole('spinbutton',{name:'Transform height',exact:true}).fill('120');await page.getByRole('button',{name:'Apply transform',exact:true}).click();
 const applied=await pixels(page);expect(applied).not.toEqual(original);expect((await history(page)).length).toBe(before.length+1);
 await page.locator('.image-stage').focus();await page.keyboard.press('Control+z');expect(await pixels(page)).toEqual(original);await page.keyboard.press('Control+y');expect(await pixels(page)).toEqual(applied);
 await page.screenshot({path:'dev/evidence/IMAGE-navigator-transform.png'});
});
test('Ctrl+T exposes on-canvas rotation and moving with synchronized zoom',async({page})=>{
 await start(page);await percent(page,'100');await select(page);await page.locator('.image-stage').focus();await page.keyboard.press('Control+t');await expect(page.getByRole('form',{name:'Free transform'})).toBeVisible();
 await page.getByRole('spinbutton',{name:'Transform angle',exact:true}).fill('90');await page.getByRole('spinbutton',{name:'Transform width',exact:true}).focus();await expect(page.locator('.image-transform-box')).toHaveCSS('transform',/matrix\(0, 1, -1, 0,/);
 await percent(page,'125');const move=page.locator('[data-transform-handle=move]'),box=(await move.boundingBox())!;
 const x=Number(await page.getByRole('spinbutton',{name:'Transform x',exact:true}).inputValue());await drag(page,{x:box.x+box.width/2,y:box.y+box.height/2},{x:box.x+box.width/2+25,y:box.y+box.height/2});await expect(page.getByRole('spinbutton',{name:'Transform x',exact:true})).toHaveValue(String(x+20));
 await page.getByRole('button',{name:'Cancel transform',exact:true}).click();await expect(page.getByRole('form',{name:'Free transform'})).toBeHidden();
});
test('Touch pointer dragging pans the mini map and resizes without painting',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:720},hasTouch:true}),page=await context.newPage();await start(page);await percent(page,'100');await select(page);const before=await history(page);
 async function touch(locator:ReturnType<Page['locator']>,dx:number,dy:number){const b=(await locator.boundingBox())!,x=b.x+b.width/2,y=b.y+b.height/2;const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
 await touch(page.locator('[data-transform-handle=se]'),30,20);await expect(page.getByRole('spinbutton',{name:'Transform width',exact:true})).toHaveValue('131');expect(await history(page)).toEqual(before);
 await page.getByRole('button',{name:'Cancel transform',exact:true}).click();await percent(page,'200');await touch(page.locator('.navigator-map'),20,10);expect(await history(page)).toEqual(before);await context.close();
});

test('Save captures the visible graphical transform and a still-focused typed size',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined}));await start(page);await percent(page,'100');
 await page.locator('.gc-palette [data-command="image.rectangle"]').click();const c=(await page.locator('.image-canvas').boundingBox())!;await drag(page,{x:c.x+110,y:c.y+120},{x:c.x+180,y:c.y+160});await select(page);
 const h=(await page.locator('[data-transform-handle=se]').boundingBox())!;await drag(page,{x:h.x+h.width/2,y:h.y+h.height/2},{x:h.x+h.width/2+100,y:h.y+h.height/2+60});
 const before=await history(page),width=page.getByRole('spinbutton',{name:'Transform width',exact:true});await width.fill('202');
 const waiting=page.waitForEvent('download');await page.keyboard.press('Control+s');const file=await waiting,bytes=await readFile((await file.path())!);const pkg=nativeContainer({op:'decode',parts:[bytes]});
 expect(pkg.project.format).toBe('gsnv-image');expect((await history(page)).length).toBe(before.length+1);await expect(page.getByRole('form',{name:'Free transform'})).toBeHidden();
 const layer=pkg.assets[0]!.bytes;expect(Array.from(layer.subarray((160*800+125)*4,(160*800+125)*4+4))).toEqual([0,0,0,255]);expect(Array.from(layer.subarray((160*800+175)*4,(160*800+175)*4+4))).toEqual([255,255,255,255]);
 const content=imageContent({operation:'decode',content:pkg.project.content,assets:pkg.assets});expect(content.selection!.bounds.width).toBe(202);
});

test('Visible Zoom panel opens raw images and works on a tablet-sized touch viewport',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true}),page=await context.newPage();
 await page.addInitScript(()=>Object.defineProperty(window,'showOpenFilePicker',{value:undefined}));
 await page.goto(server.resolvedUrls!.local[0]!);
 const panel=page.locator('.image-navigator'),map=page.getByRole('button',{name:'Pan canvas preview'}),zoomIn=page.getByRole('button',{name:'Zoom in',exact:true}),zoomOut=page.getByRole('button',{name:'Zoom out',exact:true});
 await expect(panel).toBeVisible();await expect(panel.locator('summary')).toHaveText('Zoom');await expect(page.locator('.image-canvas')).toHaveAttribute('width','800');await expect(panel.getByText('Drag map to move view',{exact:true})).toBeVisible();await expect(zoomIn).toBeEnabled();
 async function reachable(){
  for(const control of [map,zoomIn,zoomOut,page.getByRole('slider',{name:'Canvas zoom'}),page.getByRole('spinbutton',{name:'Zoom percent',exact:true}),page.getByRole('button',{name:'Fit image',exact:true})]){
   const b=(await control.boundingBox())!,stage=(await page.locator('.image-stage').boundingBox())!;
   expect(b.x).toBeGreaterThanOrEqual(stage.x);expect(b.y).toBeGreaterThanOrEqual(stage.y);expect(b.x+b.width).toBeLessThanOrEqual(stage.x+stage.width);expect(b.y+b.height).toBeLessThanOrEqual(stage.y+stage.height);
   expect(await control.evaluate(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return hit===e||e.contains(hit);})).toBe(true);
  }
 }
 await reachable();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const ctx=c.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,800,600);ctx.fillStyle='#1248ab';ctx.fillRect(450,300,200,180);return c.toDataURL().split(',')[1]!;});
 const choosing=page.waitForEvent('filechooser');await page.locator('.gc-standard [data-command="file.open"]').click();await(await choosing).setFiles({name:'Zoom-check.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.locator('.image-canvas')).toBeVisible();await expect(panel.getByText('Drag map to move view',{exact:true})).toBeVisible();await expect(zoomIn).toBeEnabled();await reachable();
 const before=await history(page),data=await pixels(page);await percent(page,'200');
 const b=(await map.boundingBox())!,x=b.x+b.width/2,y=b.y+b.height/2,cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+20,y:y+10}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 const center=()=>page.evaluate(()=>{const c=document.querySelector<HTMLCanvasElement>('.image-canvas')!,cb=c.getBoundingClientRect(),v=document.querySelector('.image-stage')!.getBoundingClientRect();return {x:(v.x+v.width/2-cb.x)/(cb.width/c.width),y:(v.y+v.height/2-cb.y)/(cb.height/c.height)};});
 const target=await center();expect(target.x).toBeGreaterThan(500);expect(target.y).toBeGreaterThan(350);
 await zoomIn.tap();await expect(page.getByRole('spinbutton',{name:'Zoom percent',exact:true})).toHaveValue('250');
 const after=await center();expect(Math.abs(after.x-target.x)).toBeLessThan(1);expect(Math.abs(after.y-target.y)).toBeLessThan(1);
 await zoomOut.tap();await expect(page.getByRole('spinbutton',{name:'Zoom percent',exact:true})).toHaveValue('200');
 // Use the native slider with touch, without wheel or keyboard shortcuts.
 const slider=page.getByRole('slider',{name:'Canvas zoom'}),sb=(await slider.boundingBox())!;await page.touchscreen.tap(sb.x+sb.width*.7,sb.y+sb.height/2);await expect.poll(async()=>Number(await page.getByRole('spinbutton',{name:'Zoom percent',exact:true}).inputValue())).not.toBe(200);
 await page.getByRole('button',{name:'Fit image',exact:true}).tap();await panel.locator('summary').tap();await expect(map).toBeHidden();await expect(zoomIn).toBeVisible();await zoomIn.tap();await panel.locator('summary').tap();await reachable();
 expect(await pixels(page)).toEqual(data);expect(await history(page)).toEqual(before);
 await page.getByRole('tab',{name:'Photo',exact:true}).click();await expect(panel).toBeHidden();await page.getByRole('tab',{name:'Image',exact:true}).click();await expect(panel).toBeVisible();await reachable();
 expect(await pixels(page)).toEqual(data);expect(await history(page)).toEqual(before);
 await page.screenshot({path:'dev/evidence/IMAGE-zoom-touch.png'});await context.close();
});
