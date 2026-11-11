/**
 * PURPOSE    Connect the working CAD increment to the shared application.
 * KIND       SHELL assembly CAD-APP; routing, lifecycle and transactional UI only.
 * CONTRACT   IN: browser DOM/Worker capabilities. OUT: production WorkspaceAdapter.
 *            Sources persist through S15; native results are disposable display data.
 *            RAISES: invalid project content errors; editing failures display in properties.
 * GUARANTEES No native handles or cached meshes in saved files; stale builds cannot commit.
 * TUNING     Starting document title, tool labels and transaction defaults below.
 * DECISIONS  D1: Keep geometry previews outside history. Alternative: commit then undo
 *            cancel; that pollutes history/recovery. Revisit if: the shell transaction API changes.
 * LIMITS     C50 supported CAD subset; all other feature families remain planned.
 * TESTBENCH  src/cad/cad-workspace.browser.spec.ts -- run with: npm run test:browser -- src/cad/cad-workspace.browser.spec.ts
 */
import type { WorkspaceAdapter, AppDocument } from '../app/app-shell.ts';
import type { DialogSpec } from '../shared/dialog.ts';
import type { View2D } from '../shared/view-transform.ts';
import { editableCADContent, type CADContent } from './editable-cad-content.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
import { evaluateDimension } from './dimension-expressions.ts';
import { evaluateVariables } from './named-variables.ts';
import { makeLinearEntities, type LinearEntity } from './sketch-linear-primitives.ts';
import { cadWorkerClient, type CADBuild } from './cad-worker-client.ts';
import { cadViewport } from './cad-viewport.ts';
import { cadToolInput, type CADToolState } from './cad-tool-input.ts';
import { cadProperties, type PropertyEdit } from './cad-properties.ts';
import kernelModule from 'replicad-opencascadejs?url';
import kernelWasm from 'replicad-opencascadejs/wasm?url';
import solverModule from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.js?url';
import solverWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import './cad-workspace.css';

type Snapshot=Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
export function createCADWorkspace():WorkspaceAdapter{
 const value=(document:AppDocument)=>editableCADContent({operation:'read',value:document.value});
 return{
  create:()=>({id:crypto.randomUUID(),title:'Untitled part',format:'gsnv-cad',version:1,value:editableCADContent({operation:'new'})}),
  decode(packageValue){if(packageValue.project.format!=='gsnv-cad'||packageValue.assets.length)throw new Error('This CAD build opens native sketch/extrusion projects without imported assets.');const p=packageValue.project;return{id:p.id,title:p.title,format:p.format,version:p.version,value:editableCADContent({operation:'read',value:p.content})};},
  encode(document){return{project:{format:'gsnv-cad',version:1,id:document.id,title:document.title,content:JSON.parse(JSON.stringify(value(document)))},assets:[]};},
  mount(host){
   const document=host.root.ownerDocument,stage=document.createElement('div'),panel=document.createElement('div'),hint=document.createElement('div');
   stage.className='cad-stage';stage.tabIndex=-1;hint.className='cad-tool-hint';host.root.append(stage,hint);
   const viewport=cadViewport(stage);
   let current:Snapshot,content:CADContent|null=null,preview:CADContent|null=null,result:CADBuild|null=null,view:View2D={zoom:1,pan:{x:0,y:0}};
   let mode:'sketch'|'solid'='sketch',status:'idle'|'busy'|'ready'|'error'='idle',message='Start a new part with Ctrl+N.',disposed=false,jobIdentity='',previewSequence=0;
   let tool:CADToolState={tool:'select',anchor:null,cursor:null,selected:[]};
   const properties=cadProperties({root:panel,onEdit:edit});
   const assets={kernelModule:new URL(kernelModule,location.href).href,kernelWasm:new URL(kernelWasm,location.href).href,solverModule:new URL(solverModule,location.href).href,solverWasm:new URL(solverWasm,location.href).href};
   const worker=cadWorkerClient({assets,createWorker:()=>new Worker(new URL('./cad-workspace.worker.ts',import.meta.url),{type:'module'}),
    onResult(identity,output){if(disposed||identity!==jobIdentity)return;result=output;status='ready';message=output.dof===0?'Sketch is fully defined.':`Sketch has ${output.dof} degrees of freedom.`;refresh();},
    onError(identity,error){if(disposed||identity!==jobIdentity)return;result=null;status='error';message=error;refresh();},
   });
   const effective=()=>preview??content;
   const entities=()=>result?.entities??effective()?.graph.features[0].definition.sketch.entities??[];
   const uid=()=>crypto.randomUUID();
   function toolStatus(){return !current?'New (Ctrl+N) starts a part.':mode==='solid'?'Middle-drag to orbit · Shift+middle-drag to pan · wheel to zoom · F to fit.':tool.tool==='select'?'Click an edge to select · Ctrl-click adds to selection · double-click a dimension to edit.':tool.anchor?'Click the next corner to finish · Shift aligns a line · Esc cancels.':tool.tool==='line'?'Click the first endpoint · endpoints snap · Esc cancels.':'Click the first corner. This replaces the current sketch with a dimensioned rectangle.';}
   function refresh(includePanel=true){
    if(disposed)return;const shown=effective();let ghost:LinearEntity[]=[];
    if(shown&&tool.anchor&&tool.cursor&&tool.tool!=='select')try{ghost=makeLinearEntities({tool:tool.tool==='line'?'line':'corner-rectangle',anchors:[tool.anchor,tool.cursor],ids:tool.tool==='line'?['preview']:['preview1','preview2','preview3','preview4'],construction:false,tolerance:shown.tolerance});}catch{/* A zero-length hover is a preview, never a committed segment. */}
    viewport.update({content:shown,entities:entities(),view,selected:tool.selected,preview:ghost,solid:result?.solid??null,mode,state:status==='error'?'error':result?.dof===0?'fully':'under'});
    hint.textContent=toolStatus();hint.dataset.tool=tool.tool;
    if(includePanel)properties.update({content:shown,selected:tool.selected,state:status,message,result});
    if(current&&document.activeElement===document.body&&!document.querySelector('dialog[open]'))stage.focus();
   }
   function build(next:CADContent,identity:string){
    jobIdentity=identity;result=null;
    if(!next.graph.features[0].definition.sketch.entities.length&&!next.graph.features[1]){worker.cancel();status='idle';message='Draw a closed sketch, then extrude it.';refresh();return;}
    status='busy';message='Rebuilding in the CAD worker…';refresh();worker.submit(identity,next);
   }
   function commit(action:CADAction,label:string){
    if(!content||!current)return;
    try{const next=editCADContent({content,action});host.commit({...current,value:next},label,current.identity);}catch(cause){status='error';message=cause instanceof Error?cause.message:String(cause);refresh();}
   }
   function transaction(title:string,fields:DialogSpec['fields'],initial:DialogSpec['initial'],action:(values:DialogSpec['initial'])=>CADAction,solid=false){
    if(!current||!content)return;const original=current,source=content,previousMode=mode;
    if(solid)mode='solid';tool={...tool,anchor:null,cursor:null};
    host.dialog({title,fields,initial,validate(values){try{return{ok:true,value:JSON.parse(JSON.stringify(editCADContent({content:source,action:action(values)})))}}catch(cause){return{ok:false,error:{code:'cad.input',message:cause instanceof Error?cause.message:String(cause)}};}},
     preview(value){preview=value as unknown as CADContent;build(preview,`preview-${++previewSequence}`);},
     commit(value){preview=null;host.commit({...original,value},title,original.identity);},
     cancel(){preview=null;mode=previousMode;build(source,original.identity);},
    });
   }
   function length(source:unknown){if(!content)throw new Error('Create a part first.');return evaluateDimension({expression:{source:String(source),kind:'length'},context:evaluateVariables({variables:content.variables,units:content.units}).context}).value;}
   function edit(request:PropertyEdit){
    if(disposed||!content)return;const sketch=content.graph.features[0].definition.sketch;
    if(request.command==='cad.dimension'){
     const d=sketch.dimensions.find(d=>d.id===request.id);if(d)transaction('Edit dimension',[{key:'source',label:`Length (${content.units} or expression)`,type:'text'}],{source:d.value.source},v=>({kind:'dimension',id:d.id,source:String(v.source)}));
    }else if(request.command==='cad.removeConstraint'&&request.id)commit({kind:'remove-constraint',id:request.id},'Remove constraint');
    else command(request.command);
   }
   function command(id:string){
    if(!content)return;
    if(id==='tool.cancel'){worker.cancel();preview=null;tool=cadToolInput({state:tool,event:{kind:'cancel'},endpoints:[],tolerance:content.tolerance.linearMm}).state;build(content,current!.identity);return;}
    if(id==='tool.confirm'){if(tool.anchor&&tool.cursor)pointer(tool.cursor,null,false,false);return;}
    if(['cad.select','cad.line','cad.rectangleTool'].includes(id)){mode='sketch';tool=cadToolInput({state:tool,event:{kind:'tool',tool:id==='cad.select'?'select':id==='cad.line'?'line':'rectangle'},endpoints:[],tolerance:content.tolerance.linearMm}).state;refresh();return;}
    if(id==='cad.sketch'||id==='cad.solid'){mode=id==='cad.sketch'?'sketch':'solid';refresh();return;}
    if(id==='view.fit'){viewport.fit();return;}
    if(id==='edit.selectAll'){tool={...tool,selected:content.graph.features[0].definition.sketch.entities.map(e=>e.id)};refresh();return;}
    if(id==='edit.delete'){if(tool.selected.length)commit({kind:'remove',ids:tool.selected},'Delete sketch geometry');return;}
    if(id==='cad.horizontal'||id==='cad.vertical'){if(tool.selected.length===1)commit({kind:'constraint',id:uid(),entity:tool.selected[0]!,axis:id==='cad.horizontal'?'horizontal':'vertical'},'Add constraint');return;}
    if(id==='cad.removeExtrude'){commit({kind:'remove-extrude'},'Delete extrusion');mode='sketch';refresh();return;}
    if(id==='cad.extrude'){
     const feature=content.graph.features[1];const featureId=feature?.id??uid();
     transaction('Extrude',[{key:'depth',label:`Depth (${content.units} or expression)`,type:'text'}],{depth:feature?.definition.extent.distance.source??'10'},v=>({kind:'extrude',id:featureId,depth:String(v.depth)}),true);return;
    }
    if(id==='cad.rectangle'){
     const prefix=uid(),sketch=content.graph.features[0].definition.sketch;
     transaction('Rectangle dimensions',[{key:'width',label:`Width (${content.units})`,type:'text'},{key:'height',label:`Height (${content.units})`,type:'text'},{key:'x',label:'Corner X (mm)',type:'number'},{key:'y',label:'Corner Y (mm)',type:'number'}],{width:sketch.dimensions[0]?.value.source??'100',height:sketch.dimensions[1]?.value.source??'60',x:sketch.entities[0]?.a[0]??0,y:sketch.entities[0]?.a[1]??0},v=>({kind:'rectangle',prefix,width:String(v.width),height:String(v.height),origin:[Number(v.x),Number(v.y)]}));return;
    }
    if(id==='cad.lineCoordinates'){
     const id=uid();transaction('Line coordinates',['x1','y1','x2','y2'].map(key=>({key,label:`${key.toUpperCase()} (${content!.units})`,type:'text'})),{x1:'0',y1:'0',x2:'40',y2:'0'},v=>({kind:'line',id,a:[length(v.x1),length(v.y1)],b:[length(v.x2),length(v.y2)]}));
    }
   }
   function pointer(point:[number,number],hit:string|null,ctrl:boolean,shift:boolean,move=false){
    if(!content)return;const endpoints=entities().flatMap(e=>e.kind==='segment'?[e.a,e.b]:[]),a=viewport.point({x:0,y:0}),b=viewport.point({x:8,y:0});
    const next=cadToolInput({state:tool,event:{kind:move?'move':'click',point,hit,ctrl,shift},endpoints,tolerance:Math.max(content.tolerance.linearMm,Math.abs(b[0]-a[0]))});tool=next.state;
    if(next.intent.kind==='line')commit({kind:'line',id:uid(),a:next.intent.a,b:next.intent.b},'Draw line');
    else if(next.intent.kind==='rectangle')commit({kind:'rectangle',prefix:uid(),width:`${next.intent.width} mm`,height:`${next.intent.height} mm`,origin:next.intent.origin},'Draw rectangle');
    else refresh(!move);
   }
   const dimensionEdit=(event:Event)=>{if(event.type==='keydown'&&!['Enter',' '].includes((event as KeyboardEvent).key))return;const target=event.target as Element;const id=target.closest('[data-dimension-id]')?.getAttribute('data-dimension-id');if(id){event.preventDefault();event.stopPropagation();edit({command:'cad.dimension',id});}};stage.addEventListener('dblclick',dimensionEdit);stage.addEventListener('keydown',dimensionEdit);
   return{
    render(snapshot,nextView){
     const changed=snapshot?.identity!==current?.identity;current=snapshot;view=nextView;
     if(changed){preview=null;content=snapshot?value(snapshot):null;tool={...tool,anchor:null,cursor:null,selected:tool.selected.filter(id=>content?.graph.features[0].definition.sketch.entities.some(e=>e.id===id))};if(content)build(content,snapshot!.identity);else{worker.cancel();result=null;refresh();}}else refresh();
    },
    model(){
     const enabled=!!current,item=(id:string,label:string,icon:string,shortcut='',toolbar=false)=>({id,label,icon,shortcut,toolbar,enabled});
     return{menus:[{id:'sketch',label:'Sketch',items:[item('cad.rectangle','Rectangle dimensions…','rectangle','',true),item('cad.lineCoordinates','Line coordinates…','line'),item('cad.sketch','Edit sketch','grid'),item('cad.horizontal','Horizontal constraint','ruler'),item('cad.vertical','Vertical constraint','ruler'),item('edit.selectAll','Select all','select','Ctrl+A'),item('edit.delete','Delete selected','delete','Delete')]},{id:'solid',label:'Solid',items:[item('cad.extrude','Extrude…','extrude','E',true),item('cad.solid','Solid view','cad','',true),item('cad.removeExtrude','Delete extrusion','delete'),item('view.fit','Zoom to fit','fit','F',true)]}],
     tools:[{id:'cad.select',label:'Select',icon:'select',shortcut:'V',enabled,status:'Click an edge to select it.'},{id:'cad.line',label:'Line',icon:'line',shortcut:'L',enabled,status:'Click two endpoints to draw a line.'},{id:'cad.rectangleTool',label:'Rectangle',icon:'rectangle',shortcut:'R',enabled,status:'Click two corners to replace the sketch with a rectangle.'}],panels:[{id:'cad-properties',title:'Part',content:panel}]};
    },context:()=>({viewRole:mode==='sketch'?'sketch2d':'cad3d',activeTool:tool.tool,status:toolStatus()}),command,
    gesture(gesture){if(mode!=='sketch'||gesture.type!=='pointer')return;if(gesture.phase==='cancel'){tool={...tool,anchor:null,cursor:null};refresh();}else if(gesture.phase==='down'&&gesture.button===0)pointer(viewport.point(gesture.point),viewport.hit(gesture.point),gesture.ctrl,gesture.shift);else if(gesture.phase==='move')pointer(viewport.point(gesture.point),null,gesture.ctrl,gesture.shift,true);},
    dispose(){if(disposed)return;disposed=true;worker.dispose();stage.removeEventListener('dblclick',dimensionEdit);stage.removeEventListener('keydown',dimensionEdit);viewport.dispose();properties.dispose();host.root.replaceChildren();},
   };
  },
 };
}
