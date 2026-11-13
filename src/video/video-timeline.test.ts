import { test } from 'node:test'; import assert from 'node:assert/strict';
import { videoTimeline, duration, starts, type Media, type VideoContent } from './video-timeline.ts';

const video: Media = { id: 'v', name: 'beach.webm', mime: 'video/webm', kind: 'video', duration: 10, width: 1920, height: 1080 };
const still: Media = { id: 'i', name: 'logo.png', mime: 'image/png', kind: 'image', duration: 1, width: 800, height: 600 };
const edit = (value: VideoContent, op: Parameters<typeof videoTimeline>[0] extends infer R ? R extends { op: infer O } ? O : never : never) => videoTimeline({ operation: 'edit', value, op });

test('V-TIMELINE clips play in sequence; images take a chosen duration; first clip sets the frame size', () => {
  let v = videoTimeline({ operation: 'new' }); assert.equal(duration(v), 0); assert.equal(videoTimeline({ operation: 'locate', value: v, time: 0 }), null);
  v = edit(v, { kind: 'add-media', media: video, bytes: new Uint8Array([1]), clipId: 'a' }); assert.deepEqual([v.width, v.height], [1920, 1080]);
  v = edit(v, { kind: 'add-media', media: still, bytes: new Uint8Array([2]), clipId: 'b', imageSeconds: 4 });
  assert.equal(duration(v), 14); assert.deepEqual(starts(v), [0, 10]);
  assert.deepEqual(videoTimeline({ operation: 'locate', value: v, time: 12 })!.clip.id, 'b'); assert.equal(videoTimeline({ operation: 'locate', value: v, time: 14 })!.offset, 4);
  assert.throws(() => edit(v, { kind: 'add-media', media: video, bytes: new Uint8Array([1]), clipId: 'c' }), { name: 'VideoEditError' });
});

test('V-TIMELINE trim, split, move, fades, volume and delete keep the sequence consistent', () => {
  let v = edit(edit(videoTimeline({ operation: 'new' }), { kind: 'add-media', media: video, bytes: new Uint8Array([1]), clipId: 'a' }), { kind: 'add-media', media: still, bytes: new Uint8Array([2]), clipId: 'b' });
  v = edit(v, { kind: 'trim', id: 'a', in: 2, out: 8 }); assert.equal(duration(v), 9);
  v = edit(v, { kind: 'split', time: 4, newId: 'a2' }); assert.deepEqual(v.clips.map(c => [c.id, c.in, c.out]), [['a', 2, 6], ['a2', 6, 8], ['b', 0, 3]]);
  assert.throws(() => edit(v, { kind: 'split', time: 4.05, newId: 'z' }), /0.1 s/);
  v = edit(v, { kind: 'move', id: 'b', index: 0 }); assert.deepEqual(v.clips.map(c => c.id), ['b', 'a', 'a2']);
  v = edit(v, { kind: 'clip', id: 'a', fadeIn: 1, fadeOut: 1, volume: 0.5 });
  const at = videoTimeline({ operation: 'locate', value: v, time: 3.5 })!; assert.equal(at.clip.id, 'a'); assert.ok(Math.abs(at.fade - 0.5) < 1e-9); assert.equal(at.source, 2.5);
  assert.throws(() => edit(v, { kind: 'clip', id: 'a', fadeIn: 3, fadeOut: 3 }), /fades must fit/);
  assert.throws(() => edit(v, { kind: 'trim', id: 'a', in: 5, out: 11 }), /inside the source/);
  v = edit(v, { kind: 'delete', id: 'b' }); assert.deepEqual(v.media.map(m => m.id), ['v']); assert.equal(v.bytes.has('i'), false);
});

test('V-TIMELINE titles validate and the project round-trips through the native encoding', () => {
  let v = edit(videoTimeline({ operation: 'new' }), { kind: 'add-media', media: video, bytes: new Uint8Array([7, 8]), clipId: 'a' });
  v = edit(v, { kind: 'title', title: { id: 't', text: 'Hello', start: 1, duration: 2, size: 64, color: '#ffffff', position: 'bottom', background: true } });
  assert.throws(() => edit(v, { kind: 'title', title: { ...v.titles[0]!, color: 'white' } }), { name: 'VideoEditError' });
  const encoded = videoTimeline({ operation: 'encode', value: v }); assert.deepEqual(encoded.assets.map(a => a.id), ['media-v']);
  const decoded = videoTimeline({ operation: 'decode', content: JSON.parse(JSON.stringify(encoded.content)), assets: encoded.assets });
  assert.deepEqual({ ...decoded, bytes: [...decoded.bytes] }, { ...v, bytes: [...v.bytes] });
  assert.throws(() => videoTimeline({ operation: 'decode', content: { ...encoded.content, extra: 1 }, assets: encoded.assets }), { name: 'VideoContentError' });
  assert.throws(() => videoTimeline({ operation: 'decode', content: encoded.content, assets: [] }), /missing/);
  v = edit(v, { kind: 'delete-title', id: 't' }); assert.equal(v.titles.length, 0);
});
