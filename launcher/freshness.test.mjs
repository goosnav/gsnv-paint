import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { acquirePreparationLock, buildMatches, inspectBuild, installedDependenciesMatch, installedLockId, readLocalState, sourceState, writeLocalState } from './freshness.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gsnv-freshness-'));
  for (const dir of ['src', 'public', 'dev', 'launcher', 'vendor', 'dist']) await mkdir(join(root, dir));
  for (const [name, value] of Object.entries({ 'index.html': '<head></head>', 'package.json': '{}', 'package-lock.json': '{}', 'src/main.js': 'one', 'public/help.txt': 'help', 'dev/offline-build.ts': 'generator', 'dev/prepare-planegcs.mjs': 'prepare', 'dev/planegcs-declarations.json': '{}', 'launcher/start.mjs': 'launcher', 'vendor/library.tgz': 'library' })) await writeFile(join(root, name), value);
  return root;
}

test('content fingerprints detect preserved timestamps, deleted files, build generators, preparation and launcher changes', async () => {
  const root = await fixture();
  try {
    let before = await sourceState(root);
    await writeFile(join(root, 'src/main.js'), 'two'); await utimes(join(root, 'src/main.js'), new Date(0), new Date(0));
    let after = await sourceState(root); assert.notEqual(after.sourceId, before.sourceId); assert.equal(after.dependencyId, before.dependencyId);
    for (const file of ['public/help.txt', 'dev/offline-build.ts', 'dev/prepare-planegcs.mjs', 'dev/planegcs-declarations.json', 'launcher/start.mjs', 'vendor/library.tgz', 'package-lock.json']) {
      before = await sourceState(root); await writeFile(join(root, file), (await readFile(join(root, file))) + '\nchanged');
      after = await sourceState(root); assert.notEqual(after.sourceId, before.sourceId, file);
      if (['dev/prepare-planegcs.mjs', 'dev/planegcs-declarations.json', 'vendor/library.tgz', 'package-lock.json'].includes(file)) assert.notEqual(after.dependencyId, before.dependencyId, file);
    }
    before = after; await unlink(join(root, 'public/help.txt')); after = await sourceState(root); assert.notEqual(after.sourceId, before.sourceId);
    await writeLocalState(root, 'build', { schema: 1 }); assert.deepEqual(await readLocalState(root, 'build'), { schema: 1 });
    assert.deepEqual(await sourceState(root), after, 'launcher state cannot invalidate its own source fingerprint');
    assert.equal(await readLocalState(root, 'missing'), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('build verification checks HTML identity, asset bytes, missing engines and the successful source stamp', async () => {
  const root = await fixture(), buildId = 'a'.repeat(64);
  try {
    const html = `<head><meta name="application-name" content="gsnv-paint"><meta name="gsnv-build-id" content="${buildId}"></head>`, engine = 'engine-v1';
    await mkdir(join(root, 'dist/assets')); await writeFile(join(root, 'dist/index.html'), html); await writeFile(join(root, 'dist/assets/engine.wasm'), engine); await writeFile(join(root, 'dist/offline-sw.js'), 'worker');
    const manifest = { schema: 1, build: buildId, assets: [['/index.html', html], ['/assets/engine.wasm', engine]].map(([url, bytes]) => ({ url, bytes: Buffer.byteLength(bytes), sha256: digest(bytes), mime: 'application/octet-stream' })) };
    const save = () => writeFile(join(root, 'dist/offline-manifest.json'), JSON.stringify(manifest)); await save();
    const build = await inspectBuild(root), state = await sourceState(root); assert.equal(build.buildId, buildId);
    assert.equal(buildMatches({ schema: 1, ...state, ...build }, state, build), true);
    assert.equal(buildMatches({ schema: 1, ...state, ...build }, { ...state, sourceId: 'b'.repeat(64) }, build), false);
    await writeFile(join(root, 'dist/assets/engine.wasm'), 'engine-v2'); assert.equal(await inspectBuild(root), null, 'same-length corruption must fail');
    await writeFile(join(root, 'dist/assets/engine.wasm'), engine); await unlink(join(root, 'dist/assets/engine.wasm')); assert.equal(await inspectBuild(root), null, 'late-loaded missing engine must rebuild');
    await writeFile(join(root, 'dist/assets/engine.wasm'), engine); await unlink(join(root, 'dist/offline-sw.js')); assert.equal(await inspectBuild(root), null);
    await writeFile(join(root, 'dist/offline-sw.js'), 'worker'); manifest.assets.push({ ...manifest.assets[0] }); await save(); assert.equal(await inspectBuild(root), null, 'duplicates are not complete inventories');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('existing dependencies are adopted only from matching lock metadata and present required directories', async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, 'node_modules/pkg'), { recursive: true });
    const packages = { 'node_modules/pkg': { version: '1.0.0', resolved: 'https://example.test/pkg', integrity: 'sha512-example' } };
    await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: { '': {}, ...packages } }));
    await writeFile(join(root, 'node_modules/.package-lock.json'), JSON.stringify({ packages }));
    assert.equal(await installedDependenciesMatch(root), true); const first = await installedLockId(root);
    await writeFile(join(root, 'node_modules/.package-lock.json'), JSON.stringify({ packages: { 'node_modules/pkg': { ...packages['node_modules/pkg'], version: '2.0.0' } } }));
    assert.equal(await installedDependenciesMatch(root), false); assert.notEqual(await installedLockId(root), first);
    await writeFile(join(root, 'node_modules/.package-lock.json'), JSON.stringify({ packages })); await rm(join(root, 'node_modules/pkg'), { recursive: true });
    assert.equal(await installedDependenciesMatch(root), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('preparation lock serializes launchers, refuses live owners and reclaims exited owners without recursive deletion', async () => {
  const root = await fixture();
  try {
    const release = await acquirePreparationLock(root);
    await assert.rejects(acquirePreparationLock(root, { timeoutMs: 60, intervalMs: 5 }), /Another launcher/);
    release(); release(); const again = await acquirePreparationLock(root); again();
    await mkdir(join(root, '.gsnv-local/prepare.lock'));
    // Find an impossible PID, instead of assuming a test machine has a particular PID free.
    let dead = 2 ** 30; while (true) { try { process.kill(dead, 0); dead++; } catch (error) { if (error.code === 'ESRCH') break; throw error; } }
    await writeFile(join(root, '.gsnv-local/prepare.lock/owner-dead.json'), JSON.stringify({ pid: dead, host: hostname() }));
    const recovered = await acquirePreparationLock(root, { timeoutMs: 100, intervalMs: 5 }); recovered();
    assert.equal((await readLocalState(root, 'build')), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
