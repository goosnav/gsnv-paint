import { test } from 'node:test'; import assert from 'node:assert/strict'; import { JSDOM } from 'jsdom';
import { slidesDocument } from './slides-document.ts'; import { slidesScene } from './slides-scene.ts';
test('P02 scene renders safe text and exact clipped positioned shapes', () => {
  const doc = new JSDOM('<body>').window.document;
  let deck = slidesDocument({ operation: 'new', slideId: 's' });
  deck = slidesDocument({ operation: 'edit', value: deck, action: { kind: 'element-add', slide: 's', id: 't', element: 'text' } });
  deck = slidesDocument({ operation: 'edit', value: deck, action: { kind: 'element-update', slide: 's', id: 't', changes: { text: '<img onerror=evil()>\nText', x: 10, y: 20, rotation: 45 } } });
  deck = slidesDocument({ operation: 'edit', value: deck, action: { kind: 'element-add', slide: 's', id: 'e', element: 'ellipse' } });
  const scene = slidesScene(doc, deck, 's');
  assert.equal(scene.style.width, '960px'); assert.equal(scene.style.height, '540px'); assert.equal(scene.style.overflow, 'hidden');
  assert.equal(scene.querySelector('img'), null); assert.match(scene.textContent!, /<img onerror=evil\(\)>/);
  const text = scene.querySelector<HTMLElement>('[data-element-id="t"]')!;
  assert.equal(text.style.left, '10px'); assert.equal(text.style.top, '20px'); assert.equal(text.style.transform, 'rotate(45deg)');
  assert.equal(scene.querySelector<HTMLElement>('[data-element-id="e"]')!.style.borderRadius, '50%');
  assert.throws(() => slidesScene(doc, deck, 'missing'), /slide/i); assert.throws(() => slidesScene(null as unknown as Document, deck, 's'), TypeError);
});
