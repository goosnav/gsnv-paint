import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { mixedRegion, profileKernelFake } from './kernel-profile-test-fixture.ts';

test('C59 transfers its only live wrapper after all temporary cleanup succeeds', () => {
  const f = profileKernelFake();
  const token = buildLinearPrism({ session: f.session, region: mixedRegion, depth: 10 });
  assert.deepEqual(token, { id: 1, generation: 7 });
  assert.equal(f.retained.length, 1);
  assert.equal(f.retained[0]?.label, 'solid');
  assert.deepEqual(f.liveAtRetain, [[f.retained[0]!.id]]);
  assert.equal(f.trace.at(-1), 'session.retain');
  assert.deepEqual(f.allocated.filter(v => !v.deleted), f.retained);
});

test('C59 stops every native call after unknown, numeric, WASM, cleanup or retain failure', () => {
  const reference = profileKernelFake();
  buildLinearPrism({ session: reference.session, region: mixedRegion, depth: 10 });
  const expected = [...reference.trace];
  const causes = [
    new Error('unexpected'), Object.assign(new Error('forged ordinary name'), { name: 'ExtrusionError' }),
    42, undefined, null, 'native failure', new WebAssembly.RuntimeError('native trap'),
    new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []),
  ];
  for (const cause of causes) for (let failAt = 1; failAt <= expected.length; failAt++) {
    const f = profileKernelFake({ failAt, cause });
    assert.throws(() => buildLinearPrism({ session: f.session, region: mixedRegion, depth: 10 }), value => value === cause);
    assert.deepEqual(f.trace, expected.slice(0, failAt), `no calls after fault ${failAt}`);
    assert.equal(f.retained.length, 0, 'never publish before cleanup or after a failed retain');
  }
});

test('C59 cleanup failure on any ordinary rejection propagates and stops immediately', () => {
  for (const reject of ['outline-wire', 'hole-wire', 'outer-face', 'hole-face', 'prism', 'invalid'] as const) {
    const reference = profileKernelFake({ reject });
    assert.throws(() => buildLinearPrism({ session: reference.session, region: mixedRegion, depth: 10 }), { name: 'ExtrusionError' });
    // Test all cleanup boundaries: C77's completed face and C59's failed solid have independent ownership.
    const positions = reference.trace.flatMap((v, i) => v.startsWith('delete ') ? [i + 1] : []);
    assert.ok(positions.length > 0);
    for (const failAt of positions) {
      const cause = new Error('cleanup failed'), f = profileKernelFake({ reject, failAt, cause });
      assert.throws(() => buildLinearPrism({ session: f.session, region: mixedRegion, depth: 10 }), value => value === cause);
      assert.deepEqual(f.trace, reference.trace.slice(0, failAt));
      assert.equal(f.retained.length, 0);
    }
  }
});

test('C59 closed session never enters C77 or any native allocation', () => {
  const f = profileKernelFake({ closed: true });
  assert.throws(() => buildLinearPrism({ session: f.session, region: mixedRegion, depth: 10 }), {
    name: 'DisposedSessionError', message: 'The CAD kernel session is closed. Rebuild before creating a solid.',
  });
  assert.deepEqual(f.trace, []);
});
