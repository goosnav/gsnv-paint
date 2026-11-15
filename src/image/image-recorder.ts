/**
 * PURPOSE    Record effective semantic Image actions.
 * KIND       CORE
 * CONTRACT   imageRecorder(start|observe|navigate|stop) returns a frozen version-1
 *            session with status, reason and effective portable recipe. Start takes
 *            immutable ImageContent; observe takes actual before/after identities,
 *            label and explicit semantic operations (null means unsupported).
 *            RAISES: RangeError for invalid start data; TypeError for unknown kind.
 *            Invalid observed data pauses atomically with a readable reason.
 * GUARANTEES Deterministic, no I/O or document edits. Undo/Redo tracks identities;
 *            unsupported edits never silently disappear. Incoming data is copied;
 *            retained assets share owned immutable-by-contract typed arrays.
 * TUNING     RECIPE_LIMITS bounds steps, samples and decoded asset bytes.
 * DECISIONS  D1: Identity checkpoints mirror immutable document history.
 *            Alternative: DOM/event recording; rejected because previews and
 *            cancelled gestures are not committed edits. Revisit if: history
 *            changes to stable transaction IDs rather than immutable roots.
 *            D2: Any new recorded operation after Undo branches the recording.
 *            Alternative: merge non-history clipboard effects into future edits;
 *            rejected because their dependencies can be ambiguous. Revisit if:
 *            clipboard state becomes part of the application's undo history.
 * LIMITS     Session state is process-local: serialize recipe only. Callers must
 *            report every semantic edit and navigate restored identities. A paused
 *            session requires Stop then Start; old roots remain until it is released.
 * TESTBENCH  node --import tsx --test src/image/image-recorder.test.ts
 * DEMO       node --import tsx src/image/image-recorder.demo.ts
 */
import { RECIPE_LIMITS, recipeSize, validateRecipeData } from './image-recipe-data.ts';
import { validateImageOperation } from './image-operations-validate.ts';
import type { ImageOperation, ImageOperationState, ImageRecipe, ImageRecipeAsset, ImageRecipeStep, ImageReference } from './image-operation-types.ts';

type Image = ImageOperationState['image'];
type Entry = { readonly operation: ImageOperation; readonly reference: ImageReference; readonly assets?: readonly ImageRecipeAsset[] };
type Checkpoint = { readonly image: Image; readonly count: number };
export type ImageRecordingState = {
  readonly version: 1;
  readonly status: 'recording' | 'paused' | 'stopped';
  readonly reason: string | null;
  readonly recipe: ImageRecipe;
  /** Opaque session bookkeeping; keep intact and never serialize it. */
  readonly history: { readonly frames: readonly Checkpoint[]; readonly cursor: number; readonly complete: ImageRecipe; readonly sequence: number };
};
export type ImageRecorderRequest =
  | { kind: 'start'; image: Image; name: string; output?: 'png' | 'project' }
  | { kind: 'observe'; state: ImageRecordingState; before: Image; after: Image; label: string; operations: readonly Entry[] | null }
  | { kind: 'navigate'; state: ImageRecordingState; image: Image }
  | { kind: 'stop'; state: ImageRecordingState };
const fail = (message: string): never => { throw new RangeError(message); };
function freeze(state: ImageRecordingState): ImageRecordingState {
  return Object.freeze({ ...state, history: Object.freeze({ ...state.history, frames: Object.freeze(state.history.frames.map(frame => Object.isFrozen(frame) ? frame : Object.freeze(frame))) }) });
}
function pause(state: ImageRecordingState, reason: string): ImageRecordingState {
  return freeze({ ...state, status: 'paused', reason });
}
function empty(name: string, output: 'png' | 'project', assets: readonly ImageRecipeAsset[] = []): ImageRecipe {
  return validateRecipeData({ format: 'gsnv-actions', version: 1, name, output, steps: [], assets });
}
function assetId(operation: ImageOperation): string | undefined {
  return operation.kind === 'paste' && operation.source.kind === 'asset' ? operation.source.id : operation.kind === 'affine' ? operation.asset : undefined;
}
function selectRecipe(recipe: ImageRecipe, steps: readonly ImageRecipeStep[]): ImageRecipe {
  const ids = new Set(steps.map(s => assetId(s.operation)).filter(id => id !== undefined));
  return Object.freeze({ ...recipe, steps: Object.freeze(steps), assets: Object.freeze(recipe.assets.filter(a => ids.has(a.id))) });
}
function sampleCount(operation: ImageOperation): number {
  if (operation.kind === 'stroke') return operation.segments.reduce((n, segment) => n + segment.points.length, 0);
  return operation.kind === 'selection' && operation.action === 'shape' && operation.shape.kind === 'polygon' ? operation.shape.points.length : 0;
}
function append(state: ImageRecordingState, request: Extract<ImageRecorderRequest, { kind: 'observe' }>): ImageRecordingState {
  const entries = request.operations;
  if (!Array.isArray(entries) || !entries.length) return pause(state, `Recording paused: “${request.label}” has no supported recording operation. Stop and start a new recording to continue.`);
  const before = state.recipe;
  if (before.steps.length + entries.length > RECIPE_LIMITS.steps) fail('An action supports up to 1000 steps.');
  recipeSize(request.after?.width, request.after?.height);
  const label = empty(request.label, before.output).name;
  const assets = new Map(before.assets.map(asset => [asset.id, asset]));
  let bytes = before.assets.reduce((n, asset) => n + asset.data.byteLength, 0), assetRecords = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !entry.reference || (entry.assets !== undefined && !Array.isArray(entry.assets))) fail('Malformed recorded operation.');
    assetRecords += entry.assets?.length ?? 0;
    if (assetRecords > RECIPE_LIMITS.steps) fail('A recording commit supports up to 1000 assets.');
    for (const raw of entry.assets ?? []) {
      const asset = empty(label, before.output, [raw]).assets[0]!;
      const previous = assets.get(asset.id);
      if (previous) {
        if (previous.width !== asset.width || previous.height !== asset.height || !previous.data.every((value, i) => value === asset.data[i])) fail(`Asset ${asset.id} was reused with different pixels.`);
      } else {
        bytes += asset.data.byteLength;
        if (bytes > RECIPE_LIMITS.assetBytes) fail('Recipe assets exceed 128 MiB decoded.');
        if (assets.size >= RECIPE_LIMITS.steps) fail('An action supports up to 1000 assets.');
        assets.set(asset.id, asset);
      }
    }
  }
  let samples = before.steps.reduce((n, step) => n + sampleCount(step.operation), 0), sequence = state.history.sequence;
  const steps = entries.map(entry => {
    const operation = validateImageOperation(entry.operation);
    const reference = Object.freeze(recipeSize(entry.reference.width, entry.reference.height));
    samples += sampleCount(operation);
    if (samples > RECIPE_LIMITS.samples) fail('Recipe exceeds one million samples.');
    const id = assetId(operation);
    if (id !== undefined && !assets.has(id)) fail(`Missing recipe asset: ${id}.`);
    return Object.freeze({ id: `step-${++sequence}`, label, enabled: true, reference, operation });
  });
  const complete = selectRecipe({ ...before, assets: [...assets.values()] }, [...before.steps, ...steps]);
  const frames = state.history.frames.slice(0, state.history.cursor + 1);
  const checkpoint = Object.freeze({ image: request.after, count: complete.steps.length });
  if (request.before === request.after) frames[frames.length - 1] = checkpoint;
  else frames.push(checkpoint);
  return freeze({ ...state, recipe: complete, history: { frames, cursor: frames.length - 1, complete, sequence } });
}

export function imageRecorder(request: ImageRecorderRequest): ImageRecordingState {
  if (request.kind === 'start') {
    recipeSize(request.image?.width, request.image?.height);
    const recipe = empty(request.name, request.output ?? 'png');
    return freeze({ version: 1, status: 'recording', reason: null, recipe, history: { frames: [{ image: request.image, count: 0 }], cursor: 0, complete: recipe, sequence: 0 } });
  }
  if (!['observe', 'navigate', 'stop'].includes(request.kind)) throw new TypeError('Unknown recording command.');
  const state = request.state;
  if (request.kind === 'stop') return state.status === 'stopped' ? state : freeze({ ...state, status: 'stopped' });
  if (state.status !== 'recording') return state;
  const current = state.history.frames[state.history.cursor]!;
  if (request.kind === 'navigate') {
    if (request.image === current.image) return state;
    const cursor = state.history.frames.findIndex(frame => frame.image === request.image);
    if (cursor === -1) return pause(state, 'Recording paused: history moved outside this recording boundary or into a discarded branch. Stop and start a new recording to continue.');
    const recipe = selectRecipe(state.history.complete, state.history.complete.steps.slice(0, state.history.frames[cursor]!.count));
    return freeze({ ...state, recipe, history: { ...state.history, cursor } });
  }
  if (request.before === request.after && (!request.operations || request.operations.length === 0)) return state;
  if (request.before !== current.image) return pause(state, 'Recording paused: the document changed outside the observed history. Stop and start a new recording to continue.');
  if (request.after !== request.before && state.history.frames.some(frame => frame.image === request.after)) return pause(state, 'Recording paused: a committed edit reused an earlier history identity. Restore it through history navigation instead.');
  try { return append(state, request); }
  catch (cause) { return pause(state, `Recording paused at “${String(request.label).slice(0, 256)}”: ${cause instanceof Error ? cause.message : String(cause)}`); }
}
