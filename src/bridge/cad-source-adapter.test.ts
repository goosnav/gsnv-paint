import test from 'node:test';
import assert from 'node:assert/strict';
import { cadSourceAdapter } from './cad-source-adapter.ts';
import type { CadCapturePort } from '../cad/cad-viewport-capture.ts';
import type { DialogSpec } from '../shared/dialog.ts';
test('D04 capture dialog offers explicit aspect-preserving dimensions and requires the same committed view', async () => {
  let current = true, dialog: DialogSpec | undefined; const intents: unknown[] = [];
  const viewport = { read: () => { if (!current) throw new Error('Build not ready'); return { documentIdentity: 'r1', viewRevision: 'v1', width: 800, height: 500 }; }, isCurrent: () => current } as unknown as CadCapturePort;
  const adapter = cadSourceAdapter({ viewport, title: () => 'Part', dialog: spec => { dialog = spec; }, transfer: async intent => { intents.push(intent); return { ok: true, workspace: 'image', documentId: 'i', identity: 'new' }; } });
  assert.equal(adapter.ready(), true); adapter.send(); assert.ok(dialog);
  assert.deepEqual(dialog.initial, { size: '800x500' });
  assert.match(JSON.stringify(dialog.fields), /800 × 500/); assert.match(JSON.stringify(dialog.fields), /400 × 250/);
  const valid = dialog.validate({ size: '400x250' }); assert.equal(valid.ok, true); if (valid.ok) dialog.commit(valid.value);
  assert.deepEqual(intents, [{ route: 'cad-viewport-to-image', width: 400, height: 250 }]);
  await Promise.resolve();
  assert.equal(dialog.validate({ size: '123x321' }).ok, false);
  adapter.send(); current = false; assert.equal(adapter.ready(), false); assert.equal(dialog.validate({ size: '800x500' }).ok, false);
  assert.throws(() => adapter.bridge.prepare('source'), /Build not ready/);
  await assert.rejects(adapter.bridge.capture({ route: 'image-to-video-bin' }, { workspace: 'image', documentId: 'i', identity: 'r1', epoch: 0, viewRevision: 'v1' }, new AbortController().signal), /CAD/);
});
test('D04 rejects a cached dialog commit when the viewport changed after its last validation',async()=>{
  let revision='v1',dialog:DialogSpec|undefined,applied=0,failure='';
  const viewport={read:()=>({documentIdentity:'r1',viewRevision:revision,width:800,height:500}),isCurrent:(stamp:{viewRevision:string})=>stamp.viewRevision===revision} as unknown as CadCapturePort;
  const adapter=cadSourceAdapter({viewport,title:()=> 'Part',dialog:spec=>{dialog=spec;},transfer:async()=>{
    try{adapter.bridge.prepare('source');applied++;return{ok:true,workspace:'image',documentId:'i',identity:'i1'};}
    catch(error){failure=(error as Error).name;return{ok:false,code:'stale',message:String(error)};}
  }});
  adapter.send();const valid=dialog!.validate({size:'800x500'});assert.equal(valid.ok,true);revision='v2';if(valid.ok)dialog!.commit(valid.value);await Promise.resolve();assert.equal(applied,0);assert.equal(failure,'StaleCaptureError');
});
