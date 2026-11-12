import { test } from 'node:test'; import assert from 'node:assert/strict';
import { writeSTL } from './stl-serialization.ts';

test('C38 golden binary STL for one triangle with header, count, normal and scaled vertices', () => {
  const file = writeSTL({ name: 'tri', meshes: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }], unitScaleToMm: 2 });
  assert.equal(file.mime, 'model/stl'); assert.equal(file.bytes.length, 134); assert.deepEqual(file.diagnostics, []);
  assert.equal(new TextDecoder().decode(file.bytes.subarray(0, 18)), 'gsnv-paint STL tri');
  const view = new DataView(file.bytes.buffer); assert.equal(view.getUint32(80, true), 1);
  assert.deepEqual(Array.from({ length: 12 }, (_, i) => view.getFloat32(84 + i * 4, true)), [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0]);
  assert.equal(view.getUint16(132, true), 0);
  assert.deepEqual(writeSTL({ name: 'tri', meshes: [{ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) }], unitScaleToMm: 2 }).bytes, file.bytes);
});

test('C38 multiple meshes offset counts; degenerate triangles are reported, invalid input rejected', () => {
  const quad = { positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], indices: [0, 1, 2, 0, 2, 3] };
  const file = writeSTL({ name: 'ünïcode', meshes: [quad, { positions: [0, 0, 0, 1, 1, 1], indices: [0, 1, 1] }], unitScaleToMm: 1 });
  assert.equal(new DataView(file.bytes.buffer).getUint32(80, true), 3); assert.equal(file.diagnostics[0]!.code, 'stl.degenerate');
  assert.match(new TextDecoder().decode(file.bytes.subarray(0, 24)), /^gsnv-paint STL _n_code/);
  for (const [request, name] of [
    [{ meshes: [], unitScaleToMm: 1 }, 'InvalidExportMeshError'], [{ meshes: [{ positions: [0, 0, 0], indices: [0, 0, 1] }], unitScaleToMm: 1 }, 'InvalidExportMeshError'],
    [{ meshes: [{ positions: [0, 0, NaN], indices: [0, 0, 0] }], unitScaleToMm: 1 }, 'InvalidExportMeshError'], [{ meshes: [{ positions: [0, 0], indices: [0] }], unitScaleToMm: 1 }, 'InvalidExportMeshError'],
    [{ meshes: [quad], unitScaleToMm: 0 }, 'InvalidUnitScaleError'],
  ] as const) assert.throws(() => writeSTL({ name: 'x', ...request } as Parameters<typeof writeSTL>[0]), { name });
});
