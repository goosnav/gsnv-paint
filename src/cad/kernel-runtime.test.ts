import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { kernelRuntime, type KernelSession, type KernelRequest } from './kernel-runtime.ts';

// Fake only the external module loader and worker environment, never the adapter.
const origin = 'https://kernel.test';
const saved = new Map(['location', 'importScripts', '__C01_FACTORY'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return specifier.startsWith(`${origin}/vendor/`) ? { url: specifier, shortCircuit: true } : next(specifier, context);
  },
  load(url, context, next) {
    return url.startsWith(`${origin}/vendor/`) ? { format: 'module', shortCircuit: true,
      source: 'export default function(options) { return globalThis.__C01_FACTORY(options); }' } : next(url, context);
  },
});
after(() => {
  hooks.deregister();
  for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
});
let resource: ReturnType<typeof fakeLibrary>;
let initialized = 0;
let options: { locateFile(path: string, directory: string): string };
function fakeLibrary() {
  const objects: { kind: string; deletes: number }[] = [];
  const state = { volume: 24, valid: true, fault: null as unknown, freedExceptions: 0, dimensions: [] as number[][], objects };
  class Native {
    kind: string; deletes = 0;
    constructor(kind: string) { this.kind = kind; objects.push(this); }
    delete() { assert.equal(this.deletes++, 0, `${this.kind} deleted twice`); }
  }
  class TopoDS_Shape extends Native {
    constructor() { super('shape'); }
    IsNull() { return false; }
  }
  const library = {
    TopoDS_Shape,
    BRepPrimAPI_MakeBox: class extends Native {
      constructor(...dimensions: number[]) { super('box'); state.dimensions.push(dimensions); }
      Shape() { if (state.fault) throw state.fault; return new TopoDS_Shape(); }
    },
    GProp_GProps: class extends Native { constructor() { super('properties'); } Mass() { return state.volume; } },
    BRepCheck_Analyzer: class extends Native { constructor() { super('validator'); } IsValid() { return state.valid; } },
    BRepGProp: { VolumeProperties() {} },
    getExceptionMessage() { return ['Standard_DomainError', '']; },
    decrementExceptionRefcount() { state.freedExceptions++; },
  };
  return { ...state, state, library };
}
beforeEach(() => {
  resource = fakeLibrary(); initialized = 0;
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL(`${origin}/worker.js`) });
  Object.defineProperty(globalThis, 'importScripts', { configurable: true, value: () => {} });
  Object.defineProperty(globalThis, '__C01_FACTORY', { configurable: true, value: async (input: typeof options) => {
    initialized++; options = input; return resource.library;
  } });
});
const config = { moduleUrl: `${origin}/vendor/replicad_single.js`, wasmUrl: `${origin}/vendor/replicad_single.wasm`,
  mode: 'single' as const, tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 } };
const open = () => kernelRuntime({ action: 'open', config });
const named = (name: string, pattern: RegExp) => (cause: unknown) => {
  assert.ok(cause instanceof Error); assert.equal(cause.name, name); assert.match(cause.message, pattern); return true;
};
function shape(session: KernelSession) { return new session.library.TopoDS_Shape(); }

test('C01 golden opens a genuine-probe contract and closes the worker-local port', async () => {
  const result = await open(); const session = result.session!;
  assert.deepEqual(result.status, { ready: true, mode: 'single', version: 'replicad-opencascadejs@1.2.1',
    capabilities: ['brep', 'box-volume', 'simd', 'wasm-exceptions'], diagnostics: [] });
  assert.equal(initialized, 1); assert.equal(options.locateFile('replicad_single.wasm', '/ignored/'), config.wasmUrl);
  assert.deepEqual(resource.state.dimensions, [[2, 3, 4]]);
  assert.ok(resource.state.objects.every(value => value.deletes === 1));
  assert.ok(Number.isSafeInteger(session.generation)); assert.equal(session.isClosed(), false);
  const generation = session.generation;
  const closed = await kernelRuntime({ action: 'close', session });
  assert.equal(closed.status.ready, false); assert.equal(closed.session, null);
  assert.equal(session.isClosed(), true); assert.notEqual(session.generation, generation);
});
test('C01 tracks ownership, stale tokens and cross-session generation isolation', async () => {
  const a = (await open()).session!, b = (await open()).session!;
  const native = shape(a), other = shape(a); const token = a.retain(native), second = a.retain(other);
  assert.ok(Object.isFrozen(token)); assert.equal(a.resolve(token), native);
  assert.throws(() => b.resolve(token), named('DisposedSessionError', /token/i));
  assert.throws(() => a.retain(native), named('DisposedSessionError', /owned/i));
  a.release(token);
  assert.throws(() => a.resolve(token), named('DisposedSessionError', /token/i));
  assert.throws(() => a.release(token), named('DisposedSessionError', /token/i));
  assert.equal(a.resolve(second), other);
  await kernelRuntime({ action: 'close', session: a }); await kernelRuntime({ action: 'close', session: b });
  assert.ok(resource.state.objects.every(value => value.deletes === 1));
  assert.throws(() => a.retain(native), named('DisposedSessionError', /closed/i));
});
test('C01 probe preserves owned shapes and returns independent status arrays', async () => {
  const result = await open(), session = result.session!;
  const native = shape(session), token = session.retain(native);
  result.status.capabilities.length = 0;
  const probe = await kernelRuntime({ action: 'probe', session });
  assert.equal(probe.session, session); assert.equal(probe.status.capabilities.length, 4);
  assert.equal(session.resolve(token), native); assert.deepEqual(resource.state.dimensions, [[2, 3, 4], [2, 3, 4]]);
  await kernelRuntime({ action: 'close', session });
  assert.ok(resource.state.objects.every(value => value.deletes === 1));
});
test('C01 rejects disposed and forged sessions without calling the vendor', async () => {
  const session = (await open()).session!; await kernelRuntime({ action: 'close', session });
  for (const action of ['probe', 'close'] as const) {
    await assert.rejects(kernelRuntime({ action, session }), named('DisposedSessionError', /session/i));
    await assert.rejects(kernelRuntime({ action, session: { ...session } }), named('DisposedSessionError', /session/i));
  }
});
test('C01 checks same origin and finite positive tolerance before loading', async () => {
  for (const change of [{ moduleUrl: 'https://foreign.test/kernel.js' }, { wasmUrl: 'data:application/wasm;base64,AA==' },
    { wasmUrl: 'https://user:secret@kernel.test/k.wasm' }, { moduleUrl: 'not a URL' },
    ...[0, -1, Infinity, NaN].map(relative => ({ tolerance: { ...config.tolerance, relative } }))]) {
    await assert.rejects(kernelRuntime({ action: 'open', config: { ...config, ...change } }), named('KernelLoadError', /URL|origin|tolerance/i));
  }
  assert.equal(initialized, 0);
});
test('C01 refuses the main thread and unsupported threaded lifecycle explicitly', async () => {
  Reflect.deleteProperty(globalThis, 'importScripts');
  await assert.rejects(open(), named('CapabilityError', /worker/i));
  Object.defineProperty(globalThis, 'importScripts', { configurable: true, value: () => {} });
  await assert.rejects(kernelRuntime({ action: 'open', config: { ...config, mode: 'threads' } }), named('CapabilityError', /thread|pool/i));
  assert.equal(initialized, 0);
});
test('C01 detects missing SIMD and exception support before module initialization', async context => {
  const validate = context.mock.method(WebAssembly, 'validate', () => false);
  await assert.rejects(open(), named('CapabilityError', /SIMD/i)); validate.mock.restore();
  const descriptor = Object.getOwnPropertyDescriptor(WebAssembly, 'Exception')!;
  try {
    Object.defineProperty(WebAssembly, 'Exception', { configurable: true, value: undefined });
    await assert.rejects(open(), named('CapabilityError', /exception/i));
  } finally { Object.defineProperty(WebAssembly, 'Exception', descriptor); }
  assert.equal(initialized, 0);
});
test('C01 turns initialization and malformed module failures into readable load errors', async () => {
  for (const factory of [async () => { throw new Error('WASM fetch failed'); }, async () => ({}),
    async () => { throw { toString() { throw Error('hostile'); } }; }]) {
    Object.defineProperty(globalThis, '__C01_FACTORY', { configurable: true, value: factory });
    await assert.rejects(open(), named('KernelLoadError', /kernel|WASM|OpenCascade/i));
  }
});
test('C01 refuses invalid solid or inaccurate/nonfinite mass instead of readiness', async () => {
  for (const volume of [0, 23, Infinity, NaN]) {
    resource = fakeLibrary(); resource.state.volume = volume;
    await assert.rejects(open(), named('KernelLoadError', /volume|mass/i));
    assert.ok(resource.state.objects.every(value => value.deletes === 1));
  }
  resource = fakeLibrary(); resource.state.valid = false;
  await assert.rejects(open(), named('KernelLoadError', /valid/i));
});
test('C01 failed live probe invalidates tokens and reports native type with context', async () => {
  const session = (await open()).session!, token = session.retain(shape(session));
  const fault = new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []);
  resource.state.fault = fault;
  await assert.rejects(kernelRuntime({ action: 'probe', session }), named('KernelLoadError', /box.*Standard_DomainError/i));
  assert.equal(resource.state.freedExceptions, 1); assert.equal(session.isClosed(), true);
  assert.throws(() => session.resolve(token), named('DisposedSessionError', /closed/i));
});
test('C01 malformed token and invalid ownership cannot delete another shape', async () => {
  const session = (await open()).session!, native = shape(session), token = session.retain(native);
  for (const bad of [{ ...token, id: 0 }, { ...token, id: NaN }, { ...token, generation: token.generation + 1 }, null]) {
    assert.throws(() => session.release(bad as typeof token), named('DisposedSessionError', /token/i));
  }
  assert.equal(session.resolve(token), native);
  await kernelRuntime({ action: 'close', session });
});
test('C01 close reports cleanup failure and still releases remaining ordinary wrappers', async () => {
  const session = (await open()).session!, broken = shape(session), healthy = shape(session);
  session.retain(broken); session.retain(healthy);
  broken.delete = () => { throw Error('wrapper deletion failed'); };
  const result = await kernelRuntime({ action: 'close', session });
  assert.equal(result.status.ready, false); assert.equal(result.session, null);
  assert.deepEqual(result.status.diagnostics, [{ code: 'kernel.dispose', severity: 'error', subjectIds: [],
    message: 'Kernel cleanup failed: wrapper deletion failed. Terminate the kernel worker.' }]);
  assert.equal(resource.state.objects.find(value => Object.is(value, healthy))?.deletes, 1);
  assert.equal(session.isClosed(), true);
});
test('C01 native release failure invalidates the entire session without further geometry calls', async () => {
  const session = (await open()).session!, broken = shape(session), healthy = shape(session);
  const token = session.retain(broken); session.retain(healthy);
  broken.delete = () => { throw new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []); };
  assert.throws(() => session.release(token), named('KernelLoadError', /release.*Standard_DomainError/i));
  assert.equal(session.isClosed(), true); assert.equal(resource.state.freedExceptions, 1);
  assert.equal(resource.state.objects.find(value => Object.is(value, healthy))?.deletes, 0);
});
test('C01 native close failure avoids subsequent native calls and leaves a readable result', async () => {
  const session = (await open()).session!, broken = shape(session), healthy = shape(session);
  session.retain(broken); session.retain(healthy);
  broken.delete = () => { throw new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []); };
  const result = await kernelRuntime({ action: 'close', session });
  assert.equal(result.status.ready, false); assert.match(result.status.diagnostics[0]!.message, /Standard_DomainError/);
  assert.equal(session.isClosed(), true); assert.equal(resource.state.freedExceptions, 1);
  assert.equal(resource.state.objects.find(value => Object.is(value, healthy))?.deletes, 0);
});
test('C01 snapshots configuration before asynchronous module loading', async () => {
  const input: Extract<KernelRequest, { action: 'open' }> = { action: 'open', config: { ...config, tolerance: { ...config.tolerance } } };
  const pending = kernelRuntime(input);
  Object.assign(input.config, { wasmUrl: 'https://foreign.test/changed.wasm', mode: 'threads' });
  const opened = await pending;
  assert.equal(options.locateFile('kernel.wasm', ''), config.wasmUrl);
  assert.equal(opened.status.mode, 'single');
  await kernelRuntime({ action: 'close', session: opened.session! });
});
test('C01 a WASM trap stops all native cleanup and invalidates retained shapes', async () => {
  const session = (await open()).session!, held = shape(session), token = session.retain(held);
  const before = resource.state.objects.length;
  resource.state.fault = new WebAssembly.RuntimeError('memory access out of bounds');
  await assert.rejects(kernelRuntime({ action: 'probe', session }), named('KernelLoadError', /box.*memory access out of bounds/i));
  assert.equal(session.isClosed(), true);
  assert.equal(resource.state.objects.find(value => Object.is(value, held))?.deletes, 0);
  assert.ok(resource.state.objects.slice(before).every(value => value.deletes === 0));
  assert.equal(resource.state.freedExceptions, 0);
  assert.throws(() => session.resolve(token), named('DisposedSessionError', /closed/i));
});
