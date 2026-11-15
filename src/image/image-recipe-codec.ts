/**
 * PURPOSE    Encode lossless Image action files.
 * KIND       CORE
 * CONTRACT   encodeRecipe(validated recipe) returns UTF-8 JSON; decodeRecipe(bytes)
 *            returns unknown runtime data for mandatory schema validation.
 *            RAISES: RangeError for file/asset limits or malformed binary fields.
 * GUARANTEES No code evaluation, paths, network or platform-specific encodings.
 * TUNING     Base64 chunks use 7680 bytes (divisible by three); shared recipe limits.
 * DECISIONS  D1: Base64 RGBA makes recipes portable without lossy image codecs.
 *            Alternative: ZIP chunks. Revisit if streaming recipe files are required.
 * LIMITS     JSON serialization uses bounded memory proportional to file size.
 * TESTBENCH  src/image/image-recipe.test.ts
 * DEMO       node --import tsx src/image/image-recipe.demo.ts
 */
import { RECIPE_LIMITS, recipeSize } from './image-recipe-data.ts';
import type { ImageRecipe } from './image-operation-types.ts';
function base64(data: Uint8ClampedArray): string {
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += 7680) parts.push(btoa(String.fromCharCode(...data.subarray(i, i + 7680))));
  return parts.join('');
}
export function encodeRecipe(value: ImageRecipe): Uint8Array {
  const json = JSON.stringify({ ...value, assets: value.assets.map(a => ({ id: a.id, width: a.width, height: a.height, encoding: 'rgba8-base64', data: base64(a.data) })) });
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > RECIPE_LIMITS.fileBytes) throw new RangeError('Actions file exceeds 192 MiB.');
  return bytes;
}
export function decodeRecipe(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.byteLength > RECIPE_LIMITS.fileBytes) throw new RangeError('Actions file exceeds 192 MiB or has invalid bytes.');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || !Array.isArray(value.assets) || value.assets.length > RECIPE_LIMITS.steps) throw new RangeError('Invalid actions file assets.');
  let total = 0;
  const assets = value.assets.map(a => {
    if (!a || typeof a !== 'object' || Object.keys(a).sort().join(',') !== 'data,encoding,height,id,width' || a.encoding !== 'rgba8-base64') throw new RangeError('Unknown recipe asset encoding.');
    const size = recipeSize(a.width, a.height), expected = size.width * size.height * 4;
    total += expected;
    if (total > RECIPE_LIMITS.assetBytes) throw new RangeError('Recipe assets exceed 128 MiB decoded.');
    if (typeof a.data !== 'string' || a.data.length !== 4 * Math.ceil(expected / 3) || /[^A-Za-z0-9+/=]/.test(a.data)) throw new RangeError('Invalid base64 image asset.');
    let raw: string; try { raw = atob(a.data); } catch { throw new RangeError('Invalid base64 image asset.'); }
    if (raw.length !== expected) throw new RangeError('Incomplete recipe asset pixels.');
    const data = new Uint8ClampedArray(expected); for (let i = 0; i < expected; i++) data[i] = raw.charCodeAt(i);
    return { id: a.id, ...size, data };
  });
  return { ...value, assets };
}
