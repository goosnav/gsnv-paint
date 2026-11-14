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
async function start(page:Page){await page.goto(server.resolvedUrls!.local[0]!);await page.locator('.gc-standard [data-command="file.new"]').click();await expect(page.locator('.image-canvas')).toBeVisible();}
async function percent(page:Page,value:string){await page.getByRole('spinbutton',{name:'Zoom percent',exact:true}).fill(value);await page.getByRole('spinbutton',{name:'Zoom percent',exact:true}).press('Enter');}
async function drag(page:Page,from:{x:number;y:number},to:{x:number;y:number}){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();}
async function select(page:Page){await page.locator('.gc-palette [data-command="image.select"]').click();const b=(await page.locator('.image-canvas').boundingBox())!;await drag(page,{x:b.x+100,y:b.y+110},{x:b.x+200,y:b.y+170});await expect(page.locator('[data-transform-handle=se]')).toBeVisible();}
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
