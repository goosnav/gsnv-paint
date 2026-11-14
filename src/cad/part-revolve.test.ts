import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { make_gcs_wrapper } from '@salusoft89/planegcs';
import { editableCADContent, type CADContent } from './editable-cad-content.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
import { buildPart } from './part-builder.ts';
import { kernelFixture } from './kernel-test-fixture.ts';
import { revolveKernelFake } from './kernel-revolve-test-fixture.ts';
import { proofBounds } from './revolve-proof-fixture.ts';
import { stepExchange } from './step-exchange.ts';
import { extrudePreview } from './extrude-preview.ts';
import type { SolverSession } from './solver-runtime.ts';
const edit = (content: CADContent, action: CADAction) => editCADContent({ content, action });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) <= 1e-6, `${a} vs ${b}`);
const vector = (actual: number[], expected: number[]) => actual.forEach((v, i) => near(v, expected[i]!));
async function solved() {
  const engine = await make_gcs_wrapper(fileURLToPath(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm', import.meta.url)));
  const solver: SolverSession = { generation: 1, engine, dof: () => engine.gcs.dof(), snapshot: () => engine.sketch_index.get_primitives(), isClosed: () => false };
  return { solver, close: () => engine.destroy_gcs_module() };
}
function tube() {
  let content = editableCADContent({ operation: 'new' });
  for (const action of [{ kind: 'variable', name: 'outer', source: '20', dimensionKind: 'length' },
    { kind: 'variable', name: 'sweep', source: '360', dimensionKind: 'angle' },
    { kind: 'rectangle', prefix: 'section', width: 'outer - 10 mm', height: '12 mm', origin: ['10 mm', '0 mm'] },
    { kind: 'revolve', id: 'turned', axis: 'v', angle: 'sweep' }] as CADAction[]) content = edit(content, action);
  return content;
}
const placement = (point: number[], plane: 'XY' | 'XZ' | 'YZ'): number[] => plane === 'XY' ? [...point] : plane === 'XZ' ? [point[0]!, -point[2]!, point[1]!] : [point[2]!, point[0]!, point[1]!];

test('production revolve rebuild solves variable tube sections, signed angles and every default plane once, with STEP and preview', async () => {
  const f = await kernelFixture(), g = await solved();
  try {
    for (const plane of ['XY', 'XZ', 'YZ'] as const) {
      let content = edit(tube(), { kind: 'plane', plane });
      for (const outer of [20, 25]) for (const degrees of [360, 90, -90]) for (const units of ['mm', 'inch'] as const) {
        content = edit(content, { kind: 'variable', name: 'outer', source: `${outer} mm` });
        content = edit(content, { kind: 'variable', name: 'sweep', source: `${degrees} deg` });
        content = edit(content, { kind: 'units', units });
        const before = structuredClone(content), reopened = editableCADContent({ operation: 'read', value: JSON.parse(JSON.stringify(content)) });
        let opens = 0;
        const part = await buildPart({ content: reopened, solver: g.solver, kernel: async () => { opens++; return f.session; } });
        assert.ok(part.token); assert.equal(opens, 1); assert.equal(part.dof, 0); assert.equal(part.session, f.session);
        assert.equal(f.retained.size, 1); assert.equal(part.sketches['sketch-1']!.length, 4);
        const points = part.sketches['sketch-1']!.flatMap(e => e.kind === 'segment' ? [e.a, e.b] : []);
        near(Math.max(...points.map(v => v[0])), outer); near(Math.min(...points.map(v => v[0])), 10);
        const quarter = Math.abs(degrees) === 90, c = quarter ? 4 * (outer ** 3 - 1000) / (3 * Math.PI * (outer ** 2 - 100)) : 0;
        const volume = Math.PI * (outer ** 2 - 100) * 12 * (quarter ? .25 : 1);
        const area = 2 * Math.PI * ((outer + 10) * 12 + outer ** 2 - 100) * (quarter ? .25 : 1) + (quarter ? 24 * (outer - 10) : 0);
        const center = placement([c, 6, quarter ? -Math.sign(degrees) * c : 0], plane);
        const localMin = quarter ? [0, 0, degrees > 0 ? -outer : 0] : [-outer, 0, -outer];
        const localMax = quarter ? [outer, 12, degrees > 0 ? 0 : outer] : [outer, 12, outer];
        const corners = [placement(localMin, plane), placement(localMax, plane)];
        const check = (token: NonNullable<typeof part.token>) => {
          const m = f.measure(token), bounds = proofBounds(f.session, token);
          assert.equal(f.session.resolve(token).ShapeType(), f.library.TopAbs_ShapeEnum.TopAbs_SOLID);
          near(m.volume, volume); near(m.area, area); vector(m.center, center);
          vector(bounds.min, [0, 1, 2].map(i => Math.min(...corners.map(p => p[i]!))));
          vector(bounds.max, [0, 1, 2].map(i => Math.max(...corners.map(p => p[i]!))));
          assert.equal(bounds.faces, quarter ? 6 : 4);
          if (quarter) for (const endpoint of [placement([outer, 12, 0], plane), placement([0, 12, -Math.sign(degrees) * outer], plane)]) {
            assert.ok(m.vertices.some(v => v.every((n, i) => Math.abs(n - endpoint[i]!) <= 1e-6)), `world cap ${endpoint}`);
          }
        };
        check(part.token);
        const bytes = stepExchange({ action: 'export', session: f.session, units, bodies: { shapes: [{ bodyId: 'turned', token: part.token }], topology: [], operands: [], diagnostics: [] } }).file!.bytes;
        const preview = extrudePreview({ session: f.session, token: part.token });
        near(preview.volume, volume); near(preview.area, area); vector(preview.center, center);
        assert.ok(preview.positions.length > 0 && preview.indices.length > 0); assert.equal(f.retained.size, 0, 'preview consumes its world-placed token');
        const imported = stepExchange({ action: 'import', session: f.session, units, bytes }).bodies!;
        assert.equal(imported.shapes.length, 1); check(imported.shapes[0]!.token); f.session.release(imported.shapes[0]!.token);
        assert.equal(f.retained.size, 0); assert.deepEqual(content, before);
      }
    }
  } finally { f.close(); g.close(); }
});

test('production revolve routes real solved circles and axis contact to analytic torus/cylinder solids', async () => {
  const f = await kernelFixture(), g = await solved();
  try {
    for (const kind of ['circle', 'cylinder'] as const) for (const degrees of [360, -90]) {
      let content = editableCADContent({ operation: 'new' });
      content = edit(content, kind === 'circle' ? { kind: 'circle', prefix: 'section', diameter: '6', center: ['20', '6'] } : { kind: 'rectangle', prefix: 'section', width: '10', height: '12' });
      content = edit(content, { kind: 'revolve', id: 'turned', axis: 'v', angle: `${degrees} deg` });
      const part = await buildPart({ content, solver: g.solver, kernel: async () => f.session }); assert.ok(part.token);
      assert.equal(part.dof, 0); near(f.measure(part.token).volume, (kind === 'circle' ? 360 * Math.PI ** 2 : 1200 * Math.PI) * (degrees === 360 ? 1 : .25));
      f.session.release(part.token); assert.equal(f.retained.size, 0);
    }
  } finally { f.close(); g.close(); }
});

test('production revolve flags failed geometry and lazy angle sources by feature name before kernel allocation', async () => {
  const g = await solved();
  try {
    const cases: CADContent[] = [edit(tube(), { kind: 'clear' }), edit(tube(), { kind: 'rectangle', prefix: 'crossing', width: '30', height: '12', origin: ['-10', '0'] })];
    const open = edit(editableCADContent({ operation: 'new' }), { kind: 'line', id: 'open', a: [10, 0], b: [20, 12] });
    cases.push(edit(open, { kind: 'revolve', id: 'turned', axis: 'v', angle: '360 deg' }));
    const holed = edit(tube(), { kind: 'circle', prefix: 'hole', diameter: '2', center: ['15', '6'] }); cases.push(holed);
    for (const angle of ['0', '361 deg', 'missing']) {
      const bad = tube(), feature = bad.graph.features[1]!; assert.equal(feature.kind, 'revolve');
      if (feature.kind === 'revolve') feature.definition.angle.source = angle; cases.push(bad);
    }
    for (const content of cases) {
      content.graph.features[1]!.name = 'Turned sleeve'; let opened = 0;
      await assert.rejects(() => buildPart({ content, solver: g.solver, kernel: async () => { opened++; throw new Error('kernel must stay lazy'); } }), error => {
        assert.ok(error instanceof Error); assert.match(error.message, /^Turned sleeve: /); assert.doesNotMatch(error.message, /Extrude/); return true;
      });
      assert.equal(opened, 0);
    }
  } finally { g.close(); }
});

test('production revolve assembly does not clean up or call native APIs after builder/cleanup/retain faults', async () => {
  const g = await solved(), content = tube();
  try {
    const reference = revolveKernelFake();
    const complete = await buildPart({ content, solver: g.solver, kernel: async () => reference.session }); assert.ok(complete.token);
    const boundaries = [reference.trace.indexOf('new revolve-builder') + 1, reference.trace.findIndex(t => t.endsWith(':properties') && t.startsWith('delete ')) + 1, reference.trace.indexOf('session.retain') + 1];
    for (const failAt of boundaries) for (const cause of [47, undefined, new WebAssembly.RuntimeError('native failure'), Object.assign(new Error('unexpected failure'), { name: 'RevolveError' })]) {
      assert.ok(failAt > 0); const f = revolveKernelFake({ failAt, cause });
      await assert.rejects(() => buildPart({ content, solver: g.solver, kernel: async () => f.session }), /^Error: Revolve 1:/);
      assert.deepEqual(f.trace, reference.trace.slice(0, failAt)); assert.equal(f.retained.size, 0);
    }
    reference.session.release(complete.token);
  } finally { g.close(); }
});
