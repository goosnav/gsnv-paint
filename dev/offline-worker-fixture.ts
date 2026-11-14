// Independently builds the S19 real worker seam before the S17 inventory plugin exists.
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureMime } from './offline-test-server.ts';
const root = fileURLToPath(new URL('..', import.meta.url));
export async function offlineWorkerFixture(directory: string, buildId: string, demo = 'offline-worker') {
  await mkdir(directory, { recursive: true });
  await build({ configFile: false, root, publicDir: false, logLevel: 'silent', define: { __DEMO_BUILD__: JSON.stringify(buildId) }, build: {
    outDir: directory, emptyOutDir: true, rollupOptions: { input: join(root, `src/shared/${demo}.demo.html`) },
  } });
  const htmlPath = join(directory, `src/shared/${demo}.demo.html`);
  await writeFile(join(directory, 'index.html'), (await readFile(htmlPath, 'utf8')).replace('%BUILD_ID%', buildId)); await unlink(htmlPath);
  await writeFile(join(directory, 'lazy.wasm'), 'hello');
  const files = await readdir(directory, { recursive: true, withFileTypes: true });
  const assets = await Promise.all(files.filter(file => file.isFile()).map(async file => {
    const path = join(file.parentPath, file.name), bytes = await readFile(path);
    return { url: '/' + path.slice(directory.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mime: fixtureMime(path) };
  }));
  const manifest = { schema: 1, build: buildId, assets };
  await build({ configFile: false, root, publicDir: false, logLevel: 'silent', define: { __OFFLINE_MANIFEST__: JSON.stringify(manifest) }, build: {
    outDir: directory, emptyOutDir: false, lib: { entry: join(root, 'src/app/offline-entry.ts'), formats: ['iife'], name: 'OfflineWorker', fileName: () => 'offline-sw.js' },
  } });
  await writeFile(join(directory, 'offline-manifest.json'), JSON.stringify(manifest));
  return { directory, manifest };
}
