import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slidesDocument, type SlidesAction, type SlidesDocument } from './slides-document.ts';
const fresh = () => slidesDocument({ operation: 'new', slideId: 's1' });
const edit = (value: SlidesDocument, action: SlidesAction) => { const before = JSON.stringify(value); const next = slidesDocument({ operation: 'edit', value, action }); assert.equal(JSON.stringify(value), before); return next; };
const png = { id: 'pic', mime: 'image/png', width: 1, height: 1, data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jltUAAAAASUVORK5CYII=' };
test('P01 literal blank deck, text defaults and immutable owned values', () => {
  const blank = fresh();
  assert.deepEqual(blank, { width: 960, height: 540, theme: { background: '#ffffff', text: '#000000', accent: '#316ac5' }, slides: [{ id: 's1', name: 'Slide 1', background: '#ffffff', elements: [] }], images: [] });
  const next = edit(blank, { kind: 'element-add', slide: 's1', id: 'title', element: 'text' });
  assert.deepEqual(next.slides[0]!.elements, [{ id: 'title', kind: 'text', x: 60, y: 60, width: 480, height: 120, rotation: 0, text: 'Type your text', fontSize: 32, fontFamily: 'Arial', color: '#000000', bold: false, italic: false, align: 'left' }]);
  assert.equal(blank.slides[0]!.elements.length, 0); assert.ok(Object.isFrozen(next)); assert.ok(Object.isFrozen(next.slides[0]!.elements[0]));
  assert.throws(() => (next.slides[0]!.elements as unknown as unknown[]).push({}), TypeError);
});
test('P01 slide order, duplicate IDs, styles, geometry and last-slide protection', () => {
  let deck = edit(fresh(), { kind: 'element-add', slide: 's1', id: 'rect', element: 'rectangle' });
  deck = edit(deck, { kind: 'element-update', slide: 's1', id: 'rect', changes: { x: -5, y: 20, width: 40, height: 30, rotation: 45, fill: '#ff0000', strokeWidth: 2 } });
  deck = edit(deck, { kind: 'slide-duplicate', id: 's1', duplicateId: 's2', elementIds: ['copy'] });
  assert.deepEqual(deck.slides[1]!.elements[0], { ...deck.slides[0]!.elements[0], id: 'copy' });
  deck = edit(deck, { kind: 'slide-add', id: 's3', after: 's1' });
  assert.deepEqual(deck.slides.map(s => s.id), ['s1','s3','s2']);
  deck = edit(deck, { kind: 'slide-move', id: 's2', index: 0 });
  assert.deepEqual(deck.slides.map(s => s.id), ['s2','s1','s3']);
  deck = edit(deck, { kind: 'slide-name', id: 's2', name: '<script>text only</script>' });
  deck = edit(deck, { kind: 'slide-background', id: 's2', color: '#ddeeff' });
  deck = edit(deck, { kind: 'canvas', width: 960, height: 720 });
  assert.equal(deck.height, 720); assert.equal(deck.slides[0]!.background, '#ddeeff');
  for (const id of ['s3','s1']) deck = edit(deck, { kind: 'slide-remove', id });
  assert.throws(() => edit(deck, { kind: 'slide-remove', id: 's2' }), { name: 'SlidesEditError' });
});
test('P01 shapes, element order and native image assets roundtrip without sharing mutable bytes', () => {
  let deck = fresh();
  for (const [id, element] of [['r','rectangle'], ['e','ellipse']] as const) deck = edit(deck, { kind: 'element-add', slide: 's1', id, element });
  deck = edit(deck, { kind: 'element-add', slide: 's1', id: 'i', element: 'image', image: png });
  deck = edit(deck, { kind: 'element-layer', slide: 's1', id: 'r', index: 2 });
  assert.deepEqual(deck.slides[0]!.elements.map(e => e.id), ['e','i','r']);
  const encoded = slidesDocument({ operation: 'encode', value: deck });
  assert.deepEqual(encoded.content.images, [{ id: 'pic', mime: 'image/png', width: 1, height: 1 }]); assert.equal(encoded.assets.length, 1);
  assert.deepEqual(slidesDocument({ operation: 'decode', content: JSON.parse(JSON.stringify(encoded.content)), assets: encoded.assets }), deck);
  encoded.assets[0]!.bytes[0] = 0; assert.equal(deck.images[0]!.data, png.data);
  const duplicate = edit(deck, { kind: 'slide-duplicate', id: 's1', duplicateId: 's2', elementIds: ['e2','i2','r2'] });
  assert.equal(duplicate.images.length, 1);
  deck = edit(deck, { kind: 'element-remove', slide: 's1', id: 'i' }); assert.equal(deck.images.length, 0, 'unused image assets are removed');
});
test('P01 malformed documents, unsafe images, missing references and invalid edits reject atomically', () => {
  const deck = edit(fresh(), { kind: 'element-add', slide: 's1', id: 't', element: 'text' });
  const bad = (mutate: (x: any) => void) => { const value = structuredClone(deck); mutate(value); assert.throws(() => slidesDocument({ operation: 'read', value }), { name: 'SlidesContentError' }); };
  for (const mutate of [(v: any) => v.extra = 1, (v: any) => v.slides = [], (v: any) => v.slides.push(v.slides[0]), (v: any) => v.width = Infinity,
    (v: any) => v.theme.accent = 'url(https://remote)', (v: any) => v.slides[0].elements[0].x = NaN, (v: any) => v.slides[0].elements[0].width = 0,
    (v: any) => v.slides[0].elements[0].fontFamily = 'url(remote)', (v: any) => v.slides[0].elements[0].onload = 'bad()']) bad(mutate);
  const actions: SlidesAction[] = [{ kind: 'slide-add', id: 's1' }, { kind: 'slide-move', id: 's1', index: -1 }, { kind: 'slide-name', id: 'absent', name: 'no' },
    { kind: 'slide-duplicate', id: 's1', duplicateId: 's2', elementIds: [] }, { kind: 'element-update', slide: 's1', id: 't', changes: { width: 0 } },
    { kind: 'element-update', slide: 's1', id: 't', changes: { fill: '#ffffff' } }, { kind: 'element-remove', slide: 'absent', id: 't' },
    { kind: 'element-add', slide: 's1', id: 'img', element: 'image', image: { ...png, mime: 'image/svg+xml' } },
    { kind: 'element-add', slide: 's1', id: 'img', element: 'image', image: { ...png, data: 'https://remote/image.png' } }];
  for (const action of actions) assert.throws(() => edit(deck, action), { name: 'SlidesEditError' });
  const imageDeck = edit(deck, { kind: 'element-add', slide: 's1', id: 'img', element: 'image', image: png }), encoded = slidesDocument({ operation: 'encode', value: imageDeck });
  assert.throws(() => slidesDocument({ operation: 'decode', content: encoded.content, assets: [] }), /asset/i);
  assert.throws(() => slidesDocument({ operation: 'decode', content: encoded.content, assets: [...encoded.assets,...encoded.assets] }), /asset/i);
  assert.throws(() => slidesDocument({ operation: 'decode', content: encoded.content, assets: [{ ...encoded.assets[0]!, mime: 'image/jpeg' }] }), /asset/i);
});
test('P01 repeated bounded transforms and native roundtrips retain every source value', () => {
  let deck = edit(fresh(), { kind: 'element-add', slide: 's1', id: 't', element: 'text' });
  for (let i = 0; i < 120; i++) {
    deck = edit(deck, { kind: 'element-update', slide: 's1', id: 't', changes: { x: i - 60, y: 2 * i, width: i + 1, height: 20, rotation: i - 60, text: `Slide ${i}\n<literal>` } });
    const encoded = slidesDocument({ operation: 'encode', value: deck }); assert.deepEqual(slidesDocument({ operation: 'decode', ...encoded }), deck);
  }
});
test('P01 image payload validation remains bounded for ordinary multi-megabyte pictures', () => {
  const payload=Buffer.alloc(2*1024*1024);payload.set([137,80,78,71,13,10,26,10]);
  const deck=edit(fresh(),{kind:'element-add',slide:'s1',id:'image',element:'image',image:{...png,data:payload.toString('base64')}});
  assert.equal(slidesDocument({operation:'encode',value:deck}).assets[0]!.bytes.length,payload.length);
});
