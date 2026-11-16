/**
 * PURPOSE    Present a closable audio processing wizard with selectable before/after preview.
 * KIND       SHELL
 * CONTRACT   Browser document/handles plus optional current-PCM/apply callback -> DialogSpec.
 *            First selected song is the preview; dropdown changes it. Explicit play only.
 *            Close/cancel stops media and processing; current recording applies once with caller revision guard.
 * GUARANTEES Files stay local, originals never written, errors remain visible, downloaded ZIP is labelled.
 * TUNING     Preview 15 seconds, offset editable; settings persist under gsnv-audio-effects-v1.
 * DECISIONS  D1: Wizard tabs keep song choice/effects/output legible while preview stays visible.
 *            Alternative long form overflowed phone screens; Revisit if: owner usability review identifies a better layout.
 * LIMITS     Direct children only; browser-dependent decode; no physical OS permission automation.
 * TESTBENCH  src/audio/audio-processing.browser.spec.ts -- run with: npx playwright test src/audio/audio-processing.browser.spec.ts
 * DEMO       npm run dev; Audio > Effects & batch
 */
import type {DialogSpec} from '../shared/dialog.ts';
import {createAudioChainControls} from './audio-chain-controls.ts';
import {createAudioProcessor} from './audio-processing-client.ts';
import {audioSettings} from './audio-effect-settings.ts';
import {audioExport} from './audio-export-profile.ts';
import type {AudioPcm} from './audio-effects.ts';
import {pickBatchInputs,createBatchDestination,type BatchFilePorts,type BatchSelection,type BatchDestination} from '../image/image-batch-files.ts';
import {runAudioBatch} from './audio-batch-run.ts';
type Ports={document:Document;files:BatchFilePorts;current?:{name:string;read():AudioPcm;apply(pcm:AudioPcm):boolean};onClose():void};
const KEY='gsnv-audio-effects-v1';
export function audioProcessingDialog(p:Ports):DialogSpec & {dispose():void}{
 const d=p.document,w=d.defaultView!,processor=createAudioProcessor();let closed=false,busy=false,applied=false,step=0,revision=0;
 let selection:BatchSelection|null=null,controller:AbortController|null=null,destination:BatchDestination|null=null,downloadValue:{blob:Blob;name:string}|null=null;
 const urls:string[]=[],make=<K extends keyof HTMLElementTagNameMap>(tag:K,text='')=>{const e=d.createElement(tag);e.textContent=text;return e;};
 const body=make('div');body.className='audio-processing-wizard';
 const button=(text:string,action:()=>void)=>{const b=make('button',text);b.type='button';b.onclick=action;return b;};
 const label=(text:string,element:HTMLElement)=>{const l=make('label',text);element.setAttribute('aria-label',text);l.append(element);return l;};
 const status=make('p','Choose songs or a folder, or use the recording already open.');status.className='audio-wizard-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const error=(cause:unknown)=>cause instanceof Error?cause.message:String(cause);
 function clearPreview(){for(const audio of [original,processed]){audio.pause();audio.removeAttribute('src');audio.load();}for(const url of urls)w.URL.revokeObjectURL(url);urls.length=0;}
 function settingsChanged(){revision++;clearPreview();downloadValue=null;download.hidden=true;try{chain.read();status.textContent='Settings changed. Update preview to hear this version.';}catch(cause){status.textContent=error(cause);}refresh();}
 let initial;try{const saved=JSON.parse(w.localStorage.getItem(KEY)??'null');if(saved){audioExport.repair(saved.output);initial={chain:audioSettings.chain(saved.chain),output:saved.output};}}catch{/* Invalid/blocked optional preferences use the documented preset. */}
 const chain=createAudioChainControls(d,settingsChanged,initial);
 const tabs=make('nav'),pages=[make('section'),chain.effects,chain.exports],main=make('div');tabs.className='audio-wizard-tabs';tabs.setAttribute('aria-label','Audio processing steps');main.className='audio-wizard-main';
 const tabButtons=['1. Songs','2. Effects','3. Export'].map((text,i)=>{const b=button(text,()=>setStep(i));tabs.append(b);return b;});
 const choices=make('div');choices.className='audio-wizard-row';const songs=button('Choose songs…',()=>void choose('files')),folder=button('Choose folder…',()=>void choose('folder'));
 const current=button('Use open recording',()=>{if(busy||!p.current)return;selection=null;configure();void preview();});choices.append(songs,folder,current);
 const credits=make('a','MP3 encoder credits & source');credits.href='/THIRD_PARTY_NOTICES.txt';credits.target='_blank';credits.rel='noopener';
 const source=make('p'),limits=make('p','Only songs directly inside the folder are processed. Each file: up to 128 MiB, mono/stereo, 30 minutes and 128 MiB decoded. Files decode locally at 48000 Hz.');limits.className='audio-wizard-note';
 pages[0]!.append(make('h3','Choose your songs'),choices,source,limits,credits);
 const dest=make('select');for(const[v,t]of [['source','New dated folder inside source folder'],['choose','Choose output folder when processing'],['zip','Download a dated ZIP']]){const o=make('option',t!);o.value=v!;dest.append(o);}
 const destNote=make('p');destNote.className='audio-wizard-note';dest.onchange=destinationNote;pages[2]!.append(label('Output destination',dest),destNote);
 const previewPane=make('aside');previewPane.className='audio-wizard-preview';const previewSong=make('select');previewSong.onchange=()=>void preview();
 const offset=make('input');offset.type='number';offset.min='0';offset.max='1800';offset.step='any';offset.value='0';offset.oninput=settingsChanged;
 const original=make('audio'),processed=make('audio');for(const a of [original,processed]){a.controls=true;a.preload='metadata';a.onplay=()=>{(a===original?processed:original).pause();};}
 original.setAttribute('aria-label','Original preview');processed.setAttribute('aria-label','Processed preview');
 const previewButton=button('Update preview',()=>void preview()),stop=button('Stop',()=>{controller?.abort();original.pause();processed.pause();status.textContent='Stopping…';});
 const previewFormat=make('p');previewFormat.className='audio-preview-format';
 previewPane.append(make('h3','Listen before processing'),label('Preview song',previewSong),label('Preview start (seconds)',offset),make('p','15-second excerpt. Press Play to listen; use the dropdown to try another song.'),previewButton,make('h4','Original'),original,make('h4','Processed'),processed,previewFormat);
 const progress=make('progress');progress.max=1;progress.value=0;progress.setAttribute('aria-label','Audio processing progress');
 const report=make('ol');report.setAttribute('aria-label','Song processing results');report.className='audio-wizard-report';
 const actions=make('div');actions.className='audio-wizard-row';
 const back=button('Back',()=>setStep(step-1)),next=button('Next',()=>setStep(step+1));
 const apply=button('Apply to open recording',()=>void applyCurrent()),run=button('Process songs',()=>void processSongs()),download=button('Download ZIP',()=>downloadOutput());download.hidden=true;
 const applyNote=make('p','Apply changes effects only. To keep the MP3 compression, use Process songs in Export and download the result.');applyNote.className='audio-wizard-note';
 actions.append(back,next,apply,run,stop,download);const content=make('div');content.className='audio-wizard-layout';main.append(...pages);content.append(main,previewPane);body.append(tabs,content,status,progress,report,applyNote,actions);
 function hasInput(){return !!selection?.inputs.length||!!p.current;}
 function refresh(){
  chain.setDisabled(busy);songs.disabled=folder.disabled=busy;current.disabled=busy||!p.current;previewSong.disabled=offset.disabled=dest.disabled=busy;previewButton.disabled=busy||!hasInput();
  apply.disabled=busy||!p.current||!!selection||applied;apply.hidden=!p.current||!!selection;run.disabled=busy||!hasInput();run.hidden=step!==2;stop.disabled=!busy;download.disabled=busy;
  applyNote.hidden=apply.hidden;try{previewFormat.textContent=`Preview uses these export settings: ${audioExport.describe(chain.read().output)}.`;}catch{previewFormat.textContent='Correct the highlighted settings before previewing.';}
  back.disabled=step===0;next.disabled=step===2;for(let i=0;i<3;i++){pages[i]!.hidden=i!==step;tabButtons[i]!.setAttribute('aria-pressed',String(i===step));}
 }
 function setStep(value:number){step=Math.max(0,Math.min(2,value));refresh();}
 function destinationNote(){destNote.textContent=dest.value==='source'?'A unique UTC time/date-stamped child folder will be created inside your selected folder. Originals are never overwritten.':dest.value==='choose'?'Processing opens a folder chooser, then creates a new dated child folder. Selected files do not reveal their parent folder.':'This browser will prepare a ZIP for download (maximum 128 MiB). It cannot automatically place that ZIP inside your source folder; unzip it there yourself.';}
 function configure(){
  previewSong.replaceChildren();const names=selection?selection.inputs.map(i=>i.name):p.current?[p.current.name]:[];
  names.forEach((name,i)=>{const o=make('option',name);o.value=String(i);previewSong.append(o);});previewSong.value='0';
  source.textContent=selection?`${selection.inputs.length} songs selected; ${selection.ignored} unsupported files or nested folders ignored.`:p.current?`Open recording: ${p.current.name}. Apply changes is undoable; batch processing leaves it untouched.`:'No songs selected yet.';
  dest.options[0]!.disabled=!selection?.sourceDirectory;dest.options[1]!.disabled=!p.files.showDirectoryPicker;dest.value=selection?.sourceDirectory?'source':p.files.showDirectoryPicker&&selection?'choose':'zip';destinationNote();refresh();
 }
 function remember(){const settings=chain.read();try{w.localStorage.setItem(KEY,JSON.stringify(settings));}catch{/* Preferences are optional; file output still works. */}return settings;}
 async function choose(kind:'files'|'folder'){
  if(busy||closed)return;busy=true;refresh();let picked=false;
  try{const value=await pickBatchInputs({source:kind,ports:p.files,profile:'audio'});if(closed)return;if(value){selection=value;picked=true;clearPreview();downloadValue=null;download.hidden=true;report.replaceChildren();configure();}}
  catch(cause){if(!closed)status.textContent=error(cause);}finally{busy=false;if(!closed)refresh();}
  if(picked&&!closed)void preview();
 }
 async function readPreview(signal:AbortSignal):Promise<AudioPcm>{
  if(selection){const input=selection.inputs[Number(previewSong.value)];if(!input)throw new Error('Choose a preview song.');return processor.decode(await input.read(),signal);}
  if(!p.current)throw new Error('Choose a song first.');return p.current.read();
 }
 async function operation(action:(signal:AbortSignal)=>Promise<void>){
  if(busy||closed)return;busy=true;controller=new AbortController();original.pause();processed.pause();refresh();
  try{await action(controller.signal);}catch(cause){if(!closed)status.textContent=controller.signal.aborted?'Processing stopped. Completed folder files are kept.':error(cause);}
  finally{if(controller?.signal.aborted&&destination){await destination.cancel().catch(()=>{});destination=null;}busy=false;controller=null;if(!closed)refresh();}
 }
 async function preview(){await operation(async signal=>{
  const settings=remember(),start=offset.valueAsNumber;if(!Number.isFinite(start)||start<0||start>1800)throw new Error('Preview start must be 0–1800 seconds.');
  clearPreview();const token=revision;status.textContent='Preparing preview…';const full=await readPreview(signal);signal.throwIfAborted();
  const from=Math.floor(start*full.sampleRate),to=Math.min(full.channels[0]!.length,from+15*full.sampleRate);if(from>=to)throw new Error(`Preview start is past the end (${(full.channels[0]!.length/full.sampleRate).toFixed(2)} seconds).`);
  const pcm={sampleRate:full.sampleRate,channels:full.channels.map(c=>c.slice(from,to))};
  const before=await processor.run({pcm:{sampleRate:pcm.sampleRate,channels:pcm.channels.map(c=>c.slice())},chain:[],output:{...audioSettings.output(),sampleRate:48000,preventClipping:false}},signal);
  const after=await processor.run({pcm,chain:settings.chain,output:settings.output},signal);signal.throwIfAborted();if(closed||token!==revision)return;
  if(!('encoded'in before)||!('encoded'in after))throw new Error('Audio preview returned no encoded output.');
  for(const[a,out]of [[original,before.encoded],[processed,after.encoded]] as const){const url=w.URL.createObjectURL(new Blob([out.bytes],{type:out.mime}));urls.push(url);a.src=url;}
  status.textContent=`Preview ready · ${previewSong.selectedOptions[0]?.textContent} · ${(to-from)/full.sampleRate} seconds. Press Play to compare. MP3 preview includes the selected bitrate.`;
 });}
 async function applyCurrent(){await operation(async signal=>{
  if(!p.current||selection||applied)return;const settings=remember();status.textContent='Applying effects to the whole open recording…';
  const result=await processor.run({pcm:p.current.read(),chain:settings.chain},signal);signal.throwIfAborted();if(closed)return;
  if(!('pcm'in result)||!p.current.apply(result.pcm))throw new Error('The open recording changed. Close this wizard and reopen it.');
  applied=true;status.textContent='Effects applied as one undo step. Close to review the waveform. The source file is unchanged.';
 });}
 async function processSongs(){await operation(async signal=>{
  const settings=remember();report.replaceChildren();download.hidden=true;downloadValue=null;
  if(!selection){
   if(!p.current)throw new Error('Choose songs first.');status.textContent='Processing the open recording…';
   const result=await processor.run({pcm:p.current.read(),chain:settings.chain,output:settings.output},signal);signal.throwIfAborted();if(closed)return;
   if(!('encoded'in result))throw new Error('No audio output was produced.');downloadValue={blob:new Blob([result.encoded.bytes],{type:result.encoded.mime}),name:`${p.current.name.replace(/[\\/:*?"<>|]/g,'_')}.${result.encoded.extension}`};download.textContent='Download song';download.hidden=false;status.textContent='Processed song ready. Download the copy below; your open recording is unchanged.';return;
  }
  const selected=selection;destination=await createBatchDestination({selection:selected,mode:dest.value as 'source'|'choose'|'zip',now:Date.now(),runId:crypto.randomUUID().slice(0,8),ports:p.files});
  if(!destination){status.textContent='Output selection cancelled.';return;}signal.throwIfAborted();progress.max=selected.inputs.length;progress.value=0;const target=destination;
  const result=await runAudioBatch({selection:selected,destination:target,chain:settings.chain,output:settings.output,signal,
   progress(done,name){if(!closed){progress.value=done;status.textContent=`Processing ${Math.min(done+1,selected.inputs.length)}/${selected.inputs.length}: ${name}`;}},
   async process(file,abort){const pcm=await processor.decode(file,abort);const result=await processor.run({pcm,chain:settings.chain,output:settings.output},abort);if(!('encoded'in result))throw new Error('No audio output was produced.');return new Blob([result.encoded.bytes],{type:result.encoded.mime});},
  });destination=null;if(closed)return;
  for(const entry of result.entries){const row=make('li',entry.status==='written'?`${entry.input} → ${entry.output}`:`${entry.input}: ${entry.message}`);row.dataset.result=entry.status;report.append(row);}
  const errors=result.entries.filter(e=>e.status==='error').length;
  status.textContent=`${result.status==='completed'?'Batch complete':result.status==='stopped'?'Batch stopped':'Batch failed'}: ${result.written} songs written; ${errors} errors. ${target.kind==='directory'?`Output: ${target.name}. Completed files are kept.`:'ZIP output.'}${result.error?` ${result.error}`:''}`;
  if(result.result?.kind==='zip'){downloadValue={blob:result.result.blob,name:result.result.name};download.textContent='Download ZIP';download.hidden=false;}else if(target.kind==='zip'&&result.status!=='completed')status.textContent+=' Incomplete ZIP discarded.';
 });}
 function downloadOutput(){if(!downloadValue||closed)return;const url=w.URL.createObjectURL(downloadValue.blob),a=make('a');a.href=url;a.download=downloadValue.name;d.body.append(a);a.click();a.remove();w.setTimeout(()=>w.URL.revokeObjectURL(url),1000);status.textContent=`Download handed to the browser: ${downloadValue.name}.`;}
 function close(){if(closed)return;closed=true;revision++;controller?.abort();processor.dispose();clearPreview();void destination?.cancel().catch(()=>{});downloadValue=null;p.onClose();}
 body.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.stopPropagation();if((event.target as Element).tagName==='BUTTON'){event.preventDefault();(event.target as HTMLButtonElement).click();}}});
 configure();if(p.current)w.setTimeout(()=>{if(!closed)void preview();},0);
 return{title:'Audio effects & batch',previewElement:body,confirmLabel:'Close',fields:[],initial:{},validate:()=>({ok:true,value:null}),preview(){},commit:close,cancel:close,dispose:close};
}
