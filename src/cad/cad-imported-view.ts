/**
 * PURPOSE    Connect a fixed imported STEP source to CAD viewing and inspection.
 * KIND       SHELL assembly CAD-IMPORT; presentation, shared transactions and lifecycle.
 * CONTRACT   IN: shared host, FilePorts and native asset URLs. OUT: editor view with
 *            all-solid inspection, unit transactions and cancellable STEP/STL exports.
 *            RAISES: C66 errors for unsupported runtime source; native failures are visible.
 * GUARANTEES No invented feature history, persisted previews or stale solid after failure.
 * TUNING     Measurements display three decimals; source and inspection retain full precision.
 * DECISIONS  D1: Separate imported view from the parametric editor. Alternative: dummy
 *            sketch/boss features would misrepresent source history. Revisit if: mixed graphs ship.
 * LIMITS     Fixed source only; no face selection or imported geometry editing. STL uses
 *            C54's displayed 0.1 mm tessellation. C37 owns complete analytic STEP export.
 * TESTBENCH  src/cad/cad-imported-view.test.ts -- run with: node --import tsx --test src/cad/cad-imported-view.test.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { cadProjectSource, isSTEPSource, type CADSource } from './cad-project-source.ts';
import { cadWorkerClient, type CADBuild, type CADProtocol } from './cad-worker-client.ts';
import { cadSTEPExport } from './cad-step-export.ts';
import { cadViewport } from './cad-viewport.ts';
import { writeSTL } from './stl-serialization.ts';
type Host=Parameters<WorkspaceAdapter['mount']>[0];
type View=ReturnType<WorkspaceAdapter['mount']>;
type Snapshot=Parameters<View['render']>[0];
export function createImportedCADView(host:Host,files:FilePorts,assets:CADProtocol['assets']):View{
  const document=host.root.ownerDocument,stage=document.createElement('div'),hint=document.createElement('div'),panel=document.createElement('div');
  stage.className='cad-stage';stage.tabIndex=-1;hint.className='cad-tool-hint';panel.className='cad-properties cad-imported-properties';host.root.append(stage,hint);
  const viewport=cadViewport(stage);
  let current:Snapshot,content:CADSource|null=null,result:CADBuild|null=null,state:'busy'|'ready'|'error'='busy',message='Rebuilding imported STEP…',exportMessage='',disposed=false;
  const worker=cadWorkerClient({assets,createWorker:()=>new Worker(new URL('./cad-workspace.worker.ts',import.meta.url),{type:'module'}),
    onResult(identity,value){if(disposed||identity!==current?.identity)return;result=value;state='ready';message=`${value.bodies?.length??0} solid${value.bodies?.length===1?'':'s'} imported. Source is non-parametric.`;refresh();host.invalidate();},
    onError(identity,error){if(disposed||identity!==current?.identity)return;result=null;state='error';message=error;refresh();host.invalidate();},
  });
  const exporter=cadSTEPExport({files,assets,createWorker:()=>new Worker(new URL('./cad-step-export.worker.ts',import.meta.url),{type:'module'}),onStatus(value,text){exportMessage=text;hint.dataset.exportState=value;refresh();}});
  const node=(tag:string,text?:string)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
  function button(label:string,id:string){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.importAction=id;b.onclick=()=>command(id);return b;}
  function refresh(){
    if(disposed)return;
    viewport.update({content:null,entities:[],view:{zoom:1,pan:{x:0,y:0}},selected:[],preview:[],solid:result?.solid??null,mode:'solid',state:state==='error'?'error':'fully',emptyMessage:state==='error'?'The imported source could not be rebuilt.':message});
    hint.textContent=exportMessage||'Middle-drag to orbit · Shift+middle-drag to pan · wheel to zoom · F to fit.';
    const focus=(document.activeElement as HTMLElement|null)?.dataset.importAction;panel.replaceChildren();
    const status=node('p',message);status.className='cad-build-status';status.dataset.state=state;status.setAttribute('role','status');panel.append(status);
    if(!content||!isSTEPSource(content))return;
    const units=node('div');units.className='cad-units';units.append(node('span','Units '));
    for(const unit of ['mm','inch'] as const){const b=button(unit==='mm'?'Metric (mm)':'Imperial (in)',`cad.units.${unit}`);b.setAttribute('aria-pressed',String(unit===content.units));units.append(b);}panel.append(units,node('h3','Feature tree'));
    const tree=node('ol'),feature=node('li');tree.className='cad-feature-tree';feature.dataset.featureId=content.graph.features[0].id;
    feature.append(node('strong','Imported STEP — non-parametric'),node('small',content.assets[0].name));tree.append(feature);panel.append(tree,node('p','The original STEP source is embedded in this project. It contains fixed solid geometry without editable sketch history.'));
    if(result?.solid){
      const scale=content.units==='inch'?25.4:1,label=content.units==='inch'?'in':'mm';
      const measurements=(parent:HTMLElement,solid:Pick<NonNullable<CADBuild['solid']>,'volume'|'area'|'center'>)=>{
        const list=node('dl');for(const [name,text] of [['Volume',`${(solid.volume/scale**3).toFixed(3)} ${label}³`],['Surface area',`${(solid.area/scale**2).toFixed(3)} ${label}²`],['Center of mass',`${solid.center.map(n=>(n/scale).toFixed(3)).join(', ')} ${label}`]])list.append(node('dt',name),node('dd',text));parent.append(list);
      };
      panel.append(node('h3','All solids'));measurements(panel,result.solid);panel.append(node('p','Totals sum the source bodies; overlapping volumes are counted for each body.'));
      for(const [index,body] of (result.bodies??[]).entries()){const row=node('section');row.dataset.bodyId=body.id;row.append(node('h3',`Solid ${index+1}`));measurements(row,body);panel.append(row);}
    }
    if(focus)[...panel.querySelectorAll<HTMLButtonElement>('[data-import-action]')].find(b=>b.dataset.importAction===focus)?.focus();
    if(current&&document.activeElement===document.body&&!document.querySelector('dialog[open]'))stage.focus();
  }
  async function exportSTL(){
    if(!current||!result?.solid)return;const identity=current.identity;
    try{const file=writeSTL({name:current.title,meshes:[result.solid],unitScaleToMm:1}),saved=await fileAccess({op:'save',name:`${current.title||'imported-part'}.stl`,mime:file.mime,bytes:file.bytes},files);
      if(disposed||identity!==current?.identity)return;exportMessage='cancelled' in saved?'STL export canceled.':saved.ok?`STL export handed to file access: ${saved.value.name}`:saved.error.message;
    }catch(cause){exportMessage=cause instanceof Error?cause.message:String(cause);}refresh();
  }
  function command(id:string){
    if(disposed)return;if(id==='tool.cancel'){exporter.cancel();worker.cancel();if(state==='busy'){state='error';message='STEP rebuild canceled.';result=null;refresh();host.invalidate();}return;}
    if(id==='view.fit'){viewport.fit();return;}if(!content||!current)return;
    if(id==='cad.exportSTEP'){void exporter.run({content,name:`${current.title||'imported-part'}.step`});return;}
    if(id==='cad.exportSTL'){void exportSTL();return;}
    if(id==='cad.units.mm'||id==='cad.units.inch'){
      const units=id==='cad.units.mm'?'mm':'inch';if(content.units===units)return;
      try{host.commit({...current,value:cadProjectSource({operation:'units',source:content,units})},units==='mm'?'Metric units':'Imperial units',current.identity);}catch(cause){message=cause instanceof Error?cause.message:String(cause);state='error';refresh();}
    }
  }
  return{
    render(snapshot){if(disposed||snapshot?.identity===current?.identity)return;current=snapshot;exporter.cancel();exportMessage='';result=null;
      content=snapshot?cadProjectSource({operation:'read',value:snapshot.value}):null;state='busy';message='Rebuilding imported STEP…';refresh();
      if(content&&snapshot)worker.submit(snapshot.identity,content);else worker.cancel();
    },
    model(){const item=(id:string,label:string,icon:string,toolbar=false)=>({id,label,icon,toolbar,shortcut:id==='view.fit'?'F':'',enabled:!!current});
      return{menus:[{id:'solid',label:'Solid',items:[item('view.fit','Zoom to fit','fit',true),item('cad.units.mm','Metric units (mm)','ruler'),item('cad.units.inch','Imperial units (inch)','ruler'),item('cad.exportSTEP','Export STEP','export',true),{...item('cad.exportSTL','Export STL (3D printing)','export'),enabled:!!result?.solid}]}],tools:[],panels:[{id:'cad-properties',title:'Imported part',content:panel}]};
    },context:()=>({viewRole:'cad3d',activeTool:'orbit',status:exportMessage||message}),command,gesture(){},
    dispose(){if(disposed)return;disposed=true;worker.dispose();exporter.dispose();viewport.dispose();host.root.replaceChildren();panel.replaceChildren();},
  };
}
