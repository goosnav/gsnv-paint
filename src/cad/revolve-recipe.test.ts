import assert from 'node:assert/strict';
import test from 'node:test';
import { revolveRecipe, type RevolveRecipeRequest } from './revolve-recipe.ts';

type ProfileRequest = Extract<RevolveRecipeRequest, { operation: 'profile' }>;
type Entity = ProfileRequest['entities'][number];
type Point = [number, number];
const source = (angle = '360 deg'): RevolveRecipeRequest['source'] => ({
  kind: 'revolve', operation: 'boss', sketchId: 'sketch-1', profileLoopIds: [],
  axis: { kind: 'sketch-axis', sketchId: 'sketch-1', axis: 'v' },
  angle: { source: angle, kind: 'angle' }, targetBodyIds: [],
});
const parameters = (angle = '360 deg'): Extract<RevolveRecipeRequest, { operation: 'parameters' }> => ({
  operation: 'parameters', source: source(angle), sketchId: 'sketch-1',
  context: { units: 'mm', variables: {} }, tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 },
});
const polygon = (points: Point[], prefix = 'edge'): Entity[] => points.map((a, i) => ({
  id: `${prefix}-${i}`, kind: 'segment', a: [...a], b: [...points[(i + 1) % points.length]!], construction: false,
}));
const rectangle = (left = 10): Entity[] => polygon([[left, 0], [20, 0], [20, 12], [left, 12]]);
const circle = (u = 20, radius = 3): Entity => ({ id: 'circle', kind: 'circle', center: [u, 6], radius, construction: false });
const profile = (entities: readonly Entity[] = rectangle(), angle = '360 deg'): ProfileRequest => ({ ...parameters(angle), operation: 'profile', entities });
function rejects(value: unknown, field: RegExp, name = 'RevolveRecipeError') {
  assert.throws(() => revolveRecipe(value as RevolveRecipeRequest), (error: unknown) => {
    assert.ok(error instanceof Error); assert.equal(error.name, name); assert.match(error.message, field); return true;
  });
}
function adjacent(value: number, direction: 'up' | 'down'): number {
  const bytes = new DataView(new ArrayBuffer(8)); bytes.setFloat64(0, value);
  bytes.setBigUint64(0, bytes.getBigUint64(0) + (direction === 'up' ? 1n : -1n)); return bytes.getFloat64(0);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

test('C79 literal parameter and profile goldens retain the sketch +V axis and analytic shapes', () => {
  assert.deepEqual(revolveRecipe(parameters('180 deg')), { axis: { origin: [0, 0, 0], direction: [0, 1, 0] }, angleRad: Math.PI });
  assert.deepEqual(revolveRecipe(profile(rectangle(), '-90 deg')), {
    axis: { origin: [0, 0, 0], direction: [0, 1, 0] }, angleRad: -Math.PI / 2,
    profile: { kind: 'polygon', points: [[10, 0], [20, 0], [20, 12], [10, 12]] },
  });
  assert.deepEqual(revolveRecipe(profile([circle()])), {
    axis: { origin: [0, 0, 0], direction: [0, 1, 0] }, angleRad: 2 * Math.PI,
    profile: { kind: 'circle', center: [20, 6], radius: 3 },
  });
});

test('C79 degrees, radians and canonical angle variables keep their meaning in mm and inch', () => {
  for (const units of ['mm', 'inch'] as const) {
    for (const [text, expected] of [['90', Math.PI / 2], ['-360°', -2 * Math.PI], ['1.5 rad', 1.5], ['sweep / 2', Math.PI / 4], ['sweep + 90', Math.PI]] as const) {
      const input = parameters(text); input.context = { units, variables: { sweep: { value: Math.PI / 2, kind: 'angle' } } };
      assert.equal(revolveRecipe(input).angleRad, expected);
    }
  }
});

test('C79 variable edits are reevaluated, and missing or wrong-kind variables remain errors', () => {
  const input = parameters('sweep / 2');
  input.context = { units: 'mm', variables: { sweep: { value: Math.PI, kind: 'angle' } } };
  assert.equal(revolveRecipe(input).angleRad, Math.PI / 2);
  input.context = { units: 'mm', variables: { sweep: { value: Math.PI / 2, kind: 'angle' } } };
  assert.equal(revolveRecipe(input).angleRad, Math.PI / 4);
  input.context = { units: 'inch', variables: {} }; rejects(input, /sweep/, 'UnknownVariableError');
  for (const kind of ['scalar', 'length'] as const) {
    input.context = { units: 'mm', variables: { sweep: { value: 90, kind } } }; rejects(input, /angle/, 'UnitMismatchError');
  }
  input.context = { units: 'mm', variables: { sweep: { value: Infinity, kind: 'angle' } } }; rejects(input, /finite/, 'NonFiniteValueError');
});

test('C79 preserves expression error type and token instead of converting invalid text to a sweep', () => {
  for (const [text, name, reason] of [['1/0', 'DivisionByZeroError', /zero/], ['90(', 'ExpressionSyntaxError', /operator/], ['1e309 rad', 'NonFiniteValueError', /finite/], ['2mm', 'UnitMismatchError', /angle/]] as const) {
    rejects(parameters(text), reason, name);
  }
  assert.throws(() => revolveRecipe(parameters('missing')), (error: unknown) => {
    const located = error as Error & { token: string; offset: number };
    assert.equal(located.name, 'UnknownVariableError'); assert.equal(located.token, 'missing'); assert.equal(located.offset, 0); return true;
  });
});

test('C79 angular limits reject exact resolution, zero and multiple turns without wrapping or losing sign', () => {
  const lower = parameters().tolerance.angularRad, upper = 2 * Math.PI;
  for (const sign of [1, -1]) {
    for (const amount of [0, adjacent(lower, 'down'), lower, adjacent(upper, 'up'), 4 * Math.PI]) rejects(parameters(`${sign * amount} rad`), /angle|sweep/i);
    for (const amount of [adjacent(lower, 'up'), adjacent(upper, 'down'), upper]) assert.equal(revolveRecipe(parameters(`${sign * amount} rad`)).angleRad, sign * amount);
  }
  rejects(parameters('-0 deg'), /angle|sweep/i);
  const impossible = parameters(); impossible.tolerance.angularRad = upper; rejects(impossible, /angle|sweep/i);
});

test('C79 tolerances must be complete finite positive document quantities', () => {
  for (const key of ['linearMm', 'angularRad', 'relative'] as const) for (const invalid of [0, -1, NaN, Infinity, -Infinity, '1']) {
    rejects({ ...parameters(), tolerance: { ...parameters().tolerance, [key]: invalid } }, /tolerance/i);
  }
  for (const tolerance of [null, {}, { linearMm: 1e-7, angularRad: 1e-9 }, { ...parameters().tolerance, extra: 1 }]) rejects({ ...parameters(), tolerance }, /tolerance/i);
  const fine = parameters(); fine.tolerance = { linearMm: Number.MIN_VALUE, angularRad: Number.MIN_VALUE, relative: 1e100 };
  assert.equal(revolveRecipe(fine).angleRad, 2 * Math.PI);
});

test('C79 malformed definitions, unsupported operations and selections reject with the affected field', () => {
  const cases: [unknown, RegExp][] = [
    [null, /source/i], [{ ...source(), extra: true }, /source/i], [{ ...source(), kind: 'extrude' }, /kind/i],
    [{ ...source(), operation: 'cut' }, /operation/i], [{ ...source(), sketchId: 'other' }, /sketch/i],
    [{ ...source(), profileLoopIds: ['loop'] }, /profileLoopIds/i], [{ ...source(), profileLoopIds: null }, /profileLoopIds/i],
    [{ ...source(), targetBodyIds: ['body'] }, /targetBodyIds/i], [{ ...source(), targetBodyIds: {} }, /targetBodyIds/i],
    [{ ...source(), angle: null }, /angle/i], [{ ...source(), angle: { source: '90', kind: 'length' } }, /angle/i],
    [{ ...source(), angle: { source: '  ', kind: 'angle' } }, /angle/i], [{ ...source(), angle: { source: 90, kind: 'angle' } }, /angle/i],
    [{ ...source(), angle: { source: '90', kind: 'angle', evaluated: 1 } }, /angle/i],
  ];
  for (const [value, reason] of cases) for (const input of [parameters(), profile()]) rejects({ ...input, source: value }, reason);
  const missing = source() as unknown as Record<string, unknown>; delete missing.operation; rejects({ ...parameters(), source: missing }, /source/i);
});

test('C79 axis and root references cannot drift from the declared local +V sketch axis', () => {
  for (const axis of [null, { ...source().axis, axis: 'u' }, { ...source().axis, axis: '-v' }, { ...source().axis, kind: 'world' }, { ...source().axis, sketchId: 'other' }, { ...source().axis, origin: [0, 0, 0] }]) {
    for (const input of [parameters(), profile()]) rejects({ ...input, source: { ...source(), axis } }, /axis/i);
  }
  for (const sketchId of ['', '   ', null, 1]) rejects({ ...parameters(), sketchId }, /sketch/i);
});

test('C79 request modes reject unknown fields and require solved entities only for profile compilation', () => {
  for (const invalid of [null, undefined, {}, { ...parameters(), operation: 'native' }, { ...parameters(), cachedMesh: [] }, { ...parameters(), entities: [] }]) rejects(invalid, /request|operation/i);
  rejects({ ...parameters(), operation: 'profile' }, /entities|request/i);
  rejects({ ...profile(), entities: null }, /entities/i);
  assert.equal('profile' in revolveRecipe(parameters()), false);
});

test('C79 polygon boundaries accept exact axis contact and reject every negative U', () => {
  for (const left of [0, -0, Number.MIN_VALUE, 1e-12, 1]) {
    const result = revolveRecipe(profile(rectangle(left))); assert.equal(result.profile.kind, 'polygon');
  }
  for (const left of [-Number.MIN_VALUE, -5e-8, -1e-7, -2, -20]) rejects(profile(rectangle(left)), /axis|negative|nonnegative|U/i);
});

test('C79 clustering cannot hide a negative solved endpoint in either entity order', () => {
  const entities = rectangle(0), closing = entities[3]!;
  assert.equal(closing.kind, 'segment'); if (closing.kind !== 'segment') throw new Error('fixture');
  closing.a[0] = -5e-8; closing.b[0] = -5e-8;
  rejects(profile(entities), /axis|negative|nonnegative|U/i);
  rejects(profile([...entities].reverse()), /axis|negative|nonnegative|U/i);
});

test('C79 circular boundaries need strictly more than the linear tolerance of axis clearance', () => {
  for (const center of [0, 2, 3, 3.5]) { const input = profile([circle(center)]); input.tolerance.linearMm = 0.5; rejects(input, /axis|clearance|U/i); }
  const input = profile([circle(adjacent(3.5, 'up'))]); input.tolerance.linearMm = 0.5;
  assert.deepEqual(revolveRecipe(input).profile, { kind: 'circle', center: [adjacent(3.5, 'up'), 6], radius: 3 });
  rejects(profile([circle(20, 0)]), /collapsed/, 'ProfileError');
  rejects(profile([circle(Infinity)]), /collapsed/, 'ProfileError');
});

test('C79 never drops holes or chooses one of several outer boundaries', () => {
  rejects(profile([...rectangle(), { ...circle(15, 1), id: 'hole' }]), /holes/i);
  rejects(profile([circle(20, 5), { ...circle(20, 1), id: 'hole' }]), /holes/i);
  rejects(profile([...rectangle(), ...polygon([[30, 0], [40, 0], [40, 12], [30, 12]], 'second')]), /one outer|fully inside/, 'ProfileError');
});

test('C79 propagates empty, open and self-intersecting topology failures from the real compiler', () => {
  rejects(profile([]), /closed profile/, 'ProfileError');
  rejects(profile(rectangle().slice(0, 3)), /open|branched|three/, 'ProfileError');
  rejects(profile(polygon([[10, 0], [20, 12], [10, 12], [20, 0]])), /intersect/, 'ProfileError');
  const nonfinite = rectangle(); if (nonfinite[0]!.kind === 'segment') nonfinite[0]!.a[1] = NaN;
  rejects(profile(nonfinite), /collapsed/, 'ProfileError');
});

test('C79 excludes construction geometry before testing half-plane and region policy', () => {
  const entities = [...rectangle(), ...polygon([[-20, 0], [-10, 0], [-10, 12], [-20, 12]], 'construction').map(e => ({ ...e, construction: true })), { ...circle(-100, 300), id: 'reference', construction: true }];
  const result = revolveRecipe(profile(entities)); assert.deepEqual(result.profile, { kind: 'polygon', points: [[10, 0], [20, 0], [20, 12], [10, 12]] });
});

test('C79 returns owned axes and loops without mutating successful or rejected input', () => {
  for (const entities of [rectangle(), [circle()]]) {
    const input = freeze(profile(entities)), before = structuredClone(input), expected = structuredClone(revolveRecipe(input)), result = revolveRecipe(input);
    result.axis.origin[0] = 100; result.axis.direction[1] = -1;
    if (result.profile.kind === 'polygon') result.profile.points[0]![0] = -999;
    else { result.profile.center[0] = -999; result.profile.radius = 99; }
    assert.deepEqual(input, before); assert.deepEqual(revolveRecipe(input), expected);
  }
  const invalid = freeze(profile(rectangle(-1))), before = structuredClone(invalid); rejects(invalid, /axis|negative|nonnegative|U/i); assert.deepEqual(invalid, before);
});

test('C79 equivalent endpoint directions and loop orders preserve the physical section', () => {
  for (const left of [0, 1, 10]) {
    const original = rectangle(left);
    for (let start = 0; start < 4; start++) for (const reverse of [false, true]) {
      const rotated = [...original.slice(start), ...original.slice(0, start)], entities = reverse ? rotated.reverse().map(e => e.kind === 'segment' ? { ...e, a: e.b, b: e.a } : e) : rotated;
      const loop = revolveRecipe(profile(entities)).profile; assert.equal(loop.kind, 'polygon'); if (loop.kind !== 'polygon') throw new Error('polygon expected');
      const area = loop.points.reduce((sum, p, i) => { const q = loop.points[(i + 1) % loop.points.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
      assert.equal(area, (20 - left) * 12); assert.deepEqual([...loop.points].sort((a, b) => a[0] - b[0] || a[1] - b[1]), [[left, 0], [left, 12], [20, 0], [20, 12]]);
    }
  }
});
