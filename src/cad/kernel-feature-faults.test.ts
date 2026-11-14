import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFeature } from './kernel-features.ts';
import type { KernelSession } from './kernel-runtime.ts';

test('C65 cut caller stops after every untrusted C59/C77 failure, including an ordinary-looking name', () => {
  const faults = [
    new Error('unexpected C77 failure'), Object.assign(new Error('untrusted label'), { name: 'FeatureError' }),
    Object.assign(new Error('untrusted nested label'), { name: 'ExtrusionError' }),
    42, undefined, null, 'unknown native failure', new WebAssembly.RuntimeError('trap'),
    new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []),
  ];
  for (const fault of faults) {
    const calls: string[] = [];
    const session = {
      library: {
        GProp_GProps: class {
          constructor() { calls.push('new properties'); }
          Mass() { calls.push('mass'); return 60000; }
          delete() { calls.push('delete properties AFTER FAULT'); }
        },
        BRepGProp: { VolumeProperties() { calls.push('measure'); } },
        BRepBuilderAPI_MakeWire: class { constructor() { calls.push('C77 fault'); throw fault; } },
      },
      resolve: () => ({}), isClosed: () => false,
      release() { calls.push('release AFTER FAULT'); },
    } as unknown as KernelSession;
    assert.throws(() => applyFeature(session, { id: 1, generation: 1 }, {
      kind: 'cut', loops: [{ kind: 'circle', center: [20, 30], radius: 5 }], top: 10, bottom: 0, depth: null,
    }), { name: 'FeatureError' });
    assert.deepEqual(calls, ['new properties', 'measure', 'mass', 'C77 fault']);
  }
});

test('C65 edge caller stops on unknown errors independently of their public diagnostic name', () => {
  for (const fault of [new Error('unknown'), Object.assign(new Error('unknown'), { name: 'FeatureError' }), undefined]) {
    const calls: string[] = [];
    const session = {
      library: {
        Bnd_Box: class { constructor() { calls.push('box'); } delete() { calls.push('delete AFTER FAULT'); } },
        BRepBndLib: { Add() { calls.push('fault'); throw fault; } },
      },
      resolve: () => ({}), isClosed: () => false,
    } as unknown as KernelSession;
    assert.throws(() => applyFeature(session, { id: 1, generation: 1 }, { kind: 'fillet', set: 'vertical', size: 5 }), { name: 'FeatureError' });
    assert.deepEqual(calls, ['box', 'fault']);
  }
});
