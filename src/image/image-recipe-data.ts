/**
 * PURPOSE    Canonicalize portable Image recipe data.
 * KIND       CORE
 * CONTRACT   validateRecipeData(unknown) copies/freezes a runtime recipe; binary
 *            assets stay owned typed arrays. RAISES: RangeError for malformed data.
 * GUARANTEES Exact schema, unique IDs, bounded decoded assets and total samples.
 * TUNING     1000 steps, 1000000 samples, 128 MiB assets, 192 MiB encoded file.
 * DECISIONS  D1: Lossless RGBA assets preserve hidden RGB and text appearance.
 *            Alternative: PNG assets. Revisit if streaming asset containers are added.
 * LIMITS     Runtime validation does not execute or resolve browser file handles.
 * TESTBENCH  src/image/image-recipe.test.ts
 * DEMO       node --import tsx src/image/image-recipe.demo.ts
 */
import { isRasterSize } from './raster-ops.ts';
import { validateImageOperation } from './image-operations-validate.ts';
import type { ImageRecipe, ImageRecipeAsset, ImageRecipeStep } from './image-operation-types.ts';
export const RECIPE_LIMITS = Object.freeze({ steps: 1000, samples: 1000000, assetBytes: 128 * 1024 * 1024, fileBytes: 192 * 1024 * 1024 });
const fail = (message: string): never => { throw new RangeError(message); };
const exact = (value: unknown, keys: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys) fail('Recipe record has missing or unknown fields.');
  return value as Record<string, unknown>;
};
const identifier = (value: unknown): string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value) ? value : fail('Invalid recipe identifier.');
const name = (value: unknown): string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f]/.test(value) ? value : fail('Recipe names need 1–256 printable characters.');
export function recipeSize(width: unknown, height: unknown): { width: number; height: number } {
  if (typeof width !== 'number' || typeof height !== 'number' || !isRasterSize(width, height)) fail('Recipe image dimensions exceed the pixel limit.');
  return { width: width as number, height: height as number };
}
export function validateRecipeData(value: unknown): ImageRecipe {
  const r = exact(value, 'assets,format,name,output,steps,version');
  if (r.format !== 'gsnv-actions' || r.version !== 1 || !['png', 'project'].includes(r.output as string)) fail('Unsupported Image actions format, version or output.');
  if (!Array.isArray(r.steps) || r.steps.length > RECIPE_LIMITS.steps || !Array.isArray(r.assets) || r.assets.length > RECIPE_LIMITS.steps) fail('An action supports up to 1000 steps and assets.');
  let bytes = 0, samples = 0;
  const assetIDs = new Set<string>(), stepIDs = new Set<string>();
  const assets: ImageRecipeAsset[] = (r.assets as unknown[]).map(value => {
    const a = exact(value, 'data,height,id,width'), id = identifier(a.id), size = recipeSize(a.width, a.height);
    if (assetIDs.has(id)) fail('Recipe asset IDs must be unique.'); assetIDs.add(id);
    bytes += size.width * size.height * 4;
    if (bytes > RECIPE_LIMITS.assetBytes) fail('Recipe assets exceed 128 MiB decoded.');
    if (!(a.data instanceof Uint8ClampedArray) || !(a.data.buffer instanceof ArrayBuffer) || a.data.byteLength !== size.width * size.height * 4) fail('Recipe asset pixels are incomplete.');
    return Object.freeze({ id, ...size, data: new Uint8ClampedArray(a.data as Uint8ClampedArray) });
  });
  const steps: ImageRecipeStep[] = (r.steps as unknown[]).map(value => {
    const s = exact(value, 'enabled,id,label,operation,reference'), id = identifier(s.id), ref = exact(s.reference, 'height,width');
    if (stepIDs.has(id)) fail('Recipe step IDs must be unique.'); stepIDs.add(id);
    if (typeof s.enabled !== 'boolean') fail('Step enabled must be boolean.');
    const operation = validateImageOperation(s.operation);
    if (operation.kind === 'stroke') samples += operation.segments.reduce((n, s) => n + s.points.length, 0);
    if (operation.kind === 'selection' && operation.action === 'shape' && operation.shape.kind === 'polygon') samples += operation.shape.points.length;
    if (samples > RECIPE_LIMITS.samples) fail('Recipe exceeds one million samples.');
    if (operation.kind === 'affine' && operation.asset && !assetIDs.has(operation.asset)) fail(`Missing transform asset: ${operation.asset}.`);
    if (operation.kind === 'paste' && operation.source.kind === 'asset' && !assetIDs.has(operation.source.id)) fail(`Missing recipe asset: ${operation.source.id}.`);
    return Object.freeze({ id, label: name(s.label), enabled: s.enabled as boolean, reference: Object.freeze(recipeSize(ref.width, ref.height)), operation });
  });
  return Object.freeze({ format: 'gsnv-actions', version: 1, name: name(r.name), output: r.output as 'png' | 'project', steps: Object.freeze(steps), assets: Object.freeze(assets) });
}
