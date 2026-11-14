import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { videoMediaBin } from './video-media-bin.ts';
import { videoTimeline } from './video-timeline.ts';
test('V31 bin keeps placement and deletion explicit, labels dimensions, and protects referenced media', () => {
  const dom = new JSDOM('<main></main>'), root = dom.window.document.querySelector('main')!, actions: unknown[] = [];
  const bin = videoMediaBin({ root, action: (kind,id) => actions.push([kind,id]) });
  let value = videoTimeline({ operation: 'edit', value: videoTimeline({ operation: 'new' }), op: { kind: 'import-media', media: { id: 'still', name: '<script>sample.png', mime: 'image/png', kind: 'image', width: 64, height: 32, duration: 3 }, bytes: new Uint8Array([1]) } });
  bin.update(value, () => 'blob:local'); assert.equal(root.querySelector('script'), null); assert.match(root.textContent!, /64 × 32/); assert.equal(root.querySelector('img')?.getAttribute('src'), 'blob:local');
  root.querySelector<HTMLButtonElement>('[data-bin-action=place]')!.click(); root.querySelector<HTMLButtonElement>('[data-bin-action=remove]')!.click(); assert.deepEqual(actions, [['place','still'],['remove','still']]);
  assert.equal(value.clips.length, 0); value = videoTimeline({ operation: 'edit', value, op: { kind: 'place-media', mediaId: 'still', clipId: 'clip' } });
  bin.update(value, () => 'blob:local'); const remove = root.querySelector<HTMLButtonElement>('[data-bin-action=remove]')!; assert.equal(remove.disabled, true); assert.match(remove.title, /timeline clips/); remove.click(); assert.equal(actions.length, 2);
  bin.update(null, () => undefined); assert.match(root.textContent!, /Empty/); bin.dispose(); assert.equal(root.childElementCount, 0); dom.window.close();
});
