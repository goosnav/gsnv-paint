import test from 'node:test';
import assert from 'node:assert/strict';
import { bindImageEffectsWorker } from './image-effects.worker.ts';
import { quantizeImage } from './image-quantize.ts';
import { downpixelImage } from './image-downpixel.ts';

test('Effects endpoint delegates both operations and transfers only owned output', () => {
  const sent: { value: unknown; transfers: Transferable[] }[] = [];
  const port = { onmessage: null as ((event: MessageEvent<unknown>) => void) | null, postMessage(value: unknown, transfers: Transferable[] = []) { sent.push({ value, transfers }); } };
  const dispose = bindImageEffectsWorker(port), raster = { width: 2, height: 1, data: new Uint8ClampedArray([127, 127, 127, 255, 220, 220, 220, 255]) }, palette = { colours: [[0, 0, 0], [255, 255, 255]] as const, dither: 'none' as const }, before = raster.data.slice();
  port.onmessage!({ data: { id: 7, request: { kind: 'quantize', raster, palette } } } as MessageEvent);
  assert.deepEqual(sent[0]!.value, { id: 7, ok: true, value: quantizeImage(raster, palette) });
  const out = (sent[0]!.value as { value: typeof raster }).value; assert.deepEqual(sent[0]!.transfers, [out.data.buffer]); assert.notEqual(out.data.buffer, raster.data.buffer);
  port.onmessage!({ data: { id: 8, request: { kind: 'downpixel', raster, width: 1, height: 1, resize: false } } } as MessageEvent);
  assert.deepEqual(sent[1]!.value, { id: 8, ok: true, value: downpixelImage(raster, { width: 1, height: 1, resize: false }) }); assert.deepEqual(raster.data, before);
  dispose(); dispose(); assert.equal(port.onmessage, null);
});

test('Effects endpoint turns malformed transport and leaf validation into readable errors', () => {
  const sent: unknown[] = [], port = { onmessage: null as ((event: MessageEvent<unknown>) => void) | null, postMessage(value: unknown) { sent.push(value); } }, dispose = bindImageEffectsWorker(port);
  for (const input of [null, { id: 1, request: null }, { id: 2, request: { kind: 'script' } }, { id: 3, request: { kind: 'quantize', raster: null, palette: null } }, { id: 4, request: { kind: 'downpixel', raster: null, width: 0, height: 0, resize: false } }]) port.onmessage!({ data: input } as MessageEvent);
  assert.equal(sent.length, 5);
  for (const reply of sent as { id: number; ok: boolean; message: string }[]) { assert.equal(reply.ok, false); assert.ok(Number.isInteger(reply.id)); assert.ok(reply.message.length > 0 && reply.message.length <= 500); }
  dispose();
});
