/** Cross-platform tests for the Mac SSH bridge (the Mac commands are mocked). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../connect-mac.sh', import.meta.url));
const skip = process.platform === 'win32'; // POSIX shell helper; no sh on native Windows.
const invoke = (args, env) =>
  spawnSync('sh', [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('SSH bridge refuses missing host, invalid port and wrong OS', { skip }, () => {
  const invalid = invoke(['user@example.test'], { GSNV_PAINT_PORT: 'not-a-port' });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /REMOTE-PORT/);
  const missing = invoke([], { GSNV_PAINT_PORT: '24173', GSNV_PAINT_REMOTE: '' });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Usage.*user@server/);
  if (process.platform !== 'darwin') {
    const wrongOS = invoke(['user@example.test'], { GSNV_PAINT_PORT: '24173' });
    assert.equal(wrongOS.status, 2);
    assert.match(wrongOS.stderr, /REMOTE-PLATFORM/);
  }
});

test('SSH bridge forwards loopback only and opens Safari after app identity check', { skip, timeout: 15_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gsnv-mac-bridge-'));
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><meta name="application-name" content="gsnv-paint">');
  });
  let child;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const fake = {
      uname: '#!/bin/sh\nprintf "Darwin\\n"\n',
      ssh: '#!/bin/sh\nprintf "%s\\n" "$*" > "$GSNV_SSH_ARGS"\nwhile :; do sleep 1; done\n',
      open: '#!/bin/sh\nprintf "%s\\n" "$*" > "$GSNV_OPEN_ARGS"\n',
    };
    for (const [name, body] of Object.entries(fake)) {
      const file = join(dir, name);
      await writeFile(file, body);
      await chmod(file, 0o755);
    }
    const env = {
      ...process.env,
      PATH: dir + delimiter + process.env.PATH,
      GSNV_PAINT_PORT: String(port),
      GSNV_SSH_ARGS: join(dir, 'ssh-args'),
      GSNV_OPEN_ARGS: join(dir, 'open-args'),
    };
    child = spawn('sh', [script, 'user@example.test'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', part => { output += part; });
    child.stderr.on('data', part => { output += part; });
    let opened = '';
    const deadline = Date.now() + 8_000;
    while (!opened && Date.now() < deadline) {
      try { opened = await readFile(env.GSNV_OPEN_ARGS, 'utf8'); } catch { /* pending */ }
      if (!opened) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(output, /reachable from this Mac/);
    assert.equal(opened.trim(), '-a Safari http://127.0.0.1:' + port + '/');
    assert.ok((await readFile(env.GSNV_SSH_ARGS, 'utf8')).includes(
      '-L 127.0.0.1:' + port + ':127.0.0.1:' + port + ' -- user@example.test'));
  } finally {
    if (child) {
      const closed = new Promise(resolve => child.once('close', resolve));
      child.kill('SIGTERM');
      await closed;
    }
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
