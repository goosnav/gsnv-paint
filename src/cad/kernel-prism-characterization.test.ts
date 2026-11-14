import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { annulusRegion, mixedRegion, profileKernelFake } from './kernel-profile-test-fixture.ts';

test('C59 characterization: all six ordinary rejection messages stay stable', () => {
  const messages = {
    'outline-wire': 'Extrude: the outline could not be connected into a wire.',
    'hole-wire': 'Extrude: a hole could not be connected into a wire.',
    'outer-face': 'Extrude: the sketch did not form a planar face.',
    'hole-face': 'Extrude: a hole could not be added to the face.',
    prism: 'Extrude: OpenCascade could not construct this solid.',
    invalid: 'Extrude: OpenCascade reported an invalid solid. Edit the sketch or depth.',
  };
  for (const reject of Object.keys(messages) as (keyof typeof messages)[]) {
    const f = profileKernelFake({ reject });
    assert.throws(() => buildLinearPrism({ session: f.session, region: mixedRegion, depth: 10 }), {
      name: 'ExtrusionError', message: messages[reject],
    });
    assert.equal(f.retained.length, 0);
    assert.ok(f.allocated.every(v => v.deleted), reject);
  }
});

test('C59 characterization: clockwise circular holes, immutable input and one surviving solid', () => {
  for (const depth of [-10, 10]) {
    const f = profileKernelFake(), before = structuredClone(annulusRegion);
    assert.deepEqual(buildLinearPrism({ session: f.session, region: annulusRegion, depth }), { id: 1, generation: 7 });
    assert.deepEqual(annulusRegion, before);
    assert.deepEqual(f.directions, [[0, 0, 1], [0, 0, -1]]);
    assert.equal(f.retained.length, 1);
    assert.deepEqual(f.allocated.filter(v => !v.deleted), f.retained);
  }
});
