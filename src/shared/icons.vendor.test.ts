import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { iconCatalog, renderIcon } from './icons.ts';
import { tablerPaths } from './tabler-paths.ts';

const root = new URL('../../', import.meta.url);
const vendor = new URL('vendor/tabler/', root);
const provenance = JSON.parse(readFileSync(new URL('provenance.json', vendor), 'utf8')) as {
  source: string; version: string; tag: string; commit: string; license: string;
  glyphs: Record<string, string>; files: { file: string; upstreamPath: string; sha256: string }[];
};

test('PU-03 pinned official Tabler sources retain their documented SHA-256 hashes', () => {
  assert.equal(provenance.source, 'https://github.com/tabler/tabler-icons');
  assert.equal(provenance.version, '3.52.0');
  assert.equal(provenance.tag, 'v3.52.0');
  assert.equal(provenance.commit, '4581ad20d8d13e24f6c3be75caaea1c4ad6c4b35');
  assert.equal(provenance.license, 'MIT');
  assert.equal(provenance.files.length, 48);
  for (const source of provenance.files) {
    assert.match(source.file, /^(?:[a-z0-9-]+\.svg|LICENSE)$/);
    assert.equal(source.upstreamPath, source.file === 'LICENSE' ? 'LICENSE' : `icons/outline/${source.file}`);
    const bytes = readFileSync(new URL(source.file, vendor));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.file);
  }
});

test('PU-03 all adopted glyphs exactly preserve upstream path geometry and stroke style', () => {
  const document = new JSDOM('<!doctype html>').window.document;
  assert.equal(Object.keys(provenance.glyphs).length, 65);
  assert.deepEqual(Object.keys(tablerPaths), Object.keys(provenance.glyphs));
  assert.equal(Object.isFrozen(tablerPaths), true);
  for (const [name, source] of Object.entries(provenance.glyphs)) {
    assert.ok(iconCatalog.includes(name), name);
    const svg = new JSDOM(readFileSync(new URL(`${source}.svg`, vendor), 'utf8'), { contentType: 'image/svg+xml' }).window.document.documentElement;
    const rendered = renderIcon({ document, name, label: name, size: 24 });
    assert.deepEqual([...svg.children].map(path => path.tagName), [...svg.children].map(() => 'path'));
    const paths = [...svg.children].map(path => {
      assert.deepEqual(path.getAttributeNames(), ['d'], source);
      return path.getAttribute('d');
    }).join(' ');
    assert.equal(rendered.querySelector('path')!.getAttribute('d'), paths, name);
    for (const key of ['viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'])
      assert.equal(rendered.getAttribute(key), svg.getAttribute(key), `${name}: ${key}`);
  }
});

test('PU-03 complete MIT license ships with the application and identifies Tabler in notices', () => {
  const license = readFileSync(new URL('LICENSE', vendor), 'utf8');
  assert.match(license, /^MIT License\n/);
  assert.match(license, /Copyright \(c\) 2020-2026 Paweł Kuna/);
  assert.match(license, /The above copyright notice and this permission notice shall be included/);
  assert.equal(readFileSync(new URL('public/licenses/tabler-3.52.0.LICENSE.txt', root), 'utf8'), license);
  assert.match(readFileSync(new URL('public/THIRD_PARTY_NOTICES.txt', root), 'utf8'), /Tabler Icons 3\.52\.0[\s\S]*licenses\/tabler-3\.52\.0\.LICENSE\.txt/);
});

test('PU-03 checked-in glyph data is reproducible from the vendored subset without network access', () => {
  const output = execFileSync(process.execPath, ['vendor/tabler/generate.mjs', '--check'], { cwd: fileURLToPath(root), encoding: 'utf8' });
  assert.match(output, /47 source hashes and 65 catalog mappings verified/);
});
