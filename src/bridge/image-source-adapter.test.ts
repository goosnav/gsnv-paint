import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSourceAdapter } from './image-source-adapter.ts';
import { imageContent } from '../image/image-content.ts';
test('D02 adapter blocks every pending operation without mutating or placing it, and captures only committed content', async () => {
  const value = imageContent({ operation: 'new', width: 2, height: 1, fill: [0,0,0,0] });
  let pending = '', snapshot: { id: string; identity: string; title: string; value: typeof value } | undefined = { id: 'i', identity: 'r1', title: 'Image', value };
  const bridge = imageSourceAdapter({ read: () => snapshot, pending: () => pending });
  const stamp = { workspace: 'image' as const, documentId: 'i', identity: 'r1', epoch: 1, viewRevision: bridge.revision() };
  const result = await bridge.capture({ route: 'image-to-video-bin' }, stamp, new AbortController().signal);
  assert.deepEqual([result.pixels.width, result.pixels.height], [2,1]); assert.equal(snapshot.value, value);
  for (const operation of ['floating selection','brush stroke','shape','marquee','opacity preview','image import']) {
    pending = operation; assert.notEqual(bridge.revision(), stamp.viewRevision); assert.throws(() => bridge.prepare('source'), error => error instanceof Error && error.name === 'BridgePendingEdit' && error.message.includes(operation));
    assert.throws(() => bridge.prepare('target'), /Finish or cancel/);
    await assert.rejects(bridge.capture({ route: 'image-to-video-bin' }, stamp, new AbortController().signal));
  }
  pending = ''; snapshot = undefined; bridge.prepare('target'); assert.throws(() => bridge.prepare('source'), /Open/);
});
