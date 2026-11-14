/**
 * PURPOSE    Compile the supported sketch-axis revolve definition into canonical parameters.
 * KIND       CORE
 * CONTRACT   IN: RevolveRecipeRequest with exact plain source records, matching nonempty
 *            sketch IDs, +V boss axis, empty profile/target selections, C03 canonical
 *            expression context and finite positive document tolerances.
 *            Parameters mode evaluates the angle without solved geometry. Profile mode
 *            also takes actual solved C64 segments/circles, ignoring construction.
 *            OUT: owned origin [0,0,0], direction [0,1,0], signed angleRad satisfying
 *            angularRad < abs(angleRad) <= 2π; profile mode adds one C64 outer loop.
 *            Polygons require every actual and compiled U >= 0; signed zero is valid.
 *            Circles require finite center/radius and centerU-radius > linearMm.
 *            RAISES: RevolveRecipeError with field/reason for malformed request/source,
 *            unsupported reference/axis/selection, invalid tolerance, angular range,
 *            holes or half-plane violation.
 * GUARANTEES Pure, deterministic, no I/O, mutation, normalization, reflection or snapping.
 *            Near-coincident endpoint clustering cannot hide a negative input U.
 * TUNING     Document linear/angular tolerances; one full turn is a fixed geometric bound.
 * DECISIONS  D1: Compile parameters separately from geometry. Alternative: solve during
 *            source edits, which would make pure variable validation depend on WASM.
 *            Revisit if: the general feature-recipe contract replaces this subset.
 *            D2: Check original endpoints as well as the compiled loop. Alternative:
 *            trusting clustered vertices makes axis rejection depend on entity order.
 *            Revisit if: C64 guarantees preservation of the entire supplied boundary.
 * LIMITS     One polygon/circle, no holes, +V axis only; does not certify a solid.
 *            C03 context and C64 solved-entity structure are caller preconditions.
 *            C03 expression and C64 profile errors propagate unchanged.
 * TESTBENCH  src/cad/revolve-recipe.test.ts -- run with: node --import tsx --test src/cad/revolve-recipe.test.ts
 */
import { evaluateDimension, type DimensionRequest } from './dimension-expressions.ts';
import { sketchRegions, type ProfileLoop } from './sketch-regions.ts';

type Definition = {
  kind: 'revolve'; operation: 'boss'; sketchId: string; profileLoopIds: [];
  axis: { kind: 'sketch-axis'; sketchId: string; axis: 'v' };
  angle: { source: string; kind: 'angle' }; targetBodyIds: [];
};
type Common = {
  source: Definition; sketchId: string; context: DimensionRequest['context'];
  tolerance: { linearMm: number; angularRad: number; relative: number };
};
export type RevolveRecipeRequest = Common & (
  { operation: 'parameters' } |
  { operation: 'profile'; entities: Parameters<typeof sketchRegions>[0]['entities'] }
);
type EvaluatedParameters = { axis: { origin: [number, number, number]; direction: [number, number, number] }; angleRad: number };
export type RevolveRecipeResult<T extends RevolveRecipeRequest = RevolveRecipeRequest> = EvaluatedParameters &
  (T extends { operation: 'profile' } ? { profile: ProfileLoop } : {});

const FULL_TURN = 2 * Math.PI;
function fail(field: string, reason: string): never {
  throw Object.assign(new Error(`${field}: ${reason}`), { name: 'RevolveRecipeError' });
}
function keys(value: unknown, expected: string[], field: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(field, 'expected a plain record');
  }
  const own = Reflect.ownKeys(value as object);
  if (own.length !== expected.length || own.some(key => typeof key !== 'string' || !expected.includes(key))) {
    fail(field, 'missing or unsupported fields');
  }
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) fail(field, 'expected plain data fields');
  }
}

export function revolveRecipe<T extends RevolveRecipeRequest>(request: T): RevolveRecipeResult<T> {
  if (!request || typeof request !== 'object') fail('request', 'expected a revolve recipe request');
  const operation = Object.getOwnPropertyDescriptor(request, 'operation')?.value;
  keys(request, ['operation', 'source', 'sketchId', 'context', 'tolerance', ...(operation === 'profile' ? ['entities'] : [])], 'request');
  if (operation !== 'parameters' && operation !== 'profile') fail('request.operation', 'choose parameters or profile');
  const { source, sketchId, context, tolerance } = request;
  if (typeof sketchId !== 'string' || !sketchId.trim()) fail('sketchId', 'expected a nonempty sketch reference');
  keys(source, ['kind', 'operation', 'sketchId', 'profileLoopIds', 'axis', 'angle', 'targetBodyIds'], 'source');
  if (source.kind !== 'revolve') fail('source.kind', 'expected revolve');
  if (source.operation !== 'boss') fail('source.operation', 'only a revolve boss is supported');
  if (source.sketchId !== sketchId) fail('source.sketchId', 'must reference the root sketch');
  for (const field of ['profileLoopIds', 'targetBodyIds'] as const) {
    if (!Array.isArray(source[field]) || source[field].length !== 0) fail(`source.${field}`, 'explicit selections are not supported');
  }
  keys(source.axis, ['kind', 'sketchId', 'axis'], 'source.axis');
  if (source.axis.kind !== 'sketch-axis' || source.axis.axis !== 'v') fail('source.axis', 'choose the sketch vertical axis (+V)');
  if (source.axis.sketchId !== sketchId) fail('source.axis.sketchId', 'must reference the root sketch');
  keys(source.angle, ['source', 'kind'], 'source.angle');
  if (source.angle.kind !== 'angle' || typeof source.angle.source !== 'string' || !source.angle.source.trim()) {
    fail('source.angle', 'expected a nonempty angle expression');
  }
  keys(tolerance, ['linearMm', 'angularRad', 'relative'], 'tolerance');
  for (const field of ['linearMm', 'angularRad', 'relative'] as const) {
    if (!Number.isFinite(tolerance[field]) || tolerance[field] <= 0) fail(`tolerance.${field}`, 'must be finite and positive');
  }
  const angleRad = evaluateDimension({ expression: source.angle, context }).value;
  if (Math.abs(angleRad) <= tolerance.angularRad || Math.abs(angleRad) > FULL_TURN) {
    fail('source.angle', 'sweep must exceed angular resolution and be no more than one full turn');
  }
  const parameters: EvaluatedParameters = { axis: { origin: [0, 0, 0], direction: [0, 1, 0] }, angleRad };
  if (request.operation === 'parameters') return parameters as RevolveRecipeResult<T>;
  if (!Array.isArray(request.entities)) fail('entities', 'expected solved sketch entities');
  const { outer, holes } = sketchRegions({ entities: request.entities, tolerance: tolerance.linearMm });
  if (holes.length) fail('profile', 'holes are not supported for this revolve');
  const boundaryPoint = (point: readonly number[]) => {
    if (!point.every(Number.isFinite) || point[0]! < 0) fail('profile', 'every U coordinate must be finite and nonnegative on the +V axis side');
  };
  // C64 may merge near-coincident endpoints; the original negative side must still reject.
  for (const entity of request.entities) if (entity.kind === 'segment' && !entity.construction) {
    boundaryPoint(entity.a); boundaryPoint(entity.b);
  }
  if (outer.kind === 'polygon') outer.points.forEach(boundaryPoint);
  else if (!outer.center.every(Number.isFinite) || !Number.isFinite(outer.radius) || outer.center[0] - outer.radius <= tolerance.linearMm) {
    fail('profile', 'circle axis clearance must exceed the document linear tolerance');
  }
  return { ...parameters, profile: outer } as RevolveRecipeResult<T>;
}
