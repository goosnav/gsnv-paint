/**
 * PURPOSE    Convert bounded script results into portable actions.
 * KIND       CORE
 * CONTRACT   recipeScriptProgram(source,metadata,runId) produces worker-only source;
 *            recipeScriptResult(stdout,metadata,runId) validates one JSON envelope
 *            and returns an ImageRecipe. RAISES: RangeError on malformed data.
 * GUARANTEES Source/result UTF-8 limits, exact envelope, no asset references or I/O.
 * TUNING     64 KiB source, 128 KiB result, at most 1000 semantic operations.
 * DECISIONS  D1: Result is data for CORE validation, never a host command.
 *            Alternative: RPC editing authority. Revisit if script assets are added.
 * LIMITS     Network/storage isolation belongs to executeCodeFrame, not this wrapper.
 * TESTBENCH  src/image/image-recipe-script-program.test.ts
 * DEMO       node --import tsx src/image/image-recipe-script.demo.ts
 */
import { validateImageOperation } from './image-operations-validate.ts';
import { validateRecipeData, recipeSize, RECIPE_LIMITS } from './image-recipe-data.ts';
import type { ImageRecipe, ImageRecipeStep, ImageReference, ImageOperation } from './image-operation-types.ts';
export type RecipeScriptImage = ImageReference & { readonly layerCount: number };
export const SCRIPT_LIMITS = Object.freeze({ sourceBytes: 64 * 1024, resultBytes: 128 * 1024 });
function metadata(image: RecipeScriptImage, runId: string): RecipeScriptImage {
  recipeSize(image?.width, image?.height);
  if (!Number.isInteger(image.layerCount) || image.layerCount < 1 || image.layerCount > 100) throw new RangeError('Script image layer count must be from 1 to 100.');
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(runId)) throw new RangeError('Invalid script run identifier.');
  return { width: image.width, height: image.height, layerCount: image.layerCount };
}
export function recipeScriptProgram(source: string, image: RecipeScriptImage, runId: string): string {
  if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > SCRIPT_LIMITS.sourceBytes) throw new RangeError('JavaScript actions support at most 64 KiB of source.');
  const dimensions = metadata(image, runId);
  return `await (async () => {
  "use strict";
  const emit = console.log.bind(console), stringify = JSON.stringify.bind(JSON), Encoder = TextEncoder;
  const image = Object.freeze(${JSON.stringify(dimensions)}), collected = [];
  const add = operation => { if (collected.length >= 1000) throw new RangeError("An action supports at most 1000 steps."); collected.push(operation); };
  const ops = Object.freeze({
    adjust: adjustment => ({kind:"adjust",adjustment}),
    resize: (width,height) => ({kind:"transform",transform:{kind:"resize",width,height}}),
    downpixel: (width,height,resize=false) => ({kind:"downpixel",width,height,resize}),
    selectionAll: () => ({kind:"selection",action:"all"}),
    layerNew: name => ({kind:"layer",action:"new",name})
  });
  const returned = await (async (image, add, ops) => {
${source}
  })(image,add,ops);
  if (returned !== undefined && !Array.isArray(returned)) throw new TypeError("Return an operation array, or use add(op).");
  if (returned !== undefined && collected.length) throw new TypeError("Use add(op) or return an array, not both.");
  const operations = returned === undefined ? collected : returned;
  if (operations.length > 1000) throw new RangeError("An action supports at most 1000 steps.");
  const json = stringify({format:"gsnv-script-result",version:1,runId:${JSON.stringify(runId)},operations});
  if (new Encoder().encode(json + "\\n").byteLength > ${SCRIPT_LIMITS.resultBytes}) throw new RangeError("Script result exceeds 128 KiB.");
  emit(json);
})()`;
}
function nextSize(op: ImageOperation, size: ImageReference): ImageReference {
  if (op.kind === 'downpixel') {
    if (op.width > size.width || op.height > size.height) throw new RangeError('Down-pixel dimensions cannot exceed the current image.');
    return op.resize ? { width: op.width, height: op.height } : size;
  }
  if (op.kind !== 'transform') return size;
  const t = op.transform;
  if (t.kind === 'resize' || t.kind === 'canvas') return { width: t.width, height: t.height };
  if (t.kind === 'rotate' && t.turns !== 2) return { width: size.height, height: size.width };
  if (t.kind === 'crop') return recipeSize(Math.max(0, Math.min(size.width, t.rect.x + t.rect.width) - Math.max(0, t.rect.x)), Math.max(0, Math.min(size.height, t.rect.y + t.rect.height) - Math.max(0, t.rect.y)));
  return size;
}
export function recipeScriptResult(stdout: string, image: RecipeScriptImage, runId: string): ImageRecipe {
  const initial = metadata(image, runId);
  if (typeof stdout !== 'string' || new TextEncoder().encode(stdout).byteLength > SCRIPT_LIMITS.resultBytes) throw new RangeError('Script result exceeds 128 KiB.');
  let result: unknown;
  try { result = JSON.parse(stdout); } catch { throw new RangeError('Script must produce one JSON result. Remove console output and use add(op) or return an operation array.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).sort().join(',') !== 'format,operations,runId,version') throw new RangeError('Invalid script result envelope.');
  const r = result as Record<string, unknown>;
  if (r.format !== 'gsnv-script-result' || r.version !== 1 || r.runId !== runId || !Array.isArray(r.operations) || r.operations.length > RECIPE_LIMITS.steps) throw new RangeError('Unsupported script result or operation count.');
  let size: ImageReference = { width: initial.width, height: initial.height };
  const steps: ImageRecipeStep[] = r.operations.map((value: unknown, index: number) => {
    const operation = validateImageOperation(value);
    if (operation.kind === 'paste' && operation.source.kind === 'asset') throw new RangeError('Scripts cannot request external image assets. Use the current input clipboard.');
    const reference = size; size = nextSize(operation, size);
    return { id: `script-${index + 1}`, label: `Step ${index + 1}: ${operation.kind}`, enabled: true, reference, operation };
  });
  return validateRecipeData({ format: 'gsnv-actions', version: 1, name: 'JavaScript action', output: 'png', steps, assets: [] });
}
