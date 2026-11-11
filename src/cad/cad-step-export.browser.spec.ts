import {test,expect} from '@playwright/test';
import {preview} from 'vite';
import {readFile} from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import {stepExchange} from './step-exchange.ts';
import type {KernelSession} from './kernel-runtime.ts';

test('STEP-APP production downloads the actual solid and rebuilt dimensions without changing project history',async({page,context})=>{
 test.setTimeout(90000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}}),errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4175')&&!r.url().startsWith('blob:'))external.push(r.url());});
 await context.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined}));
 const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),print:()=>{}});
 const shapes=new Map<number,ReturnType<KernelSession['resolve']>>();let sequence=0;
 const session:KernelSession={library,generation:1,isClosed:()=>false,retain(shape){const id=++sequence;shapes.set(id,shape);return{id,generation:1};},resolve(token){return shapes.get(token.id)!;},release(token){shapes.get(token.id)!.delete();shapes.delete(token.id);}};
 const volume=(bytes:Uint8Array)=>{
  const imported=stepExchange({action:'import',session,bytes,units:'mm'}).bodies!;expect(imported.shapes).toHaveLength(1);
  const props=new library.GProp_GProps();library.BRepGProp.VolumeProperties(session.resolve(imported.shapes[0]!.token),props,true,false,false);const value=props.Mass();props.delete();imported.shapes.forEach(b=>session.release(b.token));return value;
 };
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();await page.keyboard.press('Control+n');
  await page.locator('button[data-command="cad.rectangle"]:visible').first().click();await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();
  await page.keyboard.press('e');await expect(page.locator('.cad-properties')).toContainText('60000.000 mm³',{timeout:30000});await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();
  for(const [width,expected]of [[100,60000],[120,72000]]){
   if(width===120){await page.getByRole('button',{name:'Width: 100',exact:true}).click();await page.getByRole('dialog').getByLabel('Length (mm or expression)').fill('120');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();}
   await expect(page.locator('.cad-properties')).toContainText(`${expected}.000 mm³`,{timeout:30000});const history=await page.locator('[data-panel-history]').innerText();
   const downloading=page.waitForEvent('download');await page.locator('button[data-command="cad.exportSTEP"]:visible').first().click();const download=await downloading;
   expect(download.suggestedFilename()).toBe('Untitled part.step');const bytes=await readFile((await download.path())!);const text=new TextDecoder().decode(bytes);
   expect(text.startsWith('ISO-10303-21;')).toBe(true);expect(text.trim().endsWith('END-ISO-10303-21;')).toBe(true);expect(text).toContain('MANIFOLD_SOLID_BREP');expect(text).toContain('SI_UNIT(.MILLI.,.METRE.)');
   expect(Math.abs(volume(bytes)-expected!)).toBeLessThan(1e-6);expect(await page.locator('[data-panel-history]').innerText()).toBe(history);
   await expect(page.locator('.cad-tool-hint')).toContainText('STEP download handed to browser');await expect(page.locator('[data-window-title]')).toContainText('*');
  }
  expect(shapes.size).toBe(0);expect(errors).toEqual([]);expect(external).toEqual([]);expect(await page.evaluate(()=>crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight)).toBe(true);await page.screenshot({path:'dev/evidence/STEP-APP-production.png'});
  console.log(`STEP-APP Chrome ${context.browser()!.version()} ${process.platform}/${process.arch}: real worker downloads re-import as 60000/72000 mm3; history unchanged; no external requests.`);
 }finally{await page.close();await server.close();for(const shape of shapes.values())shape.delete();}
});

test('STEP-APP cancels real workers on Esc/source changes and reports invalid solids without a download',async({page,context})=>{
 test.setTimeout(60000);const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}}),downloads:string[]=[];
 let hold=true;const releases:(()=>void)[]=[];
 type Spy={started:number;terminated:number};
 await context.addInitScript(()=>{
  Object.defineProperty(window,'showSaveFilePicker',{value:undefined});
  const spy={started:0,terminated:0};Object.assign(window,{__stepWorkers:spy});const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{
   isStep:boolean;
   constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.isStep=String(url).includes('cad-step-export.worker');if(this.isStep)spy.started++;}
   override terminate(){if(this.isStep)spy.terminated++;super.terminate();}
  };
 });
 await page.route('**/cad-step-export.worker*.js',async route=>{if(hold)await new Promise<void>(resolve=>releases.push(resolve));try{await route.continue();}catch{/* A terminated worker cancels its pending module request. */}});
 page.on('download',d=>downloads.push(d.suggestedFilename()));
 const count=()=>page.evaluate(()=>(window as unknown as {__stepWorkers:Spy}).__stepWorkers);
 const start=async(n:number)=>{await page.locator('button[data-command="cad.exportSTEP"]:visible').first().click();await expect.poll(async()=>(await count()).started).toBe(n);};
 try{
  await page.goto(server.resolvedUrls!.local[0]!);await expect(page.locator('button[data-command="file.new"]:visible').first()).toBeEnabled();await page.keyboard.press('Control+n');
  await page.locator('button[data-command="cad.rectangle"]:visible').first().click();await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();await page.keyboard.press('e');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();
  await expect(page.locator('.cad-properties')).toContainText('60000.000 mm³',{timeout:30000});
  await start(1);await page.keyboard.press('Escape');await expect.poll(async()=>(await count()).terminated).toBe(1);await expect(page.locator('.cad-tool-hint')).toContainText('canceled');releases.splice(0).forEach(resolve=>resolve());
  await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','ready',{timeout:30000});expect(downloads).toEqual([]);
  await start(2);await page.getByRole('button',{name:'Width: 100',exact:true}).click();await page.getByRole('dialog').getByLabel('Length (mm or expression)').fill('120');await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();
  await expect.poll(async()=>(await count()).terminated).toBe(2);releases.splice(0).forEach(resolve=>resolve());hold=false;await expect(page.locator('.cad-properties')).toContainText('72000.000 mm³',{timeout:30000});expect(downloads).toEqual([]);
  await page.getByRole('button',{name:'Sketch 1',exact:true}).click();await page.keyboard.press('Control+a');await page.keyboard.press('Delete');await expect(page.locator('.cad-build-status')).toHaveAttribute('data-state','error',{timeout:30000});
  await start(3);await expect(page.locator('.cad-tool-hint')).toHaveAttribute('data-export-state','error',{timeout:30000});await expect(page.locator('.cad-tool-hint')).toContainText('closed profile');await expect.poll(async()=>(await count()).terminated).toBe(3);expect(downloads).toEqual([]);
  await page.keyboard.press('Control+z');await expect(page.locator('.cad-properties')).toContainText('72000.000 mm³',{timeout:30000});
 }finally{hold=false;releases.splice(0).forEach(resolve=>resolve());await page.close();await server.close();}
});
