// Copy an explicitly frozen production candidate; make B differ only in build identity.
// This bundles the real worker into the temporary B copy and never writes shared dist.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { offlineManifest } from '../src/shared/offline-manifest.ts';

export async function offlineProductionFixture(source: string, destination: string) {
  const a = join(destination, 'a'), b = join(destination, 'b'); await mkdir(destination, { recursive: true });
  const first = offlineManifest(JSON.parse(await readFile(join(source, 'offline-manifest.json'), 'utf8')));
  await cp(source, a, { recursive: true, force: true }); await cp(source, b, { recursive: true, force: true });
  const identity = randomBytes(32).toString('hex'), htmlPath = join(b, 'index.html');
  const html = (await readFile(htmlPath, 'utf8')).replace(first.build, identity); if (!html.includes(identity)) throw new Error('Frozen candidate lacks its build identity.');
  await writeFile(htmlPath, html);
  const assets = await Promise.all(first.assets.map(async asset => {
    const bytes = await readFile(join(b, decodeURIComponent(asset.url))); return { ...asset, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  const second = offlineManifest({ schema: 1, build: identity, assets });
  await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { __OFFLINE_MANIFEST__: JSON.stringify(second) }, build: {
    outDir: b, emptyOutDir: false, sourcemap: false, lib: { entry: resolve('src/app/offline-entry.ts'), formats: ['iife'], name: 'OfflineWorker', fileName: () => 'offline-sw.js' },
  } });
  await writeFile(join(b, 'offline-manifest.json'), JSON.stringify(second));
  const report = { source: resolve(source), a: first, b: second }; await writeFile(join(destination, 'candidates.json'), JSON.stringify(report, null, 2));
  return { directory: destination, buildA: first.build, buildB: second.build, files: first.assets.length, bytes: first.assets.reduce((sum, asset) => sum + asset.bytes, 0) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Pass frozen production output and a new temporary destination.');
  console.log(JSON.stringify(await offlineProductionFixture(resolve(process.argv[2]), resolve(process.argv[3])), null, 2));
}
