/**
 * PURPOSE    Present guided audio export settings.
 * KIND       SHELL
 * CONTRACT   Document, change callback, optional output -> element/read/setDisabled.
 *            Invalid saved shapes raise RangeError; incompatible rates repair visibly via AG01.
 * GUARANTEES Presets affect export only. Estimates/compatibility delegated to AG01. Typed native controls.
 * TUNING     Presets/help in AG01/02; defaults to Early web MP3 for fresh processing.
 * DECISIONS  D1: Presets plus manual fields expose useful choices. Alternative: minimum/maximum only
 *            misses intermediate sounds. Revisit if: listening feedback calls for different presets.
 * LIMITS     Size estimate excludes padding. Keep channels cannot know source channel count yet.
 * TESTBENCH  node --import tsx --test src/audio/audio-export-controls.test.ts
 * DEMO       npm run dev; Audio > Effects & batch > Export
 */
import {audioExport,type AudioExport} from './audio-export-profile.ts';
import {audioHelp} from './audio-effect-guide.ts';
import {audioHelpButton} from './audio-help-popup.ts';
export function createAudioExportControls(d:Document,changed:()=>void,initial?:AudioExport){
 const make=<K extends keyof HTMLElementTagNameMap>(tag:K,text='')=>{const e=d.createElement(tag);e.textContent=text;return e;};
 const element=make('section');element.className='audio-output-controls';
 const select=(name:string,choices:readonly (readonly [string,string])[],help?:string)=>{
  const row=make('div'),heading=make('div',name),input=make('select');row.className='audio-export-field';heading.className='audio-control-heading';input.setAttribute('aria-label',name);
  for(const [v,t]of choices){const option=make('option',t);option.value=v;input.append(option);}
  if(help)heading.append(audioHelpButton(d,element,audioHelp(help)));row.append(heading,input);return {row,input};
 };
 const presets=audioExport.presets(),preset=select('Export preset',[['custom','Custom settings'],...presets.map(p=>[p.id,p.label] as const)]);
 const description=make('p'),estimate=make('p'),notice=make('p');description.className='audio-export-description';estimate.className='audio-export-summary';notice.className='audio-export-notice';
 const advanced=make('details'),summary=make('summary','Fine-tune format & quality');advanced.open=true;advanced.append(summary);
 const format=select('Export format',[['wav','WAV — uncompressed'],['mp3','MP3 — compressed']],'export.format');
 const bits=select('WAV bit depth',[['16','16-bit — standard'],['24','24-bit — more precision']],'export.bits');
 const bitrate=select('MP3 quality',audioExport.bitrates().map(b=>[String(b),`${b} kbps`] as const),'export.bitrate');
 const rate=select('Output sample rate',[],'export.sampleRate');
 const channels=select('Output channels',[['preserve','Keep mono / stereo'],['mono','Convert to mono']],'export.channels');
 const protection=make('div'),label=make('label',' Prevent clipping'),protect=make('input');protection.className='audio-control-heading';protect.type='checkbox';protect.setAttribute('aria-label','Prevent clipping');label.prepend(protect);protection.append(label,audioHelpButton(d,element,audioHelp('export.preventClipping')));
 advanced.append(format.row,bits.row,bitrate.row,rate.row,channels.row,protection);
 element.append(preset.row,description,estimate,notice,advanced,make('p','Update preview to hear this exact codec and quality. Size is approximate per minute, excluding padding. Tags and cover artwork are not copied.'));
 const readRaw=()=>({format:format.input.value,bits:Number(bits.input.value),bitrate:Number(bitrate.input.value),sampleRate:Number(rate.input.value),channels:channels.input.value,preventClipping:protect.checked});
 function display(output:AudioExport,message=''){
  const matched=presets.find(p=>(Object.keys(p.output) as (keyof AudioExport)[]).every(k=>p.output[k]===output[k]));preset.input.value=matched?.id??'custom';
  description.textContent=matched?.description??'Custom settings. Lower MP3 bitrate makes a smaller file; sample rate sets bandwidth, and mono removes stereo width.';
  estimate.textContent=audioExport.describe(output);notice.textContent=message;notice.hidden=!message;
  format.input.value=output.format;bits.input.value=String(output.bits);bitrate.input.value=String(output.bitrate);channels.input.value=output.channels;protect.checked=output.preventClipping;
  rate.input.replaceChildren();for(const value of audioExport.compatibleRates(output)){const o=make('option',`${value} Hz`);o.value=String(value);rate.input.append(o);}rate.input.value=String(output.sampleRate);
  bits.row.hidden=output.format!=='wav';bitrate.row.hidden=output.format!=='mp3';
 }
 preset.input.onchange=()=>{if(preset.input.value==='custom')return;display(audioExport.preset(preset.input.value).output);changed();};
 for(const input of [format.input,bits.input,bitrate.input,rate.input,channels.input,protect])input.addEventListener('change',()=>{const repaired=audioExport.repair(readRaw());display(repaired.output,repaired.notice);changed();});
 const repaired=audioExport.repair(initial??audioExport.preset('web').output);display(repaired.output,repaired.notice);
 return{element,read:()=>audioExport.validate(readRaw()),setDisabled(value:boolean){for(const input of element.querySelectorAll<HTMLInputElement>('input,select,button'))if(!input.closest('[data-audio-help-panel]'))input.disabled=value;}};
}
