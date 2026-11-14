/** Real launcher against a small temporary Vite project; never builds the shared dist. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));
const port = 24176;
async function launch(root) {
  const child = spawn(process.execPath, [join(root, 'launcher/start.mjs')], {
    cwd: root, env: { ...process.env, GSNV_PAINT_PORT: String(port), GSNV_PAINT_NO_OPEN: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const closed = new Promise(resolve => child.once('close', resolve));
  try {
    const until = Date.now() + 15_000;
    while (!output.includes('is running at')) {
      assert.equal(child.exitCode, null, output); assert.ok(Date.now() < until, output);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const response = await fetch(`http://127.0.0.1:${port}/`); assert.equal(response.status, 200);
    return output;
  } finally { child.kill(); await closed; }
}

test('launcher rebuilds missing offline controls and changed public/generator sources, and reuses complete fresh output', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'gsnv-launcher-offline-'));
  try {
    for (const directory of ['src', 'public', 'dev', 'launcher']) await mkdir(join(root, directory));
    await symlink(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
    await copyFile(join(repository, 'launcher/start.mjs'), join(root, 'launcher/start.mjs'));
    await writeFile(join(root, 'package.json'), '{"type":"module"}'); await writeFile(join(root, 'package-lock.json'), '{}');
    await utimes(join(root, 'package-lock.json'), new Date(0), new Date(0));
    await writeFile(join(root, 'index.html'), '<!doctype html><meta name="application-name" content="gsnv-paint"><script type="module" src="/src/main.js"></script>');
    await writeFile(join(root, 'src/main.js'), 'document.body.append("fixture");');
    await writeFile(join(root, 'public/notice.txt'), 'first notice'); await writeFile(join(root, 'dev/offline-build.ts'), 'generator one');
    await writeFile(join(root, 'vite.config.ts'), `import {readFileSync} from 'node:fs'; import {randomUUID} from 'node:crypto';
      export default {plugins:[{name:'fixture-offline-controls',generateBundle(){
        this.emitFile({type:'asset',fileName:'offline-sw.js',source:'// fixture worker'});
        this.emitFile({type:'asset',fileName:'offline-manifest.json',source:JSON.stringify({id:randomUUID(),generator:readFileSync('dev/offline-build.ts','utf8')})});
      }}],preview:{host:'127.0.0.1',strictPort:true}};`);
    assert.match(await launch(root), /Building gsnv-paint/);
    const manifest = () => readFile(join(root, 'dist/offline-manifest.json'), 'utf8');
    let previous = await manifest(); assert.doesNotMatch(await launch(root), /Building gsnv-paint/); assert.equal(await manifest(), previous);
    for (const missing of ['offline-sw.js', 'offline-manifest.json']) {
      await rm(join(root, 'dist', missing)); assert.match(await launch(root), /Building gsnv-paint/, `Missing ${missing} must rebuild`);
      assert.notEqual(await manifest(), previous); previous = await manifest();
    }
    await writeFile(join(root, 'public/notice.txt'), 'second notice');
    assert.match(await launch(root), /Building gsnv-paint/, 'Changed public file must rebuild');
    assert.equal(await readFile(join(root, 'dist/notice.txt'), 'utf8'), 'second notice');
    await writeFile(join(root, 'dev/offline-build.ts'), 'generator two');
    assert.match(await launch(root), /Building gsnv-paint/, 'Changed offline generator must rebuild');
    assert.equal(JSON.parse(await manifest()).generator, 'generator two');
    assert.doesNotMatch(await launch(root), /Building gsnv-paint/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
