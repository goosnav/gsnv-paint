/**
 * PURPOSE    Own a PlaneGCS instance within its worker lifetime.
 * KIND       SHELL
 * CONTRACT   IN: SolverRequest; open uses same-origin HTTP(S) pinned native glue/WASM
 *            URLs without credentials. moduleUrl exports the native default initializer;
 *            the published GcsWrapper is bundled normally. probe/close use this live port.
 *            OUT: readiness, independent diagnostics and a worker-local SolverSession.
 *            Open/probe solve one fixed-coordinate point and reject its contradictory
 *            coordinate using actual status/DOF/conflict reporting, in a separate system.
 *            Probe preserves live data/settings. Close destroys once and invalidates generation.
 *            Engine methods preserve vendor statuses (including negative DOF); callers own
 *            solve/apply policy. Inputs, snapshots and diagnostic arrays do not share data.
 *            RAISES: SolverLoadError for configuration/load/init/probe failures;
 *            SolverCapabilityError for missing worker/WASM or native reporting methods;
 *            DisposedSessionError for foreign/closed sessions or captured methods after close.
 * GUARANTEES No main-thread solver, UI, uploads, persisted native handles or replacement solver.
 *            The public facade exposes no native system or destroy method.
 * TUNING     PROBE_TOLERANCE is the fixed point oracle's allowance, not document tolerance.
 * DECISIONS  D1: Bundle the published wrapper and load native glue by URL. Alternative raw
 *            index.js URLs lose sibling imports when emitted. Revisit if: upstream ships
 *            a self-contained entry. D2: Probe a temporary system rather than clear live
 *            data. Revisit if: the vendor provides a non-mutating native health check.
 *            D3: Invalidate on any thrown vendor call; continuing can reuse partially changed
 *            or trapped state. Revisit if: a verified vendor recovery protocol becomes available.
 * LIMITS     Vendor engine exceptions propagate after invalidation; failed open/probe also
 *            requires owner termination. Ordinary contradictory results are not exceptions. Normal
 *            close releases the system, not WASM memory; owner termination reclaims the heap
 *            and cancels synchronous work. The fixed vendor memory is 337 pages (22,085,632
 *            bytes), not a total worker-memory cap. Geometry validation/commit policy is C16.
 * TESTBENCH  src/cad/solver-runtime.test.ts -- run with: node --import tsx --test src/cad/solver-runtime.test.ts
 */
import { GcsWrapper, SolveStatus, type ModuleStatic, type SketchPrimitive, type init_planegcs_module } from '@salusoft89/planegcs';

type SolverEngine = Pick<GcsWrapper, 'clear_data' | 'push_primitives_and_params' | 'solve' | 'apply_solution'
  | 'get_gcs_conflicting_constraints' | 'get_gcs_redundant_constraints' | 'get_gcs_partially_redundant_constraints'
  | 'set_convergence_threshold' | 'set_max_iterations'>;
type Diagnostic = { code: string; message: string; subjectIds: string[]; severity: 'warning' | 'error' };
export type SolverSession = Readonly<{
  generation: number; engine: SolverEngine; dof(): number; snapshot(): SketchPrimitive[]; isClosed(): boolean;
}>;
export type SolverRequest = { action: 'open'; moduleUrl: string; wasmUrl: string }
  | { action: 'probe' | 'close'; session: SolverSession };
type SolverResult = { ready: boolean; session: SolverSession | null; diagnostics: Diagnostic[] };
type Owned = { module: ModuleStatic; invalidate(): void; close(): Diagnostic[] };
const sessions = new WeakMap<SolverSession, Owned>();
const PROBE_TOLERANCE = 1e-8; // Absolute coordinate allowance for the independently known (10, 20) point.
let issuedGeneration = 0;

function error(name: string, message: string, cause?: unknown): Error {
  return Object.assign(new Error(message, { cause }), { name });
}
function explain(cause: unknown): string {
  try { return String(cause instanceof Error ? cause.message : cause); } catch { return 'unreadable solver failure'; }
}
function loadError(context: string, cause: unknown): Error {
  if (cause instanceof Error && cause.name === 'SolverCapabilityError') return cause;
  return error('SolverLoadError', `PlaneGCS ${context} failed: ${explain(cause)}. Terminate the solver worker.`, cause);
}
function checkConfig(moduleUrl: string, wasmUrl: string): void {
  try {
    for (const text of [moduleUrl, wasmUrl]) {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== location.origin || url.username || url.password) {
        throw Error('Solver assets require same-origin HTTP(S) URLs without credentials.');
      }
    }
  } catch (cause) { throw loadError('URL configuration', cause); }
  if (typeof document !== 'undefined' || typeof (globalThis as { importScripts?: unknown }).importScripts !== 'function') {
    throw error('SolverCapabilityError', 'PlaneGCS must run in a worker.');
  }
  if (typeof WebAssembly === 'undefined') throw error('SolverCapabilityError', 'PlaneGCS requires WebAssembly.');
}
function createWrapper(module: ModuleStatic): GcsWrapper {
  const native = new module.GcsSystem();
  for (const method of ['dof', 'get_conflicting', 'get_redundant', 'get_partially_redundant'] as const) {
    if (typeof native[method] !== 'function') throw error('SolverCapabilityError', `PlaneGCS reporting method ${method} is unavailable. Terminate the solver worker.`);
  }
  return new GcsWrapper(native, module);
}
function probe(module: ModuleStatic): void {
  // Any failed call/check leaves uncertain native state to owner termination, not more native calls.
  const wrapper = createWrapper(module);
  const fixture: SketchPrimitive[] = [
    { id: 'probe-point', type: 'point', x: 0, y: 0, fixed: false },
    { id: 'probe-x', type: 'coordinate_x', p_id: 'probe-point', x: 10, driving: true },
    { id: 'probe-y', type: 'coordinate_y', p_id: 'probe-point', y: 20, driving: true },
  ];
  wrapper.push_primitives_and_params(structuredClone(fixture));
  if (wrapper.solve() !== SolveStatus.Success || wrapper.gcs.dof() !== 0
    || wrapper.get_gcs_conflicting_constraints().length || wrapper.get_gcs_redundant_constraints().length
    || wrapper.get_gcs_partially_redundant_constraints().length) throw Error('The solvable coordinate probe returned incorrect status, DOF or constraints.');
  wrapper.apply_solution();
  const point = wrapper.sketch_index.get_primitives().find(item => item.id === 'probe-point');
  if (point?.type !== 'point' || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || Math.abs(point.x - 10) > PROBE_TOLERANCE || Math.abs(point.y - 20) > PROBE_TOLERANCE) throw Error('The coordinate probe returned incorrect geometry.');
  wrapper.clear_data();
  wrapper.push_primitives_and_params([...structuredClone(fixture),
    { id: 'probe-conflict', type: 'coordinate_x', p_id: 'probe-point', x: 11, driving: true }]);
  if (wrapper.solve() !== SolveStatus.Failed || wrapper.gcs.dof() !== -1) throw Error('The contradictory probe returned incorrect status or DOF.');
  const conflicts = wrapper.get_gcs_conflicting_constraints();
  if (conflicts.length !== 2 || !conflicts.includes('probe-x') || !conflicts.includes('probe-conflict')) {
    throw Error('The contradictory probe did not report both conflicting constraint IDs.');
  }
  wrapper.destroy_gcs_module();
}
function createSession(module: ModuleStatic): SolverSession {
  const wrapper = createWrapper(module);
  let generation = ++issuedGeneration, closed = false;
  const assertOpen = () => { if (closed) throw error('DisposedSessionError', 'Solver session is closed.'); };
  const invalidate = () => { if (!closed) { closed = true; generation = ++issuedGeneration; } };
  const invoke = <T>(operation: () => T): T => {
    assertOpen();
    try { return operation(); } catch (cause) { invalidate(); throw cause; }
  };
  const engine: SolverEngine = Object.freeze({
    clear_data: () => invoke(() => wrapper.clear_data()),
    push_primitives_and_params: (input: Parameters<SolverEngine['push_primitives_and_params']>[0]) => invoke(() => wrapper.push_primitives_and_params(structuredClone(input))),
    solve: (algorithm?: Parameters<SolverEngine['solve']>[0]) => invoke(() => wrapper.solve(algorithm)),
    apply_solution: () => invoke(() => wrapper.apply_solution()),
    get_gcs_conflicting_constraints: () => invoke(() => [...wrapper.get_gcs_conflicting_constraints()]),
    get_gcs_redundant_constraints: () => invoke(() => [...wrapper.get_gcs_redundant_constraints()]),
    get_gcs_partially_redundant_constraints: () => invoke(() => [...wrapper.get_gcs_partially_redundant_constraints()]),
    set_convergence_threshold: (threshold: number) => invoke(() => wrapper.set_convergence_threshold(threshold)),
    set_max_iterations: (count: number) => invoke(() => wrapper.set_max_iterations(count)),
  });
  const session: SolverSession = Object.freeze({
    get generation() { return generation; }, engine, isClosed: () => closed,
    dof: () => invoke(() => wrapper.gcs.dof()),
    snapshot: () => invoke(() => structuredClone(wrapper.sketch_index.get_primitives())),
  });
  sessions.set(session, { module, invalidate, close() {
    invalidate();
    try { wrapper.destroy_gcs_module(); return []; }
    catch (cause) { return [{ code: 'solver.dispose', message: `Solver cleanup failed: ${explain(cause)}. Terminate the solver worker.`, subjectIds: [], severity: 'error' }]; }
  } });
  return session;
}

export async function solverRuntime(request: SolverRequest): Promise<SolverResult> {
  if (request.action !== 'open') {
    const session = request.session, owned = sessions.get(session);
    if (!owned || session.isClosed()) throw error('DisposedSessionError', 'Solver session is foreign or closed.');
    if (request.action === 'close') return { ready: false, session: null, diagnostics: owned.close() };
    try { probe(owned.module); } catch (cause) { owned.invalidate(); throw loadError('probe', cause); }
    return { ready: true, session, diagnostics: [] };
  }
  const { moduleUrl, wasmUrl } = request;
  checkConfig(moduleUrl, wasmUrl);
  try {
    const vendor: { default: typeof init_planegcs_module } = await import(/* @vite-ignore */ moduleUrl);
    if (typeof vendor.default !== 'function') throw Error('The native module initializer is missing.');
    const module = await vendor.default({ locateFile: () => wasmUrl });
    if (typeof module?.GcsSystem !== 'function') throw Error('The native module has no GcsSystem constructor.');
    probe(module);
    return { ready: true, session: createSession(module), diagnostics: [] };
  } catch (cause) { throw loadError('initialization/probe', cause); }
}
