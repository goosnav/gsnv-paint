import assert from 'node:assert/strict';
import test from 'node:test';
import { iconCatalog, renderIcon } from './icons.ts';

class Element {
  attributes: Record<string, string> = {};
  children: Element[] = [];
  textContent = '';
  constructor(readonly namespace: string, readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  append(...children: Element[]) { this.children.push(...children); }
}
const document = { createElementNS: (namespace: string, tag: string) => new Element(namespace, tag) } as unknown as Document;
const fake = (svg: SVGSVGElement) => svg as unknown as Element;

test('S09 golden accessible original close glyph', () => {
  const svg = fake(renderIcon({ document, name: 'close', label: 'Close', size: 16 }));
  assert.deepEqual({ ...svg }, {
    namespace: 'http://www.w3.org/2000/svg', tag: 'svg', textContent: '',
    attributes: { viewBox: '0 0 24 24', width: '16', height: '16', role: 'img', 'aria-label': 'Close',
      focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'square', 'stroke-linejoin': 'miter', 'shape-rendering': 'crispEdges', 'data-icon': 'close' },
    children: [Object.assign(new Element('http://www.w3.org/2000/svg', 'title'), { textContent: 'Close' }),
      Object.assign(new Element('http://www.w3.org/2000/svg', 'path'), { attributes: { d: 'M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5' } })],
  });
});

test('S09 every catalog glyph has unique original local path data and an accessible name', () => {
  const paths = new Set<string>();
  assert.equal(new Set(iconCatalog).size, iconCatalog.length);
  for (const name of iconCatalog) {
    const svg = fake(renderIcon({ document, name, label: name, size: 24 }));
    assert.equal(svg.attributes['aria-label'], name);
    assert.equal(svg.attributes.viewBox, '0 0 24 24');
    assert.deepEqual(svg.children.map(child => child.tag), ['title', 'path']);
    const path = svg.children[1]!.attributes.d!;
    assert.match(path, /^M/);
    assert.ok(!paths.has(path), name);
    paths.add(path);
    assert.ok(!JSON.stringify(svg).match(/(?:href|<script|data:|https:)/));
  }
});

test('S09 labels are literal text, repeated instances share no nodes or IDs', () => {
  const label = '<img src=x onerror=alert(1)>';
  const first = fake(renderIcon({ document, name: 'save', label, size: 12 }));
  const second = fake(renderIcon({ document, name: 'save', label, size: 12 }));
  assert.equal(first.children[0]!.textContent, label);
  assert.equal(first.attributes['aria-label'], label);
  assert.notEqual(first, second);
  assert.notEqual(first.children[1], second.children[1]);
  assert.ok(!('id' in first.attributes));
});

test('S09 inclusive size bounds and fractional CSS pixel sizes', () => {
  for (const size of [12, 20.5, 64]) {
    const svg = fake(renderIcon({ document, name: 'cad', label: 'CAD', size }));
    assert.equal(svg.attributes.width, String(size));
    assert.equal(svg.attributes.height, String(size));
  }
});

for (const size of [0, 11.9, 64.1, NaN, Infinity, -Infinity]) test(`S09 rejects invalid size ${size}`, () => {
  assert.throws(() => renderIcon({ document, name: 'cad', label: 'CAD', size }), RangeError);
});
for (const name of ['unknown', '', '__proto__', 'constructor']) test(`S09 rejects unknown name ${name}`, () => {
  assert.throws(() => renderIcon({ document, name, label: name, size: 16 }), RangeError);
});
