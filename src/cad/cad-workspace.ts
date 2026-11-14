/**
 * PURPOSE    Route native CAD projects and validated STEP imports to their editors.
 * KIND       SHELL assembly CAD-IMPORT; source codecs, replacement and view lifecycle.
 * CONTRACT   IN: shared FilePorts. OUT: backward-compatible production WorkspaceAdapter.
 *            Import STEP validates every solid before shared host replacement consent.
 *            RAISES: source/envelope errors on native decode; import failures are visible.
 * GUARANTEES No imported-body loss, false parametric history or stale import publication.
 * TUNING     New document defaults remain in the parametric adapter.
 * DECISIONS  D1: Retain independent editor views behind one factory. Alternative: enlarge
 *            the sketch-only source contract. Revisit if: mixed feature graphs are implemented.
 * LIMITS     One fixed STEP source or the existing C50 parametric subset, never both.
 * TESTBENCH  src/cad/cad-step-import.browser.spec.ts -- run with: node_modules/.bin/playwright test --config src/cad/playwright.step-import.config.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import type { FilePorts } from '../shared/file-access.ts';
import { createParametricCADWorkspace } from './cad-parametric-workspace.ts';
import { createImportedCADView } from './cad-imported-view.ts';
import { cadProjectSource, isSTEPSource } from './cad-project-source.ts';
import { cadSTEPImport } from './cad-step-import.ts';
import kernelModule from 'replicad-opencascadejs?url';
import kernelWasm from 'replicad-opencascadejs/wasm?url';
import solverModule from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.js?url';
import solverWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import './cad-workspace.css';
type Snapshot=Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
export function createCADWorkspace(files:FilePorts):WorkspaceAdapter{
  const parametric=createParametricCADWorkspace(files);
  return{
    create:()=>parametric.create!(),
    decode(value){const p=value.project;if(p.format!=='gsnv-cad'||p.version!==1)throw new Error('Choose a supported native CAD project.');return{id:p.id,title:p.title,format:p.format,version:p.version,value:cadProjectSource({operation:'decode',content:p.content,assets:value.assets})};},
    encode(value){const encoded=cadProjectSource({operation:'encode',source:cadProjectSource({operation:'read',value:value.value})});return{project:{format:'gsnv-cad',version:1,id:value.id,title:value.title,content:encoded.content},assets:encoded.assets};},
    mount(host){
      const pane=host.root.ownerDocument.createElement('div'),notice=host.root.ownerDocument.createElement('p');pane.className='cad-workspace-view';notice.className='cad-import-status';notice.setAttribute('role','status');notice.hidden=true;host.root.append(pane,notice);
      const assets={kernelModule:new URL(kernelModule,location.href).href,kernelWasm:new URL(kernelWasm,location.href).href,solverModule:new URL(solverModule,location.href).href,solverWasm:new URL(solverWasm,location.href).href};
      const childHost={...host,root:pane};let current:Snapshot,imported=false,view=parametric.mount(childHost),disposed=false;
      const importer=cadSTEPImport({files,assets,id:()=>crypto.randomUUID(),createWorker:()=>new Worker(new URL('./cad-workspace.worker.ts',import.meta.url),{type:'module'}),
        onStatus(state,message){if(disposed)return;notice.hidden=false;notice.dataset.state=state;notice.textContent=message;host.invalidate();},
        onImport(source,_preview,baseIdentity){
          if(disposed||baseIdentity!==(current?.identity??null)||!isSTEPSource(source))return;
          const title=source.assets[0].name.replace(/\.(step|stp)$/i,'')||'Imported part';
          void host.open({id:crypto.randomUUID(),title,format:'gsnv-cad',version:1,value:source}).then(opened=>{if(disposed)return;if(opened)notice.hidden=true;else{notice.hidden=false;notice.textContent='STEP import canceled; the current project was kept.';}host.invalidate();}).catch(cause=>{if(disposed)return;notice.hidden=false;notice.dataset.state='error';notice.textContent=cause instanceof Error?cause.message:String(cause);});
        },
      });
      return{
        render(snapshot,nextView){
          const changed=snapshot?.identity!==current?.identity;if(changed){importer.cancel();notice.hidden=true;}current=snapshot;
          const next=!!snapshot&&isSTEPSource(cadProjectSource({operation:'read',value:snapshot.value}));
          if(next!==imported){view.dispose();imported=next;view=next?createImportedCADView(childHost,files,assets):parametric.mount(childHost);}
          view.render(snapshot,nextView);
        },
        model(){const model=view.model();return{...model,menus:[{id:'exchange',label:'Exchange',items:[{id:'cad.importSTEP',label:'Import STEP…',icon:'open',shortcut:'',toolbar:true,enabled:true}]},...model.menus]};},
        context:()=>view.context(),gesture:event=>view.gesture(event),flush:()=>view.flush?.(),
        command(id){if(id==='cad.importSTEP'){const content=current?cadProjectSource({operation:'read',value:current.value}):null;void importer.run({identity:current?.identity??null,units:content?.units??'mm'});}else{if(id==='tool.cancel')importer.cancel();view.command(id);}},
        dispose(){if(disposed)return;disposed=true;importer.dispose();view.dispose();host.root.replaceChildren();},
      };
    },
  };
}
