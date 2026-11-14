import test from 'node:test';
import assert from 'node:assert/strict';
import { saveChoices } from './save-choices.ts';

test('S22 Image choices name the editable project and PNG without inventing JPEG', () => {
  assert.deepEqual(saveChoices({ workspace: 'image', projectEnabled: true, commands: [{ id: 'image.exportPNG', enabled: true }, { id: 'unrelated', enabled: true }] }), [
    { id: 'file.save', label: 'Save project file…', description: '.gsnv-image · Keep layers and edits', shortcut: 'Ctrl+S', icon: 'save', enabled: true },
    { id: 'image.exportPNG', label: 'Save PNG image…', description: '.png · Flattened image with transparency', shortcut: '', icon: 'image', enabled: true },
  ]);
});
test('S22 every workspace exposes only its declared present formats in stable order', () => {
  const formats = { cad: ['cad.exportSTEP','cad.exportSTL'], image: ['image.exportPNG'], photo: ['photo.export'], video: ['video.export'], document: ['doc.pdf','doc.html','doc.text'], slides: ['slides.pdf'], audio: ['audio.export'], spreadsheet: ['sheet.xlsx','sheet.csv'], code: ['code.export'] };
  const commands = Object.values(formats).flat().reverse().map(id => Object.freeze({ id, enabled: true })); Object.freeze(commands);
  for (const [workspace, ids] of Object.entries(formats)) {
    const request = Object.freeze({ workspace, projectEnabled: false, commands });
    assert.deepEqual(saveChoices(request).map(c => c.id), ['file.save', ...ids]);
    assert.equal(saveChoices(request)[0]!.enabled, false);
    assert.deepEqual(saveChoices({ ...request, commands: [] }).map(c => c.id), ['file.save']);
    const result=saveChoices(request); result[0]!.label='changed'; assert.equal(saveChoices(request)[0]!.label,'Save project file…');
  }
});
test('S22 disabled exporters remain disabled and unavailable exporters are absent', () => {
  const choices=saveChoices({ workspace:'cad',projectEnabled:true,commands:[{id:'cad.exportSTEP',enabled:false}] });
  assert.deepEqual(choices.map(c=>[c.id,c.enabled]),[['file.save',true],['cad.exportSTEP',false]]);
});
test('S22 rejects malformed input and duplicate commands', () => {
  for (const request of [null, {}, {workspace:'unknown',projectEnabled:true,commands:[]}, {workspace:'__proto__',projectEnabled:true,commands:[]}, {workspace:'image',projectEnabled:1,commands:[]}, {workspace:'image',projectEnabled:true,commands:[{id:'',enabled:true}]}, {workspace:'image',projectEnabled:true,commands:[{id:'x',enabled:true},{id:'x',enabled:false}]}]) assert.throws(()=>saveChoices(request as never),TypeError);
});
