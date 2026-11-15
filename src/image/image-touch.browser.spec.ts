import {test,expect,webkit,type Page,type CDPSession} from '@playwright/test';
import {preview,type PreviewServer} from 'vite';
let server:PreviewServer;
const errors=new Map<Page,string[]>();
test.afterEach(()=>{const reported=[...errors.values()].flat();errors.clear();expect(reported).toEqual([]);});
test.beforeAll(async({browser})=>{server=await preview({preview:{host:'127.0.0.1',port:4211,strictPort:true}});console.log(`Touch regression: Chrome ${browser.version()}, ${process.platform}/${process.arch}`);});
test.afterAll(async()=>server.close());
const pixels=(page:Page)=>page.locator('.image-canvas').evaluate(async(c:HTMLCanvasElement)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d')!.getImageData(0,0,c.width,c.height).data))).join(','));
const history=(page:Page)=>page.locator('[data-panel-history] li').allTextContents();
async function start(page:Page){const messages:string[]=[];errors.set(page,messages);page.on('pageerror',error=>messages.push(error.message));await page.goto(server.resolvedUrls!.local[0]!);await page.locator('.gc-standard [data-command="file.new"]').click();await expect(page.locator('.image-canvas')).toBeVisible();await page.locator('.gc-palette [data-command="image.pencil"]').click();}
async function origin(page:Page){const c=(await page.locator('.image-canvas').boundingBox())!;return{x:c.x+c.width*.4,y:c.y+c.height*.3};}
async function loop(session:CDPSession,o:{x:number;y:number},palm=false){
 const point=(i:number)=>({x:o.x+24*Math.cos(i*Math.PI/8),y:o.y+24*Math.sin(i*Math.PI/8),id:1});
 const extra={x:o.x+80,y:o.y+50,id:2};
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(0)]});
 for(let i=1;i<=16;i++){
  if(palm&&i===4)await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(i-1),extra]});
  if(palm&&i===12)await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[extra]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:palm&&i>=4&&i<12?[point(i),extra]:[point(i)]});
 }
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
test('TOUCH-02 finger loops survive a second contact with identical pixels and one history entry',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true}),page=await context.newPage();await start(page);
 const blank=await pixels(page),before=await history(page),o=await origin(page),session=await context.newCDPSession(page);
 await loop(session,o);const expected=await pixels(page);expect(expected).not.toBe(blank);expect((await history(page)).length).toBe(before.length+1);
 await page.locator('.gc-standard [data-command="edit.undo"]').click();expect(await pixels(page)).toBe(blank);
 await loop(session,o,true);expect(await pixels(page)).toBe(expected);expect((await history(page)).length).toBe(before.length+1);
 expect(await page.evaluate(()=>getSelection()?.toString())).toBe('');
 await page.locator('.gc-standard [data-command="edit.undo"]').click();expect(await pixels(page)).toBe(blank);await loop(session,o);expect(await pixels(page)).toBe(expected);
 await page.screenshot({path:'dev/evidence/PAINT-touch-tablet.png'});await context.close();
});
for(const interruption of ['pointercancel','lostpointercapture','blur','focus','Escape'] as const)test(`TOUCH-03 ${interruption} preserves freehand only for interruptions, then undo/redo works`,async({page})=>{
 await start(page);const blank=await pixels(page),before=await history(page),o=await origin(page);
 await page.evaluate(()=>document.querySelector('.gc-viewport')!.addEventListener('pointerdown',e=>document.documentElement.dataset.activePointer=String((e as PointerEvent).pointerId)));
 await page.mouse.move(o.x,o.y);await page.mouse.down();await page.mouse.move(o.x+40,o.y+35,{steps:12});const drawn=await pixels(page);expect(drawn).not.toBe(blank);
 if(interruption==='Escape')await page.keyboard.press('Escape');
 else if(interruption==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 else if(interruption==='focus')await page.locator('.gc-standard [data-command="file.saveOptions"]').focus();
 else await page.locator('.gc-viewport').evaluate((root,type)=>root.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:Number(document.documentElement.dataset.activePointer)})),interruption);
 await page.mouse.up();
 expect(await pixels(page)).toBe(interruption==='Escape'?blank:drawn);expect((await history(page)).length).toBe(before.length+(interruption==='Escape'?0:1));
 if(interruption!=='Escape'){
  await page.locator('.gc-standard [data-command="edit.undo"]').click();expect(await pixels(page)).toBe(blank);
  await page.locator('.gc-standard [data-command="edit.redo"]').click();expect(await pixels(page)).toBe(drawn);
 }
 await page.mouse.click(o.x-30,o.y);expect((await history(page)).length).toBe(before.length+(interruption==='Escape'?1:2));
});
test('TOUCH-03 interrupted shape preview still cancels',async({page})=>{
 await start(page);await page.locator('.gc-palette [data-command="image.rectangle"]').click();const blank=await pixels(page),before=await history(page),o=await origin(page);
 await page.mouse.move(o.x,o.y);await page.mouse.down();await page.mouse.move(o.x+40,o.y+35,{steps:8});expect(await pixels(page)).not.toBe(blank);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();expect(await pixels(page)).toBe(blank);expect(await history(page)).toEqual(before);
});
test('MOBILE-01 phone controls fit, panels scroll by touch and canvas loops remain visible',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:700},hasTouch:true,isMobile:true}),page=await context.newPage();await start(page);
 for(const viewport of [{width:390,height:700},{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.getByRole('button',{name:'Fit image',exact:true}).click();
  await page.locator('.gc-menu-trigger').filter({hasText:'Filters'}).click();const menu=(await page.locator('.gc-menu-popup:visible').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);expect(menu.x+menu.width).toBeLessThanOrEqual(viewport.width);await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight)).toBe(true);
  const stage=(await page.locator('.image-stage').boundingBox())!;expect(stage.height).toBeGreaterThan(150);expect(stage.width).toBeGreaterThan(230);
  for(const selector of ['.navigator-controls','.navigator-values','.gc-statusbar']){
   const b=(await page.locator(selector).boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(viewport.width);expect(b.y+b.height).toBeLessThanOrEqual(viewport.height);
  }
 }
 await page.setViewportSize({width:390,height:700});
 for(const tool of ['pencil','brush','eraser'])expect(await page.locator(`.gc-palette [data-command="image.${tool}"]`).evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
 await page.getByRole('button',{name:'Fit image',exact:true}).tap();
 await expect(page.locator('.image-navigator details')).not.toHaveAttribute('open','');
 const session=await context.newCDPSession(page),blank=await pixels(page);await loop(session,await origin(page));expect(await pixels(page)).not.toBe(blank);
 await page.getByRole('button',{name:'Zoom in',exact:true}).tap();await page.getByRole('button',{name:'Zoom out',exact:true}).tap();
 await page.locator('.image-navigator summary').tap();await expect(page.getByRole('button',{name:'Pan canvas preview'})).toBeVisible();await page.locator('.image-navigator summary').tap();
 const panels=page.locator('.gc-panels'),box=(await panels.boundingBox())!,x=box.x+box.width-35,y=box.y+30;
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*25,y}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>panels.evaluate(e=>e.scrollLeft)).toBeGreaterThan(60);
 await page.screenshot({path:'dev/evidence/PAINT-touch-phone.png'});await context.close();
});
test('TOUCH-01 drawing/chrome reject selection while text fields and Document remain editable (Chromium and WebKit)',async({browser})=>{
 const webkitBrowser=await webkit.launch({channel:''});console.log(`Selection smoke: Linux WebKit ${webkitBrowser.version()} (not physical iOS)`);
 try{for(const engine of [browser,webkitBrowser]){
  const context=await engine.newContext({viewport:{width:1024,height:768},hasTouch:true}),page=await context.newPage();await start(page);
  for(const selector of ['.image-stage','.gc-standard','.gc-palette','.image-tool-hint'])expect(await page.locator(selector).evaluate(e=>getComputedStyle(e).webkitUserSelect||getComputedStyle(e).userSelect)).toBe('none');
  expect(await page.locator('.gc-window').evaluate(e=>getComputedStyle(e).touchAction)).toBe('auto');
  const blank=await pixels(page),before=await history(page),at=await origin(page);await page.mouse.move(at.x,at.y);await page.mouse.down();
  for(let i=1;i<=16;i++)await page.mouse.move(at.x+20*Math.sin(i*Math.PI/8),at.y+20*(1-Math.cos(i*Math.PI/8)));
  const drawn=await pixels(page);expect(drawn).not.toBe(blank);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
  expect(await pixels(page)).toBe(drawn);expect((await history(page)).length).toBe(before.length+1);
  await page.locator('.gc-standard [data-command="edit.undo"]').click();expect(await pixels(page)).toBe(blank);

  await page.locator('.gc-palette [data-command="image.text"]').click();const o=await origin(page);await page.touchscreen.tap(o.x,o.y);
  const text=page.getByRole('textbox',{name:'Text (Enter for a new line)',exact:true});await expect(text).toBeVisible();expect(await text.evaluate(e=>getComputedStyle(e).webkitUserSelect||getComputedStyle(e).userSelect)).toBe('text');
  await text.fill('First line');await text.press('Enter');await text.pressSequentially('Second line');await expect(text).toHaveValue('First line\nSecond line');await text.press('Control+a');expect(await text.evaluate((e:HTMLTextAreaElement)=>e.selectionEnd-e.selectionStart)).toBe(22);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('tab',{name:'Document',exact:true}).click();await page.locator('.gc-standard [data-command="file.new"]').click();
  const editor=page.locator('[contenteditable=true]').first();await editor.fill('Editable document');expect(await editor.evaluate(e=>getComputedStyle(e).webkitUserSelect||getComputedStyle(e).userSelect)).toBe('text');
  await context.close();
 }}finally{await webkitBrowser.close();}
});

test('TOUCH-02 emulated pen keeps its stroke when a finger moves and lifts beside it',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true}),page=await context.newPage();await start(page);
 const blank=await pixels(page),before=await history(page),o=await origin(page),session=await context.newCDPSession(page),palm={x:o.x+95,y:o.y+70,id:2};
 await session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:o.x,y:o.y,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:.7});
 for(let i=1;i<=16;i++){
  if(i===4)await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[palm]});
  if(i>=4&&i<12)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...palm,x:palm.x+i}]});
  if(i===12)await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:o.x+24*Math.sin(i*Math.PI/8),y:o.y+24*(1-Math.cos(i*Math.PI/8)),button:'none',buttons:1,pointerType:'pen',force:.7});
 }
 await session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:o.x,y:o.y,button:'left',buttons:0,clickCount:1,pointerType:'pen'});
 expect(await pixels(page)).not.toBe(blank);expect((await history(page)).length).toBe(before.length+1);expect(await page.evaluate(()=>getSelection()?.toString())).toBe('');
 await page.locator('.gc-standard [data-command="edit.undo"]').click();expect(await pixels(page)).toBe(blank);await context.close();
});
