import assert from 'node:assert/strict';
import test from 'node:test';
import { stepExchange } from './step-exchange.ts';
import { stepFaultFixture } from './step-exchange-fault-fixture.ts';

const causes: unknown[] = [undefined, null, 'unknown native failure', 47, new Error('unknown'),
  ...['STEPReadError', 'STEPTransferError', 'STEPWriteError', 'InvalidImportedSolidError', 'DisposedSessionError'].map(name => Object.assign(new Error('forged ordinary'), { name })),
  new WebAssembly.RuntimeError('trap'), new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), [])];
const sameCause = (fn: () => unknown, cause: unknown) => assert.throws(fn, actual => actual === cause);
const failureCases = [
  ...(['unit', 'transfer', 'write', 'partial-write', 'empty-file', 'invalid'] as const).map(reject => ({ action: 'export' as const, reject })),
  ...(['read', 'entity', 'roots', 'stats', 'invalid', 'no-solids'] as const).map(reject => ({ action: 'import' as const, reject })),
];

test('C37 exact writer-construction regression propagates every unknown identity without later cleanup', () => {
  const reference = stepFaultFixture({ action: 'export' }); stepExchange(reference.request);
  const failAt = reference.trace.indexOf('new writer') + 1; assert.ok(failAt > 0);
  for (const cause of causes) {
    const f = stepFaultFixture({ action: 'export', failAt, cause });
    sameCause(() => stepExchange(f.request), cause);
    assert.deepEqual(f.trace, reference.trace.slice(0, failAt));
  }
});

test('C37 normal import/export own results and clean wrappers/files without consuming export sources', () => {
  for (const action of ['import', 'export'] as const) {
    const f = stepFaultFixture({ action }), result = stepExchange(f.request);
    assert.equal(f.retained.size, action === 'import' ? 2 : 1);
    assert.equal(f.files.size, 0); assert.equal(f.currentUnit(), 'CM');
    assert.ok(f.allocated.every(value => value.deleted || [...f.retained.values()].includes(value)));
    if (f.source) assert.equal(f.source.deleted, false);
    if (action === 'export') assert.ok(result.file!.bytes.length > 0);
    else assert.equal(result.bodies!.shapes.length, 2);
  }
});

test('C37 every import/export native, filesystem, retain and cleanup fault is the last call', () => {
  for (const action of ['import', 'export'] as const) {
    const reference = stepFaultFixture({ action }); stepExchange(reference.request);
    for (let failAt = 1; failAt <= reference.trace.length; failAt++) for (const cause of causes) {
      const f = stepFaultFixture({ action, failAt, cause });
      sameCause(() => stepExchange(f.request), cause);
      assert.deepEqual(f.trace, reference.trace.slice(0, failAt), `${action} stops at ${reference.trace[failAt - 1]}`);
      if (f.source) assert.equal(f.source.deleted, false);
    }
  }
});

test('C37 locally recognized ordinary rejections still release all owned temporaries and partial files', () => {
  for (const option of failureCases) {
    const f = stepFaultFixture(option);
    assert.throws(() => stepExchange(f.request), error => error instanceof Error && /^(STEP|InvalidImportedSolid)/.test(error.name));
    assert.equal(f.retained.size, option.action === 'export' ? 1 : 0);
    assert.equal(f.files.size, 0); assert.equal(f.currentUnit(), 'CM');
    assert.ok(f.allocated.every(value => value.deleted || value === f.source));
  }
});

test('C37 a cleanup fault during ordinary rejection stops deletion, unlink and unit restore immediately', () => {
  for (const option of failureCases) {
    const reference = stepFaultFixture(option); assert.throws(() => stepExchange(reference.request));
    const positions = reference.trace.flatMap((label, i) => label.startsWith('delete ') || label === 'FS.readdir' || label === 'FS.unlink' || label === 'unit.restore' ? [i + 1] : []);
    for (const failAt of positions) for (const cause of causes) {
      const f = stepFaultFixture({ ...option, failAt, cause });
      sameCause(() => stepExchange(f.request), cause);
      assert.deepEqual(f.trace, reference.trace.slice(0, failAt));
    }
  }
});

test('C37 missing private files do not require swallowing unlink errors; restore status stays readable', () => {
  const beforeFile = stepFaultFixture({ action: 'export', reject: 'transfer' });
  assert.throws(() => stepExchange(beforeFile.request), { name: 'STEPTransferError' });
  assert.ok(!beforeFile.trace.includes('FS.unlink'));
  assert.equal(beforeFile.trace.at(-1), 'unit.restore');
  const restore = stepFaultFixture({ action: 'export', reject: 'restore' });
  assert.throws(() => stepExchange(restore.request), { name: 'STEPTransferError', message: /restore/ });
  assert.equal(restore.trace.at(-1), 'unit.restore');
});

test('C37 cleanup preserves unrelated virtual files on success and deliberate rejection', () => {
  for (const action of ['import', 'export'] as const) for (const reject of [undefined, action === 'import' ? 'read' : 'write'] as const) {
    const f = stepFaultFixture(reject ? { action, reject } : { action }), unrelated = new Uint8Array([7, 8, 9]);
    f.files.set('/unrelated.step', unrelated);
    if (reject) assert.throws(() => stepExchange(f.request)); else stepExchange(f.request);
    assert.deepEqual([...f.files], [['/unrelated.step', unrelated]]);
  }
});
