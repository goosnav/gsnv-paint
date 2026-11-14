/**
 * Local launcher. Installs the locked dependencies, builds when sources changed,
 * serves dist/ on loopback and opens the browser. run.sh, run.command, run.ps1 and
 * run.cmd only find a Node.js runtime and execute this file; all logic lives here.
 * Check: npm run test:launcher
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
const supported = major > 22 || (major === 22 && minor >= 12);
// The wrappers ask this before choosing between the installed Node.js and a managed copy.
if (process.argv.includes('--check')) process.exit(supported ? 0 : 1);

const fail = (code, message) => { console.error(`\ngsnv-paint [${code}]: ${message}`); process.exit(1); };
process.on('uncaughtException', cause => fail('APP-START', `Unexpected launcher failure: ${cause instanceof Error ? cause.message : cause}\nIf dependencies look damaged, delete the node_modules folder and start again.`));
if (!supported) fail('LAUNCH-PLATFORM', `Node.js 22.12 or newer is required; this is ${process.version}. Start with run.sh, run.command or run.cmd instead: they fetch a suitable copy.`);

const root = fileURLToPath(new URL('..', import.meta.url));
const mtime = path => { try { return statSync(join(root, path)).mtimeMs; } catch { return 0; } };
if (!existsSync(join(root, 'package-lock.json')) || !existsSync(join(root, 'src'))) {
  fail('LAUNCH-ROOT', `Application files are missing from ${root}. Keep the launcher inside the complete gsnv-paint folder.`);
}

// ponytail: one fixed port. Browser storage is kept per origin, so a port that drifted
// between launches would hide the user's recovery data. Move to a launcher-owned profile
// or a native shell if a fixed port ever becomes a real problem.
const port = Number(process.env.GSNV_PAINT_PORT ?? 24173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('APP-START', 'GSNV_PAINT_PORT must be a whole number from 1024 to 65535.');
const url = `http://127.0.0.1:${port}/`;

if (mtime('node_modules/.package-lock.json') < mtime('package-lock.json')) {
  console.log('Installing locked dependencies. The first launch needs a network connection…');
  // Fixed command string, no user input; a shell is what lets Windows find npm.cmd.
  const install = spawnSync('npm ci --no-audit --no-fund', { cwd: root, stdio: 'inherit', shell: true });
  if (install.status !== 0) fail('BOOT-NETWORK', 'Installing dependencies failed; npm printed the cause above. Check the network connection, then start again.');
}

const built = mtime('dist/index.html');
const sources = ['index.html', 'vite.config.ts', 'package-lock.json', 'dev/offline-build.ts'];
for (const directory of ['src', 'public']) {
  if (existsSync(join(root, directory))) sources.push(directory, ...readdirSync(join(root, directory), { recursive: true }).map(name => join(directory, name)));
}
const complete = ['dist/index.html', 'dist/offline-sw.js', 'dist/offline-manifest.json'].every(path => {
  try { return statSync(join(root, path)).isFile(); } catch { return false; }
});
if (!complete || sources.some(path => mtime(path) > built)) {
  console.log('Building gsnv-paint…');
  const { build } = await import('vite');
  try { await build({ root, logLevel: 'warn' }); }
  catch (cause) { fail('APP-START', `The build failed: ${cause instanceof Error ? cause.message : cause}`); }
}

function openBrowser() {
  if (process.env.GSNV_PAINT_NO_OPEN) return;
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  const unopened = () => console.error(`gsnv-paint [LAUNCH-BROWSER]: No browser could be opened. Open ${url} yourself.`);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', unopened); child.on('exit', code => { if (code) unopened(); }); child.unref();
}

// A second launch reopens the running copy instead of starting a server on another origin.
const alreadyRunning = await fetch(url, { signal: AbortSignal.timeout(1500) })
  .then(async response => response.headers.get('cross-origin-opener-policy') === 'same-origin' && (await response.text()).includes('<meta name="application-name" content="gsnv-paint">'))
  .catch(() => false);
if (alreadyRunning) {
  console.log(`gsnv-paint is already running at ${url}`);
  openBrowser();
} else {
  const { preview } = await import('vite');
  // Loopback host, strict port and isolation headers come from vite.config.ts.
  try { await preview({ root, logLevel: 'warn', preview: { port } }); }
  catch (cause) {
    fail('APP-START', `${cause instanceof Error ? cause.message : cause}. Close the program using port ${port}, or set GSNV_PAINT_PORT to another port. Work stored in the browser is kept per port.`);
  }
  console.log(`\ngsnv-paint is running at ${url}\nKeep this window open while you work. Press Ctrl+C to stop.`);
  openBrowser();
}
