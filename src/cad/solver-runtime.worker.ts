/** Development-only C02 harness. Native solver/session objects remain inside this worker. */
import type { SketchPrimitive } from '@salusoft89/planegcs';
import { solverRuntime, type SolverRequest, type SolverSession } from './solver-runtime.ts';

export type FixtureRequest = ({ id: number } & Extract<SolverRequest, { action: 'open' }>)
  | { id: number; action: 'solve' | 'probe' | 'conflict' | 'close' | 'work' };
export type FixtureReply = { id: number; phase: 'started' | 'complete' | 'error'; result: Record<string, unknown> };
const port = globalThis as unknown as { postMessage(reply: FixtureReply): void; addEventListener(type: 'message', callback: (event: MessageEvent<FixtureRequest>) => void): void };
const WORK_MS = 400; // Bounded fixture work, not a product solve-time target.
let session: SolverSession | null = null;
let lastSuccessfulPoints: Record<string, number[]> = {};

function requireSession(): SolverSession { if (!session) throw Error('Load the fixture solver first.'); return session; }
function rectangle(dimensions: 0 | 1 | 2, conflict = false): SketchPrimitive[] {
  const primitives: SketchPrimitive[] = [
    { id: 'A', type: 'point', x: 0, y: 0, fixed: true }, { id: 'B', type: 'point', x: 95, y: 3, fixed: false },
    { id: 'C', type: 'point', x: 98, y: 57, fixed: false }, { id: 'D', type: 'point', x: -2, y: 59, fixed: false },
    { id: 'AB', type: 'line', p1_id: 'A', p2_id: 'B' }, { id: 'BC', type: 'line', p1_id: 'B', p2_id: 'C' },
    { id: 'CD', type: 'line', p1_id: 'C', p2_id: 'D' }, { id: 'DA', type: 'line', p1_id: 'D', p2_id: 'A' },
    { id: 'horizontalAB', type: 'horizontal_l', l_id: 'AB' }, { id: 'horizontalCD', type: 'horizontal_l', l_id: 'CD' },
    { id: 'verticalBC', type: 'vertical_l', l_id: 'BC' }, { id: 'verticalDA', type: 'vertical_l', l_id: 'DA' },
  ];
  if (dimensions >= 1) primitives.push({ id: 'width100', type: 'p2p_distance', p1_id: 'A', p2_id: 'B', distance: 100 });
  if (dimensions === 2) primitives.push({ id: 'height60', type: 'p2p_distance', p1_id: 'A', p2_id: 'D', distance: 60 });
  if (conflict) primitives.push({ id: 'width101', type: 'p2p_distance', p1_id: 'A', p2_id: 'B', distance: 101 });
  return primitives;
}
function points(current: SolverSession): Record<string, number[]> {
  return Object.fromEntries(current.snapshot().filter(primitive => primitive.type === 'point').map(point => [point.id, [point.x, point.y]]));
}
function reporting(current: SolverSession) {
  return { conflicts: current.engine.get_gcs_conflicting_constraints().sort(), redundant: current.engine.get_gcs_redundant_constraints().sort(),
    partiallyRedundant: current.engine.get_gcs_partially_redundant_constraints().sort() };
}
function solveRectangle(current: SolverSession, dimensions: 0 | 1 | 2, conflict = false) {
  const engine = current.engine; engine.clear_data();
  engine.set_convergence_threshold(1e-12); engine.set_max_iterations(100); // Tight fixed-oracle fixture settings, not document policy.
  engine.push_primitives_and_params(rectangle(dimensions, conflict));
  const before = JSON.stringify(current.snapshot()), status = engine.solve(), dof = current.dof(), reports = reporting(current);
  const applied = status === 0 && reports.conflicts.length === 0; // The published Success status is 0; failed output is never applied.
  if (applied) engine.apply_solution();
  return { status, dof, ...reports, applied, snapshotPreserved: before === JSON.stringify(current.snapshot()), points: points(current) };
}
function rejected(action: () => unknown) {
  try { action(); return 'NOT_REJECTED'; } catch (cause) { return cause instanceof Error ? cause.name : String(cause); }
}
async function run(request: FixtureRequest): Promise<Record<string, unknown>> {
  if (request.action === 'open') {
    const opened = await solverRuntime(request); session = opened.session;
    return { ready: opened.ready, workerIsolated: globalThis.crossOriginIsolated, workerOnly: typeof document === 'undefined', diagnostics: opened.diagnostics };
  }
  const current = requireSession();
  if (request.action === 'solve') {
    const { points: _underPoints, snapshotPreserved: _underPreserved, ...underdefined } = solveRectangle(current, 0);
    const { points: _widthPoints, snapshotPreserved: _widthPreserved, ...widthOnly } = solveRectangle(current, 1);
    const defined = solveRectangle(current, 2); if (defined.applied) lastSuccessfulPoints = defined.points;
    return { underdefined, widthOnly, defined };
  }
  if (request.action === 'probe') {
    const before = JSON.stringify(current.snapshot()), dof = current.dof(), reports = JSON.stringify(reporting(current));
    const probed = await solverRuntime({ action: 'probe', session: current });
    return { ready: probed.ready, snapshotPreserved: before === JSON.stringify(current.snapshot()), dofPreserved: dof === current.dof(),
      reportingPreserved: reports === JSON.stringify(reporting(current)), diagnostics: probed.diagnostics };
  }
  if (request.action === 'conflict') {
    const result = solveRectangle(current, 2, true);
    return { ...result, closed: current.isClosed(), lastSuccessfulPoints };
  }
  if (request.action === 'close') {
    const capturedSolve = current.engine.solve, generation = current.generation;
    const closed = await solverRuntime({ action: 'close', session: current });
    return { ready: closed.ready, closed: current.isClosed(), generationChanged: current.generation !== generation,
      capturedSolveError: rejected(capturedSolve), snapshotError: rejected(() => current.snapshot()), diagnostics: closed.diagnostics };
  }
  port.postMessage({ id: request.id, phase: 'started', result: {} });
  const start = performance.now(); let iterations = 0, result;
  do {
    result = solveRectangle(current, 2); iterations++;
    if (!result.applied || result.dof !== 0) throw Error('The real rectangle work loop did not solve successfully.');
  } while (performance.now() - start < WORK_MS);
  return { elapsedMs: performance.now() - start, iterations, status: result.status, dof: result.dof, points: result.points };
}
port.addEventListener('message', event => {
  void run(event.data).then(result => port.postMessage({ id: event.data.id, phase: 'complete', result }), cause => {
    port.postMessage({ id: event.data.id, phase: 'error', result: { name: cause instanceof Error ? cause.name : 'NativeFailure',
      message: cause instanceof Error ? cause.message : String(cause), closed: session?.isClosed() ?? true } });
  });
});
