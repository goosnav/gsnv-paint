/**
 * PURPOSE    Present editable audio processing settings.
 * KIND       SHELL
 * CONTRACT   Document + optional validated initial settings -> effects/export elements,
 *            read() validated owned settings, setDisabled(). Invalid values block read visibly.
 * GUARANTEES Text-only labels, numeric alternatives to sliders, no playback or persistence.
 * TUNING     Field bounds/defaults supplied by AX01; preset replaces the displayed chain.
 * DECISIONS  D1: Native buttons/selects support keyboard/touch. Alternative: drag-only ordering excludes keys.
 *            Revisit if: drag ordering is requested in addition to these buttons.
 * LIMITS     Up to 12 effects. Export fields hide irrelevant quality controls.
 * TESTBENCH  node --import tsx --test src/audio/audio-chain-controls.test.ts
 * DEMO       npm run dev; Audio > Effects & batch > Effects
 */
import {audioSettings,type AudioEffect,type AudioExport} from './audio-effect-settings.ts';
type Settings={chain:AudioEffect[];output:AudioExport};
export function createAudioChainControls(d:Document,changed:()=>void,initial?:Settings){
 let chain=audioSettings.chain(initial?.chain??audioSettings.preset('retro')),disabled=false;
 const output=audioSettings.output(initial?.output),catalog=audioSettings.catalog();
 const make=<K extends keyof HTMLElementTagNameMap>(tag:K,text='')=>{const e=d.createElement(tag);e.textContent=text;return e;};
 const button=(text:string,action:()=>void)=>{const e=make('button',text);e.type='button';e.onclick=action;return e;};
 const select=(name:string,choices:readonly (readonly [string,string])[],value:string)=>{const label=make('label',name),input=make('select');input.setAttribute('aria-label',name);for(const[v,t]of choices){const o=make('option',t);o.value=v;input.append(o);}input.value=value;label.append(input);return{label,input};};
 const effects=make('section'),exports=make('section'),list=make('div');effects.className='audio-chain-controls';exports.className='audio-output-controls';
 const preset=select('Sound preset',[['retro','Retro computer'],['dreamy','Retro + reverb'],['clean','Clean / custom']],'retro');if(initial)preset.input.value='clean';
 preset.input.onchange=()=>{chain=audioSettings.preset(preset.input.value as 'retro'|'dreamy'|'clean');render();changed();};
 const explanation=make('p','Start with Retro computer for a gently muffled early digital sound. Add reverb for space. Effects run from top to bottom.');
 const add=select('Add effect',catalog.map(e=>[e.kind,e.label] as const),'reverb');const addButton=button('Add effect',()=>{if(chain.length<12){chain.push(audioSettings.effect(add.input.value as AudioEffect['kind']));render();changed();}});
 const addRow=make('div');addRow.className='audio-wizard-row';addRow.append(add.label,addButton);effects.append(preset.label,explanation,list,addRow);
 function render(){
  list.replaceChildren();chain.forEach((effect,index)=>{
   const definition=catalog.find(e=>e.kind===effect.kind)!,card=make('fieldset'),legend=make('legend',`${index+1}. ${definition.label}`),row=make('div');row.className='audio-wizard-row';
   const enabled=make('input');enabled.type='checkbox';enabled.checked=effect.enabled;enabled.setAttribute('aria-label',`Enable ${definition.label}`);const enableLabel=make('label','Enabled ');enableLabel.prepend(enabled);enabled.onchange=()=>{effect.enabled=enabled.checked;changed();};
   const move=(delta:number)=>{const target=index+delta;if(target<0||target>=chain.length)return;[chain[index],chain[target]]=[chain[target]!,chain[index]!];render();changed();};
   const up=button('↑',()=>move(-1)),down=button('↓',()=>move(1)),remove=button('Remove',()=>{chain.splice(index,1);render();changed();});up.setAttribute('aria-label',`Move ${definition.label} up`);down.setAttribute('aria-label',`Move ${definition.label} down`);up.disabled=index===0;down.disabled=index===chain.length-1;
   row.append(enableLabel,up,down,remove);card.append(legend,row,make('p',definition.description));
   for(const p of definition.parameters){const label=make('label',p.label),controls=make('span'),slider=make('input'),number=make('input');label.className='audio-effect-parameter';slider.type='range';slider.className='xp-range';number.type='number';number.required=true;
    for(const input of [slider,number]){input.min=String(p.min);input.max=String(p.max);input.step=p.key==='bits'?'1':'any';input.value=String(effect.values[p.key]);input.setAttribute('aria-label',input===slider?`${p.label} slider`:p.label);}
    slider.step=String(p.step);slider.oninput=()=>{number.value=slider.value;effect.values[p.key]=slider.valueAsNumber;changed();};number.oninput=()=>{effect.values[p.key]=number.valueAsNumber;if(number.validity.valid)slider.value=number.value;changed();};controls.append(slider,number);label.append(controls);card.append(label);
   }
   list.append(card);
  });addButton.disabled=disabled||chain.length>=12;
  if(disabled)setDisabled(true);
 }
 const format=select('Export format',[['wav','WAV — uncompressed'],['mp3','MP3 — compressed']],output.format);
 const bits=select('WAV bit depth',[['16','16-bit — standard'],['24','24-bit — more precision']],String(output.bits));
 const bitrate=select('MP3 quality',[['64','64 kbps — early web texture'],['96','96 kbps — small'],['128','128 kbps — standard'],['192','192 kbps — high'],['256','256 kbps — higher'],['320','320 kbps — maximum']],String(output.bitrate));
 const rate=select('Output sample rate',[['22050','22050 Hz'],['44100','44100 Hz — music'],['48000','48000 Hz — video']],String(output.sampleRate));
 const channels=select('Output channels',[['preserve','Keep mono / stereo'],['mono','Convert to mono']],output.channels);
 const protection=make('label',' Prevent clipping (reduce gain if needed)'),protect=make('input');protect.type='checkbox';protect.checked=output.preventClipping;protect.setAttribute('aria-label','Prevent clipping');protection.prepend(protect);
 const hint=make('p','MP3 reduces file size and adds lossy texture at lower bitrates. WAV preserves the processed samples. Tags and cover artwork are not copied.');
 exports.append(format.label,bits.label,bitrate.label,rate.label,channels.label,protection,hint);
 const showQuality=()=>{bits.label.hidden=format.input.value!=='wav';bitrate.label.hidden=format.input.value!=='mp3';};
 for(const e of [format.input,bits.input,bitrate.input,rate.input,channels.input,protect])e.addEventListener('change',()=>{showQuality();changed();});
 function read():Settings{
  for(const input of effects.querySelectorAll<HTMLInputElement>('input[type=number]'))if(!input.validity.valid||!Number.isFinite(input.valueAsNumber))throw new RangeError(`${input.getAttribute('aria-label')}: enter a valid value.`);
  return {chain:audioSettings.chain(chain),output:audioSettings.output({format:format.input.value,bits:Number(bits.input.value),bitrate:Number(bitrate.input.value),sampleRate:Number(rate.input.value),channels:channels.input.value,preventClipping:protect.checked})};
 }
 function setDisabled(value:boolean){if(disabled===value)return;disabled=value;for(const root of [effects,exports])for(const e of root.querySelectorAll<HTMLInputElement>('input,select,button'))e.disabled=value;if(!value){render();showQuality();}}
 render();showQuality();return{effects,exports,read,setDisabled};
}
