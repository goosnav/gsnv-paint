import {test,expect,type Page} from '@playwright/test';
import {audioSamples} from './audio-samples.ts';import {audioDocument} from './audio-document.ts';
const wave=Buffer.from(audioSamples({operation:'wav',value:audioDocument({operation:'import',id:'song',sampleRate:48000,channels:[Float32Array.from({length:48000},(_,i)=>.3*Math.sin(i*2*Math.PI*440/48000))]})}));
const open=async(page:Page)=>{await page.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true});Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});});await page.goto('/');await page.getByRole('tab',{name:'Audio',exact:true}).click();await page.locator('.audio-stage').getByRole('button',{name:'Effects & batch…',exact:true}).click();};
async function choose(page:Page){const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose songs…',exact:true}).click();await(await picker).setFiles([{name:'first.wav',mimeType:'audio/wav',buffer:wave},{name:'second.wav',mimeType:'audio/wav',buffer:wave}]);}
test('AUD-FX wizard selects first preview, changes song/effects, exports real ZIP and closes',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);const dialog=page.getByRole('dialog',{name:'Audio effects & batch'});await expect(dialog).toBeVisible();await choose(page);
 await expect(dialog.getByLabel('Preview song',{exact:true})).toHaveValue('0');await expect(dialog.locator('audio').nth(1)).toHaveAttribute('src',/^blob:/);await expect(dialog.getByRole('status')).toContainText('Preview ready');
 await dialog.locator('audio').first().evaluate((a:HTMLAudioElement)=>a.play());await expect.poll(()=>dialog.locator('audio').first().evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(.1);
 await dialog.locator('audio').nth(1).evaluate((a:HTMLAudioElement)=>a.play());expect(await dialog.locator('audio').first().evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
 await dialog.getByLabel('Preview song',{exact:true}).selectOption('1');await expect(dialog.getByRole('status')).toContainText('Preview ready');
 await dialog.getByRole('button',{name:'2. Effects',exact:true}).click();await dialog.getByLabel('Sound preset').selectOption('dreamy');await expect(dialog.getByText('4. Reverb',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Update preview',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Preview ready');await page.screenshot({path:'dev/evidence/audio-processing-desktop.png'});
 await dialog.getByRole('button',{name:'3. Export',exact:true}).click();await dialog.getByLabel('Output destination').selectOption('zip');await dialog.getByRole('button',{name:'Process songs',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('2 songs written',{timeout:30000});
 const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download ZIP',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/^gsnv-audio-batch-.*\.zip$/);
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(dialog).not.toBeVisible();expect(errors).toEqual([]);
});

test('AUD-FX MP3 preview decodes at chosen quality; applied effects undo exactly',async({page})=>{
 await open(page);let dialog=page.getByRole('dialog',{name:'Audio effects & batch'});await dialog.getByRole('button',{name:'Close',exact:true}).click();
 const picker=page.waitForEvent('filechooser');await page.locator('.audio-stage').getByRole('button',{name:'Import audio…',exact:true}).click();await(await picker).setFiles({name:'original.wav',mimeType:'audio/wav',buffer:wave});await expect(page.locator('.audio-info')).toContainText('48000 frames');
 await page.locator('.audio-stage').getByRole('button',{name:'Effects & batch…',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Preview ready');
 await dialog.getByRole('button',{name:'2. Effects',exact:true}).click();await dialog.getByLabel('Sound preset').selectOption('clean');await dialog.getByLabel('Add effect',{exact:true}).selectOption('gain');await dialog.getByRole('button',{name:'Add effect',exact:true}).click();
 const number=dialog.getByLabel('Gain (dB)',{exact:true});await number.fill('-6');await expect(number).toBeFocused();await expect(number).toHaveValue('-6');
 await dialog.getByRole('button',{name:'3. Export',exact:true}).click();await dialog.getByLabel('Export format').selectOption('mp3');await dialog.getByLabel('MP3 quality').selectOption('64');await dialog.getByRole('button',{name:'Update preview',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Preview ready');
 const decoded=await dialog.locator('audio').nth(1).evaluate(async(audio:HTMLAudioElement)=>{const bytes=await(await fetch(audio.src)).arrayBuffer();const context=new OfflineAudioContext(2,1,44100),buffer=await context.decodeAudioData(bytes);const center=buffer.getChannelData(0).subarray(Math.floor(.25*44100),Math.floor(.75*44100));return{rms:Math.sqrt(center.reduce((n,x)=>n+x*x,0)/center.length),duration:buffer.duration,channels:buffer.numberOfChannels,peak:buffer.getChannelData(0).reduce((n,x)=>Math.max(n,Math.abs(x)),0)};});
 expect(decoded.duration).toBeGreaterThanOrEqual(1);expect(decoded.duration).toBeLessThan(1.1);expect(decoded.channels).toBe(1);expect(decoded.peak).toBeLessThan(1);
 // Lossy decoders can overshoot transients. Verify the -6dB effect using steady-state RMS, not a PCM peak oracle.
 expect(Math.abs(decoded.rms-(.3*10**(-6/20)/Math.SQRT2))).toBeLessThan(.01);
 await dialog.getByRole('button',{name:'Apply to open recording',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('one undo step');await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('[data-panel-history]')).toContainText('Audio effects');
 await page.locator('.audio-stage').getByRole('button',{name:'Effects & batch…',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Preview ready');await dialog.getByRole('button',{name:'2. Effects',exact:true}).click();await expect(dialog.getByLabel('Gain (dB)',{exact:true})).toHaveValue('-6');await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.keyboard.press('Control+z');
 const download=page.waitForEvent('download');await page.locator('.audio-stage').getByRole('button',{name:'Export WAV…',exact:true}).click();const file=await download;const stream=await file.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));const restored=Buffer.concat(chunks);
 expect(restored.length).toBe(wave.length);let maximumDifference=0;for(let i=44;i<wave.length;i+=2)maximumDifference=Math.max(maximumDifference,Math.abs(restored.readInt16LE(i)-wave.readInt16LE(i)));expect(maximumDifference).toBeLessThanOrEqual(1);
});

test('AUD-FX folder batch writes dated child, report and no originals; close cancels preview',async({page})=>{
 await open(page);const dialog=page.getByRole('dialog',{name:'Audio effects & batch'});
 await page.evaluate((bytes:number[])=>{
  const output:Record<string,Blob>={},created:string[]=[]; (window as any).__audioFolder={output,created,originalWrites:0};
  const missing=()=>new DOMException('Missing','NotFoundError');
  const child={kind:'directory',name:'output',async *entries(){},async getFileHandle(name:string,options?:{create?:boolean}){if(!options?.create)throw missing();return{kind:'file',name,async getFile(){return new File([output[name]!],name);},async createWritable(){let pending:Blob;return{async write(blob:Blob){pending=blob;},async close(){output[name]=pending!;},async abort(){}};}};},async removeEntry(name:string){delete output[name];}};
  const songs=['one.wav','two.wav','bad.wav'];const source={kind:'directory',name:'songs',async *entries(){for(const name of songs)yield[name,{kind:'file',name,async getFile(){return new File([name==='bad.wav'?new Uint8Array([1,2]):new Uint8Array(bytes)],name,{lastModified:1});},async createWritable(){(window as any).__audioFolder.originalWrites++;throw new Error('Original write');}}];},async queryPermission(){return'granted';},async getDirectoryHandle(name:string,options?:{create?:boolean}){if(!options?.create)throw missing();created.push(name);return child;}};
  Object.defineProperty(window,'showDirectoryPicker',{value:async()=>source,configurable:true});
 },[...wave]);
 // Reopen so capability ports are captured from the selected browser adapter.
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.audio-stage').getByRole('button',{name:'Effects & batch…',exact:true}).click();
 await dialog.getByRole('button',{name:'Choose folder…',exact:true}).click();await expect(dialog.getByLabel('Preview song',{exact:true})).toHaveValue('0');
 // The alphabetically first corrupt file reports a preview error; choosing a good song recovers.
 await expect(dialog.getByRole('status')).toContainText('Could not decode');await dialog.getByLabel('Preview song',{exact:true}).selectOption('1');await expect(dialog.getByRole('status')).toContainText('Preview ready');
 await dialog.getByRole('button',{name:'3. Export',exact:true}).click();await expect(dialog.getByLabel('Output destination')).toHaveValue('source');await dialog.getByLabel('WAV bit depth').selectOption('24');await dialog.getByRole('button',{name:'Process songs',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('2 songs written; 1 errors');
 const result=await page.evaluate(async()=>{const f=(window as any).__audioFolder;const buffer=await new OfflineAudioContext(2,1,44100).decodeAudioData(await f.output['one.wav'].arrayBuffer());return{names:Object.keys(f.output),folders:f.created,writes:f.originalWrites,duration:buffer.duration,report:JSON.parse(await f.output['audio-batch-report.json'].text())};});
 expect(result.names).toEqual(['one.wav','two.wav','audio-batch-report.json']);expect(result.folders[0]).toMatch(/^gsnv-audio-batch-\d{4}-\d{2}-\d{2}_/);expect(result.writes).toBe(0);expect(result.duration).toBeCloseTo(1,4);expect(result.report.output.bits).toBe(24);
 await dialog.getByRole('button',{name:'Update preview',exact:true}).click();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(page.locator('.audio-stage')).toBeVisible();
});

test('AUD-FX wizard remains usable at phone width and has consistent slider controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);const dialog=page.getByRole('dialog',{name:'Audio effects & batch'});await dialog.getByRole('button',{name:'2. Effects',exact:true}).click();
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await expect(dialog.locator('input[type=range]').first()).toHaveClass(/xp-range/);await page.screenshot({path:'dev/evidence/audio-processing-phone.png'});await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});

test('AUD-FX real browser directory handles retain originals and write processed copies',async({page})=>{
 await open(page);const dialog=page.getByRole('dialog',{name:'Audio effects & batch'});await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(async(bytes:number[])=>{
  const root=await navigator.storage.getDirectory(),source=await root.getDirectoryHandle('audio-test-songs',{create:true}),file=await source.getFileHandle('test.wav',{create:true});
  const write=await file.createWritable();await write.write(new Uint8Array(bytes));await write.close();Object.defineProperty(window,'showDirectoryPicker',{value:async()=>source,configurable:true});(window as any).__audioRealDirectory=source;
 },[...wave]);
 await page.locator('.audio-stage').getByRole('button',{name:'Effects & batch…',exact:true}).click();await dialog.getByRole('button',{name:'Choose folder…',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Preview ready');
 await dialog.getByRole('button',{name:'3. Export',exact:true}).click();await dialog.getByRole('button',{name:'Process songs',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('1 songs written; 0 errors');
 const files=await page.evaluate(async()=>{const source=(window as any).__audioRealDirectory;const original=await(await source.getFileHandle('test.wav')).getFile();let output:File|null=null,names:string[]=[];for await(const[name,handle]of source.entries()){names.push(name);if(handle.kind==='directory')output=await(await handle.getFileHandle('test.wav')).getFile();}return{names,original:[...new Uint8Array(await original.arrayBuffer())],size:output!.size};});
 expect(Buffer.from(files.original)).toEqual(wave);expect(files.names.filter(n=>n.startsWith('gsnv-audio-batch-'))).toHaveLength(1);expect(files.size).toBeGreaterThan(44);await dialog.getByRole('button',{name:'Close',exact:true}).click();
});

test('AUD-FX installed production build processes first-use audio while offline',async({page,context},info)=>{
 test.skip(!info.config.configFile?.endsWith('audio-processing.playwright.config.ts'),'Requires production service worker; covered by production configuration.');
 test.setTimeout(90000);await page.addInitScript(()=>{Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true});Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});});
 await page.goto('/');await expect(page.getByText('Ready offline',{exact:true})).toBeVisible({timeout:60000});await context.setOffline(true);await page.reload();await page.getByRole('tab',{name:'Audio',exact:true}).click();await page.locator('.audio-stage').getByRole('button',{name:'Effects & batch…',exact:true}).click();await choose(page);
 const dialog=page.getByRole('dialog',{name:'Audio effects & batch'});await expect(dialog.getByRole('status')).toContainText('Preview ready');await dialog.getByRole('button',{name:'3. Export',exact:true}).click();await dialog.getByLabel('Export format').selectOption('mp3');await dialog.getByRole('button',{name:'Process songs',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('2 songs written');await dialog.getByRole('button',{name:'Close',exact:true}).click();
});
