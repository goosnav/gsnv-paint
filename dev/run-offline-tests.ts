// Dedicated acceptance harness: each invocation owns fresh A/B copies and never
// relies on a previous agent's /tmp artifacts. Production files are read-only.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { offlineProductionFixture } from './offline-production-fixture.ts';

const directory = await mkdtemp(join(tmpdir(), 'gsnv-offline-acceptance-'));
try {
  console.log(JSON.stringify(await offlineProductionFixture(resolve('dist'), directory)));
  const child = spawn(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test',
    '--config', 'dev/offline.playwright.config.ts', ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, GSNV_OFFLINE_CANDIDATES: directory },
  });
  process.exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once('error', reject); child.once('exit', (code, signal) => resolveExit(signal ? 1 : code ?? 1));
  });
} finally { await rm(directory, { recursive: true, force: true }); }
