/**
 * PURPOSE    Present contextual audio help on demand.
 * KIND       SHELL
 * CONTRACT   Document, controls root, AudioHelp -> accessible question-mark button.
 *            Activation shows one helper per wizard; Close/Escape returns focus to trigger.
 * GUARANTEES Text-only rendering; Escape stays inside help; no document/window listeners.
 * TUNING     Layout and touch target sizing live in audio-workspace.css.
 * DECISIONS  D1: Explicit popup supports touch/keyboard. Alternative: title tooltips need hover.
 *            Revisit if: the shared help system gains contextual popovers.
 * LIMITS     Host owns removal of its controls; help never changes effects or playback.
 * TESTBENCH  node --import tsx --test src/audio/audio-help-popup.test.ts
 * DEMO       npm run dev; Audio > Effects & batch > Effects > ?
 */
import type {AudioHelp} from './audio-effect-guide.ts';
let serial=0;
export function audioHelpButton(d:Document,scope:HTMLElement,help:AudioHelp):HTMLButtonElement {
 const trigger=d.createElement('button');trigger.type='button';trigger.textContent='?';trigger.className='audio-help-trigger';
 trigger.setAttribute('aria-label',`Help: ${help.title}`);trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.title=`About ${help.title}`;
 let dismiss:(focus?:boolean)=>void=()=>{};
 trigger.onclick=()=>{
  if(trigger.getAttribute('aria-expanded')==='true'){dismiss();return;}
  const owner=scope.closest<HTMLElement>('.audio-processing-wizard')??scope;
  for(const open of owner.querySelectorAll('[data-audio-help-panel]'))open.dispatchEvent(new d.defaultView!.Event('audio-help-close'));
  const panel=d.createElement('div'),title=d.createElement('h4'),close=d.createElement('button');panel.className='audio-help-popup';panel.dataset.audioHelpPanel='';panel.id=`audio-help-${++serial}`;panel.setAttribute('role','dialog');panel.setAttribute('aria-label',`${help.title} help`);
  title.textContent=help.title;panel.append(title);
  for(const [label,text] of [['',help.what],['Lower',help.lower],['Higher',help.higher],['Try this',help.start],['',help.note]]){
   if(!text)continue;const p=d.createElement('p');if(label){const strong=d.createElement('strong');strong.textContent=`${label}: `;p.append(strong);}p.append(d.createTextNode(text));panel.append(p);
  }
  close.type='button';close.textContent='Close help';close.className='audio-help-close';panel.append(close);
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();}};
  const outside=(event:Event)=>{const target=event.target as Node;if(!panel.contains(target)&&!trigger.contains(target))dismiss(false);};
  dismiss=(focus=true)=>{panel.remove();owner.removeEventListener('keydown',key,true);owner.removeEventListener('pointerdown',outside,true);trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');if(focus&&trigger.isConnected)trigger.focus();};
  close.onclick=()=>dismiss();panel.addEventListener('audio-help-close',()=>dismiss(false));owner.addEventListener('keydown',key,true);owner.addEventListener('pointerdown',outside,true);
  trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',panel.id);owner.append(panel);close.focus();
 };
 return trigger;
}
