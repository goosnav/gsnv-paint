import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {audioHelpButton} from './audio-help-popup.ts';import {audioHelp} from './audio-effect-guide.ts';
test('AG04 question help is text-safe, single, dismissible, focus-restoring and isolates Escape',()=>{
 const dom=new JSDOM('<body><div class="audio-processing-wizard"></div></body>'),d=dom.window.document,root=d.querySelector('div')!;let outerEsc=0;d.addEventListener('keydown',e=>{if(e.key==='Escape')outerEsc++;});
 const one=audioHelpButton(d,root,{...audioHelp('compressor'),title:'<script>help</script>'}),two=audioHelpButton(d,root,audioHelp('reverb'));root.append(one,two);
 assert.equal(one.textContent,'?');one.click();assert.equal(one.getAttribute('aria-expanded'),'true');assert.equal(root.querySelectorAll('script').length,0);assert.match(root.querySelector('[role=dialog]')!.textContent!,/not file size/);
 two.click();assert.equal(root.querySelectorAll('[role=dialog]').length,1);assert.equal(one.getAttribute('aria-expanded'),'false');
 d.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(outerEsc,0);assert.equal(root.querySelector('[role=dialog]'),null);assert.equal(d.activeElement,two);
 one.click();(root.querySelector('.audio-help-close') as HTMLButtonElement).click();assert.equal(d.activeElement,one);assert.equal(one.getAttribute('aria-expanded'),'false');
 one.click();root.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}));assert.equal(root.querySelector('[role=dialog]'),null);dom.window.close();
});
