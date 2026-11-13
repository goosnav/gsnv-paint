import test from 'node:test'; import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { applyFeature } from './kernel-features.ts';
import type { KernelSession } from './kernel-runtime.ts';

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
