/**
 * PURPOSE    Present editable audio processing settings.
 * KIND       SHELL
 * CONTRACT   Document + optional initial settings -> effects/export elements with contextual help,
 *            read() validated owned settings, setDisabled(). Invalid values block read visibly.
 * GUARANTEES Text-only labels, numeric alternatives to sliders, no playback or persistence.
 * TUNING     Field bounds/defaults supplied by AX01; clean startup; preset replaces only the chain.
 * DECISIONS  D1: Native buttons/selects support keyboard/touch. Alternative: drag-only ordering excludes keys.
 *            Revisit if: drag ordering is requested in addition to these buttons.
 * LIMITS     Up to 12 effects. Export fields hide irrelevant quality controls.
 * TESTBENCH  node --import tsx --test src/audio/audio-chain-controls.test.ts
 * DEMO       npm run dev; Audio > Effects & batch > Effects
 */
import {audioSettings,type AudioEffect,type AudioExport} from './audio-effect-settings.ts';
import {audioHelpButton} from './audio-help-popup.ts';
import {createAudioExportControls} from './audio-export-controls.ts';
type Settings={chain:AudioEffect[];output:AudioExport};
export function createAudioChainControls(d:Document,changed:()=>void,initial?:Settings){
 let chain=audioSettings.chain(initial?.chain??[]),disabled=false;
 const catalog=audioSettings.catalog(),output=createAudioExportControls(d,changed,initial?.output);
 const make=<K extends keyof HTMLElementTagNameMap>(tag:K,text='')=>{const e=d.createElement(tag);e.textContent=text;return e;};
 const button=(text:string,action:()=>void)=>{const e=make('button',text);e.type='button';e.onclick=action;return e;};
 const select=(name:string,choices:readonly (readonly [string,string])[],value:string)=>{
  const label=make('label',name),input=make('select');input.setAttribute('aria-label',name);
  for(const[v,t]of choices){const o=make('option',t);o.value=v;input.append(o);}input.value=value;label.append(input);return{label,input};
 };
 const effects=make('section'),list=make('div');effects.className='audio-chain-controls';
 const preset=select('Sound preset',[
  ['clean','No effects — hear export compression'],['ambient','Soft ambience — muffle + reverb'],['swirl','Slow swirl — phaser + reverb'],
  ['retro','Digital grit — original Retro computer'],['dreamy','Digital grit + reverb'],['custom','Custom effects'],
 ],initial?'custom':'clean');
 preset.input.onchange=()=>{if(preset.input.value==='custom')return;chain=audioSettings.preset(preset.input.value as Parameters<typeof audioSettings.preset>[0]);render();changed();};
 const explanation=make('p','For a compressed music sound, start with no effects and choose Early web or Phone-sized in Export. Add ambience or movement to taste. Effects run from top to bottom; ? explains each control.');
 const add=select('Add effect',catalog.map(e=>[e.kind,e.label] as const),'reverb');
 const edited=()=>{preset.input.value='custom';changed();};
 const addButton=button('Add effect',()=>{if(chain.length<12){chain.push(audioSettings.effect(add.input.value as AudioEffect['kind']));render();edited();}});
 const addRow=make('div');addRow.className='audio-wizard-row';addRow.append(add.label,addButton);effects.append(preset.label,explanation,list,addRow);
 function render(){
  list.replaceChildren();
  if(!chain.length)list.append(make('p','No effects added. The processed preview still includes your export compression.'));
  chain.forEach((effect,index)=>{
   const definition=catalog.find(e=>e.kind===effect.kind)!,card=make('fieldset'),legend=make('legend'),row=make('div');row.className='audio-wizard-row';
   legend.append(make('span',`${index+1}. ${definition.label}`),audioHelpButton(d,effects,definition.help));
   const enabled=make('input');enabled.type='checkbox';enabled.checked=effect.enabled;enabled.setAttribute('aria-label',`Enable ${definition.label}`);
   const enableLabel=make('label','Enabled ');enableLabel.prepend(enabled);enabled.onchange=()=>{effect.enabled=enabled.checked;edited();};
   const move=(delta:number)=>{const target=index+delta;if(target<0||target>=chain.length)return;[chain[index],chain[target]]=[chain[target]!,chain[index]!];render();edited();};
   const up=button('↑',()=>move(-1)),down=button('↓',()=>move(1)),remove=button('Remove',()=>{chain.splice(index,1);render();edited();});
   up.setAttribute('aria-label',`Move ${definition.label} up`);down.setAttribute('aria-label',`Move ${definition.label} down`);up.disabled=index===0;down.disabled=index===chain.length-1;
   row.append(enableLabel,up,down,remove);card.append(legend,row,make('p',definition.description));
   for(const p of definition.parameters){
    const field=make('div'),heading=make('span',p.label),controls=make('span'),slider=make('input'),number=make('input');field.className='audio-effect-parameter';heading.className='audio-control-heading';
    heading.append(audioHelpButton(d,effects,p.help));slider.type='range';slider.className='xp-range';number.type='number';number.required=true;
    for(const input of [slider,number]){input.min=String(p.min);input.max=String(p.max);input.step=p.key==='bits'?'1':'any';input.value=String(effect.values[p.key]);input.setAttribute('aria-label',input===slider?`${p.label} slider`:p.label);}
    slider.step=String(p.step);slider.oninput=()=>{number.value=slider.value;effect.values[p.key]=slider.valueAsNumber;edited();};
    number.oninput=()=>{effect.values[p.key]=number.valueAsNumber;if(number.validity.valid)slider.value=number.value;edited();};
    controls.append(slider,number);field.append(heading,controls);card.append(field);
   }
   list.append(card);
  });
  addButton.disabled=disabled||chain.length>=12;
 }
 function read():Settings{
  for(const input of effects.querySelectorAll<HTMLInputElement>('input[type=number]'))if(!input.validity.valid||!Number.isFinite(input.valueAsNumber))throw new RangeError(`${input.getAttribute('aria-label')}: enter a valid value.`);
  return{chain:audioSettings.chain(chain),output:output.read()};
 }
 function setDisabled(value:boolean){
  if(disabled===value)return;disabled=value;output.setDisabled(value);
  for(const input of effects.querySelectorAll<HTMLInputElement>('input,select,button'))if(!input.closest('[data-audio-help-panel]'))input.disabled=value;
  if(!value)render();
 }
 render();return{effects,exports:output.element,read,setDisabled};
}
