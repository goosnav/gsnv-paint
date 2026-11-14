/**
 * PURPOSE    Package the complete static build for verified offline installation.
 * KIND       SHELL
 * CONTRACT   IN: optional fixed 64-hex build ID; a root-based writable Vite app build.
 *            OUT: HTML identity, offline-manifest.json and bundled offline-sw.js;
 *            every servable output is hashed and required lazy engines are present.
 *            RAISES: TypeError for identity; build Error for unsafe/missing/oversized
 *            output, inventory changes, symlinks or unsupported Vite configuration.
 * GUARANTEES No source/private files, recursive plugin build or remote dependency;
 *            final bootstrap assets receive the same strict file-size/count gate.
 * TUNING     FILE_BYTES=25 MiB exclusive, FILE_COUNT=20,000 follow D04;
 *            REQUIRED pins deployed runtime filename families after bundling.
 * DECISIONS  D1: Random build identity plus per-file digest avoids a self-hash cycle.
 *            Alternative: hash the manifest as identity; rejected because HTML/worker
 *            embed that identity. Revisit if immutable indirection is introduced.
 *            D2: Reject public symlinks rather than guessing deployment copy semantics;
 *            revisit if a verified link-preserving static packager is added.
 * LIMITS     Root deployment only. Header response correctness and browser installation
 *            require separate real-server tests; successful bundling does not prove them.
 * TESTBENCH  dev/offline-build.test.ts -- run with: node --import tsx --test dev/offline-build.test.ts
 */
import { build, type Plugin, type ResolvedConfig } from 'vite';
import { createHash, randomBytes } from 'node:crypto';
import { readdir, lstat, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineManifest } from '../src/shared/offline-manifest.ts';
const FILE_BYTES = 26_214_400, FILE_COUNT = 20_000;
const BOOTSTRAP = new Set(['/offline-sw.js', '/offline-manifest.json', '/_headers', '/_redirects']);
const REQUIRED = [['replicad_single-', 'wasm'], ['replicad_single-', 'js'], ['planegcs-', 'wasm'], ['planegcs-', 'js'], ['libraw-', 'wasm'], ['libraw-', 'js'],
  ['worker-', 'js'], ['photo-develop.worker-', 'js'], ['cad-workspace.worker-', 'js'], ['cad-step-export.worker-', 'js'], ['code-runtime-', 'js'],
  ['pyodide.asm-', 'wasm'], ['python_stdlib-', 'zip'], ['pyodide-lock-', 'json']] as const;
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.zip': 'application/zip', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Offline builds reject symlinks: ${relative(directory, child)}`);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) {
        result.push(child); if (result.length > FILE_COUNT) throw new Error(`Static output exceeds ${FILE_COUNT} files.`);
      } else throw new Error('Offline builds require ordinary static files.');
    }
  }
  await visit(directory); return result.sort();
}
async function inventory(directory: string) {
  const result = [];
  for (const path of await files(directory)) {
    const name = relative(directory, path).split(sep).join('/');
    if (/(^|\/)(?:\.[^/]+|src|dev|launcher|node_modules)(?:\/|$)/.test(name) || /\.(?:map|ts|tsx|jsx|md|py|sh|ps1|cmd|bat|pem|key)$/i.test(name) || /(?:^|\/)(?:package(?:-lock)?|tsconfig(?:\.[^/]+)?)\.json$/i.test(name)) {
      throw new Error(`Source/private file must not enter static output: ${name}`);
    }
    const stat = await lstat(path);
    if (stat.size >= FILE_BYTES) throw new Error(`Static asset must be smaller than 25 MiB: ${name} (${stat.size} bytes)`);
    const bytes = await readFile(path);
    result.push({ url: encodeURI('/' + name), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mime: MIME[extname(path).toLowerCase()] ?? 'application/octet-stream' });
  }
  return result;
}

export function offlineBuild(options: { buildId?: string } = {}): Plugin {
  const buildId = options.buildId ?? randomBytes(32).toString('hex');
  if (!/^[a-f0-9]{64}$/.test(buildId)) throw new TypeError('Offline build identity must be 64 lowercase hex characters.');
  let config: ResolvedConfig, written = false;
  return {
    name: 'complete-build-offline', apply: 'build', enforce: 'post',
    configResolved(value) {
      config = value;
      if (config.base !== '/' || !config.build.write || config.build.ssr) throw new Error('Offline installation requires a writable root-based browser build.');
    },
    async buildStart() {
      if (config.publicDir) for (const path of await files(config.publicDir)) {
        if (['offline-sw.js', 'offline-manifest.json'].includes(relative(config.publicDir, path))) throw new Error('Public files must not replace generated offline bootstrap assets.');
      }
    },
    transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'meta', attrs: { name: 'gsnv-build-id', content: buildId }, injectTo: 'head' }] },
    writeBundle() { written = true; },
    async closeBundle() {
      if (!written) return;
      const output = resolve(config.root, config.build.outDir), found = await inventory(output);
      for (const [prefix, extension] of REQUIRED) if (!found.some(asset => asset.url.startsWith('/assets/' + prefix) && asset.url.endsWith('.' + extension))) {
        throw new Error(`Missing required offline asset ${prefix}*.${extension}.`);
      }
      const manifest = offlineManifest({ schema: 1, build: buildId, assets: found.filter(asset => !BOOTSTRAP.has(asset.url)) });
      await build({ configFile: false, root: config.root, publicDir: false, logLevel: 'silent', define: { __OFFLINE_MANIFEST__: JSON.stringify(manifest) }, build: {
        outDir: output, emptyOutDir: false, sourcemap: false, lib: { entry: fileURLToPath(new URL('../src/app/offline-entry.ts', import.meta.url)), formats: ['iife'], name: 'OfflineWorker', fileName: () => 'offline-sw.js' },
      } });
      await writeFile(join(output, 'offline-manifest.json'), JSON.stringify(manifest));
      const final = await inventory(output), served = final.filter(asset => !BOOTSTRAP.has(asset.url));
      const verified = offlineManifest({ schema: 1, build: buildId, assets: served });
      if (JSON.stringify(verified) !== JSON.stringify(manifest) || !final.some(asset => asset.url === '/offline-sw.js')) throw new Error('Static output changed during offline inventory. Rebuild before publishing.');
    },
  };
}
