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
    assert.equal(tablerPaths[name], paths, name);
    if (name.startsWith('paint')) continue; // PIR-01 deliberately overrides only Paint presentation.
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

test('PIR-04 native Paint source PNGs, licenses and generated data stay pinned and offline', () => {
  const directory = new URL('vendor/paint-icons/', root);
  const manifest = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8')) as {
    license: string; version: string; archiveSha256: string;
    fugueFiles: { file: string; upstreamPath: string; sha256: string }[];
    derived: Record<string, { source: string; sourceSha256: string; license: string }>;
  };
  assert.equal(manifest.license, 'CC-BY-3.0'); assert.equal(manifest.version, '3.5.6');
  assert.equal(manifest.archiveSha256, '59d54804343b9add8c96ea03bfb2fa3ff48f692459cf426c920a5612e771c37a');
  assert.equal(manifest.fugueFiles.length, 32);
  for (const source of manifest.fugueFiles) {
    const bytes = readFileSync(new URL(source.file, directory));
    assert.equal(source.upstreamPath, source.file.replace('fugue/', 'icons-shadowless/'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    assert.equal(bytes.readUInt32BE(16), 16); assert.equal(bytes.readUInt32BE(20), 16);
  }
  assert.equal(Object.keys(manifest.derived).length, 5);
  for (const source of Object.values(manifest.derived)) {
    assert.equal(source.license, 'MIT');
    assert.equal(createHash('sha256').update(readFileSync(new URL(source.source, directory))).digest('hex'), source.sourceSha256);
  }
  assert.equal(readFileSync(new URL('public/licenses/fugue-3.5.6.README.txt', root), 'utf8'), readFileSync(new URL('FUGUE-README.txt', directory), 'utf8'));
  const credits = readFileSync(new URL('public/icon-credits.html', root), 'utf8');
  assert.match(credits, /Yusuke Kamiyamane/); assert.match(credits, /https:\/\/creativecommons.org\/licenses\/by\/3.0\//);
  assert.match(credits, /raster derivatives/);
  const output = execFileSync(process.execPath, ['vendor/paint-icons/generate.mjs', '--check'], { cwd: fileURLToPath(root), encoding: 'utf8' });
  assert.match(output, /32 Fugue \+ 22 classic \+ 28 illustrated source hashes, 37 native bitmaps and 56 mappings verified/);
});

test('PIR-04 revised classic sources retain their hashes, license notices and editable distribution', () => {
  const directory = new URL('vendor/paint-icons/', root);
  const manifest = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8')) as {
    classicSources: { file: string; source: string; sha256: string; license: string }[];
    classicArtworkLicenses: Record<string, string>;
  };
  assert.equal(manifest.classicSources.length, 22);
  for (const source of manifest.classicSources) {
    assert.match(source.source, /^https:\/\/github.com\/(?:katahiromz\/RPaint|markjames\/famfamfam-silk-icons)\/blob\/[a-f0-9]{40}\//);
    assert.equal(createHash('sha256').update(readFileSync(new URL(source.file, directory))).digest('hex'), source.sha256);
  }
  assert.equal(Object.keys(manifest.classicArtworkLicenses).length, 37);
  assert.equal(Object.values(manifest.classicArtworkLicenses).filter(license => license === 'LGPL-2.0-or-later').length, 11);
  assert.equal(readFileSync(new URL('public/licenses/reactos-paint.LICENSE.txt', root), 'utf8'), readFileSync(new URL('reactos/LICENSE.txt', directory), 'utf8'));
  assert.equal(readFileSync(new URL('public/licenses/silk.README.txt', root), 'utf8'), readFileSync(new URL('silk/README.txt', directory), 'utf8'));
  const archive = readFileSync(new URL('public/licenses/classic-paint-artwork.zip', root));
  for (const source of ['paint-icons/reactos/iconbar.bmp', 'paint-icons/reactos/LICENSE.txt', 'paint-icons/provenance.json', 'paint-icons/classic/paintBrush.png']) assert.ok(archive.includes(Buffer.from(source)), source);
  const credits = readFileSync(new URL('public/icon-credits.html', root), 'utf8');
  assert.match(credits, /classic-paint-artwork.zip/); assert.match(credits, /Benedikt Freisen/); assert.match(credits, /Mark James/);
});

test('PIR-04 illustrated tools retain pinned artist sources, per-file licenses and offline source distribution', () => {
  const directory = new URL('vendor/paint-icons/', root);
  const manifest = JSON.parse(readFileSync(new URL('illustrated.json', directory), 'utf8')) as {
    sources: { file: string; url: string; sha256: string; author: string; license: string }[];
    recipes: Record<string, { source: string }>;
  };
  assert.equal(Object.keys(manifest.recipes).length, 19);
  const archive = readFileSync(new URL('public/licenses/classic-paint-artwork.zip', root));
  for (const source of manifest.sources) {
    assert.match(source.url, /\/[a-f0-9]{40}\//, source.file);
    assert.equal(createHash('sha256').update(readFileSync(new URL(source.file, directory))).digest('hex'), source.sha256, source.file);
    assert.ok(source.author && source.license);
    assert.ok(archive.includes(Buffer.from(`paint-icons/${source.file}`)), source.file);
  }
  for (const [name, recipe] of Object.entries(manifest.recipes)) {
    assert.ok(manifest.sources.some(source => source.file === recipe.source), name);
    assert.ok(archive.includes(Buffer.from(`paint-icons/illustrated/${name}.png`)), name);
  }
  for (const name of ['cc-by-sa-2.0.txt', 'cc-by-sa-4.0.txt', 'cc-by-4.0.txt', 'gpl-2.0.txt'])
    assert.equal(readFileSync(new URL(`public/licenses/${name}`, root), 'utf8'), readFileSync(new URL(`illustrated-sources/${name}`, directory), 'utf8'));
  const credits = readFileSync(new URL('public/icon-credits.html', root), 'utf8');
  for (const name of ['GIMP', 'KolourPaint', 'Jakub Steiner', 'Font Awesome']) assert.ok(credits.includes(name), name);
});
