import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceBridge, type EditorBridge } from './workspace-bridge.ts';
import { videoTimeline } from '../video/video-timeline.ts';
import type { AppDocument } from '../app/app-shell.ts';
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
function setup(sourceWorkspace: 'image' | 'video' = 'image') {
  let active = sourceWorkspace as string, viewRevision = 'v1', applied = 0, replacement = true, hold: Promise<void> | undefined, guard: Promise<void> | undefined, block = false;
  const documents: Record<string, (AppDocument & { identity: string }) | undefined> = { [sourceWorkspace]: { id: 'source', title: 'Source', identity: 'r1', format: `gsnv-${sourceWorkspace}`, version: 1, value: null } };
  if (sourceWorkspace === 'image') documents.video = { id: 'target', title: 'Target', identity: 'target-r1', format: 'gsnv-video', version: 1, value: videoTimeline({ operation: 'new' }) };
  const epoch: Record<string, number> = { image: 1, video: 1, cad: 1 };
  const editor: EditorBridge = { prepare() {}, revision: () => viewRevision, async capture(intent, source) {
    await hold;
    return { version: 1, label: 'Snapshot', pixels: { width: 1, height: 1, rgba: new Uint8ClampedArray([255,0,0,128]), colorSpace: 'srgb', alpha: 'straight' }, ...(intent.route === 'image-to-video-bin' ? { route: intent.route, source: { ...source, workspace: 'image' } } : { route: 'video-frame-to-image', source: { ...source, workspace: 'video' }, frame: { timelineSeconds: 0, fps: 30 } }) };
  } };
  const bridge = createWorkspaceBridge({ active: () => active, available: () => true, prepare(workspace,role) { if (role === 'target' && block) throw Error('Finish target input.'); }, read: workspace => ({ document: documents[workspace], epoch: epoch[workspace]!, editor: workspace === sourceWorkspace ? editor : undefined }),
    mayReplace: async () => { await guard; return replacement; }, newId: () => 'fresh', apply(delivery) { applied++; const next = { ...delivery.document, identity: 'applied' }; documents[delivery.workspace] = next; return next; } });
  return { bridge, documents, epoch, get applied() { return applied; }, hold(value: Promise<void>) { hold = value; }, guard(value: Promise<void>) { guard = value; }, block() { block = true; }, deny() { replacement = false; }, switch() { active = 'cad'; }, changeView() { viewRevision = 'v2'; } };
}
test('A-D-Bridge applies an acknowledged bin edit and keeps source revision intact', async () => {
  const f = setup(), source = f.documents.image; const out = await f.bridge.transfer('image', { route: 'image-to-video-bin' });
  assert.equal(out.ok, true); assert.equal(f.applied, 1); assert.equal(f.documents.image, source);
});
test('A-D-Bridge rejects target pending edits and denied replacement without applying', async () => {
  const blocked = setup(); blocked.block(); assert.equal((await blocked.bridge.transfer('image', { route: 'image-to-video-bin' })).ok, false); assert.equal(blocked.applied, 0);
  const denied = setup('video'); denied.deny(); assert.equal((await denied.bridge.transfer('video', { route: 'video-frame-to-image' })).ok, false); assert.equal(denied.applied, 0);
});
test('A-D-Bridge rechecks source, target, epoch, view and workspace after asynchronous capture', async () => {
  for (const change of [(f: ReturnType<typeof setup>) => { f.documents.image = { ...f.documents.image!, identity: 'r2' }; }, (f: ReturnType<typeof setup>) => { f.documents.video = { ...f.documents.video!, identity: 'changed' }; }, (f: ReturnType<typeof setup>) => { f.epoch.image!++; }, (f: ReturnType<typeof setup>) => f.changeView(), (f: ReturnType<typeof setup>) => f.switch()]) {
    const f = setup(), gate = deferred(); f.hold(gate.promise); const result = f.bridge.transfer('image', { route: 'image-to-video-bin' }); change(f); gate.resolve(); assert.equal((await result).ok, false); assert.equal(f.applied, 0);
  }
});
test('A-D-Bridge rechecks after replacement backup and cancellation prevents late apply', async () => {
  const f = setup('video'), gate = deferred(); f.guard(gate.promise); const pending = f.bridge.transfer('video', { route: 'video-frame-to-image' }); await new Promise(r => setImmediate(r)); f.epoch.image!++; gate.resolve(); assert.equal((await pending).ok, false); assert.equal(f.applied, 0);
  const g = setup(), capture = deferred(); g.hold(capture.promise); const result = g.bridge.transfer('image', { route: 'image-to-video-bin' }); g.bridge.cancel(); capture.resolve(); assert.equal((await result).ok, false); assert.equal(g.applied, 0);
});
test('A-D-Bridge leaves both documents intact when browser PNG compression is unavailable', async () => {
  const f=setup(),before={...f.documents},descriptor=Object.getOwnPropertyDescriptor(globalThis,'CompressionStream')!;
  Object.defineProperty(globalThis,'CompressionStream',{configurable:true,value:undefined});
  try{const result=await f.bridge.transfer('image',{route:'image-to-video-bin'});assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'encode');assert.equal(f.applied,0);assert.deepEqual(f.documents,before);assert.equal(f.bridge.busy,false);}
  finally{Object.defineProperty(globalThis,'CompressionStream',descriptor);}
});
