import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createImportedCADView } from './cad-imported-view.ts';
import { cadProjectSource } from './cad-project-source.ts';
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import type { FilePorts } from '../shared/file-access.ts';
import type { CADProtocol } from './cad-worker-client.ts';
const assets={kernelModule:'/k.js',kernelWasm:'/k.wasm',solverModule:'/s.js',solverWasm:'/s.wasm'};
test('CAD-IMPORT view labels non-parametric source and all bodies, edits units through shared history and clears stale results',()=>{
  const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main')!,commits:unknown[][]=[],workers:FakeWorker[]=[];
  class FakeWorker extends EventTarget{sent:CADProtocol['request'][]=[];stopped=false;constructor(){super();workers.push(this);}postMessage(v:CADProtocol['request']){this.sent.push(v);}terminate(){this.stopped=true;}reply(value:CADProtocol['reply']){this.dispatchEvent(new MessageEvent('message',{data:value}));}}
  const original=Object.getOwnPropertyDescriptor(globalThis,'Worker');Object.defineProperty(globalThis,'Worker',{configurable:true,value:FakeWorker});
  const source=cadProjectSource({operation:'import',name:'<script>plate.step',bytes:new Uint8Array([1]),units:'mm',featureId:'f',assetId:'a'});
  const host:Parameters<WorkspaceAdapter['mount']>[0]={root,commit:(...args)=>commits.push(args),invalidate(){},dialog(){},open:async()=>true};
  const snapshot={id:'project',title:'plate',format:'gsnv-cad' as const,version:1,identity:'one',value:source};
  const view=createImportedCADView(host,{} as FilePorts,assets);
  try{
    view.render(snapshot,{zoom:1,pan:{x:0,y:0}});
    let panel=view.model().panels[0]!.content as HTMLElement;assert.match(panel.textContent!,/Imported STEP — non-parametric/);assert.equal(panel.querySelector('script'),null);
    assert.equal(panel.querySelectorAll('.cad-feature-tree li').length,1);assert.equal(view.model().tools.length,0);
    const solid={positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2]),volume:16387.064,area:645.16,center:[25.4,0,0] as [number,number,number]};
    workers[0]!.reply({id:1,ok:true,value:{entities:[],dof:0,solid,bodies:[{id:'first',volume:8193.532,area:322.58,center:[0,0,0]},{id:'second',volume:8193.532,area:322.58,center:[50.8,0,0]}]}});
    panel=view.model().panels[0]!.content as HTMLElement;assert.match(panel.textContent!,/2 solids/);assert.equal(panel.querySelectorAll('[data-body-id]').length,2);assert.match(panel.textContent!,/16387.064 mm³/);
    view.command('cad.units.inch');assert.equal(commits.length,1);const changed=(commits[0]![0] as typeof snapshot).value;assert.equal(changed.units,'inch');assert.deepEqual(changed.assets,source.assets);
    view.render({...snapshot,identity:'two',value:changed},{zoom:1,pan:{x:0,y:0}});assert.doesNotMatch(panel.textContent!,/16387\.064/);assert.match(panel.textContent!,/Rebuilding/);
    workers[0]!.reply({id:2,ok:false,message:'invalid source'});assert.match(panel.textContent!,/invalid source/);assert.equal(panel.querySelectorAll('[data-body-id]').length,0);assert.equal(view.model().menus[0]!.items.find(v=>v.id==='cad.exportSTL')!.enabled,false);
    view.dispose();assert.ok(workers[0]!.stopped);assert.equal(root.childElementCount,0);
  }finally{view.dispose();if(original)Object.defineProperty(globalThis,'Worker',original);else Reflect.deleteProperty(globalThis,'Worker');dom.window.close();}
});
