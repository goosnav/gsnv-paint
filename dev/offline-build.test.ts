import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offlineBuild } from './offline-build.ts';

const buildId = 'c'.repeat(64);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gsnv-offline-build-'));
  await mkdir(join(root, 'public/assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><html><head><title>Fixture</title></head><body><script type="module" src="/main.js"></script></body></html>');
  await writeFile(join(root, 'main.js'), "window.loadLazy = () => import('./lazy.js');");
  await writeFile(join(root, 'lazy.js'), "export const worker = () => new Worker(new URL('./lazy.worker.js', import.meta.url), {type:'module'}); export const binary = new URL('./lazy.bin', import.meta.url).href;");
  await writeFile(join(root, 'lazy.worker.js'), "self.onmessage = () => self.postMessage('working');");
  await writeFile(join(root, 'lazy.bin'), new Uint8Array([0, 1, 2, 3]));
  const runtimes = ['replicad_single-test.wasm', 'replicad_single-test.js', 'planegcs-test.wasm', 'planegcs-test.js', 'libraw-test.wasm', 'libraw-test.js',
    'worker-test.js', 'photo-develop.worker-test.js', 'cad-workspace.worker-test.js', 'cad-step-export.worker-test.js', 'code-runtime-test.js',
    'pyodide.asm-test.wasm', 'python_stdlib-test.zip', 'pyodide-lock-test.json'];
  for (const name of runtimes) await writeFile(join(root, 'public/assets', name), name.endsWith('.js') ? '/* miniature test runtime */' : 'test');
  await writeFile(join(root, 'public/_headers'), '/*\n  Cross-Origin-Opener-Policy: same-origin\n');
  const output = join(root, 'dist');
  const run = (id = buildId) => build({ configFile: false, root, logLevel: 'silent', plugins: [offlineBuild({ buildId: id })], build: { outDir: output, assetsInlineLimit: 0 } });
  return { root, output, run, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('S17 inventories unvisited worker/binary output with exact hashes and stable build identity', async () => {
  const f = await fixture();
  try {
    await f.run();
    const manifest = JSON.parse(await readFile(join(f.output, 'offline-manifest.json'), 'utf8'));
    assert.equal(manifest.build, buildId); assert.equal(manifest.schema, 1);
    assert.match(await readFile(join(f.output, 'index.html'), 'utf8'), new RegExp(`name="gsnv-build-id" content="${buildId}"`));
    assert.match(await readFile(join(f.output, 'offline-sw.js'), 'utf8'), new RegExp(buildId));
    assert.ok(manifest.assets.some((a: { url: string }) => /lazy\.worker-.*\.js$/.test(a.url)));
    assert.ok(manifest.assets.some((a: { url: string }) => /lazy-.*\.bin$/.test(a.url)));
    const paths = manifest.assets.map((a: { url: string }) => a.url);
    assert.ok(!paths.includes('/_headers') && !paths.includes('/offline-sw.js') && !paths.includes('/offline-manifest.json'));
    const files = (await readdir(f.output, { recursive: true, withFileTypes: true })).filter(f => f.isFile());
    assert.equal(manifest.assets.length, files.length - 3);
    for (const asset of manifest.assets) {
      const bytes = await readFile(join(f.output, decodeURIComponent(asset.url)));
      assert.equal(bytes.length, asset.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    }
    await writeFile(join(f.root, 'public/new-notice.txt'), 'new public content'); await f.run('d'.repeat(64));
    const next = JSON.parse(await readFile(join(f.output, 'offline-manifest.json'), 'utf8'));
    assert.ok(next.assets.some((a: { url: string; bytes: number }) => a.url === '/new-notice.txt' && a.bytes === 18));
    assert.equal(next.build, 'd'.repeat(64));
  } finally { await f.cleanup(); }
});

test('S17 rejects missing required lazy runtimes and output at the hosting size limit', async () => {
  const f = await fixture();
  try {
    await rm(join(f.root, 'public/assets/python_stdlib-test.zip'));
    await assert.rejects(f.run(), /required.*python_stdlib/i);
    await writeFile(join(f.root, 'public/assets/python_stdlib-test.zip'), 'test');
    const file = await open(join(f.root, 'public/oversized.wasm'), 'w'); await file.truncate(26_214_400); await file.close();
    await assert.rejects(f.run(), /25 MiB/);
  } finally { await f.cleanup(); }
});

test('S17 rejects source/private output and public symlinks before declaring a build complete', async () => {
  const f = await fixture();
  try {
    for (const name of ['debug.js.map', '.env', 'package.json', 'source.ts']) {
      await writeFile(join(f.root, 'public', name), 'must not ship'); await assert.rejects(f.run(), /source|private/i); await rm(join(f.root, 'public', name));
    }
    await symlink(join(f.root, 'main.js'), join(f.root, 'public/private-link.js'));
    await assert.rejects(f.run(), /symlink/i);
  } finally { await f.cleanup(); }
});

test('S17 rejects malformed build identity before emitting static output', () => {
  assert.throws(() => offlineBuild({ buildId: 'bad' }), TypeError);
});
