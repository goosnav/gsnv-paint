import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { mountApp, type WorkspaceAdapter } from './app-shell.ts';
import { imageContent, type ImageContent } from '../image/image-content.ts';
import { videoTimeline, type VideoContent } from '../video/video-timeline.ts';
import { recentProjects } from '../shared/recent-projects.ts';
import type { TransferIntent } from '../bridge/transfer-contract.ts';
type Host = Parameters<WorkspaceAdapter['mount']>[0];
function fixture(workspace: 'image' | 'video') {
  let host: Host, current: Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0], pending = false;
  const adapter: WorkspaceAdapter = {
    create: () => ({ id: `${workspace}-initial`, title: workspace, format: `gsnv-${workspace}`, version: 1, value: workspace === 'image' ? imageContent({ operation: 'new', width: 2, height: 1, fill: [1,2,3,255] }) : videoTimeline({ operation: 'new' }) }),
    encode(doc) { const encoded = workspace === 'image' ? imageContent({ operation: 'encode', value: doc.value as ImageContent }) : videoTimeline({ operation: 'encode', value: doc.value as VideoContent }); return { project: { format: `gsnv-${workspace}`, id: doc.id, title: doc.title, version: 1, content: encoded.content }, assets: encoded.assets.map(asset => ({ mime: 'application/octet-stream', ...asset })) }; }, decode() { throw Error('unused'); },
    mount(value) { host = value; return { render(doc) { current = doc; }, model: () => ({ menus: [], tools: [], panels: [] }), context: () => ({ viewRole: 'none', activeTool: 'none', status: '' }), command() {}, gesture() {}, dispose() {},
      flush() { if (pending && current) { pending = false; host.commit({ ...current, title: 'Pending title' }, 'Pending typing', current.identity); } },
      bridge: { prepare() {}, revision: () => current?.identity ?? 'none', async capture(intent, source) { return { version: 1, route: 'video-frame-to-image', source: { ...source, workspace: 'video' }, label: 'Received frame', pixels: { width: 1, height: 1, rgba: new Uint8ClampedArray([255,0,0,255]), colorSpace: 'srgb', alpha: 'straight' }, frame: { timelineSeconds: 0, fps: 30 } }; } },
    }; },
  };
  return { adapter, stage() { pending = true; }, send(intent: TransferIntent) { return host.transfer!(intent); } };
}
test('A-SHELL bridge flushes hidden target, requires durable backup, preserves source and uses fresh target identity', async () => {
  for (const denied of [true,false]) {
    const dom = new JSDOM('<div id="app"></div>', { url: 'https://fixture.test' }), root = dom.window.document.querySelector<HTMLElement>('#app')!, image = fixture('image'), video = fixture('video'), storage = new IDBFactory(), recent = recentProjects(storage);
    Object.assign(dom.window.HTMLElement.prototype, { setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {} });
    if (denied) recent.save = async () => { throw Error('quota denied'); };
    const app = mountApp({ root, adapters: { image: image.adapter, video: video.adapter }, files: { document: dom.window.document, URL: { createObjectURL: () => '', revokeObjectURL() {} }, setTimeout: cb => { cb(); } }, recovery: { indexedDB: storage, localStorage: dom.window.localStorage }, recent, probe: { environment: {}, codecRequests: [] } });
    await app.ready; root.querySelector<HTMLButtonElement>('[data-workspace="image"]')!.click(); await app.dispatch('file.new'); image.stage();
    root.querySelector<HTMLButtonElement>('[data-workspace="video"]')!.click(); await app.dispatch('file.new'); const source = app.snapshot().documents.video, sourceHistory = app.snapshot().histories.video;
    const result = await video.send({ route: 'video-frame-to-image' }); assert.equal(result.ok, !denied, JSON.stringify(result) + root.textContent); assert.equal(app.snapshot().documents.video, source); assert.equal(app.snapshot().histories.video, sourceHistory);
    if (denied) { assert.equal(app.snapshot().documents.image!.id, 'image-initial'); assert.equal(app.snapshot().documents.image!.title, 'Pending title'); assert.equal(app.snapshot().workspace, 'video'); assert.match(root.textContent!, /quota|Save/); }
    else { assert.notEqual(app.snapshot().documents.image!.id, 'image-initial'); assert.equal(app.snapshot().workspace, 'image'); assert.equal((await recent.list()).find(e => e.id === 'image-initial')!.title, 'Pending title'); }
    app.dispose(); await app.idle(); dom.window.close();
  }
});
