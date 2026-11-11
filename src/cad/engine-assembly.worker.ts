/**
 * Development-only CAD-A1 seam fixture; contract: dev/CAD-ENGINE-ASSEMBLY.md.
 * Both GREEN runtime ports and every native object remain in this worker.
 * Literal fixture commands are not a production geometry/solve dispatcher.
 * Any error ends the pair's lifetime; the page must terminate this worker.
 */
import { kernelRuntime, type KernelRequest, type KernelSession } from './kernel-runtime.ts';
import { solverRuntime, type SolverSession } from './solver-runtime.ts';
import type { SketchPrimitive } from '@salusoft89/planegcs';

export type FixtureRequest = {
  id: number; action: 'open'; kernel: Extract<KernelRequest, { action: 'open' }>['config'];
  solver: { moduleUrl: string; wasmUrl: string };
} | { id: number; action: 'inspect' | 'close' | 'work' | 'fault' };
export type FixtureReply = { id: number; phase: 'started' | 'complete' | 'error'; result: Record<string, unknown> };
const port = globalThis as unknown as {
  postMessage(reply: FixtureReply): void;
  addEventListener(type: 'message', callback: (event: MessageEvent<FixtureRequest>) => void): void;
};
const WORK_MS = 600; // Bounded responsiveness fixture, not a product performance target.
let kernel: KernelSession | null = null, solver: SolverSession | null = null;
let token: ReturnType<KernelSession['retain']> | null = null;
let state: 'new' | 'opening' | 'ready' | 'closed' | 'failed' = 'new', busy = false;

function error(name: string, message: string): Error { return Object.assign(new Error(message), { name }); }
function fail(request: FixtureRequest, cause: unknown): void {
  state = 'failed';
  // Lifetime booleans are local observations; sibling native cleanup is unsafe here.
  port.postMessage({ id: request.id, phase: 'error', result: {
    name: cause instanceof Error ? cause.name : 'FixtureError',
    message: cause instanceof Error ? cause.message : String(cause), failedAction: request.action,
    kernelState: kernel ? kernel.isClosed() ? 'closed' : 'open' : 'absent',
    solverState: solver ? solver.isClosed() ? 'closed' : 'open' : 'absent',
  } });
}
function measure(session: KernelSession, shapeToken: NonNullable<typeof token>) {
  const library = session.library, shape = session.resolve(shapeToken);
  const validator = new library.BRepCheck_Analyzer(shape, true, false);
  const properties = new library.GProp_GProps();
  library.BRepGProp.VolumeProperties(shape, properties, true, false, false);
  const result = { valid: validator.IsValid(), volume: properties.Mass() };
  // If a native call throws, the owner terminates instead of further geometry calls.
  properties.delete(); validator.delete(); return result;
}
function rejection(operation: () => unknown): string {
  try { operation(); return 'NoError'; } catch (cause) { return cause instanceof Error ? cause.name : 'UnknownError'; }
}
async function inspect(currentKernel: KernelSession, currentSolver: SolverSession, shapeToken: NonNullable<typeof token>) {
  const box = measure(currentKernel, shapeToken), shape = currentKernel.resolve(shapeToken), engine = currentSolver.engine;
  const fixture: SketchPrimitive[] = [
    { id: 'p', type: 'point', x: 0, y: 0, fixed: false },
    { id: 'x10', type: 'coordinate_x', p_id: 'p', x: 10, driving: true },
    { id: 'y20', type: 'coordinate_y', p_id: 'p', y: 20, driving: true },
  ];
  engine.clear_data(); engine.push_primitives_and_params(fixture);
  const status = engine.solve(), dof = currentSolver.dof(), conflicts = engine.get_gcs_conflicting_constraints();
  if (status !== 0) throw error('FixtureVerificationError', 'The solvable point was rejected.');
  engine.apply_solution();
  const point = currentSolver.snapshot().find(primitive => primitive.id === 'p');
  if (point?.type !== 'point') throw error('FixtureVerificationError', 'The solved point is missing.');
  const solved = { status, dof, conflicts, point: [point.x, point.y] };
  engine.clear_data(); engine.push_primitives_and_params([...fixture,
    { id: 'x11', type: 'coordinate_x', p_id: 'p', x: 11, driving: true }]);
  const before = JSON.stringify(currentSolver.snapshot());
  // This known contradictory fixture is deliberately never applied.
  const contradiction = { status: engine.solve(), dof: currentSolver.dof(),
    conflicts: engine.get_gcs_conflicting_constraints().sort(), applied: false,
    snapshotPreserved: before === JSON.stringify(currentSolver.snapshot()) };
  const snapshot = JSON.stringify(currentSolver.snapshot());
  const kernelProbe = await kernelRuntime({ action: 'probe', session: currentKernel });
  const solverProbe = await solverRuntime({ action: 'probe', session: currentSolver });
  return { box, solved, contradiction, probes: {
    kernelReady: kernelProbe.status.ready, solverReady: solverProbe.ready,
    shapePreserved: currentKernel.resolve(shapeToken) === shape,
    solverSnapshotPreserved: snapshot === JSON.stringify(currentSolver.snapshot()),
  }, after: { ...measure(currentKernel, shapeToken), kernelClosed: currentKernel.isClosed(), solverClosed: currentSolver.isClosed() } };
}
async function close(currentKernel: KernelSession, currentSolver: SolverSession, shapeToken: NonNullable<typeof token>) {
  const kernelGeneration = currentKernel.generation, solverGeneration = currentSolver.generation;
  const capturedSolve = currentSolver.engine.solve;
  const kernelResult = await kernelRuntime({ action: 'close', session: currentKernel });
  if (kernelResult.status.diagnostics.length) {
    throw error('FixtureDisposalError', kernelResult.status.diagnostics.map(item => item.message).join('\n'));
  }
  const solverResult = await solverRuntime({ action: 'close', session: currentSolver });
  if (solverResult.diagnostics.length) throw error('FixtureDisposalError', solverResult.diagnostics.map(item => item.message).join('\n'));
  state = 'closed';
  return { kernelClosed: currentKernel.isClosed(), solverClosed: currentSolver.isClosed(),
    kernelGenerationChanged: currentKernel.generation !== kernelGeneration,
    solverGenerationChanged: currentSolver.generation !== solverGeneration,
    kernelTokenError: rejection(() => currentKernel.resolve(shapeToken)), capturedSolveError: rejection(capturedSolve), diagnostics: [] };
}
async function execute(request: FixtureRequest): Promise<Record<string, unknown>> {
  if (request.action === 'open') {
    if (state !== 'new') throw error('FixtureProtocolError', 'A pair can only open once in this worker.');
    state = 'opening';
    const openedKernel = await kernelRuntime({ action: 'open', config: request.kernel }); kernel = openedKernel.session;
    if (state !== 'opening') throw error('FixtureProtocolError', 'Pair initialization was interrupted.');
    const openedSolver = await solverRuntime({ action: 'open', ...request.solver }); solver = openedSolver.session;
    if (state !== 'opening') throw error('FixtureProtocolError', 'Pair initialization was interrupted.');
    if (!kernel || !solver) throw error('FixtureVerificationError', 'An engine returned no session.');
    const builder = new kernel.library.BRepPrimAPI_MakeBox(2, 3, 4);
    const shape = builder.Shape(); builder.delete(); token = kernel.retain(shape); state = 'ready';
    return { kernelReady: openedKernel.status.ready, solverReady: openedSolver.ready, mode: openedKernel.status.mode,
      workerOnly: typeof document === 'undefined', workerIsolated: crossOriginIsolated };
  }
  if (state !== 'ready' || !kernel || !solver || !token) throw error('FixtureProtocolError', 'Open both engines before this operation.');
  if (request.action === 'inspect') return inspect(kernel, solver, token);
  if (request.action === 'close') return close(kernel, solver, token);
  if (request.action === 'fault') {
    // Development injection exercises a real native Standard_DomainError via C01.
    kernel.library.BRepPrimAPI_MakeBox = new Proxy(kernel.library.BRepPrimAPI_MakeBox, {
      construct(target) { return Reflect.construct(target, [0, 3, 4]); },
    });
    await kernelRuntime({ action: 'probe', session: kernel });
    throw error('FixtureVerificationError', 'The injected native fault was not rejected.');
  }
  port.postMessage({ id: request.id, phase: 'started', result: {} });
  const start = performance.now(); let iterations = 0;
  do {
    await kernelRuntime({ action: 'probe', session: kernel });
    await solverRuntime({ action: 'probe', session: solver }); iterations++;
  } while (performance.now() - start < WORK_MS);
  return { elapsedMs: performance.now() - start, iterations };
}
port.addEventListener('message', async ({ data: request }) => {
  // Acquire before the first await so repeated open cannot allocate a second pair.
  if (busy) { fail(request, error('FixtureProtocolError', 'A paired request is already active.')); return; }
  busy = true;
  try { port.postMessage({ id: request.id, phase: 'complete', result: await execute(request) }); }
  catch (cause) { fail(request, cause); }
  finally { busy = false; }
});
