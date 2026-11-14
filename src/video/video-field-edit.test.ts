import test from 'node:test';
import assert from 'node:assert/strict';
import { videoFieldEdit } from './video-field-edit.ts';
import { videoTimeline } from './video-timeline.ts';
test('V31 pending inspector fields validate before one committed edit and retain the prior value on error', () => {
  const value = videoTimeline({ operation: 'edit', value: videoTimeline({ operation: 'new' }), op: { kind: 'add-media', media: { id: 'm', name: 'image', mime: 'image/png', kind: 'image', duration: 3, width: 64, height: 32 }, bytes: new Uint8Array([1]), clipId: 'c' } });
  const result = videoFieldEdit(value, 'c', 'fadeIn', '0.5'); assert.equal(result.label, 'Fade in'); assert.equal(result.value.clips[0]!.fadeIn, 0.5); assert.equal(value.clips[0]!.fadeIn, 0);
  for (const [field,text] of [['out',''],['fadeIn','no'],['fadeIn','4'],['volume','201'],['in','3'],['unknown','2']]) assert.throws(() => videoFieldEdit(value, 'c', field!, text!));
  assert.equal(videoFieldEdit(value, 'c', 'volume', '50').value.clips[0]!.volume, .5);
});
