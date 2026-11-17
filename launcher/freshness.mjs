/** Content identities for the local launcher. No timestamps or network requests. */
import { createHash, randomUUID } from 'node:crypto';
import { rmdirSync, unlinkSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { hostname } from 'node:os';

const HEX = /^[a-f0-9]{64}$/;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fixedInputs = ['index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json',
  'dev/offline-build.ts', 'dev/prepare-planegcs.mjs', 'dev/planegcs-declarations.json'];
const dependencyInputs = ['package.json', 'package-lock.json', 'dev/prepare-planegcs.mjs', 'dev/planegcs-declarations.json'];
async function optional(path) { try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function inputFiles(root, directory) {
  let entries; try { entries = await readdir(join(root, directory), { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Source inputs must be ordinary files, not symbolic links: ${path}`);
    if (entry.isDirectory()) files.push(...await inputFiles(root, path));
    else if (entry.isFile() && !(directory === 'launcher' && entry.name.endsWith('.test.mjs'))) files.push(path);
  }
  return files;
}
async function hashInputs(root, paths, salt) {
  const hash = createHash('sha256').update(salt);
  for (const path of [...new Set(paths)].sort()) {
    const bytes = await optional(join(root, path));
    hash.update(`\0${path}\0${bytes === null ? 'missing' : bytes.length}\0`);
    if (bytes !== null) hash.update(bytes);
  }
  return hash.digest('hex');
}
export async function sourceState(root) {
  const vendor = await inputFiles(root, 'vendor');
  const paths = [...fixedInputs, ...vendor];
  for (const directory of ['src', 'public', 'launcher']) paths.push(...await inputFiles(root, directory));
  const runtime = `${process.platform}/${process.arch}/node-${process.versions.node.split('.')[0]}`;
  return {
    sourceId: await hashInputs(root, paths, `gsnv-local-source-v1/${runtime}`),
    dependencyId: await hashInputs(root, [...dependencyInputs, ...vendor], `gsnv-local-dependencies-v1/${runtime}`),
    checkoutId: sha(await realpath(root)),
  };
}
export async function readLocalState(root, name) {
  try { return JSON.parse(await readFile(join(root, '.gsnv-local', `${name}.json`), 'utf8')); } catch { return null; }
}
export async function writeLocalState(root, name, value) {
  const directory = join(root, '.gsnv-local'); await mkdir(directory, { recursive: true });
  const temporary = join(directory, `${name}.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(value) + '\n'); await rename(temporary, join(directory, `${name}.json`));
}

/** Adopt a pre-stamp npm installation only when its lock inventory matches. */
export async function installedDependenciesMatch(root) {
  try {
    const expected = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')).packages;
    const actual = JSON.parse(await readFile(join(root, 'node_modules/.package-lock.json'), 'utf8')).packages;
    if (!expected || !actual || !Object.keys(actual).length) return false;
    const declared = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const normalized = value => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])
      if (normalized(declared[key]) !== normalized(expected['']?.[key])) return false;
    for (const [path, entry] of Object.entries(actual)) {
      const wanted = expected[path]; if (!wanted || !path.startsWith('node_modules/') || entry.link || wanted.link) return false;
      if (['version', 'resolved', 'integrity'].some(key => entry[key] !== wanted[key])) return false;
      if (!(await lstat(join(root, path))).isDirectory()) return false;
    }
    for (const [path, entry] of Object.entries(expected)) if (path.startsWith('node_modules/') && !entry.optional && !actual[path]) return false;
    return true;
  } catch { return false; }
}

export async function installedLockId(root) {
  const bytes = await optional(join(root, 'node_modules/.package-lock.json'));
  return bytes === null ? null : sha(bytes);
}

/** Serialize preparation in one checkout. An OS-exited owner can be reclaimed safely. */
export async function acquirePreparationLock(root, { timeoutMs = 45_000, intervalMs = 100 } = {}) {
  const state = join(root, '.gsnv-local'); await mkdir(state, { recursive: true });
  const directory = join(state, 'prepare.lock'), owner = `owner-${randomUUID()}.json`, started = Date.now();
  const sleep = () => new Promise(resolve => setTimeout(resolve, intervalMs));
  while (true) {
    try {
      await mkdir(directory);
      await writeFile(join(directory, owner), JSON.stringify({ pid: process.pid, host: hostname() }));
      let released = false;
      return () => {
        if (released) return; released = true;
        // A unique owner filename prevents an old contender from deleting a newer lock.
        try { unlinkSync(join(directory, owner)); } catch { return; }
        try { rmdirSync(directory); } catch { /* Another contender may already be preparing. */ }
      };
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const entries = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (entries === null) continue;
    if (entries.length === 1 && /^owner-[a-z0-9-]+\.json$/.test(entries[0])) {
      const name = entries[0]; let held;
      try { held = JSON.parse(await readFile(join(directory, name), 'utf8')); } catch { /* The owner may still be writing or exiting. */ }
      if (held?.host === hostname() && Number.isSafeInteger(held.pid) && held.pid > 0) {
        let alive = true; try { process.kill(held.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
        if (!alive) {
          try { await unlink(join(directory, name)); await rmdir(directory); } catch (error) { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; }
          continue;
        }
      }
    } else if (!entries.length) {
      const info = await lstat(directory).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 5000) { await rmdir(directory).catch(() => {}); continue; }
    }
    if (Date.now() - started >= timeoutMs) throw new Error('Another launcher is preparing this folder. Wait for it to finish, then launch again. No build files were changed by this launcher.');
    await sleep();
  }
}

/** Verify output identity and every declared asset, including late-loaded engines. */
export async function inspectBuild(root) {
  try {
    const directory = resolve(root, 'dist'), manifestBytes = await readFile(join(directory, 'offline-manifest.json'));
    const manifest = JSON.parse(manifestBytes.toString());
    if (manifest.schema !== 1 || !HEX.test(manifest.build) || !Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > 20_000) return null;
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    if (!html.includes('<meta name="application-name" content="gsnv-paint">') || !html.includes(`name="gsnv-build-id" content="${manifest.build}"`)) return null;
    const seen = new Set();
    for (const asset of manifest.assets) {
      if (!asset || typeof asset.url !== 'string' || !asset.url.startsWith('/') || asset.url.includes('\\') || /[?#\0]/.test(asset.url) || !HEX.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0 || seen.has(asset.url)) return null;
      const name = decodeURIComponent(asset.url).slice(1), path = resolve(directory, name);
      if (!path.startsWith(directory + sep) || name.includes('\\') || !(await lstat(path)).isFile()) return null;
      const bytes = await readFile(path); if (bytes.length !== asset.bytes || sha(bytes) !== asset.sha256) return null;
      seen.add(asset.url);
    }
    if (!seen.has('/index.html')) return null;
    const worker = await readFile(join(directory, 'offline-sw.js')); if (!worker.length) return null;
    return { buildId: manifest.build, outputId: sha(Buffer.concat([manifestBytes, worker])) };
  } catch { return null; }
}

export function buildMatches(stamp, state, build) {
  return !!stamp && !!build && stamp.schema === 1 && stamp.sourceId === state.sourceId && stamp.dependencyId === state.dependencyId && stamp.buildId === build.buildId && stamp.outputId === build.outputId;
}
