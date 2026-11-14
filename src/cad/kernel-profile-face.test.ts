import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKernelProfileFace } from './kernel-profile-face.ts';
import { annulusRegion, mixedRegion, profileKernelFake } from './kernel-profile-test-fixture.ts';
import { kernelFixture } from './kernel-test-fixture.ts';
import type { ProfileRegion } from './sketch-regions.ts';

test('C77 success gives the caller only one face after reverse cleanup; never retains it', () => {
  for (const region of [mixedRegion, annulusRegion]) {
    const f = profileKernelFake(), before = structuredClone(region);
    const result = buildKernelProfileFace({ session: f.session, region });
    assert.equal(result.ok, true);
    if (!result.ok) return assert.fail('Expected one caller-owned face');
    const [face] = f.allocated.filter(v => !v.deleted);
    assert.equal(face?.label, 'face');
    assert.deepEqual(result, { ok: true, face });
    assert.deepEqual(f.deleted, f.allocated.filter(v => v !== face).map(v => v.id).reverse());
    assert.deepEqual(f.retained, []);
    assert.deepEqual(region, before);
    result.face.delete();
    assert.ok(f.allocated.every(v => v.deleted));
  }
});

test('C77 ordinary wire and face rejections return exact tags after all cleanup', () => {
  for (const reason of ['outline-wire', 'hole-wire', 'outer-face', 'hole-face'] as const) {
    const f = profileKernelFake({ reject: reason });
    assert.deepEqual(buildKernelProfileFace({ session: f.session, region: mixedRegion }), { ok: false, reason });
    assert.deepEqual(f.deleted, f.allocated.map(v => v.id).reverse());
    assert.deepEqual(f.retained, []);
  }
});

test('C77 keeps the +Z outer and −Z inner analytic circle convention', () => {
  const f = profileKernelFake();
  const result = buildKernelProfileFace({ session: f.session, region: annulusRegion });
  assert.deepEqual(f.directions, [[0, 0, 1], [0, 0, -1]]);
  assert.ok(result.ok);
  result.face.delete();
});

test('C77 closed session raises before allocating or calling native code', () => {
  const f = profileKernelFake({ closed: true });
  assert.throws(() => buildKernelProfileFace({ session: f.session, region: mixedRegion }), { name: 'DisposedSessionError' });
  assert.deepEqual(f.trace, []);
});

test('C77 stops at every native boundary for unexpected, numeric, WASM and cleanup exceptions', () => {
  const reference = profileKernelFake();
  const result = buildKernelProfileFace({ session: reference.session, region: mixedRegion });
  assert.ok(result.ok);
  const expected = [...reference.trace];
  result.face.delete();
  const causes = [
    new Error('unexpected native failure'),
    Object.assign(new Error('name alone does not grant cleanup permission'), { name: 'ExtrusionError' }),
    42, new WebAssembly.RuntimeError('native trap'),
    new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []),
  ];
  for (const cause of causes) for (let failAt = 1; failAt <= expected.length; failAt++) {
    const f = profileKernelFake({ failAt, cause });
    assert.throws(() => buildKernelProfileFace({ session: f.session, region: mixedRegion }), value => value === cause);
    assert.deepEqual(f.trace, expected.slice(0, failAt), `no call after fault ${failAt}`);
    assert.deepEqual(f.retained, []);
  }
});

test('C77 cleanup failure during ordinary rejection propagates instead of returning a safe tag', () => {
  for (const reject of ['outline-wire', 'hole-wire', 'outer-face', 'hole-face'] as const) {
    const reference = profileKernelFake({ reject });
    buildKernelProfileFace({ session: reference.session, region: mixedRegion });
    const positions = reference.trace.flatMap((v, i) => v.startsWith('delete ') ? [i + 1] : []);
    assert.ok(positions.length > 0);
    for (const failAt of positions) {
      const cause = new Error('cleanup failed'), f = profileKernelFake({ reject, failAt, cause });
      assert.throws(() => buildKernelProfileFace({ session: f.session, region: mixedRegion }), value => value === cause);
      assert.deepEqual(f.trace, reference.trace.slice(0, failAt));
    }
  }
});

test('C77 real kernel: polygon, circle and mixed-hole faces have independent analytic areas and centroids', async () => {
  const f = await kernelFixture();
  const cases: { region: ProfileRegion; area: number; center: number[] }[] = [
    { region: { outer: mixedRegion.outer, holes: [] }, area: 6000, center: [50, 30, 0] },
    { region: { outer: annulusRegion.outer, holes: [] }, area: 100 * Math.PI, center: [0, 0, 0] },
    { region: annulusRegion, area: 84 * Math.PI, center: [0, 0, 0] },
    { region: mixedRegion, area: 5600 - 25 * Math.PI, center: [(280000 - 500 * Math.PI) / (5600 - 25 * Math.PI), 30, 0] },
    { region: { outer: { kind: 'circle', center: [7, -9], radius: 3 }, holes: [] }, area: 9 * Math.PI, center: [7, -9, 0] },
  ];
  for (const { region, area, center } of cases) {
    const result = buildKernelProfileFace({ session: f.session, region });
    assert.ok(result.ok);
    assert.equal(result.face.ShapeType(), f.library.TopAbs_ShapeEnum.TopAbs_FACE);
    const check = new f.library.BRepCheck_Analyzer(result.face, true, false);
    const properties = new f.library.GProp_GProps();
    assert.ok(check.IsValid());
    f.library.BRepGProp.SurfaceProperties(result.face, properties, true, false);
    assert.ok(Math.abs(properties.Mass() - area) < 1e-6, `${properties.Mass()} vs ${area}`);
    const centroid = properties.CentreOfMass();
    [centroid.X(), centroid.Y(), centroid.Z()].forEach((value, i) => {
      assert.ok(Math.abs(value - center[i]!) < 1e-6, `centroid ${i}: ${value} vs ${center[i]}`);
    });
    centroid.delete();
    properties.delete();
    check.delete();
    result.face.delete();
  }
  assert.equal(f.retained.size, 0);
  f.close();
});
