/** Exercise the top-level OS wrappers from an unrelated directory, without installs or downloads. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));
const windows = process.platform === 'win32';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const launchScript = `import {writeFileSync} from 'node:fs';
if (process.argv.includes('--check')) process.exit(0);
writeFileSync(process.env.GSNV_TEST_RECORD, JSON.stringify({cwd:process.cwd(), args:process.argv.slice(2), node:process.env.GSNV_TEST_NODE ?? process.execPath}));
process.exit(Number(process.env.GSNV_TEST_EXIT ?? 0));
`;

async function fixture() {
  // macOS exposes /var through /private/var; compare actual cwd paths consistently.
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'gsnv-wrappers-')));
  const root = join(directory, 'Paint source with spaces'), bin = join(directory, 'system bin');
  const cwd = join(directory, 'unrelated working folder'), data = join(directory, 'application data');
  for (const path of [root, join(root, 'launcher'), bin, cwd, data]) await mkdir(path, { recursive: true });
  for (const name of ['run.command', 'run.sh', 'run.cmd', 'run.ps1', 'update.command', 'update.cmd']) await copyFile(join(repository, name), join(root, name));
  await copyFile(join(repository, 'launcher/node-runtime.sha256'), join(root, 'launcher/node-runtime.sha256'));
  await writeFile(join(root, 'launcher/start.mjs'), launchScript);
  const record = join(directory, 'launched.json');
  // Windows env keys are case-insensitive. Avoid passing competing PATH/Path
  // entries when constructing the deliberately isolated runtime environment.
  const inherited = windows ? Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key.toUpperCase(), value])) : process.env;
  const env = { ...inherited, PATH: bin, GSNV_TEST_RECORD: record, GSNV_PAINT_NO_PAUSE: '1', XDG_DATA_HOME: data };
  return { directory, root, bin, cwd, data, record, env };
}

async function executable(path, source) { await writeFile(path, source); await chmod(path, 0o755); }
async function posixNode(directory, name) {
  await mkdir(directory, { recursive: true });
  await executable(join(directory, 'node'), `#!/bin/sh\nGSNV_TEST_NODE=${quote(name)}\nexport GSNV_TEST_NODE\nexec ${quote(process.execPath)} "$@"\n`);
}
async function posixTools(f) {
  for (const name of ['dirname', 'grep']) {
    const found = spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
    assert.equal(found.status, 0); await symlink(found.stdout.trim(), join(f.bin, name));
  }
  // A Linux-shaped cache keeps these tests out of the real macOS application-data folder.
  await executable(join(f.bin, 'uname'), '#!/bin/sh\ncase "$1" in -s) printf "Linux\\n";; -m) printf "x86_64\\n";; *) exit 1;; esac\n');
  await posixNode(f.bin, 'system');
}
function runPosix(f, wrapper, args = [], extra = {}) {
  return spawnSync('/bin/sh', [join(f.root, wrapper), ...args], { cwd: f.cwd, env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 10_000 });
}
async function cachedRuntime(f, platform) {
  const checksums = await readFile(join(f.root, 'launcher/node-runtime.sha256'), 'utf8');
  const archive = checksums.split(/\r?\n/).find(line => line.endsWith(`-${platform}-x64.${platform === 'win' ? 'zip' : 'tar.gz'}`))?.trim().split(/\s+/)[1];
  assert.ok(archive);
  const folder = join(f.data, 'gsnv-paint', 'runtime', archive.replace(/\.(?:zip|tar\.gz)$/, ''));
  await mkdir(folder, { recursive: true }); return folder;
}

test('POSIX launch/update wrappers retain arguments and resolve their own folder without run.sh execute permission', { skip: windows }, async () => {
  const f = await fixture();
  try {
    await posixTools(f); await executable(join(f.bin, 'npm'), '#!/bin/sh\nprintf "11.0.0\\n"\n');
    await chmod(join(f.root, 'run.sh'), 0o644);
    const args = ['--no-browser', 'two words', 'literal;$value'];
    for (const wrapper of ['run.sh', 'run.command', 'update.command']) {
      const result = runPosix(f, wrapper, args);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(await readFile(f.record, 'utf8')), {
        cwd: f.root, node: 'system', args: [...(wrapper === 'update.command' ? ['--update'] : []), ...args],
      });
    }
    const failure = runPosix(f, 'run.command', [], { GSNV_TEST_EXIT: '17' });
    assert.equal(failure.status, 17, 'the wrapper must preserve a launcher failure');
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('POSIX launch uses the cached complete runtime when system Node has missing or broken npm', { skip: windows }, async () => {
  const f = await fixture();
  try {
    await posixTools(f);
    const runtime = join(await cachedRuntime(f, 'linux'), 'bin'); await posixNode(runtime, 'cached');
    await executable(join(runtime, 'npm'), '#!/bin/sh\nprintf "11.0.0\\n"\n');
    for (const broken of [false, true]) {
      if (broken) await executable(join(f.bin, 'npm'), '#!/bin/sh\nexit 1\n');
      const result = runPosix(f, 'run.command', ['--no-browser']);
      assert.equal(result.status, 0, result.stderr);
      const actual = JSON.parse(await readFile(f.record, 'utf8'));
      assert.equal(actual.node, 'cached'); assert.equal(actual.cwd, f.root); assert.deepEqual(actual.args, ['--no-browser']);
      assert.doesNotMatch(result.stdout, /Downloading/);
    }
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('POSIX --check stays offline and needs only usable Node', { skip: windows }, async () => {
  const f = await fixture();
  try {
    await posixTools(f);
    const result = runPosix(f, 'run.command', ['--check']);
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '');
    await assert.rejects(readFile(f.record), { code: 'ENOENT' });
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

async function windowsNode(directory) {
  await mkdir(directory, { recursive: true });
  try { await link(process.execPath, join(directory, 'node.exe')); }
  catch { await copyFile(process.execPath, join(directory, 'node.exe')); }
}
async function windowsTools(f) {
  const system32 = join(process.env.SystemRoot, 'System32');
  f.env.PATH = [f.bin, system32, join(system32, 'WindowsPowerShell', 'v1.0')].join(';');
  f.env.LOCALAPPDATA = f.data;
  await windowsNode(f.bin);
}
function runWindows(f, wrapper, extra = {}, args = '--no-browser "two words"') {
  return spawnSync(process.env.ComSpec ?? join(process.env.SystemRoot, 'System32', 'cmd.exe'), ['/d', '/s', '/c', `""${join(f.root, wrapper)}" ${args}"`], {
    cwd: f.cwd, env: { ...f.env, ...extra }, encoding: 'utf8', windowsVerbatimArguments: true, timeout: 15_000,
  });
}

test('Windows command wrappers preserve exit status, arguments and source folder without pausing', { skip: !windows }, async () => {
  const f = await fixture();
  try {
    await windowsTools(f); await writeFile(join(f.bin, 'npm.cmd'), '@echo off\r\necho 11.0.0\r\nexit /b 0\r\n');
    for (const wrapper of ['run.cmd', 'update.cmd']) {
      const result = runWindows(f, wrapper, { GSNV_TEST_EXIT: '17' });
      assert.equal(result.status, 17, result.stdout + result.stderr);
      const actual = JSON.parse(await readFile(f.record, 'utf8'));
      assert.equal(actual.cwd, f.root); assert.deepEqual(actual.args, [...(wrapper === 'update.cmd' ? ['--update'] : []), '--no-browser', 'two words']);
      assert.doesNotMatch(result.stdout, /Press any key/);
    }
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('Windows launcher falls back to cached Node/npm even without architecture env vars; --check needs no npm', { skip: !windows }, async () => {
  const f = await fixture();
  try {
    await windowsTools(f);
    const check = runWindows(f, 'run.cmd', {}, '--check'); assert.equal(check.status, 0, check.stdout + check.stderr);
    await assert.rejects(readFile(f.record), { code: 'ENOENT' });
    const runtime = await cachedRuntime(f, 'win'); await windowsNode(runtime);
    await writeFile(join(runtime, 'npm.cmd'), '@echo off\r\necho 11.0.0\r\nexit /b 0\r\n');
    for (const environment of [{}, { PROCESSOR_ARCHITECTURE: undefined, PROCESSOR_ARCHITEW6432: undefined }]) {
      const result = runWindows(f, 'run.cmd', environment); assert.equal(result.status, 0, result.stdout + result.stderr);
      const actual = JSON.parse(await readFile(f.record, 'utf8'));
      assert.equal(dirname(actual.node).toLowerCase(), runtime.toLowerCase()); assert.deepEqual(actual.args, ['--no-browser', 'two words']);
      assert.doesNotMatch(result.stdout, /Downloading/);
    }
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
