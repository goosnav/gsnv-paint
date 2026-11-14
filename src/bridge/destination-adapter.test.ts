import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliverRaster } from './destination-adapter.ts';
import { imageContent, type ImageContent } from '../image/image-content.ts';
import { videoTimeline, type VideoContent } from '../video/video-timeline.ts';
import { transferRaster } from './transfer-contract.ts';
const pixels = () => ({ width: 2, height: 1, rgba: new Uint8ClampedArray([17,33,65,2,255,0,0,255]), colorSpace: 'srgb' as const, alpha: 'straight' as const });
test('D05 materializes an independent editable native Image with original dimensions/alpha', async () => {
  const transfer = transferRaster({ version: 1, route: 'cad-viewport-to-image', label: 'Solid', background: 'transparent', source: { workspace: 'cad', documentId: 'cad', identity: 'r1', epoch: 1, viewRevision: 'v1' }, pixels: pixels() });
  const out = await deliverRaster({ transfer, newId: 'image-new', mediaId: 'still' }); assert.equal(out.workspace, 'image'); assert.equal(out.document.id, 'image-new');
  const encoded = imageContent({ operation: 'encode', value: out.document.value as ImageContent });
  assert.deepEqual([...encoded.assets[0]!.bytes], [...transfer.pixels.rgba]); transfer.pixels.rgba.fill(0); assert.deepEqual([...encoded.assets[0]!.bytes], [17,33,65,2,255,0,0,255]);
  assert.deepEqual(imageContent({ operation: 'encode', value: imageContent({ operation: 'decode', content: encoded.content, assets: encoded.assets }) }), encoded);
});
test('D05 appends one generated still without modifying target, resizing or adding a clip', async () => {
  const transfer = transferRaster({ version: 1, route: 'image-to-video-bin', label: 'Layered image', source: { workspace: 'image', documentId: 'image', identity: 'r2', epoch: 2, viewRevision: 'r2' }, pixels: pixels() });
  const target = { id: 'video', title: 'My timeline', format: 'gsnv-video' as const, version: 1, value: videoTimeline({ operation: 'new', width: 640, height: 480 }) };
  const out = await deliverRaster({ transfer, target, newId: 'unused', mediaId: 'generated' });
  assert.equal(out.kind, 'append'); assert.equal(out.document.id, 'video'); assert.equal(out.document.title, 'My timeline'); assert.equal(target.value.media.length, 0);
  const value = out.document.value as VideoContent; assert.deepEqual([value.width,value.height,value.clips.length,value.media.length], [640,480,0,1]);
  const encoded = videoTimeline({ operation: 'encode', value }); assert.equal(encoded.assets[0]!.id, 'media-generated'); assert.equal(encoded.assets[0]!.mime, 'image/png');
  assert.deepEqual(videoTimeline({ operation: 'decode', content: encoded.content, assets: encoded.assets }), value);
  const fresh = await deliverRaster({ transfer, newId: 'new-video', mediaId: 'new-still' }); assert.equal(fresh.kind, 'append'); assert.equal(fresh.document.id, 'new-video'); assert.ok(fresh.kind === 'append' && fresh.initial);
  await assert.rejects(deliverRaster({ transfer, target: out.document, newId: 'unused', mediaId: 'generated' }));
});
