import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createAudioChainControls} from './audio-chain-controls.ts';
import {audioSettings} from './audio-effect-settings.ts';
test('AX07 chain controls reorder/bypass and validate editable values',()=>{
 const dom=new JSDOM('<body/>'),d=dom.window.document;const ui=createAudioChainControls(d,()=>{},{chain:audioSettings.preset('retro'),output:audioSettings.output()});d.body.append(ui.effects,ui.exports);
 assert.deepEqual(ui.read().chain.map(e=>e.kind),['lowpass','compressor','digital']);
 (d.querySelector('[aria-label="Move Muffle / low-pass down"]') as HTMLButtonElement).click();assert.equal(ui.read().chain[1]!.kind,'lowpass');
 const n=d.querySelector('[aria-label="Cutoff (Hz)"]') as HTMLInputElement;n.value='bad';assert.throws(()=>ui.read(),/valid|Cutoff/);n.value='6000';n.dispatchEvent(new dom.window.Event('input'));assert.equal(ui.read().chain[1]!.values.cutoff,6000);
 const bypass=d.querySelector('[aria-label="Enable Muffle / low-pass"]') as HTMLInputElement;bypass.click();assert.equal(ui.read().chain[1]!.enabled,false);
 ui.setDisabled(true);assert.ok([...d.querySelectorAll<HTMLInputElement>('input,select,button')].every(e=>e.disabled));dom.window.close();
});
test('AX07 fresh clean preview separates effect recipes from export presets and exposes help',()=>{
 const dom=new JSDOM('<body/>'),d=dom.window.document,ui=createAudioChainControls(d,()=>{});d.body.append(ui.effects,ui.exports);
 assert.deepEqual(ui.read().chain,[]);assert.equal(ui.read().output.bitrate,64);assert.equal(ui.read().output.format,'mp3');
 const sound=d.querySelector('[aria-label="Sound preset"]') as HTMLSelectElement;sound.value='swirl';sound.dispatchEvent(new dom.window.Event('change'));
 assert.deepEqual(ui.read().chain.map(e=>e.kind),['phaser','reverb']);const before=ui.read().output;
 const add=d.querySelector('[aria-label="Add effect"]') as HTMLSelectElement;add.value='flanger';[...ui.effects.querySelectorAll('button')].find(b=>b.textContent==='Add effect')!.click();
 assert.deepEqual(ui.read().chain.map(e=>e.kind),['phaser','reverb','flanger']);assert.deepEqual(ui.read().output,before);
 assert.ok(d.querySelector('[aria-label="Help: Flanger sweep"]'));assert.ok(d.querySelector('[aria-label="Help: Flanger feedback (%)"]'));dom.window.close();
});
