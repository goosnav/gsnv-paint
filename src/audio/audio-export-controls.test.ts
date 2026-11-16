import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createAudioExportControls} from './audio-export-controls.ts';import {audioExport} from './audio-export-profile.ts';
test('AG05 presets, manual quality repair, visible estimates and disabled state',()=>{
 const dom=new JSDOM('<body/>'),d=dom.window.document;let changes=0;const ui=createAudioExportControls(d,()=>changes++);d.body.append(ui.element);
 const select=(name:string,value:string)=>{const e=d.querySelector(`[aria-label="${name}"]`) as HTMLSelectElement;e.value=value;e.dispatchEvent(new dom.window.Event('change'));};
 assert.deepEqual(ui.read(),audioExport.preset('web').output);assert.match(ui.element.textContent!,/480 kB\/min/);
 select('Export preset','minimum');assert.deepEqual(ui.read(),audioExport.preset('minimum').output);assert.match(ui.element.textContent!,/60 kB\/min/);
 select('Export preset','standard');select('MP3 quality','24');assert.equal(ui.read().sampleRate,8000);assert.match(d.querySelector('.audio-export-notice')!.textContent!,/44100.*8000/);
 select('Output channels','mono');select('Output sample rate','16000');assert.equal(ui.read().sampleRate,16000);
 select('Export format','wav');assert.equal((d.querySelector('[aria-label="WAV bit depth"]')!.closest('.audio-export-field') as HTMLElement).hidden,false);
 assert.ok(changes>=5);ui.setDisabled(true);assert.ok([...ui.element.querySelectorAll<HTMLInputElement>('input,select,button')].every(e=>e.disabled));dom.window.close();
});
test('AG05 old incompatible rates migrate with explanation instead of losing chosen bitrate',()=>{
 const dom=new JSDOM('<body/>');const ui=createAudioExportControls(dom.window.document,()=>{},{...audioExport.preset('web').output,sampleRate:44100});
 assert.equal(ui.read().sampleRate,24000);assert.equal(ui.read().bitrate,64);assert.match(ui.element.textContent!,/44100.*24000/);dom.window.close();
});
