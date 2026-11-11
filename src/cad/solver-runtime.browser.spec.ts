import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const receipt = async (page: Page, id: string) => JSON.parse((await page.locator(`#${id}-result`).textContent())!);
const ready = (page: Page) => expect(page.locator('#solver-status')).toHaveText('Solver ready', { timeout: 30_000 });
const corners = (actual: Record<string, number[]>) => {
  expect(Object.keys(actual).sort()).toEqual(['A', 'B', 'C', 'D']);
  for (const [id, expected] of Object.entries({ A: [0, 0], B: [100, 0], C: [100, 60], D: [0, 60] })) {
    expect(actual[id]).toHaveLength(2); expected.forEach((coordinate, axis) => expect(Math.abs(actual[id]![axis]! - coordinate)).toBeLessThanOrEqual(1e-8));
  }
};

test('C02 real worker solves constrained geometry, reports contradiction and invalidates closed methods', async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const specifier of ['@salusoft89/planegcs/dist/planegcs_dist/planegcs.js', '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm']) {
    const bytes = await readFile(fileURLToPath(import.meta.resolve(specifier)));
    expect(bytes.byteLength).toBeLessThan(26_214_400);
    console.log('C02 source artifact (not final emitted asset coverage):', JSON.stringify({ specifier, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }));
  }
  await page.goto('/dev/fixtures/solver-runtime.html');
  await expect(page.locator('h1')).toContainText('Development solver spike');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.getByRole('button', { name: 'Load solver', exact: true }).click(); await ready(page);
  const opened = await receipt(page, 'open'); expect(opened).toEqual({ ready: true, workerIsolated: true, workerOnly: true, diagnostics: [] });
  await page.getByRole('button', { name: 'Solve rectangle', exact: true }).click(); await ready(page);
  const solved = await receipt(page, 'solve');
  for (const [name, dof] of [['underdefined', 2], ['widthOnly', 1], ['defined', 0]] as const) {
    expect(solved[name]).toMatchObject({ status: 0, dof, conflicts: [], redundant: [], partiallyRedundant: [], applied: true });
  }
  corners(solved.defined.points);
  await page.getByRole('button', { name: 'Probe live state', exact: true }).click(); await ready(page);
  expect(await receipt(page, 'probe')).toEqual({ ready: true, snapshotPreserved: true, dofPreserved: true, reportingPreserved: true, diagnostics: [] });
  await page.getByRole('button', { name: 'Add conflicting width', exact: true }).click(); await ready(page);
  const conflict = await receipt(page, 'conflict');
  expect(conflict).toMatchObject({ status: 2, dof: -1, conflicts: ['width100', 'width101'], applied: false, snapshotPreserved: true, closed: false });
  corners(conflict.lastSuccessfulPoints);
  await expect(page.locator('#contradiction')).toContainText('width100 (100 mm) and width101 (101 mm) conflict');
  await page.getByRole('button', { name: 'Close session', exact: true }).click();
  await expect(page.locator('#solver-status')).toHaveText('Session closed; worker still owns its heap');
  expect(await receipt(page, 'close')).toEqual({ ready: false, closed: true, generationChanged: true, capturedSolveError: 'DisposedSessionError', snapshotError: 'DisposedSessionError', diagnostics: [] });
  await page.getByRole('button', { name: 'Terminate and restart', exact: true }).click(); await ready(page);
  await expect(page.locator('#worker-epoch')).toHaveText('2');
  await expect(page.locator('#termination')).toHaveText('Terminated worker 1 before replacement');
  await page.getByRole('button', { name: 'Run 400 ms solver work', exact: true }).click();
  await expect(page.locator('#solver-status')).toHaveText('Working in solver worker');
  await page.getByRole('button', { name: 'Main-thread click', exact: true }).click(); await ready(page);
  const work = await receipt(page, 'work');
  expect(work.elapsedMs).toBeGreaterThanOrEqual(400); expect(work.iterations).toBeGreaterThan(0);
  expect(work.status).toBe(0); expect(work.dof).toBe(0); corners(work.points);
  expect(work.framesDuringWork).toBeGreaterThan(0); expect(work.clicksDuringWork).toBe(1);
  await page.getByRole('button', { name: 'Terminate worker', exact: true }).click();
  await expect(page.locator('#worker-alive')).toHaveText('no'); await expect(page.locator('#solver-status')).toHaveText('Worker terminated');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'dev/evidence/C02-worker.png' });
  await testInfo.attach('C02-worker-spike', { path: 'dev/evidence/C02-worker.png', contentType: 'image/png' });
  console.log('C02 real Chrome worker evidence:', JSON.stringify({ browser: browser.version(), platform: process.platform, arch: process.arch, viewport: page.viewportSize(), opened, solved, conflict, work }));
  console.log('C02 limits: fixture solve/apply policy only; bounded responsiveness is not product performance. No native fault injection, final emitted asset, deployment or other OS/browser coverage.');
});
