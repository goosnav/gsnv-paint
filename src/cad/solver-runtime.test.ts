import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { SketchParam, SketchPrimitive } from '@salusoft89/planegcs';
import type { SolverRequest, SolverSession } from './solver-runtime.ts';

// Substitute only external vendor resources; the adapter is loaded after the hooks.
const origin = 'https://solver.test';
const vendorUrl = `${origin}/fake-package-root.js`;
const globals = ['location', 'importScripts', '__C02_FACTORY', '__C02_WRAP'];
const saved = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@salusoft89/planegcs') return { url: vendorUrl, shortCircuit: true };
    return specifier.startsWith(`${origin}/vendor/`) ? { url: specifier, shortCircuit: true } : next(specifier, context);
  },
  load(url, context, next) {
    if (url === vendorUrl) return { format: 'module', shortCircuit: true, source: `
      export const SolveStatus = { Success: 0, Converged: 1, Failed: 2, SuccessfulSolutionInvalid: 3 };
      export class GcsWrapper { constructor(native, module) { return globalThis.__C02_WRAP(native, module); } }
    ` };
    if (url.endsWith('/vendor/no-default.js')) return { format: 'module', shortCircuit: true, source: 'export const unrelated = true;' };
    if (url.startsWith(`${origin}/vendor/`)) return { format: 'module', shortCircuit: true,
      source: 'export default function(options) { return globalThis.__C02_FACTORY(options); }' };
    return next(url, context);
  },
});
const { solverRuntime } = await import('./solver-runtime.ts');
after(() => {
  hooks.deregister();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});

type Input = SketchPrimitive | SketchParam;
type Options = { locateFile(path: string, directory: string): string };
type ProbeOracle = {
  successStatus: number; successDof: number; x: number; y: number;
  successConflicts: string[]; successRedundant: string[]; conflictStatus: number; conflictDof: number; conflictIds: string[];
};
let resource: ReturnType<typeof fakeResource>;
let initialized = 0;
let options: Options;

function fakeResource() {
  const calls: { native: Native; method: string }[] = [];
  const systems: Native[] = [];
  const state = {
    missing: '' as string, creationFault: null as unknown, probeFault: null as unknown,
    liveStatus: 0, liveDof: 2,
    probe: { successStatus: 0, successDof: 0, x: 10, y: 20, successConflicts: [], successRedundant: [],
      conflictStatus: 2, conflictDof: -1, conflictIds: ['probe-x', 'probe-conflict'] } as ProbeOracle,
  };
  class Native {
    primitives: SketchPrimitive[] = [];
    params: SketchParam[] = [];
    deleted = false; deletes = 0; dofValue = -1;
    threshold = 1e-10; iterations = 100;
    conflicts: string[] = []; redundant: string[] = []; partial: string[] = [];
    faults = new Map<string, unknown>();
    constructor() {
      if (state.creationFault) throw state.creationFault;
      systems.push(this);
      if (state.missing) Object.defineProperty(this, state.missing, { value: undefined });
    }
    call(method: string) {
      calls.push({ native: this, method });
      if (this.faults.has(method)) throw this.faults.get(method);
      assert.equal(this.deleted, false, `native ${method} used after deletion`);
    }
    clear_data() { this.call('clear_data'); this.primitives = []; this.params = []; this.dofValue = -1; }
    delete() { this.call('delete'); this.deletes++; this.deleted = true; }
    dof() { this.call('dof'); return this.dofValue; }
    get_conflicting() { this.call('get_conflicting'); return this.conflicts; }
    get_redundant() { this.call('get_redundant'); return this.redundant; }
    get_partially_redundant() { this.call('get_partially_redundant'); return this.partial; }
  }
  class Wrapper {
    constructor(readonly gcs: Native, readonly module: unknown) {}
    sketch_index = { get_primitives: () => { this.gcs.call('snapshot'); return [...this.gcs.primitives]; } };
    clear_data() { this.gcs.clear_data(); }
    push_primitives_and_params(input: Input[]) {
      this.gcs.call('push');
      for (const item of input) {
        if (item.type === 'param') this.gcs.params.push(item); else this.gcs.primitives.push(item);
      }
    }
    solve(_algorithm?: number) {
      this.gcs.call('solve');
      const probe = this.gcs.primitives.some(item => item.id === 'probe-point');
      if (!probe) { this.gcs.dofValue = state.liveDof; return state.liveStatus; }
      if (state.probeFault) throw state.probeFault;
      const contradictory = this.gcs.primitives.some(item => item.id === 'probe-conflict');
      // The fake accepts the agreed oracle, not an arbitrary sketch labelled a probe.
      assert.deepEqual(this.gcs.primitives, [
        { id: 'probe-point', type: 'point', x: 0, y: 0, fixed: false },
        { id: 'probe-x', type: 'coordinate_x', p_id: 'probe-point', x: 10, driving: true },
        { id: 'probe-y', type: 'coordinate_y', p_id: 'probe-point', y: 20, driving: true },
        ...(contradictory ? [{ id: 'probe-conflict', type: 'coordinate_x', p_id: 'probe-point', x: 11, driving: true }] : []),
      ]);
      this.gcs.dofValue = contradictory ? state.probe.conflictDof : state.probe.successDof;
      this.gcs.conflicts = contradictory ? state.probe.conflictIds : state.probe.successConflicts;
      this.gcs.redundant = contradictory ? [] : state.probe.successRedundant;
      return contradictory ? state.probe.conflictStatus : state.probe.successStatus;
    }
    apply_solution() {
      this.gcs.call('apply_solution');
      if (this.gcs.primitives.some(item => item.id === 'probe-conflict')) throw Error('Contradictory probe solution was applied.');
      this.gcs.primitives = this.gcs.primitives.map(item => item.type === 'point' && item.id === 'probe-point'
        ? { ...item, x: state.probe.x, y: state.probe.y } : item);
    }
    get_gcs_conflicting_constraints() { return this.gcs.get_conflicting(); }
    get_gcs_redundant_constraints() { return this.gcs.get_redundant(); }
    get_gcs_partially_redundant_constraints() { return this.gcs.get_partially_redundant(); }
    set_convergence_threshold(value: number) { this.gcs.call('set_convergence_threshold'); this.gcs.threshold = value; }
    set_max_iterations(value: number) { this.gcs.call('set_max_iterations'); this.gcs.iterations = value; }
    destroy_gcs_module() { this.gcs.clear_data(); this.gcs.delete(); }
  }
  return { state, calls, systems, library: { GcsSystem: Native }, wrap: (native: Native, module: unknown) => new Wrapper(native, module) };
}
function setGlobal(key: string, value: unknown) { Object.defineProperty(globalThis, key, { configurable: true, value }); }
beforeEach(() => {
  resource = fakeResource(); initialized = 0;
  setGlobal('location', new URL(`${origin}/worker.js`)); setGlobal('importScripts', () => {});
  setGlobal('__C02_WRAP', (native: Parameters<typeof resource.wrap>[0], module: unknown) => resource.wrap(native, module));
  setGlobal('__C02_FACTORY', async (input: Options) => { initialized++; options = input; return resource.library; });
});
const config = { moduleUrl: `${origin}/vendor/planegcs.js`, wasmUrl: `${origin}/vendor/planegcs.wasm` };
const open = () => solverRuntime({ action: 'open', ...config });
const close = (session: SolverSession) => solverRuntime({ action: 'close', session });
const named = (name: string, pattern: RegExp) => (cause: unknown) => {
  assert.ok(cause instanceof Error); assert.equal(cause.name, name); assert.match(cause.message, pattern); return true;
};
const point = (): SketchPrimitive => ({ id: 'live-point', type: 'point', x: 4, y: 5, fixed: false });
function liveSystem() {
  const native = resource.systems.find(item => item.primitives.some(primitive => primitive.id === 'live-point'));
  assert.ok(native, 'external resource received live input'); return native;
}

test('C02 golden opens a worker-local facade with empty live data and closes once', async () => {
  const result = await open(); const session = result.session!;
  assert.deepEqual({ ready: result.ready, diagnostics: result.diagnostics, snapshot: session.snapshot(), closed: session.isClosed() },
    { ready: true, diagnostics: [], snapshot: [], closed: false });
  assert.equal(initialized, 1); assert.equal(options.locateFile('planegcs.wasm', '/ignored/'), config.wasmUrl);
  assert.ok(Number.isSafeInteger(session.generation));
  for (const key of ['gcs', 'module', 'sketch_index', 'destroy_gcs_module']) assert.equal(key in session.engine, false);
  const generation = session.generation;
  assert.deepEqual(await close(session), { ready: false, session: null, diagnostics: [] });
  assert.equal(session.isClosed(), true); assert.notEqual(session.generation, generation);
  assert.ok(resource.systems.length >= 2, 'probe has a distinct native system');
  assert.ok(resource.systems.every(native => native.deletes === 1), 'normal lifetime releases every owned system once');
});

test('C02 clones nested input and snapshot objects across the vendor boundary', async () => {
  const session = (await open()).session!;
  const reference = { o_id: 'live-point', prop: 'x' as const };
  const input: Input[] = [point(), { id: 'reference', type: 'equal', param1: reference, param2: 8, driving: true },
    { type: 'param', name: 'width', value: 8 }];
  session.engine.push_primitives_and_params(input);
  reference.o_id = 'changed-by-caller'; (input[0] as Extract<SketchPrimitive, { type: 'point' }>).x = 99;
  const snapshot = session.snapshot();
  assert.deepEqual(snapshot, [{ id: 'live-point', type: 'point', x: 4, y: 5, fixed: false },
    { id: 'reference', type: 'equal', param1: { o_id: 'live-point', prop: 'x' }, param2: 8, driving: true }]);
  const relation = snapshot[1] as Extract<SketchPrimitive, { type: 'equal' }>;
  assert.equal(typeof relation.param1, 'object'); (relation.param1 as { o_id: string }).o_id = 'changed-snapshot';
  snapshot.pop();
  assert.equal((session.snapshot()[1] as typeof relation).param1 &&
    ((session.snapshot()[1] as typeof relation).param1 as { o_id: string }).o_id, 'live-point');
  liveSystem().primitives[0] = { id: 'live-point', type: 'point', x: -10, y: 5, fixed: false };
  assert.equal((snapshot[0] as Extract<SketchPrimitive, { type: 'point' }>).x, 4);
  await close(session);
});

test('C02 probe preserves live settings, data and independent diagnostics', async () => {
  const opened = await open(), session = opened.session!;
  session.engine.push_primitives_and_params([point()]); session.engine.set_convergence_threshold(1e-7); session.engine.set_max_iterations(23);
  const native = liveSystem(), before = structuredClone(session.snapshot());
  opened.diagnostics.push({ code: 'caller', severity: 'warning', message: 'Caller-owned array.', subjectIds: ['caller'] });
  const result = await solverRuntime({ action: 'probe', session });
  assert.equal(result.ready, true); assert.equal(result.session, session); assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(session.snapshot(), before); assert.equal(native.threshold, 1e-7); assert.equal(native.iterations, 23);
  assert.equal(native.deleted, false);
  await close(session); assert.ok(resource.systems.every(item => item.deletes === 1));
});

test('C02 keeps separate sessions independent when one closes', async () => {
  const first = (await open()).session!, second = (await open()).session!;
  first.engine.push_primitives_and_params([point()]);
  second.engine.push_primitives_and_params([{ ...point(), id: 'other-point' }]);
  await close(first); assert.equal(second.isClosed(), false);
  assert.deepEqual(second.snapshot(), [{ id: 'other-point', type: 'point', x: 4, y: 5, fixed: false }]);
  await close(second);
});

test('C02 every captured public method rejects after close without calling native code', async () => {
  const session = (await open()).session!, engine = session.engine;
  const push = engine.push_primitives_and_params, threshold = engine.set_convergence_threshold, iterations = engine.set_max_iterations;
  const captured = [engine.clear_data, () => push([point()]), engine.solve, engine.apply_solution,
    engine.get_gcs_conflicting_constraints, engine.get_gcs_redundant_constraints, engine.get_gcs_partially_redundant_constraints,
    () => threshold(1e-7), () => iterations(20), session.dof, session.snapshot];
  await close(session); const count = resource.calls.length;
  for (const invoke of captured) assert.throws(invoke, named('DisposedSessionError', /session|closed/i));
  await assert.rejects(close(session), named('DisposedSessionError', /session|closed/i));
  await assert.rejects(solverRuntime({ action: 'probe', session }), named('DisposedSessionError', /session|closed/i));
  assert.equal(resource.calls.length, count);
});

test('C02 rejects forged session copies without touching live native state', async () => {
  const session = (await open()).session!; const count = resource.calls.length;
  for (const action of ['probe', 'close'] as const) {
    await assert.rejects(solverRuntime({ action, session: { ...session } }), named('DisposedSessionError', /session|foreign/i));
    await assert.rejects(solverRuntime({ action, session: null as unknown as SolverSession }), named('DisposedSessionError', /session|foreign/i));
  }
  assert.equal(resource.calls.length, count); assert.equal(session.isClosed(), false); await close(session);
});

test('C02 forwards ordinary solve statuses and negative DOF without applying or invalidating', async () => {
  const session = (await open()).session!; session.engine.push_primitives_and_params([point()]); const native = liveSystem();
  const before = resource.calls.filter(call => call.native === native && call.method === 'apply_solution').length;
  for (const [status, dof] of [[0, 2], [1, 1], [2, -1], [3, 0]] as const) {
    resource.state.liveStatus = status; resource.state.liveDof = dof;
    assert.equal(session.engine.solve(), status); assert.equal(session.dof(), dof); assert.equal(session.isClosed(), false);
  }
  assert.equal(resource.calls.filter(call => call.native === native && call.method === 'apply_solution').length, before);
  assert.deepEqual(session.snapshot(), [point()]); await close(session);
});

test('C02 diagnostic arrays returned from the vendor cannot alias caller-owned results', async () => {
  const session = (await open()).session!; session.engine.push_primitives_and_params([point()]); const native = liveSystem();
  native.conflicts = ['a']; native.redundant = ['b']; native.partial = ['c'];
  const calls = [session.engine.get_gcs_conflicting_constraints, session.engine.get_gcs_redundant_constraints,
    session.engine.get_gcs_partially_redundant_constraints];
  for (const [index, invoke] of calls.entries()) { const ids = invoke(); ids[0] = 'caller'; assert.deepEqual(invoke(), [['a'], ['b'], ['c']][index]); }
  await close(session);
});

for (const method of ['push', 'clear_data', 'solve', 'apply_solution', 'get_conflicting', 'get_redundant',
  'get_partially_redundant', 'set_convergence_threshold', 'set_max_iterations', 'dof', 'snapshot'] as const) {
  test(`C02 a thrown vendor ${method} call invalidates once and preserves the original error`, async () => {
    const session = (await open()).session!; session.engine.push_primitives_and_params([point()]); const native = liveSystem();
    const failure = method === 'solve' ? new WebAssembly.RuntimeError('memory access out of bounds') : new Error(`vendor ${method} failed`);
    native.faults.set(method, failure); const generation = session.generation;
    const invoke: Record<typeof method, () => unknown> = {
      push: () => session.engine.push_primitives_and_params([point()]), clear_data: session.engine.clear_data,
      solve: session.engine.solve, apply_solution: session.engine.apply_solution,
      get_conflicting: session.engine.get_gcs_conflicting_constraints, get_redundant: session.engine.get_gcs_redundant_constraints,
      get_partially_redundant: session.engine.get_gcs_partially_redundant_constraints,
      set_convergence_threshold: () => session.engine.set_convergence_threshold(1e-8), set_max_iterations: () => session.engine.set_max_iterations(12),
      dof: session.dof, snapshot: session.snapshot,
    };
    const before = resource.calls.length;
    assert.throws(invoke[method], cause => cause === failure);
    assert.equal(session.isClosed(), true); assert.notEqual(session.generation, generation);
    assert.equal(resource.calls.length, before + 1, 'no cleanup or further native calls after the thrown call');
    assert.throws(session.snapshot, named('DisposedSessionError', /closed|session/i));
    assert.equal(resource.calls.length, before + 1);
  });
}

test('C02 close failure returns a readable diagnostic and never retries native cleanup', async () => {
  const session = (await open()).session!; session.engine.push_primitives_and_params([point()]); const native = liveSystem();
  native.faults.set('clear_data', new WebAssembly.RuntimeError('cleanup memory fault'));
  const before = resource.calls.length, result = await close(session);
  assert.equal(result.ready, false); assert.equal(result.session, null); assert.equal(session.isClosed(), true);
  assert.equal(result.diagnostics.length, 1); assert.equal(result.diagnostics[0]!.code, 'solver.dispose');
  assert.equal(result.diagnostics[0]!.severity, 'error'); assert.deepEqual(result.diagnostics[0]!.subjectIds, []);
  assert.match(result.diagnostics[0]!.message, /cleanup memory fault/); assert.match(result.diagnostics[0]!.message, /terminat/i);
  assert.equal(resource.calls.length, before + 1); assert.equal(native.deletes, 0);
  await assert.rejects(close(session), named('DisposedSessionError', /closed|session/i)); assert.equal(resource.calls.length, before + 1);
});

test('C02 missing native reporting is a capability error, not an apparently ready session', async () => {
  for (const method of ['dof', 'get_conflicting', 'get_redundant', 'get_partially_redundant']) {
    resource = fakeResource(); resource.state.missing = method;
    await assert.rejects(open(), named('SolverCapabilityError', /report|DOF|conflict|redundan|capabil|method/i));
  }
});

test('C02 wrong probe status, DOF, geometry or conflict evidence rejects readiness', async () => {
  const cases: Partial<ProbeOracle>[] = [
    { successStatus: 1 }, { successDof: 1 }, { successDof: NaN }, { x: 9 }, { x: NaN }, { y: Infinity },
    { successConflicts: ['probe-x'] }, { successRedundant: ['probe-x'] },
    { conflictStatus: 0 }, { conflictDof: 0 }, { conflictIds: [] }, { conflictIds: ['not-a-probe-constraint'] },
  ];
  for (const change of cases) {
    resource = fakeResource(); Object.assign(resource.state.probe, change);
    await assert.rejects(open(), named('SolverLoadError', /probe|solver|coordinate|constraint|DOF/i));
  }
});

test('C02 a thrown live probe invalidates the old port without calling native cleanup', async () => {
  const session = (await open()).session!; session.engine.push_primitives_and_params([point()]); const live = liveSystem();
  resource.state.probeFault = new WebAssembly.RuntimeError('probe native trap');
  const before = resource.calls.length;
  await assert.rejects(solverRuntime({ action: 'probe', session }), named('SolverLoadError', /probe.*native trap|native trap.*probe/i));
  assert.equal(session.isClosed(), true); assert.equal(live.deleted, false);
  const tail = resource.calls.slice(before); const solveIndex = tail.findIndex(call => call.method === 'solve');
  assert.ok(solveIndex >= 0); assert.equal(tail.length, solveIndex + 1, 'no native call follows the probe trap');
  assert.throws(session.dof, named('DisposedSessionError', /closed|session/i));
});

test('C02 rejects cross-origin, credentialed, non-HTTP and malformed URLs before initialization', async () => {
  for (const change of [{ moduleUrl: 'https://foreign.test/native.js' }, { wasmUrl: 'https://foreign.test/native.wasm' },
    { moduleUrl: 'https://user:secret@solver.test/native.js' }, { wasmUrl: 'https://user:secret@solver.test/native.wasm' },
    { moduleUrl: 'file:///tmp/native.js' }, { wasmUrl: 'data:application/wasm;base64,AA==' }, { moduleUrl: 'https://[' }]) {
    await assert.rejects(solverRuntime({ action: 'open', ...config, ...change }), named('SolverLoadError', /URL|origin|HTTP|credential/i));
  }
  assert.equal(initialized, 0);
});

test('C02 refuses a main-thread environment before loading the solver', async () => {
  Reflect.deleteProperty(globalThis, 'importScripts');
  await assert.rejects(open(), named('SolverCapabilityError', /worker/i)); assert.equal(initialized, 0);
});

test('C02 refuses missing WebAssembly before initializing the vendor', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly')!;
  try {
    setGlobal('WebAssembly', undefined);
    await assert.rejects(open(), named('SolverCapabilityError', /WebAssembly|WASM/i)); assert.equal(initialized, 0);
  } finally { Object.defineProperty(globalThis, 'WebAssembly', descriptor); }
});

test('C02 missing default initializer and malformed native modules fail readably', async () => {
  await assert.rejects(solverRuntime({ action: 'open', ...config, moduleUrl: `${origin}/vendor/no-default.js` }), named('SolverLoadError', /module|init|solver/i));
  for (const value of [null, {}, { GcsSystem: 3 }]) {
    setGlobal('__C02_FACTORY', async () => value);
    await assert.rejects(open(), named('SolverLoadError', /module|init|solver|system/i));
  }
});

test('C02 initialization and native construction failures become readable load errors', async () => {
  for (const cause of [Error('WASM fetch failed'), { toString() { throw Error('hostile coercion'); } }]) {
    setGlobal('__C02_FACTORY', async () => { throw cause; });
    await assert.rejects(open(), named('SolverLoadError', /solver|WASM|load|init/i));
  }
  setGlobal('__C02_FACTORY', async () => resource.library); resource.state.creationFault = Error('native construction failed');
  await assert.rejects(open(), named('SolverLoadError', /construct|native|solver|init/i));
});

test('C02 captures the chosen WASM URL before asynchronous loading', async () => {
  const request: Extract<SolverRequest, { action: 'open' }> = { action: 'open', ...config };
  const pending = solverRuntime(request); request.wasmUrl = 'https://foreign.test/changed.wasm';
  const result = await pending;
  assert.equal(options.locateFile('planegcs.wasm', ''), config.wasmUrl); await close(result.session!);
});
