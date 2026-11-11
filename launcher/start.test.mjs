/** Launcher smoke test: the real launcher process over real HTTP. Run with: npm run test:launcher */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';

const start = fileURLToPath(new URL('./start.mjs', import.meta.url));
const port = 24174; // Not the user's port: a copy of the app they left running must not satisfy this test.
const env = { ...process.env, GSNV_PAINT_PORT: String(port), GSNV_PAINT_NO_OPEN: '1' };
function launch() {
  const child = spawn(process.execPath, [start], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; });
  return { child, output: () => output, exited: new Promise(resolve => child.on('exit', resolve)) };
}

const first = launch();
try {
  const deadline = Date.now() + 180_000;
  while (!first.output().includes('is running at')) {
    assert.equal(first.child.exitCode, null, `The launcher exited before serving:\n${first.output()}`);
    assert.ok(Date.now() < deadline, 'The launcher did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const origin = `http://127.0.0.1:${port}`;
  const html = await (await fetch(origin)).text();
  assert.match(html, /<title>gsnv-paint<\/title>/);
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(script, 'The built page references its script.');
  for (const path of ['/', script]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin', path);
    assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp', path);
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin', path);
    assert.equal(response.headers.get('access-control-allow-origin'), null, path);
  }
  // Only the build output is served, and only to loopback host names.
  assert.doesNotMatch(await (await fetch(`${origin}/package.json`)).text(), /devDependencies/);
  // fetch() does not let a caller choose the Host header; a raw request does.
  const foreignHost = await new Promise((resolve, reject) => get({ host: '127.0.0.1', port, path: '/', headers: { host: 'example.com' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
  assert.equal(foreignHost, 403, 'A foreign Host header must be refused.');

  const second = launch();
  assert.equal(await second.exited, 0, 'A second launch exits cleanly.');
  assert.match(second.output(), /already running/);
  console.log('launcher smoke: PASS');
} finally { first.child.kill(); }
