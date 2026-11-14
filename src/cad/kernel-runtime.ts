/**
 * PURPOSE    Own an OpenCascade instance within its worker lifetime.
 * KIND       SHELL
 * CONTRACT   IN: KernelRequest; open uses same-origin pinned module/WASM URLs and
 *            positive finite tolerances; probe/close use this runtime's live session.
 *            OUT: readiness/status and a worker-local KernelSession; open/probe run
 *            a real valid 2×3×4 mm box with volume 24 mm³. Probe preserves owned shapes.
 *            retain transfers a distinct live shape wrapper; resolve borrows it;
 *            release deletes it once. Normal close invalidates generation and deletes all.
 *            Every unknown/native/cleanup fault stops native calls, including exception
 *            inspection/refcount calls; remaining cleanup belongs to worker termination.
 *            RAISES: KernelLoadError on configuration/load/init/probe/native lifetime failure;
 *            CapabilityError for missing worker/SIMD/native exceptions or unsupported
 *            thread lifecycle; DisposedSessionError for foreign/closed sessions or tokens.
 * GUARANTEES No main-thread kernel, uploads, UI, persisted handles or silent fallback.
 *            A failed probe closes the session; its owner must terminate the worker.
 * TUNING     PROBE_VOLUME_TOLERANCE (mm³) is the fixed 24 mm³ oracle's numeric allowance,
 *            not document tolerance. Change only with an independently justified oracle.
 * DECISIONS  D1: Transfer wrapper ownership, rather than guess native refcounts.
 *            Why not: aliases risk double deletion. Revisit if vendor adds typed leases.
 *            D2: Single-thread WASM in a worker; alternative pthread build lacks public
 *            pool teardown and eagerly allocates host-count workers. Revisit with a
 *            bounded, explicitly disposable pool. threads requests fail visibly.
 *            D3: Fatal native errors require worker replacement; alternative continuing
 *            loses shadow-stack space because this build omits stackSave/stackRestore.
 *            Revisit with a verified build exporting those guards.
 * LIMITS     The vendor heap starts at 100 MiB and can grow to 4 GiB; close releases
 *            wrappers, not the heap. Owner termination reclaims the whole worker and
 *            cancels synchronous calls. Raw library aliases must not outlive the port.
 *            Callers own temporary wrappers and must terminate on native faults.
 * TESTBENCH  src/cad/kernel-runtime.test.ts -- run with: node --import tsx --test src/cad/kernel-runtime.test.ts
 */
import type { OpenCascadeInstance, TopoDS_Shape } from 'replicad-opencascadejs';

type Tolerance = Readonly<{ linearMm: number; angularRad: number; relative: number }>;
type ShapeToken = Readonly<{ id: number; generation: number }>;
type Diagnostic = { code: string; message: string; subjectIds: string[]; severity: 'warning' | 'error' };
type KernelConfig = Readonly<{ moduleUrl: string; wasmUrl: string; mode: 'single' | 'threads'; tolerance: Tolerance }>;
type KernelStatus = { ready: boolean; mode: 'single' | 'threads'; version: string; capabilities: string[]; diagnostics: Diagnostic[] };
export type KernelSession = Readonly<{
  generation: number; library: OpenCascadeInstance;
  retain(shape: TopoDS_Shape): ShapeToken; resolve(token: ShapeToken): TopoDS_Shape;
  release(token: ShapeToken): void; isClosed(): boolean;
}>;
export type KernelRequest =
  | { action: 'open'; config: KernelConfig }
  | { action: 'close' | 'probe'; session: KernelSession };
type KernelResult = { status: KernelStatus; session: KernelSession | null };
type Owned = { config: KernelConfig; close(dispose?: boolean): Diagnostic[] };
const sessions = new WeakMap<KernelSession, Owned>();
const VERSION = 'replicad-opencascadejs@1.2.1';
const CAPABILITIES = ['brep', 'box-volume', 'simd', 'wasm-exceptions'];
const PROBE_VOLUME_TOLERANCE = 1e-8; // Much tighter than document acceptance; covers floating point integration of 24.
// (module (func (result v128) (v128.const i32x4 0 0 0 0))) — SIMD validation, no execution.
const SIMD_PROBE = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,22,1,20,0,253,12,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11]);
let issuedGeneration = 0;

function error(name: string, message: string, cause?: unknown): Error {
  return Object.assign(new Error(message, { cause }), { name });
}
function native(cause: unknown): cause is WebAssembly.Exception {
  return typeof WebAssembly.Exception === 'function' && cause instanceof WebAssembly.Exception;
}
function explain(cause: unknown): string {
  if (native(cause)) return 'native OpenCascade exception';
  try { return String(cause instanceof Error ? cause.message : cause); } catch { return 'unreadable kernel failure'; }
}
function status(config: KernelConfig, ready: boolean, diagnostics: Diagnostic[] = []): KernelStatus {
  return { ready, mode: config.mode, version: VERSION, capabilities: [...CAPABILITIES], diagnostics };
}
function checkConfig(config: KernelConfig): void {
  try {
    for (const text of [config.moduleUrl, config.wasmUrl]) {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== location.origin || url.username || url.password) {
        throw Error('Kernel assets require same-origin URLs without credentials.');
      }
    }
    if (config.mode !== 'single' && config.mode !== 'threads') throw Error('Invalid kernel mode.');
    for (const key of ['linearMm', 'angularRad', 'relative'] as const) {
      if (!Number.isFinite(config.tolerance[key]) || config.tolerance[key] <= 0) throw Error('Kernel tolerance must be finite and positive.');
    }
  } catch (cause) { throw error('KernelLoadError', `Invalid kernel configuration: ${explain(cause)}`, cause); }
  if (typeof document !== 'undefined' || typeof (globalThis as { importScripts?: unknown }).importScripts !== 'function') {
    throw error('CapabilityError', 'The OpenCascade kernel must run in a dedicated worker.');
  }
  if (typeof WebAssembly === 'undefined' || !WebAssembly.validate(SIMD_PROBE)) throw error('CapabilityError', 'This kernel requires WebAssembly SIMD.');
  if (typeof WebAssembly.Exception !== 'function' || typeof WebAssembly.Tag !== 'function') {
    throw error('CapabilityError', 'This kernel requires native WebAssembly exception support.');
  }
  if (config.mode === 'threads') throw error('CapabilityError', 'Threaded kernel mode is unavailable: this build has no bounded, disposable worker pool. Use single mode.');
}
function probe(library: OpenCascadeInstance): void {
  const objects: { delete(): void }[] = [];
  let failure: { cause: unknown } | undefined;
  let ordinary: Error | undefined;
  const reject=(message:string):never=>{ordinary=new Error(message);throw ordinary;};
  try {
    const builder = new library.BRepPrimAPI_MakeBox(2, 3, 4); objects.push(builder);
    const shape = builder.Shape(); objects.push(shape);
    const validator = new library.BRepCheck_Analyzer(shape, true, false); objects.push(validator);
    if (!validator.IsValid()) reject('The kernel box probe returned an invalid solid.');
    const properties = new library.GProp_GProps(); objects.push(properties);
    library.BRepGProp.VolumeProperties(shape, properties, true, false, false);
    const mass = properties.Mass();
    if (!Number.isFinite(mass) || Math.abs(mass - 24) > PROBE_VOLUME_TOLERANCE) reject(`The kernel box probe returned volume ${mass}; expected 24 mm³.`);
  } catch (cause) { failure = { cause }; }
  // Only our own validation rejection permits cleanup. Any unknown throw may be native.
  if (!failure || ordinary!==undefined&&failure.cause===ordinary) for (const object of objects.reverse()) {
    try { object.delete(); } catch (cause) { failure = { cause }; break; }
  }
  if (failure) throw error('KernelLoadError', `OpenCascade box probe failed: ${explain(failure.cause)}. Restart the kernel worker.`, failure.cause);
}

function createSession(library: OpenCascadeInstance, config: KernelConfig): KernelSession {
  let generation = ++issuedGeneration, closed = false, nextId = 0;
  const shapes = new Map<number, TopoDS_Shape>(), owned = new Set<TopoDS_Shape>();
  const assertOpen = () => { if (closed) throw error('DisposedSessionError', 'Kernel session is closed.'); };
  const resolve = (token: ShapeToken): TopoDS_Shape => {
    assertOpen();
    if (!token || token.generation !== generation || !Number.isSafeInteger(token.id) || !shapes.has(token.id)) {
      throw error('DisposedSessionError', 'Shape token is stale, foreign or already released.');
    }
    return shapes.get(token.id)!;
  };
  const close = (dispose = true): Diagnostic[] => {
    closed = true; generation = ++issuedGeneration;
    const pending = [...shapes.values()]; shapes.clear(); owned.clear();
    const diagnostics: Diagnostic[] = [];
    if (dispose) for (const shape of pending) {
      try { shape.delete(); } catch (cause) {
        diagnostics.push({ code: 'kernel.dispose', severity: 'error', subjectIds: [],
          message: `Kernel cleanup failed: ${explain(cause)}. Terminate the kernel worker.` });
        break;
      }
    }
    return diagnostics;
  };
  const session: KernelSession = Object.freeze({
    get generation() { return generation; }, library,
    retain(shape: TopoDS_Shape) {
      assertOpen();
      if (!(shape instanceof library.TopoDS_Shape) || owned.has(shape)) throw error('DisposedSessionError', 'Shape wrapper is invalid or already owned by this session.');
      const id = ++nextId; shapes.set(id, shape); owned.add(shape);
      return Object.freeze({ id, generation });
    }, resolve,
    release(token: ShapeToken) {
      const shape = resolve(token); shapes.delete(token.id); owned.delete(shape);
      try { shape.delete(); } catch (cause) {
        close(false);
        throw error('KernelLoadError', `Kernel shape release failed: ${explain(cause)}. Terminate the kernel worker.`, cause);
      }
    }, isClosed: () => closed,
  });
  sessions.set(session, { config, close });
  return session;
}

export async function kernelRuntime(request: KernelRequest): Promise<KernelResult> {
  if (request.action !== 'open') {
    const session = request.session, owned = sessions.get(session);
    if (!owned || session.isClosed()) throw error('DisposedSessionError', 'Kernel session is foreign or closed.');
    if (request.action === 'close') return { status: status(owned.config, false, owned.close()), session: null };
    try { probe(session.library); } catch (cause) { owned.close(false); throw cause; }
    return { status: status(owned.config, true), session };
  }
  checkConfig(request.config);
  const config: KernelConfig = { ...request.config, tolerance: { ...request.config.tolerance } };
  let library: OpenCascadeInstance;
  try {
    const vendor = await import(/* @vite-ignore */ config.moduleUrl);
    library = await vendor.default({ locateFile: () => config.wasmUrl });
    for (const name of ['BRepPrimAPI_MakeBox', 'BRepCheck_Analyzer', 'GProp_GProps', 'TopoDS_Shape',
      'getExceptionMessage', 'decrementExceptionRefcount'] as const) {
      if (typeof library?.[name] !== 'function') throw Error(`OpenCascade binding ${name} is missing.`);
    }
  } catch (cause) { throw error('KernelLoadError', `OpenCascade initialization failed: ${explain(cause)}. Restart the kernel worker.`, cause); }
  probe(library);
  return { status: status(config, true), session: createSession(library, config) };
}
