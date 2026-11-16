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

test('S09/PU-03 golden accessible Tabler close glyph', () => {
  const svg = fake(renderIcon({ document, name: 'close', label: 'Close', size: 16 }));
  assert.deepEqual({ ...svg }, {
    namespace: 'http://www.w3.org/2000/svg', tag: 'svg', textContent: '',
    attributes: { viewBox: '0 0 24 24', width: '16', height: '16', role: 'img', 'aria-label': 'Close',
      focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'shape-rendering': 'auto', 'data-icon': 'close' },
    children: [Object.assign(new Element('http://www.w3.org/2000/svg', 'title'), { textContent: 'Close' }),
      Object.assign(new Element('http://www.w3.org/2000/svg', 'path'), { attributes: { d: 'M18 6l-12 12 M6 6l12 12' } })],
  });
});

test('S09 every catalog name renders local artwork and an accessible name', () => {
  assert.equal(new Set(iconCatalog).size, iconCatalog.length);
  for (const name of iconCatalog) {
    const svg = fake(renderIcon({ document, name, label: name, size: 24 }));
    assert.equal(svg.attributes['aria-label'], name);
    if (name.startsWith('paint')) {
      assert.equal(svg.attributes.viewBox, name === 'paintTransform' ? '0 0 16 16' : '0 0 24 24');
      assert.deepEqual(svg.children.map(child => child.tag), ['title', 'image']);
      assert.match(svg.children[1]!.attributes.href!, /^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    } else {
      assert.equal(svg.attributes.viewBox, '0 0 24 24');
      assert.deepEqual(svg.children.map(child => child.tag), ['title', 'path']);
      assert.match(svg.children[1]!.attributes.d!, /^M/);
      assert.ok(!JSON.stringify(svg).match(/(?:href|<script|data:|https:)/));
    }
  }
});

test('PIR-01 Paint tools use distinct native 24px artwork while transform remains a 16px command', () => {
  const images = new Set<string>();
  for (const name of iconCatalog.filter(name => name.startsWith('paint'))) {
    const nativeSize = name === 'paintTransform' ? 16 : 24;
    const svg = fake(renderIcon({ document, name, label: name, size: nativeSize }));
    assert.equal(svg.attributes.viewBox, `0 0 ${nativeSize} ${nativeSize}`, name);
    assert.equal(svg.attributes['data-icon-style'], 'paint-bitmap');
    assert.equal(svg.children[1]!.tag, 'image');
    assert.match(svg.children[1]!.attributes.style!, /image-rendering:pixelated/);
    const uri = svg.children[1]!.attributes.href!;
    assert.ok(!images.has(uri), `${name} needs a distinct silhouette`);
    const bytes = Buffer.from(uri.split(',')[1]!, 'base64');
    assert.equal(bytes.readUInt32BE(16), nativeSize); assert.equal(bytes.readUInt32BE(20), nativeSize);
    assert.equal(svg.children[1]!.attributes.width, String(nativeSize));
    assert.equal(svg.children[1]!.attributes.height, String(nativeSize));
    images.add(uri);
  }
  assert.equal(images.size, 20); // 19 tools plus the separate free-transform command.
});

test('PIR-02 Paint aliases and themed commands match; default shared and workspace art stays vector', () => {
  for (const name of ['move', 'select', 'lasso', 'wand', 'pencil', 'brush', 'airbrush', 'eraser', 'clone', 'blur', 'smudge', 'fill', 'gradient', 'picker', 'text', 'line', 'rectangle', 'ellipse', 'ellipseSelect']) {
    const paint = `paint${name[0]!.toUpperCase()}${name.slice(1)}`;
    const themed = fake(renderIcon({ document, name, label: name, size: 16, theme: 'paint' }));
    const alias = fake(renderIcon({ document, name: paint, label: name, size: 16 }));
    assert.equal(themed.children[1]!.attributes.href, alias.children[1]!.attributes.href);
    assert.equal(fake(renderIcon({ document, name, label: name, size: 16 })).children[1]!.tag, 'path');
  }
  for (const name of ['app', 'image', 'cad', 'photo', 'video', 'document', 'slides', 'audio', 'spreadsheet', 'code']) {
    const original = fake(renderIcon({ document, name, label: name, size: 18 }));
    assert.deepEqual(fake(renderIcon({ document, name, label: name, size: 18, theme: 'paint' })), original);
    assert.equal(original.children[1]!.tag, 'path');
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
