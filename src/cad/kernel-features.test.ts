import test from 'node:test'; import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { applyFeature, type FeatureOp } from './kernel-features.ts';
import { stepExchange } from './step-exchange.ts';
import type { KernelSession } from './kernel-runtime.ts';

let libraryPromise: ReturnType<typeof init> | undefined;
async function kernelFixture() {
  const library = await (libraryPromise ??= readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)).then(wasmBinary => init({ wasmBinary, print: () => {} })));
  const shapes = new Map<number, ReturnType<KernelSession['resolve']>>(); let sequence = 0;
  const session: KernelSession = {
    generation: 1, library, isClosed: () => false,
    retain(shape) { const id = ++sequence; shapes.set(id, shape); return { id, generation: 1 }; },
    resolve(token) { assert.ok(shapes.has(token.id), 'the token must still be live'); return shapes.get(token.id)!; },
    release(token) { session.resolve(token).delete(); shapes.delete(token.id); },
  };
  const volume = (token: ReturnType<KernelSession['retain']>) => {
    const properties = new library.GProp_GProps();
    library.BRepGProp.VolumeProperties(session.resolve(token), properties, true, false, false);
    const result = properties.Mass(); properties.delete(); return result;
  };
  return { library, session, shapes, volume,
    plate: () => buildLinearPrism({ session, polygon: [[0, 0], [100, 0], [100, 60], [0, 60]], depth: 10 }),
    close() { for (const id of [...shapes.keys()]) session.release({ id, generation: 1 }); },
  };
}

for (const { name, operation, expected } of [
  { name: 'through cut', operation: { kind: 'cut', loops: [{ kind: 'circle', center: [20, 30], radius: 5 }], top: 10, bottom: 0, depth: null }, expected: 60000 - 250 * Math.PI },
  { name: 'blind cut', operation: { kind: 'cut', loops: [{ kind: 'circle', center: [20, 30], radius: 5 }], top: 10, bottom: 0, depth: 4 }, expected: 60000 - 100 * Math.PI },
  { name: 'fillet', operation: { kind: 'fillet', set: 'vertical', size: 5 }, expected: 60000 - (4 - Math.PI) * 250 },
  { name: 'chamfer', operation: { kind: 'chamfer', set: 'top', size: 2 }, expected: 60000 - 640 + 32 / 3 },
] satisfies { name: string; operation: FeatureOp; expected: number }[]) {
  test(`C65 ${name} publishes one solid that preserves volume through STEP`, async () => {
    const fixture = await kernelFixture(), { session, library, shapes, volume } = fixture;
    try {
      const token = applyFeature(session, fixture.plate(), operation);
      const file = stepExchange({ action: 'export', session, units: 'mm', bodies: { shapes: [{ bodyId: 'part', token }], topology: [], operands: [], diagnostics: [] } }).file!;
      assert.equal(session.resolve(token).ShapeType(), library.TopAbs_ShapeEnum.TopAbs_SOLID);
      assert.ok(Math.abs(volume(token) - expected) < 1e-3);
      session.release(token);
      const imported = stepExchange({ action: 'import', session, units: 'mm', bytes: file.bytes }).bodies!;
      assert.equal(imported.shapes.length, 1);
      assert.ok(Math.abs(volume(imported.shapes[0]!.token) - expected) < 1e-3);
      session.release(imported.shapes[0]!.token);
      assert.equal(shapes.size, 0, 'success releases the input, tool and exported/restored solids');
    } finally { fixture.close(); }
  });
}

for (const { name, loops, reason } of [
  { name: 'disjoint', loops: [{ kind: 'circle', center: [200, 300], radius: 5 }], reason: /remove|overlap/i },
  { name: 'tangent', loops: [{ kind: 'circle', center: [105, 30], radius: 5 }], reason: /remove|overlap/i },
  { name: 'partially ineffective', loops: [{ kind: 'circle', center: [20, 30], radius: 5 }, { kind: 'circle', center: [200, 300], radius: 5 }], reason: /remove|overlap/i },
  { name: 'whole body removal', loops: [{ kind: 'polygon', points: [[-1, -1], [101, -1], [101, 61], [-1, 61]] }], reason: /solid|material/i },
  { name: 'disconnected result', loops: [{ kind: 'polygon', points: [[45, -1], [55, -1], [55, 61], [45, 61]] }], reason: /single|multiple|more than one/i },
] satisfies { name: string; loops: Extract<FeatureOp, { kind: 'cut' }>['loops']; reason: RegExp }[]) test(`C65 ${name} cut fails without replacing the input solid`, async () => {
  const fixture = await kernelFixture(), { session, shapes, volume } = fixture;
  try {
    const input = fixture.plate();
    assert.throws(() => applyFeature(session, input, { kind: 'cut', loops, top: 10, bottom: 0, depth: null }), reason);
    assert.equal(shapes.size, 1, 'only the original input survives an ordinary feature failure');
    assert.ok(Math.abs(volume(input) - 60000) < 1e-6);
    session.release(input);
  } finally { fixture.close(); }
});

test('C65 normalization rejects loose geometry alongside a solid instead of dropping it', async () => {
  const fixture = await kernelFixture(), { library, session, shapes, volume } = fixture;
  try {
    const input = fixture.plate(), compound = new library.TopoDS_Compound(), builder = new library.TopoDS_Builder();
    builder.MakeCompound(compound); builder.Add(compound, session.resolve(input));
    const point = new library.gp_Pnt(200, 200, 0), vertexBuilder = new library.BRepBuilderAPI_MakeVertex(point), vertex = vertexBuilder.Vertex();
    builder.Add(compound, vertex); vertex.delete(); vertexBuilder.delete(); point.delete(); builder.delete();
    // Substitute only the native feature's result; classification, topology and validation remain real.
    const Fillet = new Proxy(library.BRepFilletAPI_MakeFillet, { construct(target, args) {
      const native = Reflect.construct(target, args) as InstanceType<typeof target>;
      native.Shape = () => compound; return native;
    } });
    const patched: KernelSession = { ...session, library: { ...library, BRepFilletAPI_MakeFillet: Fillet } };
    assert.throws(() => applyFeature(patched, input, { kind: 'fillet', set: 'vertical', size: 5 }), /loose|outside|non-solid/i);
    assert.equal(shapes.size, 1); assert.ok(Math.abs(volume(input) - 60000) < 1e-6);
  } finally { fixture.close(); }
});

test('C65 native feature faults stop all native cleanup calls', () => {
  for (const fault of [new WebAssembly.RuntimeError('injected trap'), new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []), 17]) {
    let cleanupCalls = 0;
    const session = {
      library: { Bnd_Box: class { delete() { cleanupCalls++; } }, BRepBndLib: { Add() { throw fault; } } },
      resolve: () => ({}), isClosed: () => false,
    } as unknown as KernelSession;
    assert.throws(() => applyFeature(session, { id: 1, generation: 1 }, { kind: 'fillet', set: 'vertical', size: 5 }));
    assert.equal(cleanupCalls, 0, 'only worker termination may reclaim native objects after a fault');
  }
});

test('C65 a native fault during a cut does not release retained tools', async () => {
  const fixture = await kernelFixture(), { library, session } = fixture;
  try {
    let releases = 0;
    const Cut = new Proxy(library.BRepAlgoAPI_Cut, { construct() { throw new WebAssembly.RuntimeError('injected cut trap'); } });
    const patched: KernelSession = { ...session, library: { ...library, BRepAlgoAPI_Cut: Cut }, release(token) { releases++; session.release(token); } };
    assert.throws(() => applyFeature(patched, fixture.plate(), { kind: 'cut', loops: [{ kind: 'circle', center: [20, 30], radius: 5 }], top: 10, bottom: 0, depth: null }));
    assert.equal(releases, 0, 'native tool cleanup must wait for worker termination');
  } finally { fixture.close(); } // The injected fault did not actually invalidate this test's native module.
});

test('C65 native cleanup stops at the first cleanup fault', () => {
  const calls: string[] = [], fault = new WebAssembly.RuntimeError('injected cleanup trap');
  const point = (name: string, z: number) => ({ Z: () => z, delete() { calls.push(name); } });
  const session = { isClosed: () => false, resolve: () => ({}), library: {
    Bnd_Box: class { CornerMin() { return point('min', 0); } CornerMax() { return point('max', 10); } delete() { calls.push('box'); } },
    BRepBndLib: { Add() {} }, ChFi3d_FilletShape: { ChFi3d_Rational: 'rational' }, TopAbs_ShapeEnum: { TopAbs_EDGE: 'edge', TopAbs_SHAPE: 'shape' },
    BRepFilletAPI_MakeFillet: class { delete() { calls.push('fillet'); } },
    TopExp_Explorer: class { More() { return false; } delete() { calls.push('explorer'); throw fault; } },
  } } as unknown as KernelSession;
  assert.throws(() => applyFeature(session, { id: 1, generation: 1 }, { kind: 'fillet', set: 'vertical', size: 5 }));
  assert.deepEqual(calls, ['explorer']);
});

test('C65 real kernel: through and blind cuts, fillets and chamfers give exact or bounded volumes', async () => {
  const library = await init({ wasmBinary: await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)), print: () => {} });
  const shapes = new Map<number, ReturnType<KernelSession['resolve']>>(); let sequence = 0;
  const session: KernelSession = { generation: 1, library, isClosed: () => false, retain(shape) { const id = ++sequence; shapes.set(id, shape); return { id, generation: 1 }; }, resolve(t) { return shapes.get(t.id)!; }, release(t) { shapes.get(t.id)?.delete(); shapes.delete(t.id); } };
  const volume = (t: { id: number; generation: number }) => { const p = new library.GProp_GProps(); library.BRepGProp.VolumeProperties(session.resolve(t), p, true, false, false); const v = p.Mass(); p.delete(); return v; };
  const plate = () => buildLinearPrism({ session, polygon: [[0, 0], [100, 0], [100, 60], [0, 60]], depth: 10 });
  let t = applyFeature(session, plate(), { kind: 'cut', loops: [{ kind: 'circle', center: [20, 30], radius: 5 }], top: 10, bottom: 0, depth: null });
  assert.ok(Math.abs(volume(t) - (60000 - 250 * Math.PI)) < 1e-6);
  t = applyFeature(session, t, { kind: 'cut', loops: [{ kind: 'polygon', points: [[50, 20], [70, 20], [70, 40], [50, 40]] }], top: 10, bottom: 0, depth: 4 });
  assert.ok(Math.abs(volume(t) - (60000 - 250 * Math.PI - 1600)) < 1e-6); session.release(t);
  const rounded = applyFeature(session, plate(), { kind: 'fillet', set: 'vertical', size: 5 });
  assert.ok(Math.abs(volume(rounded) - (60000 - (4 - Math.PI) * 25 * 10)) < 1e-3); session.release(rounded);
  const bevel = applyFeature(session, plate(), { kind: 'chamfer', set: 'top', size: 2 }), v = volume(bevel);
  assert.ok(v < 60000 - 2 * 320 * 0.9 && v > 60000 - 2 * 320 * 1.1, String(v)); session.release(bevel);
  const top = applyFeature(session, plate(), { kind: 'fillet', set: 'top', size: 2 }); assert.ok(volume(top) < 60000); session.release(top);
  const keep = plate();
  assert.throws(() => applyFeature(session, keep, { kind: 'fillet', set: 'vertical', size: 40 }), { name: 'FeatureError' });
  assert.ok(volume(keep) > 59999, 'a failed feature leaves the input solid valid');
  assert.throws(() => applyFeature(session, keep, { kind: 'cut', loops: [], top: 10, bottom: 0, depth: null }), /no closed profile/);
  session.release(keep); assert.equal(shapes.size, 0);
});
