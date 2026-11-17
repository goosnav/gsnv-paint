/** Local production launcher: verified content freshness, one stable origin, explicit updates. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquirePreparationLock, buildMatches, inspectBuild, installedDependenciesMatch, installedLockId, readLocalState, sourceState, writeLocalState } from './freshness.mjs';
import { localAppPath, localAppPlugin } from './local-app.mjs';

const [major, minor] = process.versions.node.split('.').map(Number);
const supported = major > 22 || (major === 22 && minor >= 12);
if (process.argv.includes('--check')) process.exit(supported ? 0 : 1);
const fail = (code, message) => { console.error(`\ngsnv-paint [${code}]: ${message}`); process.exit(1); };
process.on('uncaughtException', cause => fail('APP-START', `Unexpected launcher failure: ${cause instanceof Error ? cause.message : cause}`));
if (!supported) fail('LAUNCH-PLATFORM', `Node.js 22.12 or newer is required; this is ${process.version}. Start with run.sh, run.command or run.cmd instead: they fetch a suitable copy.`);
const root = fileURLToPath(new URL('..', import.meta.url));
if (!existsSync(join(root, 'package-lock.json')) || !existsSync(join(root, 'src'))) fail('LAUNCH-ROOT', `Application files are missing from ${root}. Keep the launcher inside the complete gsnv-paint folder.`);
const port = Number(process.env.GSNV_PAINT_PORT ?? 24173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('APP-START', 'GSNV_PAINT_PORT must be a whole number from 1024 to 65535.');
// Keep the origin fixed: project recovery belongs to this browser origin.
const origin = `http://127.0.0.1:${port}`, url = origin + '/';
const stopInstruction = `Save your work, close Paint tabs, and stop the older launcher window with Ctrl+C. Then start this folder again: ${root}\nThe launcher has not stopped another program or changed browser recovery. Keep port ${port} to retain the same local project storage.`;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
async function probe() {
  const occupied = await new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true)); socket.once('error', error => done(error.code === 'ECONNREFUSED' ? false : true));
    socket.setTimeout(1500, () => done(true));
  });
  if (!occupied) return { occupied: false };
  try {
    const response = await fetch(origin + '/__gsnv-local__/status', { redirect: 'error', signal: AbortSignal.timeout(2500), cache: 'no-store' });
    if (response.ok && response.headers.get('content-type')?.startsWith('application/json')) {
      const data = await response.json();
      if (data?.app === 'gsnv-paint' && data.protocol === 1 && [data.buildId, data.sourceId, data.checkoutId].every(hex) && typeof data.revision === 'string') return { occupied: true, data };
    }
  } catch { /* A legacy/unresponsive server must never be silently reopened. */ }
  return { occupied: true };
}
function git(args, { network = false } = {}) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: network ? 45_000 : 10_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }, maxBuffer: 4 * 1024 * 1024 });
}
function revision(sourceId) {
  // /usr/bin/git can be a macOS installer stub; ZIP users do not need Git at all.
  if (!existsSync(join(root, '.git'))) return `source-${sourceId.slice(0, 12)}`;
  const head = git(['rev-parse', '--short=12', 'HEAD']);
  if (head.status !== 0 || !/^[a-f0-9]{7,40}$/.test(head.stdout.trim())) return `source-${sourceId.slice(0, 12)}`;
  const dirty = git(['status', '--porcelain', '--untracked-files=normal']);
  return head.stdout.trim() + (dirty.status === 0 && dirty.stdout.trim() ? '-modified' : '');
}
let live = await probe(); // Never install, replace build output, or update a live checkout first.
if (process.argv.includes('--diagnose')) {
  const state = await sourceState(root), output = await inspectBuild(root), stamp = await readLocalState(root, 'build');
  const matching = !!live.data && live.data.checkoutId === state.checkoutId && live.data.sourceId === state.sourceId && live.data.buildId === output?.buildId && buildMatches(stamp, state, output);
  console.log(`gsnv-paint [DIAGNOSE]: This shell runs on ${process.platform} (${hostname()}).`);
  console.log(`gsnv-paint [DIAGNOSE]: Source folder: ${root}\nRevision: ${revision(state.sourceId)}; source ${state.sourceId.slice(0, 12)}.`);
  console.log(`gsnv-paint [DIAGNOSE]: ${url} responds as gsnv-paint: ${live.data ? 'yes' : 'no'}; current folder/build: ${matching ? 'yes' : 'no'}.`);
  if (live.occupied && !matching) console.log(stopInstruction);
  if (process.platform !== 'darwin') console.log('If Safari is on a different Mac, it cannot reach this shell through its own 127.0.0.1. Run on the Mac directly, or use ./connect-mac.sh user@server on the Mac to forward the SSH port.');
  process.exit(matching ? 0 : 1);
}
let release = () => {};
if (!live.occupied) {
  try { release = await acquirePreparationLock(root); } catch (cause) { fail('APP-PREPARING', cause.message); }
  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(130); });
  process.once('SIGTERM', () => { release(); process.exit(143); });
  live = await probe(); // A preceding launcher may have started while we held no lock.
}
if (process.argv.includes('--update')) {
  if (live.occupied) fail('UPDATE-RUNNING', stopInstruction);
  if (!existsSync(join(root, '.git'))) fail('UPDATE-SOURCE', 'This folder came from a ZIP or is not a Git checkout. Download the latest main ZIP from https://github.com/goosnav/gsnv-paint and start run.command/run.cmd from the newly extracted folder. Your browser projects stay at the same local address.');
  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0 || top.stdout.trim().replaceAll('\\', '/').replace(/\/$/, '') !== root.replaceAll('\\', '/').replace(/\/$/, '')) fail('UPDATE-SOURCE', 'This is not a Git checkout of the application. For a ZIP download, download the latest main ZIP from https://github.com/goosnav/gsnv-paint and launch run.command/run.cmd from the newly extracted folder. Your browser projects stay at the same local address.');
  const branch = git(['symbolic-ref', '--short', 'HEAD']), status = git(['status', '--porcelain', '--untracked-files=normal']), remote = git(['remote', 'get-url', 'origin']);
  if (branch.status !== 0 || branch.stdout.trim() !== 'main') fail('UPDATE-BRANCH', 'Automatic update requires the main branch. Keep your branch unchanged and update it with your normal Git workflow.');
  if (status.status !== 0 || status.stdout.trim()) fail('UPDATE-CHANGES', 'This source folder has local changes or untracked files. Commit or move them before updating. Nothing was overwritten.');
  if (remote.status !== 0 || !/^(?:https:\/\/github\.com\/goosnav\/gsnv-paint(?:\.git)?\/?|git@github\.com:goosnav\/gsnv-paint(?:\.git)?|ssh:\/\/git@github\.com\/goosnav\/gsnv-paint(?:\.git)?)$/i.test(remote.stdout.trim())) fail('UPDATE-ORIGIN', 'Automatic update only accepts origin = https://github.com/goosnav/gsnv-paint.git (or its GitHub SSH equivalent). The remote was not changed.');
  const before = git(['rev-parse', 'HEAD']).stdout.trim();
  console.log('Checking the official main branch for updates…');
  const fetched = git(['-c', 'credential.interactive=false', '-c', 'core.askPass=', '-c', 'core.sshCommand=ssh -oBatchMode=yes -oConnectTimeout=10', 'fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'], { network: true });
  if (fetched.status !== 0) fail('UPDATE-NETWORK', `Update could not be fetched within 45 seconds. Check your connection or Git access, then try again. The working files were kept.\n${fetched.error?.message ?? fetched.stderr.trim()}`);
  const ancestor = git(['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main']);
  if (ancestor.status !== 0) fail('UPDATE-DIVERGED', 'Local main has commits that cannot be fast-forwarded to official main. Resolve this with your normal Git workflow; no local commits were discarded.');
  const again = git(['status', '--porcelain', '--untracked-files=normal']);
  if (again.status !== 0 || again.stdout.trim() || git(['rev-parse', 'HEAD']).stdout.trim() !== before) fail('UPDATE-CHANGES', 'The source folder changed during the update check. No merge was attempted.');
  const merged = git(['merge', '--ff-only', 'refs/remotes/origin/main']);
  if (merged.status !== 0) fail('UPDATE-MERGE', `The fast-forward could not complete. No reset or forced update was attempted.\n${merged.stderr.trim()}`);
  console.log(merged.stdout.trim());
  release();
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2).filter(arg => arg !== '--update')], { cwd: root, stdio: 'inherit', env: process.env });
  // Keep terminal Stop/Ctrl+C attached to the restarted launcher, not an orphan child.
  process.removeAllListeners('SIGINT'); process.removeAllListeners('SIGTERM');
  process.once('SIGINT', () => child.kill('SIGINT')); process.once('SIGTERM', () => child.kill('SIGTERM'));
  child.on('error', cause => fail('APP-START', cause.message)); child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  await new Promise(() => {});
}

const state = await sourceState(root), version = revision(state.sourceId);
console.log(`gsnv-paint source: ${root}\nRevision: ${version}; source ${state.sourceId.slice(0, 12)}.`);
let output = await inspectBuild(root), stamp = await readLocalState(root, 'build');
function openBrowser(buildId) {
  if (process.env.GSNV_PAINT_NO_OPEN || process.argv.includes('--no-browser')) return;
  const entry = origin + localAppPath(buildId);
  const [command, args] = process.platform === 'darwin' ? ['open', [entry]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', entry]] : ['xdg-open', [entry]];
  const unopened = () => console.error(`\ngsnv-paint [LAUNCH-BROWSER]: Could not open a browser from this ${process.platform} session.\nCheck the server in this terminal: ${process.platform === 'win32' ? 'curl.exe' : 'curl'} -I ${url}\nIf it responds, open ${entry} in a browser running in the SAME network environment.\nIf Safari runs on a Mac but this shell does not, use ./run.command in Mac Terminal, or ./connect-mac.sh user@server on the Mac to forward port ${port} securely over SSH.`);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', unopened); child.on('exit', code => { if (code) unopened(); }); child.unref();
}
if (live.occupied) {
  if (!live.data || live.data.checkoutId !== state.checkoutId || live.data.sourceId !== state.sourceId || live.data.buildId !== output?.buildId || !buildMatches(stamp, state, output)) fail('APP-STALE', `A different, older or unverified server owns ${url}.\n${stopInstruction}`);
  console.log(`gsnv-paint is already running at ${origin + localAppPath(output.buildId)} (verified ${version}).`);
  release();
  openBrowser(output.buildId);
} else {
  const dependencies = await readLocalState(root, 'dependencies');
  let ready = dependencies?.schema === 1 && dependencies.dependencyId === state.dependencyId && dependencies.installedLockId === await installedLockId(root) && await installedDependenciesMatch(root);
  if (!dependencies && await installedDependenciesMatch(root)) {
    const prepared = existsSync(join(root, 'dev/prepare-planegcs.mjs')) ? spawnSync(process.execPath, ['dev/prepare-planegcs.mjs'], { cwd: root, stdio: 'inherit' }) : { status: 0 };
    ready = prepared.status === 0;
  }
  if (!ready) {
    console.log('Installing locked dependencies. The first launch or a changed lockfile needs a network connection…');
    const install = spawnSync('npm ci --no-audit --no-fund', { cwd: root, stdio: 'inherit', shell: true });
    if (install.status !== 0) fail('BOOT-NETWORK', 'Installing dependencies failed; npm printed the cause above. Check the connection, then start again.');
  }
  await writeLocalState(root, 'dependencies', { schema: 1, dependencyId: state.dependencyId, installedLockId: await installedLockId(root) });
  if (!buildMatches(stamp, state, output)) {
    console.log('Building gsnv-paint from the current source…');
    const { build } = await import('vite');
    try { await build({ root, logLevel: 'warn' }); } catch (cause) { fail('APP-START', `The build failed: ${cause instanceof Error ? cause.message : cause}`); }
    output = await inspectBuild(root);
    if (!output) fail('APP-BUILD', 'The build is incomplete or its manifest does not match its files. No browser was opened.');
    if ((await sourceState(root)).sourceId !== state.sourceId) fail('APP-BUILD', 'Source files changed while building. Start again to build one consistent version.');
    stamp = { schema: 1, ...state, ...output }; await writeLocalState(root, 'build', stamp);
  }
  const meta = { buildId: output.buildId, sourceId: state.sourceId, checkoutId: state.checkoutId, revision: version };
  const { preview } = await import('vite');
  let server;
  try { server = await preview({ root, logLevel: 'warn', plugins: [localAppPlugin(meta)], preview: { port } }); }
  catch (cause) { fail('APP-START', `${cause instanceof Error ? cause.message : cause}. ${stopInstruction}`); }
  const served = await probe();
  if (!served.data || ['buildId', 'sourceId', 'checkoutId'].some(key => served.data[key] !== meta[key])) {
    await server.httpServer.close(); fail('APP-START', `The current local build did not respond at ${url}. Check proxy settings, loopback networking and the local firewall.`);
  }
  console.log(`\ngsnv-paint is running at ${origin + localAppPath(output.buildId)} (on ${process.platform})\nCurrent full application, served locally. Keep this window open while you work. Press Ctrl+C to stop.`);
  release();
  openBrowser(output.buildId);
}
