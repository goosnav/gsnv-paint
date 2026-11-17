/** Explicit update guard and real fast-forward tests. Fetch is routed only to a temporary fixture. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectBuild, installedLockId, sourceState, writeLocalState } from './freshness.mjs';
const repository = fileURLToPath(new URL('..', import.meta.url)), port = 24178;
const gitPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
const skip = process.platform === 'win32' || !gitPath;
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
function git(root, ...args) { const result = spawnSync(gitPath, args, { cwd: root, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
function start(root, env, args = ['--update']) {
  const child = spawn(process.execPath, [join(root, 'launcher/start.mjs'), ...args], { cwd: root, env: { ...process.env, GSNV_PAINT_PORT: String(port), GSNV_PAINT_NO_OPEN: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  return { child, output: () => output, closed: new Promise(resolve => child.once('close', resolve)) };
}
async function code(root) {
  for (const dir of ['src', 'launcher']) await mkdir(join(root, dir), { recursive: true });
  for (const name of ['start.mjs', 'freshness.mjs', 'local-app.mjs']) await copyFile(join(repository, 'launcher', name), join(root, 'launcher', name));
  await copyFile(join(repository, 'package-lock.json'), join(root, 'package-lock.json'));
  await copyFile(join(repository, 'package.json'), join(root, 'package.json'));
  await writeFile(join(root, 'src/main.js'), '// fixture source');
  await writeFile(join(root, 'index.html'), '<head></head>');
  await writeFile(join(root, 'vite.config.ts'), 'export default {preview:{host:"127.0.0.1",strictPort:true}};');
  await writeFile(join(root, '.gitignore'), 'node_modules\ndist/\n.gsnv-local/\n');
}
async function build(root) {
  await symlink(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir'); await mkdir(join(root, 'dist'));
  const id = 'c'.repeat(64), html = `<html><head><meta name="application-name" content="gsnv-paint"><meta name="gsnv-build-id" content="${id}"></head><body>fixture</body></html>`;
  await writeFile(join(root, 'dist/index.html'), html); await writeFile(join(root, 'dist/offline-sw.js'), '// worker');
  await writeFile(join(root, 'dist/offline-manifest.json'), JSON.stringify({ schema: 1, build: id, assets: [{ url: '/index.html', bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), mime: 'text/html' }] }));
  const state = await sourceState(root), output = await inspectBuild(root);
  await writeLocalState(root, 'build', { schema: 1, ...state, ...output });
  await writeLocalState(root, 'dependencies', { schema: 1, dependencyId: state.dependencyId, installedLockId: await installedLockId(root) });
}
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'gsnv-update-')), upstream = join(parent, 'upstream'), root = join(parent, 'app'), bin = join(parent, 'bin');
  await mkdir(upstream); await mkdir(bin); await code(upstream);
  git(upstream, 'init', '-b', 'main'); git(upstream, 'config', 'user.name', 'Launcher test'); git(upstream, 'config', 'user.email', 'launcher@example.test'); git(upstream, 'add', '.'); git(upstream, 'commit', '-m', 'initial fixture');
  git(parent, 'clone', upstream, root); git(root, 'remote', 'set-url', 'origin', 'https://github.com/goosnav/gsnv-paint.git'); git(root, 'config', 'user.name', 'Launcher test'); git(root, 'config', 'user.email', 'launcher@example.test');
  const log = join(parent, 'git-log');
  await writeFile(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${quote(log)}\ncase " $* " in *' fetch '*)\n[ "$GIT_TERMINAL_PROMPT" = 0 ] || exit 90\nexec ${quote(gitPath)} -c protocol.file.allow=always fetch --no-tags ${quote(upstream)} refs/heads/main:refs/remotes/origin/main;;\n*) exec ${quote(gitPath)} "$@";; esac\n`);
  await chmod(join(bin, 'git'), 0o755);
  return { parent, upstream, root, log, env: { PATH: bin + delimiter + process.env.PATH } };
}

test('ZIP launches never invoke Git and explicit ZIP updates explain how to replace the source folder', { skip }, async () => {
  const parent = await mkdtemp(join(tmpdir(), 'gsnv-update-zip-')), root = join(parent, 'app'), bin = join(parent, 'bin'), log = join(parent, 'git-called');
  try {
    await mkdir(root); await mkdir(bin); await code(root); await build(root);
    await writeFile(join(bin, 'git'), `#!/bin/sh\necho called > ${quote(log)}\nexit 99\n`); await chmod(join(bin, 'git'), 0o755);
    const env = { PATH: bin + delimiter + process.env.PATH };
    const update = start(root, env); assert.equal(await update.closed, 1); assert.match(update.output(), /UPDATE-SOURCE.*ZIP/);
    const diagnose = start(root, env, ['--diagnose']); assert.equal(await diagnose.closed, 1); assert.match(diagnose.output(), /Revision: source-/);
    await assert.rejects(readFile(log), { code: 'ENOENT' });
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('explicit update refuses local changes, other branches and foreign remotes; clean official main fast-forwards and restarts', { skip, timeout: 30_000 }, async () => {
  const f = await fixture(); let run;
  try {
    await writeFile(join(f.upstream, 'RELEASE.txt'), 'new official version'); git(f.upstream, 'add', 'RELEASE.txt'); git(f.upstream, 'commit', '-m', 'release fixture');
    await writeFile(join(f.root, 'mine.txt'), 'local work');
    let attempt = start(f.root, f.env); assert.equal(await attempt.closed, 1); assert.match(attempt.output(), /UPDATE-CHANGES/); await rm(join(f.root, 'mine.txt'));
    git(f.root, 'switch', '-c', 'feature'); attempt = start(f.root, f.env); assert.equal(await attempt.closed, 1); assert.match(attempt.output(), /UPDATE-BRANCH/); git(f.root, 'switch', 'main');
    git(f.root, 'remote', 'set-url', 'origin', 'https://github.com/example/another-app.git'); attempt = start(f.root, f.env); assert.equal(await attempt.closed, 1); assert.match(attempt.output(), /UPDATE-ORIGIN/);
    assert.doesNotMatch(await readFile(f.log, 'utf8'), / fetch /, 'refused requests must not fetch');
    git(f.root, 'remote', 'set-url', 'origin', 'https://github.com/goosnav/gsnv-paint.git'); await build(f.root);
    run = start(f.root, f.env); const until = Date.now() + 15_000;
    while (!run.output().includes('is running at')) { assert.equal(run.child.exitCode, null, run.output()); assert.ok(Date.now() < until, run.output()); await new Promise(resolve => setTimeout(resolve, 25)); }
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), git(f.upstream, 'rev-parse', 'HEAD')); assert.equal(await readFile(join(f.root, 'RELEASE.txt'), 'utf8'), 'new official version');
    const calls = await readFile(f.log, 'utf8'); assert.match(calls, /fetch --no-tags origin refs\/heads\/main:refs\/remotes\/origin\/main/); assert.match(calls, /merge --ff-only refs\/remotes\/origin\/main/); assert.doesNotMatch(calls, /reset|--force|clean -/);
    const busy = start(f.root, f.env); assert.equal(await busy.closed, 1); assert.match(busy.output(), /UPDATE-RUNNING/);
  } finally {
    if (run) { run.child.kill(); await run.closed; }
    await rm(f.parent, { recursive: true, force: true });
  }
});

test('explicit update refuses a diverged main without discarding a local commit', { skip, timeout: 15_000 }, async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'local.txt'), 'owned work'); git(f.root, 'add', 'local.txt'); git(f.root, 'commit', '-m', 'local commit'); const before = git(f.root, 'rev-parse', 'HEAD');
    await writeFile(join(f.upstream, 'upstream.txt'), 'remote work'); git(f.upstream, 'add', 'upstream.txt'); git(f.upstream, 'commit', '-m', 'remote commit');
    const attempt = start(f.root, f.env); assert.equal(await attempt.closed, 1); assert.match(attempt.output(), /UPDATE-DIVERGED/);
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), before); assert.equal(await readFile(join(f.root, 'local.txt'), 'utf8'), 'owned work'); assert.doesNotMatch(await readFile(f.log, 'utf8'), /merge --ff-only|reset|--force/);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});
