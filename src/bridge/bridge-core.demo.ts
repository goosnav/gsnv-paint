// Run: node --import tsx src/bridge/bridge-core.demo.ts
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { imageContent } from '../image/image-content.ts';
import { videoTimeline, type VideoContent } from '../video/video-timeline.ts';
import { imageSource } from './image-source.ts';
import { transferRaster } from './transfer-contract.ts';
import { deliverRaster } from './destination-adapter.ts';
const value = imageContent({ operation: 'layers', previous: null, width: 2, height: 1, activeLayerId: 'top', layers: [
  { meta: { id: 'base', name: 'Base', visible: true, opacity: 1, blend: 'normal' }, raster: { width: 2, height: 1, data: new Uint8ClampedArray([0,0,255,255,0,0,0,0]) } },
  { meta: { id: 'top', name: 'Top', visible: true, opacity: 1, blend: 'normal' }, raster: { width: 2, height: 1, data: new Uint8ClampedArray([255,0,0,128,0,255,0,128]) } },
] });
const transfer = imageSource({ value, source: { workspace: 'image', documentId: 'demo-image', identity: 'revision-1', epoch: 1, viewRevision: 'ready' }, label: 'Two layers' });
assert.deepEqual([...transfer.pixels.rgba], [128,0,127,255,0,255,0,128]);
console.log('D02 composite:', [...transfer.pixels.rgba].join(','), '| source layers:', value.layers.length);
const copy = transferRaster(transfer); copy.pixels.rgba.fill(0); assert.equal(transfer.pixels.rgba[0],128);
console.log('D01 owned copy: true');
const delivery = await deliverRaster({ transfer, newId: 'demo-video', mediaId: 'demo-still' });
const video = delivery.document.value as VideoContent, encoded = videoTimeline({ operation: 'encode', value: video });
const png = Buffer.from(encoded.assets[0]!.bytes), idat: Buffer[] = [];
for (let i=8;i<png.length;) { const length=png.readUInt32BE(i); if(png.toString('ascii',i+4,i+8)==='IDAT')idat.push(png.subarray(i+8,i+8+length)); i+=12+length; }
assert.deepEqual([...inflateSync(Buffer.concat(idat))], [0,128,0,127,255,0,255,0,128]);
assert.equal(video.clips.length,0); assert.equal(video.media.length,1);
assert.deepEqual(videoTimeline({operation:'decode',content:encoded.content,assets:encoded.assets}),video);
console.log('D05/V02 PNG: exact straight RGBA | media: 1 | clips: 0 | frame: 1280x720 | native round trip: true');
