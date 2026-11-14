import { expect, test, type Page } from '@playwright/test';

const receipt = async (page: Page, id: string) => JSON.parse((await page.locator(`#${id}-result`).textContent())!);
const ready = (page: Page) => expect(page.locator('#assembly-status')).toHaveText('Both engines ready', { timeout: 30_000 });
const open = async (page: Page, epoch: number) => {
  await page.getByRole('button', { name: 'Load both engines', exact: true }).click(); await ready(page);
  await expect(page.locator('#worker-epoch')).toHaveText(String(epoch)); await expect(page.locator('#worker-alive')).toHaveText('yes');
  expect(await receipt(page, 'open')).toEqual({ kernelReady: true, solverReady: true, mode: 'single', workerOnly: true, workerIsolated: true });
};
const inspect = async (page: Page) => {
  await page.getByRole('button', { name: 'Inspect pair', exact: true }).click(); await ready(page);
  const observed = await receipt(page, 'inspect');
  expect(observed.box.valid).toBe(true); expect(observed.box.volume).toBeCloseTo(24, 8);
  expect(observed.solved).toMatchObject({ status: 0, dof: 0, conflicts: [] }); expect(observed.solved.point).toHaveLength(2);
  [10, 20].forEach((coordinate, axis) => expect(Math.abs(observed.solved.point[axis] - coordinate)).toBeLessThanOrEqual(1e-8));
  expect(observed.contradiction).toEqual({ status: 2, dof: -1, conflicts: ['x10', 'x11'], applied: false, snapshotPreserved: true });
  expect(observed.probes).toEqual({ kernelReady: true, solverReady: true, shapePreserved: true, solverSnapshotPreserved: true });
  expect(observed.after).toMatchObject({ valid: true, kernelClosed: false, solverClosed: false }); expect(observed.after.volume).toBeCloseTo(24, 8);
  return observed;
};
const close = async (page: Page) => {
  await page.getByRole('button', { name: 'Close pair', exact: true }).click();
  await expect(page.locator('#assembly-status')).toHaveText('Pair closed; worker terminated'); await expect(page.locator('#worker-alive')).toHaveText('no');
  const observed = await receipt(page, 'close');
  expect(observed).toEqual({ kernelClosed: true, solverClosed: true, kernelGenerationChanged: true, solverGenerationChanged: true,
    kernelTokenError: 'DisposedSessionError', capturedSolveError: 'DisposedSessionError', diagnostics: [] });
  return observed;
};

test('CAD-A1 real paired worker preserves both engines and owns failure, cancellation and replacement', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('/dev/fixtures/engine-assembly.html'); expect(response?.status()).toBe(200);
  const headers = await response!.allHeaders();
  expect(headers['cross-origin-opener-policy']).toBe('same-origin'); expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  expect(headers['cross-origin-resource-policy']).toBe('same-origin'); expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.locator('h1')).toContainText('Combined engine spike');
  await open(page, 1); const initial = await inspect(page); const initialClose = await close(page);

  const solverAsset = /\/planegcs\.wasm(?:\?.*)?$/; let aborted = 0;
  // The vendor retries with an ArrayBuffer fetch after streaming initialization fails.
  await page.route(solverAsset, async route => { aborted++; await route.abort('failed'); });
  try {
    await page.getByRole('button', { name: 'Load both engines', exact: true }).click();
    await expect(page.locator('#assembly-status')).toHaveText('Pair failed; worker terminated', { timeout: 30_000 });
    await expect(page.locator('#worker-epoch')).toHaveText('2'); await expect(page.locator('#worker-alive')).toHaveText('no');
    await expect(page.locator('#error-result')).toContainText('PlaneGCS'); expect(aborted).toBeGreaterThanOrEqual(1);
    expect(await receipt(page, 'error')).toMatchObject({ kernelState: 'open', solverState: 'absent' });
  } finally { await page.unroute(solverAsset); }
  const initializationFailure = await page.locator('#error-result').textContent();
  await open(page, 3);
  await page.getByRole('button', { name: 'Run 600 ms paired work', exact: true }).click();
  await expect(page.locator('#assembly-status')).toHaveText('Working in paired worker');
  await page.getByRole('button', { name: 'Main-thread click', exact: true }).click();
  await page.getByRole('link', { name: 'Main-thread navigation', exact: true }).click(); await ready(page);
  const work = await receipt(page, 'work');
  expect(work.elapsedMs).toBeGreaterThanOrEqual(600); expect(work.iterations).toBeGreaterThan(0); expect(work.framesDuringWork).toBeGreaterThan(0);
  expect(work.clicksDuringWork).toBe(1); expect(work.navigationDuringWork).toBe(1); expect(new URL(page.url()).hash).toBe('#notes');
  await expect(page.locator('#click-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Run 600 ms paired work', exact: true }).click();
  await expect(page.locator('#assembly-status')).toHaveText('Working in paired worker');
  await page.getByRole('button', { name: 'Terminate and restart', exact: true }).click(); await ready(page);
  await expect(page.locator('#worker-epoch')).toHaveText('4'); await expect(page.locator('#termination')).toContainText('during work');
  await expect(page.locator('#worker-alive')).toHaveText('yes'); await inspect(page);
  await page.getByRole('button', { name: 'Inject native fault', exact: true }).click();
  await expect(page.locator('#assembly-status')).toHaveText('Pair failed; worker terminated'); await expect(page.locator('#worker-alive')).toHaveText('no');
  await expect(page.locator('#error-result')).toContainText('KernelLoadError'); await expect(page.locator('#error-result')).toContainText('native OpenCascade exception');
  expect(await receipt(page, 'error')).toMatchObject({ kernelState: 'closed', solverState: 'open' });
  const nativeFailure = await page.locator('#error-result').textContent();
  await open(page, 5); const recovered = await inspect(page); const finalClose = await close(page);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'dev/evidence/CAD-A1.png' });
  await testInfo.attach('CAD-A1-paired-worker', { path: 'dev/evidence/CAD-A1.png', contentType: 'image/png' });
  console.log('CAD-A1 paired-worker evidence:', JSON.stringify({ browser: browser.version(), platform: process.platform, arch: process.arch,
    viewport: page.viewportSize(), headers: { coop: headers['cross-origin-opener-policy'], coep: headers['cross-origin-embedder-policy'], corp: headers['cross-origin-resource-policy'] },
    initial, initialClose, initializationFailure, work, nativeFailure, recovered, finalClose }));
  console.log('CAD-A1 limits: single kernel mode; development fault injection only. Bounded paired-probe work does not prove product operation latency, 50-feature performance, offline behavior, release assets, deployment or other OS/browser coverage.');
});
