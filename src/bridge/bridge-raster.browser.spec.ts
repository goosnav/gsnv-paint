import { test, expect } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
let server: PreviewServer, outDir: string;
test.beforeAll(async () => {
  outDir = mkdtempSync(join(process.env.BRIDGE_TEST_TMP ?? tmpdir(), 'gsnv-bridge-raster-'));
  await build({ configFile: false, publicDir: false, logLevel: 'error', build: { outDir, emptyOutDir: true, rollupOptions: { input: fileURLToPath(new URL('./bridge-raster-fixture.ts', import.meta.url)), output: { entryFileNames: 'fixture.js' } } } });
  server = await preview({ configFile: false, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port: 4194, strictPort: true }, plugins: [{ name: 'fixture', configurePreviewServer(vite) { vite.middlewares.use((req,res,next) => { if (req.url === '/') { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><link rel="icon" href="data:,"><script type="module" src="/fixture.js"></script>'); } else next(); }); } }] });
});
test.afterAll(async () => { if (server) await new Promise<void>(resolve => server.httpServer.close(() => resolve())); if (outDir) rmSync(outDir, { recursive: true, force: true }); });
test('C35 real transparent capture retains all geometry, camera/color, edge alpha and visible renderer state', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('http://127.0.0.1:4194/');
  const result = await page.evaluate(async () => window.bridgeRaster.cad());
  console.log('C35 capture proof',JSON.stringify(result));
  expect(result.size).toEqual([320,240]); expect(result.corners).toEqual([0,0,0,0]); expect(result.blue).toEqual([64,128,192,255]); expect(result.green).toEqual([16,192,64,255]);
  expect(result.edges).toBeGreaterThan(100); expect(result.maxFringeError).toBeLessThanOrEqual(2); expect(result.unchanged).toBe(true); expect(errors).toEqual([]);
});
test('D05 real browser CompressionStream PNG preserves low-alpha bytes without Canvas conversion', async ({ page }) => {
  await page.goto('http://127.0.0.1:4194/'); const result = await page.evaluate(() => window.bridgeRaster.png());
  const bytes = Buffer.from(result), idat: Buffer[] = []; let offset = 8;
  while (offset < bytes.length) { const n = bytes.readUInt32BE(offset); if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + n)); offset += 12 + n; }
  expect([...inflateSync(Buffer.concat(idat))]).toEqual([0,17,83,249,0,1,99,207,1,24,51,81,2,253,104,9,127,51,202,188,128,17,37,111,254]);
});
test('D03 private decoder returns the requested adjacent frame, letterbox, fade and title', async ({ page }) => {
  await page.goto('http://127.0.0.1:4194/'); const { frames, corner, faded, stale, cancelled, unreadable, urlsReleased } = await page.evaluate(() => window.bridgeRaster.video());
  expect(frames.map(f => f.size)).toEqual([[160,120],[160,120],[160,120]]);
  for (const [i, rgb] of [[0,[255,0,0]],[1,[0,255,0]],[2,[0,0,255]]] as const) for (let c = 0; c < 3; c++) expect(Math.abs(frames[i]!.interior[c]!-rgb[c]!)).toBeLessThanOrEqual(3);
  expect(frames.every(f => f.interior[3] === 255)).toBe(true); expect(frames[1]!.whiteTitlePixels).toBeGreaterThan(5);
  expect(corner).toEqual([0,0,0,255]); expect(Math.abs(faded[0]!-128)).toBeLessThanOrEqual(3); expect(faded.slice(1)).toEqual([0,0,255]);
  expect(stale).toBe('BridgeFrameRevisionError'); expect(cancelled).toBe('AbortError');
  expect(unreadable).toBe('BridgeFrameReadbackError'); expect(urlsReleased).toBe(true);
});
test('C35 lost source context fails before creating a capture',async({page})=>{await page.goto('http://127.0.0.1:4194/');expect(await page.evaluate(()=>window.bridgeRaster.lostContext())).toBe('ContextLostError');});
test('D03 samples inside trimmed End and rejects a trim beyond the actual decoded duration',async({page})=>{
  await page.goto('http://127.0.0.1:4194/');const result=await page.evaluate(()=>window.bridgeRaster.trimmedVideo());console.log('D03 trimmed endpoint proof',JSON.stringify(result));
  expect(result.frames.map(f=>f.sample)).toEqual([.499999,.999999]);expect(result.frames.map(f=>f.timelineSeconds)).toEqual([.5,.5]);
  for(const[i,rgb]of [[0,[255,0,0]],[1,[0,255,0]]]as const){for(let c=0;c<3;c++)expect(Math.abs(result.frames[i]!.rgba[c]!-rgb[c]!)).toBeLessThanOrEqual(3);expect(result.frames[i]!.rgba[3]).toBe(255);}
  expect(result.beyond).toBe('BridgeFrameReadbackError');
});
