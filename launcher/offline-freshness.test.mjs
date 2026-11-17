/** Real launcher against an isolated tiny Vite project; never rewrites shared dist. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repository = fileURLToPath(new URL('..', import.meta.url)), port = 24176;
function start(root) {
  const child = spawn(process.execPath, [join(root, 'launcher/start.mjs')], { cwd: root, env: { ...process.env, GSNV_PAINT_PORT: String(port), GSNV_PAINT_NO_OPEN: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const closed = new Promise(resolve => child.once('close', resolve));
  return { child, closed, output: () => output, async stop() { child.kill(); await closed; } };
}
async function ready(run) {
  const until = Date.now() + 20_000;
  while (!run.output().includes('is running at')) { assert.equal(run.child.exitCode, null, run.output()); assert.ok(Date.now() < until, run.output()); await new Promise(resolve => setTimeout(resolve, 25)); }
}
async function launch(root) { const run = start(root); try { await ready(run); return run.output(); } finally { await run.stop(); } }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gsnv-launcher-current-'));
  for (const dir of ['src', 'public', 'dev', 'launcher']) await mkdir(join(root, dir));
  await symlink(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
  for (const file of ['start.mjs', 'freshness.mjs', 'local-app.mjs']) await copyFile(join(repository, 'launcher', file), join(root, 'launcher', file));
  await copyFile(join(repository, 'package-lock.json'), join(root, 'package-lock.json'));
  await copyFile(join(repository, 'package.json'), join(root, 'package.json'));
  await writeFile(join(root, 'index.html'), '<!doctype html><html><head><meta name="application-name" content="gsnv-paint"><script type="module" src="/src/main.js"></script></head><body></body></html>');
  await writeFile(join(root, 'src/main.js'), 'document.body.append("current fixture");');
  await writeFile(join(root, 'public/notice.txt'), 'first notice'); await writeFile(join(root, 'dev/offline-build.ts'), 'generator one');
  await writeFile(join(root, 'vite.config.ts'), `import {readFileSync,readdirSync,writeFileSync} from 'node:fs'; import {join} from 'node:path'; import {randomBytes,createHash} from 'node:crypto';
    const id=randomBytes(32).toString('hex'); let built=false;
    export default {plugins:[{name:'fixture-offline-controls',apply:'build',transformIndexHtml(){return [{tag:'meta',attrs:{name:'gsnv-build-id',content:id},injectTo:'head'}];},
      generateBundle(){built=true;this.emitFile({type:'asset',fileName:'offline-sw.js',source:'// fixture worker'});},
      closeBundle(){if(!built)return;const paths=[];const walk=p=>{for(const entry of readdirSync(p,{withFileTypes:true})){const f=join(p,entry.name);if(entry.isDirectory())walk(f);else paths.push(f);}};walk('dist');
        const assets=paths.filter(p=>!p.endsWith('offline-sw.js')).map(p=>{const b=readFileSync(p);return {url:'/'+p.slice(5).replaceAll('\\\\','/'),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),mime:'application/octet-stream'};});
        writeFileSync('dist/offline-manifest.json',JSON.stringify({schema:1,build:id,generator:readFileSync('dev/offline-build.ts','utf8'),assets}));}}],preview:{host:'127.0.0.1',strictPort:true}};`);
  return root;
}

test('launcher rebuilds preserved-timestamp changes, deleted inputs, missing assets and generators; reuses only verified complete output', { timeout: 60_000 }, async () => {
  const root = await fixture();
  try {
    assert.match(await launch(root), /Building gsnv-paint/); const manifest = () => readFile(join(root, 'dist/offline-manifest.json'), 'utf8');
    let before = await manifest(); assert.doesNotMatch(await launch(root), /Building gsnv-paint/); assert.equal(await manifest(), before);
    for (const path of ['src/main.js', 'public/notice.txt', 'dev/offline-build.ts']) {
      await writeFile(join(root, path), path.endsWith('.js') ? 'document.body.append("newer fixture");' : 'changed content');
      await utimes(join(root, path), new Date(0), new Date(0));
      assert.match(await launch(root), /Building gsnv-paint/, path); assert.notEqual(await manifest(), before); before = await manifest();
    }
    await rm(join(root, 'public/notice.txt')); assert.match(await launch(root), /Building gsnv-paint/, 'deleted inputs must invalidate');
    for (const missing of ['offline-sw.js', 'offline-manifest.json']) { await rm(join(root, 'dist', missing)); assert.match(await launch(root), /Building gsnv-paint/); }
    const asset = JSON.parse(await manifest()).assets.find(asset => asset.url.endsWith('.js')); await rm(join(root, 'dist', asset.url.slice(1)));
    assert.match(await launch(root), /Building gsnv-paint/, 'a missing lazy asset invalidates output');
    assert.doesNotMatch(await launch(root), /Building gsnv-paint/);
    const run = start(root);
    try {
      await ready(run); const identity = await (await fetch(`http://127.0.0.1:${port}/__gsnv-local__/status`)).json();
      const entry = await fetch(`http://127.0.0.1:${port}/__gsnv-local__/start/${identity.buildId}`);
      assert.equal(entry.status, 200); assert.equal(entry.headers.get('cache-control'), 'no-store'); assert.match(await entry.text(), /name="gsnv-local-runtime" content="1"/);
      const second = start(root); assert.equal(await second.closed, 0, second.output()); assert.match(second.output(), /already running/); assert.doesNotMatch(second.output(), /Building|Installing/);
      const saved = await manifest(); await writeFile(join(root, 'src/main.js'), 'document.body.append("later source");');
      const stale = start(root); assert.equal(await stale.closed, 1); assert.match(stale.output(), /APP-STALE/); assert.equal(await manifest(), saved, 'an active server must be refused before rebuilding its assets');
    } finally { await run.stop(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('legacy fixed-port servers are refused before install/build and simultaneous launches build only once', { timeout: 40_000 }, async () => {
  const root = await fixture(), old = createServer((_req, res) => { res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.end('<meta name="application-name" content="gsnv-paint">'); });
  try {
    await new Promise(resolve => old.listen(port, '127.0.0.1', resolve));
    const rejected = start(root); assert.equal(await rejected.closed, 1); assert.match(rejected.output(), /APP-STALE/); assert.doesNotMatch(rejected.output(), /Building|Installing/);
    await new Promise(resolve => old.close(resolve));
    const a = start(root), b = start(root);
    try {
      const until = Date.now() + 20_000;
      while (!a.output().includes('already running') && !b.output().includes('already running')) {
        assert.ok(Date.now() < until, a.output() + b.output());
        if (a.child.exitCode !== null) assert.equal(a.child.exitCode, 0, a.output()); if (b.child.exitCode !== null) assert.equal(b.child.exitCode, 0, b.output());
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const combined = a.output() + b.output(); assert.equal((combined.match(/Building gsnv-paint/g) ?? []).length, 1, combined);
      assert.equal((await fetch(`http://127.0.0.1:${port}/__gsnv-local__/status`)).status, 200);
    } finally { await a.stop(); await b.stop(); }
  } finally { if (old.listening) await new Promise(resolve => old.close(resolve)); await rm(root, { recursive: true, force: true }); }
});
