import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createAudioChainControls} from './audio-chain-controls.ts';
test('AX07 chain controls reorder/bypass and validate editable values',()=>{
 const dom=new JSDOM('<body/>'),d=dom.window.document;const ui=createAudioChainControls(d,()=>{});d.body.append(ui.effects,ui.exports);
 assert.deepEqual(ui.read().chain.map(e=>e.kind),['lowpass','compressor','digital']);
 (d.querySelector('[aria-label="Move Muffle / low-pass down"]') as HTMLButtonElement).click();assert.equal(ui.read().chain[1]!.kind,'lowpass');
 const n=d.querySelector('[aria-label="Cutoff (Hz)"]') as HTMLInputElement;n.value='bad';assert.throws(()=>ui.read(),/valid|Cutoff/);n.value='6000';n.dispatchEvent(new dom.window.Event('input'));assert.equal(ui.read().chain[1]!.values.cutoff,6000);
 const bypass=d.querySelector('[aria-label="Enable Muffle / low-pass"]') as HTMLInputElement;bypass.click();assert.equal(ui.read().chain[1]!.enabled,false);
 ui.setDisabled(true);assert.ok([...d.querySelectorAll<HTMLInputElement>('input,select,button')].every(e=>e.disabled));dom.window.close();
});
