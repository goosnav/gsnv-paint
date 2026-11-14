import { test, expect, type Page } from '@playwright/test';
import { createServer, preview } from 'vite';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { nativeContainer } from '../shared/native-container.ts';
import { stepExchange } from './step-exchange.ts';
import type { KernelSession } from './kernel-runtime.ts';
const serve=async()=>{if(process.env.STEP_IMPORT_DEV==='1'){const server=await createServer({server:{host:'127.0.0.1',port:4188,strictPort:true}});await server.listen();return server;}return preview({preview:{host:'127.0.0.1',port:4188,strictPort:true}});};
const tool=(page:Page,id:string)=>page.locator(`button[data-command="${id}"]:visible`).first();
const ready=(page:Page)=>expect(page.locator('.cad-imported-properties .cad-build-status')).toHaveAttribute('data-state','ready',{timeout:30000});
const history=(page:Page)=>page.locator('[data-panel-history] li').allTextContents();
async function importFile(page:Page,bytes:Uint8Array,name='source.step'){
  const choosing=page.waitForEvent('filechooser');await tool(page,'cad.importSTEP').click();await(await choosing).setFiles({name,mimeType:'model/step',buffer:Buffer.from(bytes)});
}
async function download(page:Page,action:()=>Promise<unknown>){const waiting=page.waitForEvent('download');await action();const file=await waiting;return{name:file.suggestedFilename(),bytes:await readFile((await file.path())!)};}
async function kernel(){
  const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),print:()=>{},printErr:()=>{}}),retained=new Map<number,ReturnType<KernelSession['resolve']>>();let id=0;
  const session:KernelSession={generation:1,library,isClosed:()=>false,retain(shape){retained.set(++id,shape);return{id,generation:1};},resolve(token){return retained.get(token.id)!;},release(token){retained.get(token.id)!.delete();retained.delete(token.id);}};
  return{session,library,measure(bytes:Uint8Array){const imported=stepExchange({action:'import',session,bytes,units:'mm'}).bodies!;return imported.shapes.map(body=>{const p=new library.GProp_GProps();library.BRepGProp.VolumeProperties(session.resolve(body.token),p,true,false,false);const value=p.Mass();p.delete();session.release(body.token);return value;});},twoBodies(){
    const point=new library.gp_Pnt(40,0,0),first=new library.BRepPrimAPI_MakeBox(10,20,30),second=new library.BRepPrimAPI_MakeBox(point,5,6,7);
    const shapes=[{bodyId:'large',token:session.retain(first.Shape())},{bodyId:'small',token:session.retain(second.Shape())}];first.delete();second.delete();point.delete();
    const bytes=stepExchange({action:'export',session,units:'inch',bodies:{shapes,topology:[],operands:[],diagnostics:[]}}).file!.bytes;for(const body of shapes)session.release(body.token);return bytes;
  },close(){for(const id of [...retained.keys()])session.release({id,generation:1});}};
}
test('CAD-IMPORT production golden: exact source, units, undo, STEP/STL export and native reopen',async({page,context},testInfo)=>{
  test.setTimeout(90000);const server=await serve(),native=await kernel(),errors:string[]=[],external:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:4188'))external.push(r.url());});
  await context.addInitScript(()=>{Object.defineProperty(window,'showOpenFilePicker',{value:undefined});Object.defineProperty(window,'showSaveFilePicker',{value:undefined});});
  const bytes=await readFile(new URL('./fixtures/acceptance-plate-120mm.step',import.meta.url)),expected=68654.42480810515;
  try{
    await page.goto(server.resolvedUrls!.local[0]!);await importFile(page,bytes,'acceptance-plate-120mm.step');await ready(page);
    const panel=page.locator('.cad-imported-properties');await expect(panel).toContainText('Imported STEP — non-parametric');await expect(panel).toContainText('68654.425 mm³');await expect(panel.locator('.cad-feature-tree li')).toHaveCount(1);await expect(panel.locator('[data-body-id]')).toHaveCount(1);await expect(panel).not.toContainText('Sketch 1');
    await expect(page.getByLabel('CAD solid viewport')).toBeVisible();const canvas=page.locator('.cad-solid canvas'),box=(await canvas.boundingBox())!;
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2+30,{steps:4});await page.mouse.up({button:'middle'});await page.keyboard.press('f');
    await panel.getByRole('button',{name:'Imperial (in)',exact:true}).click();await ready(page);await expect(panel).toContainText(`${(expected/25.4**3).toFixed(3)} in³`);
    await page.keyboard.press('Control+z');await ready(page);await expect(panel).toContainText('68654.425 mm³');await page.keyboard.press('Control+y');await ready(page);await expect(panel).toContainText(`${(expected/25.4**3).toFixed(3)} in³`);
    const before=await history(page),step=await download(page,()=>tool(page,'cad.exportSTEP').click());expect(new TextDecoder().decode(step.bytes)).toContain("CONVERSION_BASED_UNIT('INCH'");const volumes=native.measure(step.bytes);expect(volumes).toHaveLength(1);expect(Math.abs(volumes[0]!-expected)).toBeLessThan(expected*0.0001);expect(await history(page)).toEqual(before);
    await page.getByRole('menuitem',{name:'Solid',exact:true}).click();const stl=await download(page,()=>page.getByRole('menuitem',{name:'Export STL (3D printing)',exact:true}).click());
    const data=new DataView(stl.bytes.buffer,stl.bytes.byteOffset,stl.bytes.byteLength),triangles=data.getUint32(80,true);expect(stl.bytes.byteLength).toBe(84+50*triangles);let maxX=-Infinity;
    for(let t=0;t<triangles;t++)for(let v=0;v<3;v++)maxX=Math.max(maxX,data.getFloat32(84+t*50+12+v*12,true));expect(maxX).toBeCloseTo(120,4);
    await page.locator('.cad-stage').focus();const saved=await download(page,()=>page.keyboard.press('Control+s')),pkg=nativeContainer({op:'decode',parts:[saved.bytes]});expect(pkg.assets).toHaveLength(1);expect(pkg.assets[0]!.bytes).toEqual(new Uint8Array(bytes));expect((pkg.project.content as any).graph.features[0].kind).toBe('import');expect((pkg.project.content as any).units).toBe('inch');
    await page.keyboard.press('Control+n');await expect(page.locator('.cad-properties')).toContainText('Draw a closed sketch');const opening=page.waitForEvent('filechooser');await page.keyboard.press('Control+o');await(await opening).setFiles({name:saved.name,mimeType:'application/octet-stream',buffer:saved.bytes});await ready(page);await expect(panel).toContainText(`${(expected/25.4**3).toFixed(3)} in³`);
    const reopened=await download(page,()=>page.keyboard.press('Control+s'));expect(nativeContainer({op:'decode',parts:[reopened.bytes]})).toEqual(pkg);
    await page.screenshot({path:testInfo.outputPath('step-import-production.png')});await testInfo.attach('Imported acceptance plate',{path:testInfo.outputPath('step-import-production.png'),contentType:'image/png'});
    expect(errors).toEqual([]);expect(external).toEqual([]);expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight)).toBe(true);
  }finally{native.close();await page.close();await server.close();}
});

test('CAD-IMPORT production preserves every source solid and rejects a damaged second solid atomically',async({page,context})=>{
  test.setTimeout(60000);const server=await serve(),native=await kernel(),bytes=native.twoBodies();
  await context.addInitScript(()=>{Object.defineProperty(window,'showOpenFilePicker',{value:undefined});Object.defineProperty(window,'showSaveFilePicker',{value:undefined});});
  try{
    await page.goto(server.resolvedUrls!.local[0]!);await importFile(page,bytes,'two-solids-inches.step');await ready(page);const panel=page.locator('.cad-imported-properties');
    await expect(panel).toContainText('2 solids');await expect(panel).toContainText('6210.000 mm³');await expect(panel.locator('[data-body-id]')).toHaveCount(2);await expect(panel.locator('[data-body-id]').nth(0)).toContainText('6000.000 mm³');await expect(panel.locator('[data-body-id]').nth(1)).toContainText('210.000 mm³');
    const step=await download(page,()=>tool(page,'cad.exportSTEP').click());const volumes=native.measure(step.bytes).sort((a,b)=>a-b);expect(volumes).toHaveLength(2);expect(volumes[0]).toBeCloseTo(210,5);expect(volumes[1]).toBeCloseTo(6000,5);
    await page.locator('.cad-stage').focus();const saved=await download(page,()=>page.keyboard.press('Control+s')),pkg=nativeContainer({op:'decode',parts:[saved.bytes]});expect(pkg.assets[0]!.bytes).toEqual(bytes);
    const before=await history(page),title=await page.locator('[data-window-title]').textContent();let count=0;const damaged=new TextDecoder().decode(bytes).replace(/(MANIFOLD_SOLID_BREP\('[^']*',)#\d+(\))/g,(full,before,after)=>++count===2?`${before}#99999${after}`:full);expect(count).toBe(2);
    await importFile(page,new TextEncoder().encode(damaged),'broken.step');await expect(page.locator('.cad-import-status')).toHaveAttribute('data-state','error',{timeout:30000});await expect(panel).toContainText('6210.000 mm³');expect(await history(page)).toEqual(before);expect(await page.locator('[data-window-title]').textContent()).toBe(title);
    await page.locator('.cad-stage').focus();const kept=await download(page,()=>page.keyboard.press('Control+s'));expect(nativeContainer({op:'decode',parts:[kept.bytes]})).toEqual(pkg);
  }finally{native.close();await page.close();await server.close();}
});

test('CAD-IMPORT production cancellation and project replacement terminate pending native work',async({page,context})=>{
  test.setTimeout(60000);const server=await serve(),bytes=await readFile(new URL('./fixtures/acceptance-plate-120mm.step',import.meta.url)),releases:(()=>void)[]=[];let hold=true;
  await context.addInitScript(()=>{Object.defineProperty(window,'showOpenFilePicker',{value:undefined});const spy={started:0,terminated:0};Object.assign(window,{__importWorkers:spy});const Native=Worker;window.Worker=class extends Native{tracked:boolean;constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.tracked=String(url).includes('cad-workspace.worker');if(this.tracked)spy.started++;}override terminate(){if(this.tracked)spy.terminated++;super.terminate();}};});
  await page.route('**/cad-workspace.worker*.js',async route=>{if(hold)await new Promise<void>(r=>releases.push(r));try{await route.continue();}catch{/* A canceled native job cancels its module request. */}});
  const counts=()=>page.evaluate(()=>(window as unknown as {__importWorkers:{started:number;terminated:number}}).__importWorkers);
  try{
    await page.goto(server.resolvedUrls!.local[0]!);await page.keyboard.press('Control+n');const before=await history(page);
    await importFile(page,bytes);await expect.poll(async()=>(await counts()).started).toBe(1);await page.keyboard.press('Escape');await expect.poll(async()=>(await counts()).terminated).toBe(1);await expect(page.locator('.cad-import-status')).toContainText('canceled');expect(await history(page)).toEqual(before);await expect(page.locator('.cad-imported-properties')).toHaveCount(0);
    releases.splice(0).forEach(r=>r());await importFile(page,bytes);await expect.poll(async()=>(await counts()).started).toBe(2);await page.keyboard.press('Control+n');await expect.poll(async()=>(await counts()).terminated).toBe(2);hold=false;releases.splice(0).forEach(r=>r());await expect(page.locator('.cad-imported-properties')).toHaveCount(0);await expect(page.locator('.cad-properties')).toContainText('Draw a closed sketch');
  }finally{hold=false;releases.splice(0).forEach(r=>r());await page.close();await server.close();}
});
