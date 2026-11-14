import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import init from 'replicad-opencascadejs';
import { make_gcs_wrapper } from '@salusoft89/planegcs';
import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
import { buildPart } from './part-builder.ts';
import { stepExchange } from './step-exchange.ts';
import type { KernelSession } from './kernel-runtime.ts';
import type { SolverSession } from './solver-runtime.ts';

test('CAD golden production rebuild: rounded plate, four holes, pocket, changed width and STEP round trip', async () => {
  const library = await init({ wasmBinary: await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)), print: () => {} });
  const wrapper = await make_gcs_wrapper(fileURLToPath(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm', import.meta.url)));
  const retained = new Map<number, ReturnType<KernelSession['resolve']>>(); let issued = 0;
  const kernel: KernelSession = { generation: 1, library, isClosed: () => false,
    retain(shape) { const id = ++issued; retained.set(id, shape); return { id, generation: 1 }; },
    resolve(token) { const shape = retained.get(token.id); assert.ok(shape, 'a retained shape must be live'); return shape; },
    release(token) { const shape = retained.get(token.id); assert.ok(shape, 'no double release'); shape.delete(); retained.delete(token.id); },
  };
  const solver: SolverSession = { generation: 1, engine: wrapper, dof: () => wrapper.gcs.dof(), snapshot: () => wrapper.sketch_index.get_primitives(), isClosed: () => false };
  const volume = (token: Parameters<KernelSession['resolve']>[0]) => {
    const properties = new library.GProp_GProps();
    try { library.BRepGProp.VolumeProperties(kernel.resolve(token), properties, true, false, false); return properties.Mass(); }
    finally { properties.delete(); }
  };
  let content = editableCADContent({ operation: 'new' });
  const edit = (action: CADAction, sketch?: string) => { content = editCADContent({ content, action, sketch }); };
  try {
    edit({ kind: 'variable', name: 'width', source: '100' });
    edit({ kind: 'rectangle', prefix: 'plate', width: 'width', height: '60' });
    edit({ kind: 'extrude', id: 'boss', depth: '10' });
    edit({ kind: 'edge-feature', id: 'corners', feature: 'fillet', edges: 'vertical', size: '5' });
    edit({ kind: 'add-cut', id: 'holes' });
    for (const [i, center] of ([['10','10'],['width - 10','10'],['width - 10','50'],['10','50']] as [string,string][]).entries()) edit({ kind: 'circle', prefix: `hole${i}`, diameter: '6', center }, 'holes');
    edit({ kind: 'add-cut', id: 'pocket' });
    edit({ kind: 'rectangle', prefix: 'pocket-profile', width: '20', height: '20', origin: ['width / 2 - 10','20'] }, 'pocket');
    edit({ kind: 'cut-extent', id: 'pocket', depth: '5' });
    const original = structuredClone(content);
    for (const [width, expected] of [[100,56654.425],[120,68654.425]] as const) {
      if (width === 120) edit({ kind: 'variable', name: 'width', source: '120' });
      for (const units of ['mm', 'inch', 'mm'] as const) {
      if (content.units !== units) edit({ kind: 'units', units });
      const decoded = editableCADContent({ operation: 'read', value: JSON.parse(JSON.stringify(content)) });
      const part = await buildPart({ content: decoded, solver, kernel: async () => kernel });
      assert.ok(part.token); assert.equal(part.dof, 0);
      const measured = volume(part.token);
      assert.ok(Math.abs(measured - expected) < expected * 0.0001, `width ${width}: expected ${expected}, got ${measured}`);
      const centers = part.sketches.holes!.map(entity => { assert.equal(entity.kind, 'circle'); return entity.kind === 'circle' ? entity.center : []; });
      for (const [i, center] of ([[10,10],[width-10,10],[width-10,50],[10,50]]).entries()) {
        assert.ok(Math.hypot(centers[i]![0]! - center[0]!, centers[i]![1]! - center[1]!) < 1e-6, 'holes stay 10 mm from each neighboring edge');
      }
      const pocketEdge=part.sketches.pocket![0]!; assert.equal(pocketEdge.kind,'segment');
      assert.ok(pocketEdge.kind==='segment'&&Math.hypot(pocketEdge.a[0]-(width/2-10),pocketEdge.a[1]-20)<1e-6,'pocket stays centered after the width changes');
      assert.equal(retained.size, 1, 'rebuild keeps only the final solid');
      const bytes = stepExchange({ action: 'export', session: kernel, units: content.units, bodies: { shapes: [{ bodyId: 'plate', token: part.token }], topology: [], operands: [], diagnostics: [] } }).file!.bytes;
      kernel.release(part.token);
      const imported = stepExchange({ action: 'import', session: kernel, units: content.units, bytes }).bodies!;
      assert.equal(imported.shapes.length, 1);
      assert.ok(Math.abs(volume(imported.shapes[0]!.token) - measured) < measured * 0.0001);
      for (const body of imported.shapes) kernel.release(body.token);
      assert.equal(retained.size, 0);
      console.log(`CAD golden: width ${width} mm, document ${units}; native volume ${measured.toFixed(9)} mm3; STEP re-import matches.`);
      }
    }
    assert.equal(original.graph.features[0].definition.sketch.dimensions.find(d => d.id === 'plate-width')!.value.source, 'width');
    assert.equal(original.variables[0]!.expression.source,'100');
  } finally {
    for (const id of [...retained.keys()]) kernel.release({ id, generation: 1 });
    wrapper.destroy_gcs_module();
  }
});
