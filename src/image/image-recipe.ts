/**
 * PURPOSE    Run portable Image action recipes.
 * KIND       CORE
 * CONTRACT   Assembly: composes validation, file encoding, scaling and execution.
 *            imageRecipe({operation:'validate',value}) returns an owned recipe;
 *            'encode' returns Uint8Array, 'decode' accepts bytes and returns recipe;
 *            'replay' accepts value plus state and returns final ImageOperationState.
 *            RAISES: RangeError with failed step label; input state remains unchanged.
 * GUARANTEES No automatic execution on decode, I/O, UI, clock or hidden clipboard.
 * TUNING     Shared RECIPE_LIMITS bounds the portable file and operation resources.
 * DECISIONS  D1: Each step scales against current dimensions and its own reference.
 *            Revisit if an explicit alternative coordinate policy is introduced.
 * LIMITS     Synchronous pure replay belongs in a cancellable worker for batch use.
 * TESTBENCH  src/image/image-recipe.test.ts
 * DEMO       node --import tsx src/image/image-recipe.demo.ts
 */
import { checkRecipeBudget } from './image-recipe-budget.ts';
import { validateRecipeData } from './image-recipe-data.ts';
import { encodeRecipe, decodeRecipe } from './image-recipe-codec.ts';
import { applyImageOperation } from './image-operations.ts';
import { scaleImageOperation } from './image-operations-scale.ts';
import type { ImageRecipe, ImageOperationState } from './image-operation-types.ts';
export { RECIPE_LIMITS } from './image-recipe-data.ts';
type Request = { operation: 'validate' | 'encode'; value: unknown } | { operation: 'decode'; bytes: Uint8Array } | { operation: 'replay'; value: unknown; state: ImageOperationState };
type Result<R extends Request> = R extends { operation: 'encode' } ? Uint8Array : R extends { operation: 'replay' } ? ImageOperationState : ImageRecipe;
export function imageRecipe<R extends Request>(request: R): Result<R> {
  if (!['validate', 'encode', 'decode', 'replay'].includes(request.operation)) throw new RangeError('Unknown actions request.');
  const recipe = validateRecipeData(request.operation === 'decode' ? decodeRecipe(request.bytes) : request.value);
  if (request.operation === 'encode') return encodeRecipe(recipe) as Result<R>;
  if (request.operation !== 'replay') return recipe as Result<R>;
  let state = request.state;
  checkRecipeBudget(state.image, recipe);
  for (const [index, step] of recipe.steps.entries()) {
    if (!step.enabled) continue;
    try { state = applyImageOperation(state, scaleImageOperation(step.operation, step.reference, state.image), recipe.assets); }
    catch (cause) { throw new RangeError(`Step ${index + 1} (${step.label}): ${cause instanceof Error ? cause.message : String(cause)}`); }
  }
  return state as Result<R>;
}
