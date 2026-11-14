/**
 * PURPOSE    Rebuild a whole CAD part (all sketches, the boss, cuts, fillets and chamfers) inside a worker.
 * KIND       SHELL (worker-side assembly shared by the editor and STEP export workers)
 * CONTRACT   IN: validated CADContent and open solver/kernel sessions (kernel may be opened lazily by the caller).
 *            OUT: {sketches: solved entities per sketch id, dof of the base sketch, token of the final solid or null}.
 *            RAISES: Error with a readable, feature-named message for unsatisfiable sketches or failed features.
 * GUARANTEES Solver-only identifiers never reach messages; conflicting constraints are named in words.
 * TUNING     None.
 * DECISIONS  D1: One builder for display and export so STEP always matches what the user sees.
 * LIMITS     One root default plane; features run locally, then the final solid is placed in world coordinates.
 * TESTBENCH  exercised through cad-workspace and cad-step-export browser tests and kernel-features.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
import type { SolverSession } from './solver-runtime.ts';
import { bossOf, laterOf, type CADContent, type Sketch, type SketchEntity } from './editable-cad-content.ts';
import { evaluateVariables } from './named-variables.ts';
import { evaluateDimension } from './dimension-expressions.ts';
import { linearSketchProgram } from './linear-sketch-program.ts';
import { sketchRegions, sketchLoops } from './sketch-regions.ts';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { transformPartPlane } from './kernel-plane-transform.ts';
import { applyFeature } from './kernel-features.ts';

type Token = ReturnType<KernelSession['retain']>;
const NAMES: Record<string, string> = { horizontal: 'Horizontal', vertical: 'Vertical', fix: 'Fixed point', parallel: 'Parallel', perpendicular: 'Perpendicular', equal: 'Equal length', coincident: 'Coincident' };

function solve(sketch: Sketch, label: string, content: CADContent, solver: SolverSession) {
  const context = evaluateVariables({ variables: content.variables, units: content.units }).context;
  const program = linearSketchProgram({ sketch, context, tolerance: content.tolerance });
  solver.engine.clear_data(); solver.engine.push_primitives_and_params(program.primitives);
  const status = solver.engine.solve(), dof = solver.dof(), conflicts = solver.engine.get_gcs_conflicting_constraints();
  if (status !== 0 || conflicts.length || dof < 0) {
    const named = conflicts.map(id => { const c = sketch.constraints.find(c => c.id === id), d = sketch.dimensions.find(d => d.id === id); return c ? NAMES[c.kind] ?? c.kind : d ? `dimension ${d.value.source}` : null; }).filter(Boolean);
    const latest = [...sketch.constraints].reverse().find(c => !c.inferred);
    if (named.length) throw new Error(`${label}: the constraints contradict each other (${[...new Set(named)].join(', ')}). Remove one of those constraints or change a dimension.`);
    throw new Error(`${label}: the constraints contradict each other${latest ? ` (most likely the last one added: ${NAMES[latest.kind] ?? latest.kind})` : ''}. Press Ctrl+Z, or remove that constraint, or change a dimension.`);
  }
  solver.engine.apply_solution();
  return { entities: program.accept(solver.snapshot()) as SketchEntity[], dof };
}

export async function buildPart({ content, solver, kernel }: { content: CADContent; solver: SolverSession; kernel: () => Promise<KernelSession> }): Promise<{ sketches: Record<string, SketchEntity[]>; dof: number; token: Token | null; session: KernelSession | null }> {
  const base = content.graph.features[0], context = evaluateVariables({ variables: content.variables, units: content.units }).context, tolerance = content.tolerance.linearMm;
  const first = solve(base.definition.sketch, 'Sketch', content, solver), sketches: Record<string, SketchEntity[]> = { [base.id]: first.entities };
  const later = laterOf(content);
  for (const f of later) if (f.kind === 'pocket') sketches[f.id] = solve(f.definition.sketch, f.name, content, solver).entities;
  const boss = bossOf(content); if (!boss) return { sketches, dof: first.dof, token: null, session: null };
  const length = (source: { source: string; kind: 'length' | 'angle' | 'scalar' }, label: string) => { const v = evaluateDimension({ expression: source, context }).value; if (!(Math.abs(v) > tolerance)) throw new Error(`${label} must be larger than zero.`); return v; };
  const session = await kernel();
  let token: Token;
  try {
    const depth = length(boss.definition.extent.distance, 'Extrude: depth');
    token = buildLinearPrism({ session, region: sketchRegions({ entities: first.entities, tolerance }), depth });
    const top = Math.max(0, depth), bottom = Math.min(0, depth);
    for (const f of later) {
      try {
        if (f.kind === 'pocket') {
          if (!sketches[f.id]!.some(e => !e.construction)) continue; // An empty cut sketch waits for a profile.
          const loops = sketchLoops({ entities: sketches[f.id]!, tolerance });
          token = applyFeature(session, token, { kind: 'cut', loops, top, bottom, depth: f.definition.extent.kind === 'through' ? null : Math.abs(length(f.definition.extent.distance, `${f.name}: depth`)) });
        } else token = applyFeature(session, token, { kind: f.kind, set: f.definition.edges, size: Math.abs(length(f.definition.size, `${f.name}: size`)) });
      } catch (cause) { throw new Error(`${f.name}: ${cause instanceof Error ? cause.message : String(cause)}`); }
    }
  } catch (cause) { throw new Error(cause instanceof Error && /^(Cut|Fillet|Chamfer|Extrude)/.test(cause.message) ? cause.message : `Extrude: ${cause instanceof Error ? cause.message : String(cause)}`); }
  return { sketches, dof: first.dof, token: transformPartPlane({session,token,plane:base.definition.sketch.plane}), session };
}
