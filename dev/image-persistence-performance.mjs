/**
 * Matched baseline/current Image persistence benchmark; no build or browser required.
 * Run from the checkout with its installed dependencies:
 * node --expose-gc --import tsx dev/image-persistence-performance.mjs --baseline aef6295 --rounds 5 --output dev/image-persistence-performance.json
 *
 * Each source tree runs in its own Node process. The measured app uses the real
 * shell, Image codec, recovery store and Recent store, with JSDOM/fake-indexeddb.
 * A metadata edit retains the same pixel payload, isolating persistence from
 * drawing/compositing. beforeunload flushes the existing 700 ms Recent timer;
 * there is no synthetic sleep or changed production scheduling. These are Node
 * data-path measurements, not browser, disk durability or user-device timings.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { IDBFactory } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';

const script = fileURLToPath(import.meta.url), checkout = resolve(dirname(script), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; };
const rounds = Number(option('--rounds', '5'));
assert.ok(Number.isSafeInteger(rounds) && rounds > 0, '--rounds must be a positive integer');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const milliseconds = value => Number(value.toFixed(3));
const summary = samples => ({ samplesMs: samples.map(milliseconds), medianMs: milliseconds(median(samples)) });
const scenarios = [
  { width: 800, height: 600, layers: 1 },
  { width: 2550, height: 3300, layers: 1 },
  { width: 2550, height: 3300, layers: 3 },
];
const sourceDigest = root => {
  const digest = createHash('sha256');
  const walk = directory => {
    for (const name of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, name.name);
      if (name.isDirectory()) walk(path);
      else { digest.update(relative(root, path).split('\\').join('/')); digest.update('\0'); digest.update(readFileSync(path)); }
    }
  };
  walk(join(root, 'src')); return digest.digest('hex');
};

async function measureSource(sourceRoot) {
  const load = path => import(pathToFileURL(join(sourceRoot, path)).href);
  const [{ imageContent }, { nativeContainer }, { mountApp }, { recentProjects }, { recoveryStore }] = await Promise.all([
    load('src/image/image-content.ts'), load('src/shared/native-container.ts'), load('src/app/app-shell.ts'),
    load('src/shared/recent-projects.ts'), load('src/shared/recovery-store.ts'),
  ]);
  let samePayload;
  if (existsSync(join(sourceRoot, 'src/shared/same-payload.ts'))) ({ samePayload } = await load('src/shared/same-payload.ts'));
  else {
    // Run the exact original private helper, whose body is ordinary JavaScript.
    const source = readFileSync(join(sourceRoot, 'src/app/app-shell.ts'), 'utf8');
    const at = source.indexOf('function samePayload('), start = source.indexOf('{', at), end = source.indexOf('\n}', start);
    assert.ok(at >= 0 && start > at && end > start, 'Baseline payload comparison helper was not found');
    samePayload = new Function(`return function samePayload(left, right) ${source.slice(start, end + 2)}`)();
  }
  const packageFor = document => {
    const encoded = imageContent({ operation: 'encode', value: document.value });
    return { project: { id: document.id, title: document.title, format: 'gsnv-image', version: 1, content: encoded.content },
      assets: encoded.assets.map(asset => ({ ...asset, mime: 'application/octet-stream' })) };
  };
  const results = [];
  for (const size of scenarios) {
    let value = imageContent({ operation: 'new', width: size.width, height: size.height, fill: [255, 255, 255, 255] });
    if (size.layers > 1) value = imageContent({ operation: 'layers', previous: value, width: size.width, height: size.height,
      layers: Array.from({ length: size.layers }, (_, index) => ({ meta: { id: `layer-${index}`, name: `Layer ${index}`, visible: true, opacity: 1, blend: 'normal' }, from: 'background' })), activeLayerId: 'layer-0' });
    const document = { id: 'benchmark-project', title: 'Persistence benchmark', format: 'gsnv-image', version: 1, value };
    const flatten = [], encode = [], decode = [], compare = [];
    let payloadBytes = 0;
    for (let round = -1; round < rounds; round++) {
      globalThis.gc?.();
      const start = performance.now(), packageValue = packageFor(document), flattened = performance.now();
      const encoded = nativeContainer({ op: 'encode', package: packageValue }), framed = performance.now();
      const decoded = nativeContainer({ op: 'decode', parts: encoded.parts }), checked = performance.now();
      assert.equal(decoded.project.id, document.id); payloadBytes = encoded.byteLength;
      const cloned = encoded.parts.map(part => part.slice());
      // Exercise independent chunk boundaries and empty parts, not the identity fast path.
      const divided = [new Uint8Array(), ...cloned.flatMap(part => [part.subarray(0, Math.floor(part.length / 3)), new Uint8Array(), part.subarray(Math.floor(part.length / 3))])];
      const compareStart = performance.now();
      assert.equal(samePayload(encoded.parts, divided), true);
      const compared = performance.now();
      if (round >= 0) { flatten.push(flattened - start); encode.push(framed - flattened); decode.push(checked - framed); compare.push(compared - compareStart); }
    }
    const dom = new JSDOM('<!doctype html><body><main></main></body>', { url: 'https://benchmark.test' });
    const window = dom.window;
    Object.assign(window.HTMLElement.prototype, { setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {} });
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    const storage = { indexedDB: new IDBFactory(), localStorage: window.localStorage };
    const recent = recentProjects(storage.indexedDB);
    let current, commit, encodeCalls = 0;
    const adapter = {
      create: () => document,
      encode(snapshot) { encodeCalls++; return packageFor(snapshot); },
      decode(packageValue) { return { ...packageValue.project, value: imageContent({ operation: 'decode', content: packageValue.project.content, assets: packageValue.assets }) }; },
      mount(host) {
        commit = () => host.commit({ ...current, title: `Revision ${encodeCalls}` }, 'Benchmark edit', current.identity);
        return { render(snapshot) { current = snapshot; }, model: () => ({ menus: [], tools: [], panels: [] }),
          context: () => ({ viewRole: 'canvas2d', activeTool: 'brush', status: 'Benchmark' }), command() {}, gesture() {}, dispose() {} };
      },
    };
    const app = mountApp({ root: window.document.querySelector('main'), adapters: { image: adapter }, recovery: storage, recent,
      files: { document: window.document, URL: { createObjectURL: () => 'blob:benchmark', revokeObjectURL() {} }, setTimeout: callback => { callback(); } },
      probe: { environment: {}, codecRequests: [] } });
    const flush = () => window.dispatchEvent(new window.Event('beforeunload', { cancelable: true }));
    const complete = [], synchronous = [], calls = [];
    try {
      await app.ready; await app.dispatch('file.new'); flush(); await app.idle();
      for (let round = -1; round < rounds; round++) {
        globalThis.gc?.();
        const before = encodeCalls, start = performance.now(); commit(); const returned = performance.now(); flush(); await app.idle(); const end = performance.now();
        if (round >= 0) { complete.push(end - start); synchronous.push(returned - start); calls.push(encodeCalls - before); }
      }
      const recovery = await recoveryStore({ op: 'read', workspace: 'image' }, storage);
      assert.ok(recovery.ok && recovery.value, 'Recovery persisted successfully');
      const retained = await recent.load(document.id);
      assert.equal(samePayload(recovery.value.payload, retained), true, 'Recovery and Recent contain the same current bytes');
      assert.equal(nativeContainer({ op: 'decode', parts: retained }).project.title, current.title);
      assert.equal(flush(), true, 'The current revision is durable, so unload does not need a warning');
    } finally { app.dispose(); await app.idle(); dom.window.close(); }
    results.push({ ...size, rgbaBytes: size.width * size.height * 4 * size.layers, payloadBytes,
      domainFlatten: summary(flatten), containerEncode: summary(encode), containerDecodeValidation: summary(decode),
      clonedPayloadCompare: summary(compare), commitReturn: summary(synchronous), recoveryAndRecent: summary(complete),
      domainEncodeCallsPerRevision: calls, checks: 'Exact recovery/Recent bytes and current title verified; no pending-save unload warning.' });
  }
  return { sourceSha256: sourceDigest(sourceRoot), scenarios: results };
}

if (args.includes('--worker')) {
  assert.ok(globalThis.gc, 'Run with --expose-gc so collection occurs outside timing');
  process.stdout.write(JSON.stringify(await measureSource(resolve(option('--source-root', checkout)))));
} else {
  const baseline = execFileSync('git', ['rev-parse', `${option('--baseline', 'aef6295')}^{commit}`], { cwd: checkout, encoding: 'utf8' }).trim();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
  const dirty = !!execFileSync('git', ['status', '--porcelain', '--', 'src'], { cwd: checkout, encoding: 'utf8' }).trim();
  const output = resolve(option('--output', join(checkout, 'dev/image-persistence-performance.json')));
  const temporary = mkdtempSync(join(tmpdir(), 'gsnv-image-persistence-'));
  const baselineRoot = join(temporary, 'baseline'), currentRoot = join(temporary, 'current');
  try {
    mkdirSync(baselineRoot); mkdirSync(currentRoot);
    const archive = execFileSync('git', ['archive', baseline, 'src', 'package.json'], { cwd: checkout, maxBuffer: 64 * 1024 * 1024 });
    execFileSync('tar', ['-xf', '-', '-C', baselineRoot], { input: archive });
    cpSync(join(checkout, 'src'), join(currentRoot, 'src'), { recursive: true }); cpSync(join(checkout, 'package.json'), join(currentRoot, 'package.json'));
    for (const root of [baselineRoot, currentRoot]) symlinkSync(join(checkout, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const run = root => JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--import', 'tsx', script, '--worker', '--source-root', root, '--rounds', String(rounds)], { cwd: checkout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
    const before = run(baselineRoot), after = run(currentRoot);
    const evidence = { measuredAt: new Date().toISOString(), command: `node --expose-gc --import tsx dev/image-persistence-performance.mjs --baseline ${baseline} --rounds ${rounds} --output ${JSON.stringify(relative(checkout, output).split('\\').join('/'))}`,
      environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length,
        dependencies: Object.fromEntries(['fake-indexeddb', 'jsdom', 'tsx'].map(name => [name, JSON.parse(readFileSync(join(checkout, 'node_modules', name, 'package.json'), 'utf8')).version])) },
      rounds, warmupRounds: 1, baselineRevision: baseline, currentCheckoutHead: head, currentIncludesUncommittedSourceChanges: dirty,
      scope: 'Node/JSDOM/fake-indexeddb; same immutable Image pixel payload, metadata edit, actual application recovery + Recent writes. Rendering, browser storage/disk and the normal 700 ms Recent timer are excluded.',
      caveats: ['Medians are local CPU observations, not browser or user-device latency guarantees.', 'Payload comparison measures cloned/segmented bytes; successful ordinary recovery writes normally use its identity fast path.', 'Recent.list still reads payload-bearing records; the storage schema is unchanged.'],
      before, after,
      comparison: before.scenarios.map((scenario, index) => {
        const next = after.scenarios[index];
        return { width: scenario.width, height: scenario.height, layers: scenario.layers,
          recoveryAndRecentSpeedup: Number((scenario.recoveryAndRecent.medianMs / next.recoveryAndRecent.medianMs).toFixed(3)),
          recoveryAndRecentReductionPercent: Number((100 * (1 - next.recoveryAndRecent.medianMs / scenario.recoveryAndRecent.medianMs)).toFixed(1)),
          containerEncodeSpeedup: Number((scenario.containerEncode.medianMs / next.containerEncode.medianMs).toFixed(3)),
          clonedPayloadCompareSpeedup: Number((scenario.clonedPayloadCompare.medianMs / next.clonedPayloadCompare.medianMs).toFixed(3)) };
      }),
    };
    writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ output, comparison: evidence.comparison }, null, 2) + '\n');
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
