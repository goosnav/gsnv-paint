/** Build prerequisite for the pinned upstream declaration packaging defect (D11).
 * Only declaration import paths change; no signatures, JavaScript or WASM change.
 * Exact input/output hashes prevent silently applying this repair to another release.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('../node_modules/@salusoft89/planegcs/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('./planegcs-declarations.json', import.meta.url), 'utf8'));
const installed = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (installed.name !== manifest.package || installed.version !== manifest.version) {
  throw Error('PlaneGCS declaration repair requires the exact pinned package; review a new version before changing the manifest.');
}
const hash = text => createHash('sha256').update(text).digest('hex');
const optionalRead = async url => {
  try { return await readFile(url, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const pending = [];
for (const change of manifest.changes) {
  const source = await readFile(new URL(change.source, root), 'utf8');
  const sourceHash = hash(source);
  const isPreparedInPlace = change.source === change.target && sourceHash === change.preparedSha256;
  if (sourceHash !== change.originalSha256 && !isPreparedInPlace) {
    throw Error(`Unexpected upstream declaration: ${change.source}`);
  }
  const prepared = source.replace(/(from\s+['"])(\.{1,2}\/[^'"\n]+)(['"])/g,
    (_match, prefix, path, quote) => `${prefix}${path}${extname(path) ? '' : '.js'}${quote}`);
  if (hash(prepared) !== change.preparedSha256) throw Error(`Unexpected normalized declaration: ${change.source}`);
  const target = new URL(change.target, root), existing = await optionalRead(target);
  if (existing !== null && hash(existing) !== change.originalSha256 && hash(existing) !== change.preparedSha256) {
    throw Error(`Refusing to replace an unknown declaration: ${change.target}`);
  }
  if (existing !== prepared) pending.push({ target, prepared });
}
// Validate the complete patch before the first write; npm ci resets any interrupted/unknown state.
for (const { target, prepared } of pending) await writeFile(target, prepared);
console.log(`PlaneGCS ${manifest.version}: verified ${manifest.changes.length} declaration repairs; wrote ${pending.length} files. Runtime files unchanged.`);
