import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureCADViewport, type CadCapturePort } from './cad-viewport-capture.ts';
const stamp = { documentIdentity: 'r1', viewRevision: 'v1' };
test('C35 rejects invalid allocations, stale captures and aborts before WebGL allocation', async () => {
  let reads = 0; const viewport = { read() { reads++; throw Error('must not allocate'); }, isCurrent: () => false } as CadCapturePort;
  for (const [width,height] of [[0,1],[1.1,2],[4096,4096],[Number.MAX_SAFE_INTEGER,2]]) await assert.rejects(captureCADViewport({ viewport, width: width!, height: height!, expected: stamp }), { name: 'CaptureSizeError' });
  await assert.rejects(captureCADViewport({ viewport, width: 320, height: 240, expected: stamp }), { name: 'StaleCaptureError' });
  const abort = new AbortController(); abort.abort(); await assert.rejects(captureCADViewport({ viewport, width: 320, height: 240, expected: stamp, signal: abort.signal }), { name: 'AbortError' });
  assert.equal(reads, 0);
  const changed={read:()=>({...stamp,documentIdentity:'same-geometry-new-document'}),isCurrent:()=>true} as unknown as CadCapturePort;
  await assert.rejects(captureCADViewport({viewport:changed,width:320,height:240,expected:stamp}),{name:'StaleCaptureError'});
});
