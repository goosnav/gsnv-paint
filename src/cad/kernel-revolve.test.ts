import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevolvedSolid } from './kernel-revolve.ts';
import { revolveKernelFake } from './kernel-revolve-test-fixture.ts';
import { revolveRecipe, type RevolveRecipeRequest } from './revolve-recipe.ts';
import { kernelFixture } from './kernel-test-fixture.ts';
import { proofBounds } from './revolve-proof-fixture.ts';
import { stepExchange } from './step-exchange.ts';

type ProfileRequest = Extract<RevolveRecipeRequest, { operation: 'profile' }>;
type Entity = ProfileRequest['entities'][number];
const rectangle = (inner = 10, outer = 20): Entity[] => {
  const points: [number, number][] = [[inner, 0], [outer, 0], [outer, 12], [inner, 12]];
  return points.map((a, i) => ({ id: `edge-${i}`, kind: 'segment', a, b: points[(i + 1) % points.length]!, construction: false }));
};
const circle = (): Entity[] => [{ id: 'circle', kind: 'circle', center: [20, 6], radius: 3, construction: false }];
const recipe = (entities = rectangle(), angle = '360 deg', units: 'mm' | 'inch' = 'mm') => revolveRecipe({
  operation: 'profile', entities, sketchId: 'sketch',
  source: { kind: 'revolve', operation: 'boss', sketchId: 'sketch', profileLoopIds: [], targetBodyIds: [],
    axis: { kind: 'sketch-axis', sketchId: 'sketch', axis: 'v' }, angle: { source: angle, kind: 'angle' } },
  context: { units, variables: {} }, tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 },
} as ProfileRequest);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) <= 1e-6, `${actual} vs ${expected}`);
const vectorNear = (actual: number[], expected: number[]) => actual.forEach((value, i) => near(value, expected[i]!));

test('C78 constructs the signed local axis, owns one output and cleans every temporary before retention', () => {
  for (const entities of [rectangle(), circle()]) {
    const f = revolveKernelFake(), input = recipe(entities, '-90 deg'), before = structuredClone(input);
    Object.freeze(input.axis.origin); Object.freeze(input.axis.direction); Object.freeze(input.axis); Object.freeze(input);
    const token = buildRevolvedSolid({ session: f.session, recipe: input });
    assert.deepEqual(token, { id: 1, generation: 7 }); assert.deepEqual(input, before);
    assert.equal(f.retained.size, 1); const output = f.retained.get(token.id)!;
    assert.equal(output.label, 'solid'); assert.deepEqual(f.liveAtRetain, [[output.id]]);
    assert.deepEqual(f.allocated.filter(value => !value.deleted), [output]);
    assert.equal(f.trace.at(-1), 'session.retain');
    const axis = f.allocated.find(value => value.label === 'revolve-axis')!;
    assert.deepEqual((axis.args[0] as { args: number[] }).args, [0, 0, 0]);
    assert.deepEqual((axis.args[1] as { args: number[] }).args, [0, 1, 0]);
    const face = f.allocated.find(value => value.label === 'face')!;
    const builder = f.allocated.find(value => value.label === 'revolve-builder')!;
    assert.deepEqual(builder.args, [face, axis, -Math.PI / 2, true]);
    const ownedByC78 = f.allocated.filter(value => value.id >= face.id && value !== output);
    assert.deepEqual(f.deleted.slice(-ownedByC78.length), ownedByC78.map(value => value.id).reverse());
    f.session.release(token); assert.equal(f.retained.size, 0); assert.ok(f.allocated.every(value => value.deleted));
  }
});

test('C78 rejects every ordinary native failure with a readable reason and complete ownership cleanup', () => {
  const cases = [
    { reject: 'wire', reason: /wire|outline|profile/i }, { reject: 'face', reason: /face|profile/i },
    { reject: 'final-face', reason: /face|profile/i }, { reject: 'revolve', reason: /complete|construct|operation/i },
    { reject: 'null', reason: /empty|null|solid/i }, { reject: 'compound', reason: /single|one|solid/i },
    { reject: 'shell', reason: /single|one|solid/i }, { reject: 'invalid', reason: /valid/i },
  ] as const;
  for (const entities of [rectangle(), circle()]) for (const item of cases) {
    const f = revolveKernelFake({ reject: item.reject });
    assert.throws(() => buildRevolvedSolid({ session: f.session, recipe: recipe(entities) }), { name: 'RevolveError', message: item.reason });
    assert.equal(f.retained.size, 0); assert.ok(f.allocated.every(value => value.deleted));
    assert.equal(new Set(f.deleted).size, f.allocated.length);
    const face = f.allocated.find(value => value.label === 'face');
    if (face) assert.deepEqual(f.deleted.slice(-f.allocated.filter(value => value.id >= face.id).length),
      f.allocated.filter(value => value.id >= face.id).map(value => value.id).reverse());
    else assert.deepEqual(f.deleted, f.allocated.map(value => value.id).reverse());
  }
});

test('C78 requires finite positive native volume and never substitutes mesh volume', () => {
  for (const mass of [0, -0, -1, NaN, Infinity, -Infinity]) {
    const f = revolveKernelFake({ mass });
    assert.throws(() => buildRevolvedSolid({ session: f.session, recipe: recipe() }), { name: 'RevolveError', message: /volume/i });
    assert.equal(f.retained.size, 0); assert.ok(f.allocated.every(value => value.deleted));
  }
  const f = revolveKernelFake({ mass: Number.MIN_VALUE }), token = buildRevolvedSolid({ session: f.session, recipe: recipe() });
  f.session.release(token); assert.equal(f.retained.size, 0);
});

test('C78 stops at every native, cleanup and retain boundary for unknown and native fault values', () => {
  const causes = [new Error('unexpected'), Object.assign(new Error('forged ordinary'), { name: 'RevolveError' }),
    42, undefined, null, 'native failure', new WebAssembly.RuntimeError('trap'),
    new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), [])];
  for (const entities of [rectangle(), circle()]) {
    const reference = revolveKernelFake(), input = recipe(entities);
    buildRevolvedSolid({ session: reference.session, recipe: input }); const expected = [...reference.trace];
    for (const cause of causes) for (let failAt = 1; failAt <= expected.length; failAt++) {
      const f = revolveKernelFake({ failAt, cause });
      assert.throws(() => buildRevolvedSolid({ session: f.session, recipe: input }), value => value === cause);
      assert.deepEqual(f.trace, expected.slice(0, failAt), `no additional call after boundary ${failAt}`);
      assert.equal(f.retained.size, 0, 'no success token before complete cleanup or after failed retention');
    }
  }
});

test('C78 cleanup failure during ordinary rejection stops immediately, including undefined faults', () => {
  const options = [...(['wire', 'face', 'final-face', 'revolve', 'null', 'compound', 'shell', 'invalid'] as const).map(reject => ({ reject })), { mass: NaN }];
  for (const entities of [rectangle(), circle()]) for (const option of options) {
    const input = recipe(entities);
    const reference = revolveKernelFake(option);
    assert.throws(() => buildRevolvedSolid({ session: reference.session, recipe: input }), { name: 'RevolveError' });
    const positions = reference.trace.flatMap((label, i) => label.startsWith('delete ') ? [i + 1] : []);
    assert.ok(positions.length > 0);
    for (const failAt of positions) for (const cause of [42, undefined, new Error('delete failed'), new WebAssembly.RuntimeError('delete trap'), new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), [])]) {
      const f = revolveKernelFake({ ...option, failAt, cause });
      assert.throws(() => buildRevolvedSolid({ session: f.session, recipe: input }), value => value === cause);
      assert.deepEqual(f.trace, reference.trace.slice(0, failAt)); assert.equal(f.retained.size, 0);
    }
  }
});

test('C78 rejects a closed session before constructing the face or allocating anything', () => {
  const f = revolveKernelFake({ closed: true });
  assert.throws(() => buildRevolvedSolid({ session: f.session, recipe: recipe() }), { name: 'DisposedSessionError', message: /closed/i });
  assert.deepEqual(f.trace, []); assert.deepEqual(f.allocated, []);
});

test('C78 native full and signed quarter tubes match analytic measures, cap positions and STEP in mm/inch', async () => {
  const f = await kernelFixture();
  try {
    for (const outer of [20, 25]) for (const degrees of [360, -360, 90, -90]) for (const units of ['mm', 'inch'] as const) {
      const input = recipe(rectangle(10, outer), `${degrees} deg`, units), snapshot = structuredClone(input);
      const token = buildRevolvedSolid({ session: f.session, recipe: input }), quarter = Math.abs(degrees) === 90;
      const centroid = quarter ? 4 * (outer ** 3 - 10 ** 3) / (3 * Math.PI * (outer ** 2 - 10 ** 2)) : 0;
      const check = (value: typeof token) => {
        const shape = f.session.resolve(value), m = f.measure(value), bounds = proofBounds(f.session, value);
        assert.equal(shape.ShapeType(), f.library.TopAbs_ShapeEnum.TopAbs_SOLID);
        near(m.volume, Math.PI * (outer ** 2 - 100) * 12 * (quarter ? .25 : 1));
        const fullArea = 2 * Math.PI * (outer + 10) * 12 + 2 * Math.PI * (outer ** 2 - 100);
        near(m.area, quarter ? fullArea / 4 + 2 * (outer - 10) * 12 : fullArea);
        vectorNear(m.center, [centroid, 6, quarter ? -Math.sign(degrees) * centroid : 0]);
        vectorNear(bounds.min, quarter ? [0, 0, degrees > 0 ? -outer : 0] : [-outer, 0, -outer]);
        vectorNear(bounds.max, quarter ? [outer, 12, degrees > 0 ? 0 : outer] : [outer, 12, outer]);
        assert.equal(bounds.faces, quarter ? 6 : 4);
        if (quarter) for (const expected of [[outer, 12, 0], [0, 12, -Math.sign(degrees) * outer]]) {
          assert.ok(m.vertices.some(v => v.every((coordinate, i) => Math.abs(coordinate - expected[i]!) <= 1e-6)), `cap vertex ${expected}`);
        }
      };
      assert.equal(f.retained.size, 1); check(token);
      const bytes = stepExchange({ action: 'export', session: f.session, units,
        bodies: { shapes: [{ bodyId: 'tube', token }], topology: [], operands: [], diagnostics: [] } }).file!.bytes;
      f.session.release(token); assert.equal(f.retained.size, 0);
      const bodies = stepExchange({ action: 'import', session: f.session, units, bytes }).bodies!;
      assert.equal(bodies.shapes.length, 1); check(bodies.shapes[0]!.token);
      f.session.release(bodies.shapes[0]!.token); assert.equal(f.retained.size, 0); assert.deepEqual(input, snapshot);
    }
  } finally { f.close(); }
});

test('C78 native cylinder and full/signed quarter torus preserve curved extrema, caps, mass and STEP', async () => {
  const f = await kernelFixture(), p = Math.PI;
  const inspectCaps = (token: Parameters<typeof f.measure>[0], sign: number) => {
    const oc = f.library, temporary: { delete(): void }[] = [];
    const own = <T extends { delete(): void }>(value: T): T => { temporary.push(value); return value; };
    const caps: number[][] = [], faces = own(new oc.TopExp_Explorer(f.session.resolve(token), oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    try {
      for (; faces.More(); faces.Next()) {
        const current = own(faces.Current()), face = own(oc.TopoDS.Face(current)), surface = own(new oc.BRepAdaptor_Surface(face, true));
        if (surface.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) continue;
        const properties = own(new oc.GProp_GProps()); oc.BRepGProp.SurfaceProperties(face, properties, true, false);
        near(properties.Mass(), 9 * p);
        const center = own(properties.CentreOfMass()); caps.push([center.X(), center.Y(), center.Z()]);
        const edges = own(new oc.TopExp_Explorer(face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
        let count = 0;
        for (; edges.More(); edges.Next()) {
          const raw = own(edges.Current()), edge = own(oc.TopoDS.Edge(raw)), curve = own(new oc.BRepAdaptor_Curve(edge));
          assert.equal(curve.GetType(), oc.GeomAbs_CurveType.GeomAbs_Circle);
          const circle = own(curve.Circle()); near(circle.Radius(), 3); count++;
        }
        assert.equal(count, 1, 'each cap has exactly one circular boundary');
      }
      assert.equal(caps.length, 2); caps.sort((a, b) => b[0]! - a[0]!);
      vectorNear(caps[0]!, [20, 6, 0]); vectorNear(caps[1]!, [0, 6, -sign * 20]);
    } finally { for (const value of temporary.reverse()) value.delete(); }
  };
  // Quarter-torus centroid integrates u² over the circular section and cos/sin over its sweep.
  const c = (2 / p) * (20 + 9 / 80);
  const cases = [
    { entities: rectangle(0, 10), angle: '360 deg', volume: 1200 * p, area: 440 * p, center: [0, 6, 0], min: [-10, 0, -10], max: [10, 12, 10], faces: 3 },
    { entities: circle(), angle: '360 deg', volume: 360 * p ** 2, area: 240 * p ** 2, center: [0, 6, 0], min: [-23, 3, -23], max: [23, 9, 23], faces: 1 },
    { entities: circle(), angle: '90 deg', volume: 90 * p ** 2, area: 60 * p ** 2 + 18 * p, center: [c, 6, -c], min: [0, 3, -23], max: [23, 9, 0], faces: 3 },
    { entities: circle(), angle: '-90 deg', volume: 90 * p ** 2, area: 60 * p ** 2 + 18 * p, center: [c, 6, c], min: [0, 3, 0], max: [23, 9, 23], faces: 3 },
  ];
  try {
    for (const fixture of cases.flatMap(value => value.angle === '360 deg' ? [value, { ...value, angle: '-360 deg' }] : [value])) for (const units of ['mm', 'inch'] as const) {
      const token = buildRevolvedSolid({ session: f.session, recipe: recipe(fixture.entities, fixture.angle, units) });
      const check = (value: typeof token) => {
        const m = f.measure(value), bounds = proofBounds(f.session, value);
        assert.equal(f.session.resolve(value).ShapeType(), f.library.TopAbs_ShapeEnum.TopAbs_SOLID);
        near(m.volume, fixture.volume); near(m.area, fixture.area); vectorNear(m.center, fixture.center);
        vectorNear(bounds.min, fixture.min); vectorNear(bounds.max, fixture.max); assert.equal(bounds.faces, fixture.faces);
        if (fixture.angle === '90 deg' || fixture.angle === '-90 deg') inspectCaps(value, fixture.angle[0] === '-' ? -1 : 1);
      };
      check(token); assert.equal(f.retained.size, 1);
      const bytes = stepExchange({ action: 'export', session: f.session, units,
        bodies: { shapes: [{ bodyId: 'curved-solid', token }], topology: [], operands: [], diagnostics: [] } }).file!.bytes;
      f.session.release(token); const bodies = stepExchange({ action: 'import', session: f.session, units, bytes }).bodies!;
      assert.equal(bodies.shapes.length, 1); check(bodies.shapes[0]!.token);
      f.session.release(bodies.shapes[0]!.token); assert.equal(f.retained.size, 0);
    }
  } finally { f.close(); }
});
