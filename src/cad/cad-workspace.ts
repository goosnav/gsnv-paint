/**
 * PURPOSE    Connect the working CAD increment to the shared application.
 * KIND       SHELL assembly CAD-APP; routing, lifecycle and transactional UI only.
 * CONTRACT   IN: S07 file ports and browser DOM/Worker capabilities. OUT: production WorkspaceAdapter.
 *            Sources persist through S15; native results are disposable display data.
 *            RAISES: invalid project content errors; editing failures display in properties.
 * GUARANTEES No native handles or cached meshes in saved files; stale builds cannot commit.
 * TUNING     Starting document title, tool labels and transaction defaults below.
 * DECISIONS  D1: Keep geometry previews outside history. Alternative: commit then undo
 *            cancel; that pollutes history/recovery. Revisit if: the shell transaction API changes.
 * LIMITS     C50 supported CAD subset; all other feature families remain planned. STL export
 *            writes the displayed B-rep triangulation (0.1 mm deflection), not a separate export mesh.
 * TESTBENCH  src/cad/cad-workspace.browser.spec.ts -- run with: npm run test:browser -- src/cad/cad-workspace.browser.spec.ts
 */
import type { WorkspaceAdapter, AppDocument } from '../app/app-shell.ts';
import type { DialogSpec } from '../shared/dialog.ts';
import type { View2D } from '../shared/view-transform.ts';
import type { FilePorts } from '../shared/file-access.ts';
import { editableCADContent, type CADContent } from './editable-cad-content.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
import { evaluateDimension } from './dimension-expressions.ts';
import { evaluateVariables } from './named-variables.ts';
import { makeLinearEntities, type LinearEntity } from './sketch-linear-primitives.ts';
import { cadWorkerClient, type CADBuild } from './cad-worker-client.ts';
import { cadViewport } from './cad-viewport.ts';
import { cadToolInput, type CADToolState } from './cad-tool-input.ts';
import { cadProperties, type PropertyEdit } from './cad-properties.ts';
import { cadSTEPExport } from './cad-step-export.ts';
import { writeSTL } from './stl-serialization.ts';
import { fileAccess } from '../shared/file-access.ts';
import { bossOf, laterOf, type SketchEntity, type Sketch, type EdgeSet } from './editable-cad-content.ts';
const UNITS_KEY='gsnv-cad-default-units';
const defaultUnits=():'mm'|'inch'=>{try{return localStorage.getItem(UNITS_KEY)==='inch'?'inch':'mm';}catch{return 'mm';}};
import kernelModule from 'replicad-opencascadejs?url';
import kernelWasm from 'replicad-opencascadejs/wasm?url';
import solverModule from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.js?url';
import solverWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import './cad-workspace.css';

type Snapshot=Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
const firstSegment=(entities:readonly SketchEntity[])=>entities.find((e):e is Extract<SketchEntity,{kind:'segment'}>=>e.kind==='segment');
export function createCADWorkspace(files:FilePorts):WorkspaceAdapter{
 const value=(document:AppDocument)=>editableCADContent({operation:'read',value:document.value});
 return{
  create:()=>({id:crypto.randomUUID(),title:'Untitled part',format:'gsnv-cad',version:1,value:{...editableCADContent({operation:'new'}),units:defaultUnits()}}),
  decode(packageValue){if(packageValue.project.format!=='gsnv-cad'||packageValue.assets.length)throw new Error('This CAD build opens native sketch/extrusion projects without imported assets.');const p=packageValue.project;return{id:p.id,title:p.title,format:p.format,version:p.version,value:editableCADContent({operation:'read',value:p.content})};},
  encode(document){return{project:{format:'gsnv-cad',version:1,id:document.id,title:document.title,content:JSON.parse(JSON.stringify(value(document)))},assets:[]};},
  mount(host){
   const document=host.root.ownerDocument,stage=document.createElement('div'),panel=document.createElement('div'),hint=document.createElement('div');
   stage.className='cad-stage';stage.tabIndex=-1;hint.className='cad-tool-hint';host.root.append(stage,hint);
   const viewport=cadViewport(stage);
   let current:Snapshot,content:CADContent|null=null,preview:CADContent|null=null,result:CADBuild|null=null,view:View2D={zoom:1,pan:{x:0,y:0}};
   let mode:'sketch'|'solid'='sketch',status:'idle'|'busy'|'ready'|'error'='idle',message='Start a new part with Ctrl+N.',disposed=false,jobIdentity='',previewSequence=0,exportMessage='';
   let tool:CADToolState={tool:'select',anchor:null,cursor:null,selected:[]};
   const properties=cadProperties({root:panel,onEdit:edit});
   const assets={kernelModule:new URL(kernelModule,location.href).href,kernelWasm:new URL(kernelWasm,location.href).href,solverModule:new URL(solverModule,location.href).href,solverWasm:new URL(solverWasm,location.href).href};
   const exporter=cadSTEPExport({files,assets,createWorker:()=>new Worker(new URL('./cad-step-export.worker.ts',import.meta.url),{type:'module'}),onStatus(state,text){exportMessage=text;hint.dataset.exportState=state;refresh(false);}});
   const worker=cadWorkerClient({assets,createWorker:()=>new Worker(new URL('./cad-workspace.worker.ts',import.meta.url),{type:'module'}),
    onResult(identity,output){if(disposed||identity!==jobIdentity)return;result=output;status='ready';message=output.dof===0?'Sketch is fully defined.':`Sketch has ${output.dof} degrees of freedom.`;refresh();host.invalidate();},
    onError(identity,error){if(disposed||identity!==jobIdentity)return;result=null;status='error';message=error;refresh();host.invalidate();},
   });
   const effective=()=>preview??content;
   let activeSketch='';
   const baseId=()=>effective()?.graph.features[0].id??'';
   const sketchOf=(c:CADContent|null):Sketch|undefined=>{if(!c)return undefined;const cut=laterOf(c).find(f=>f.id===activeSketch&&f.kind==='pocket');return cut&&cut.kind==='pocket'?cut.definition.sketch:c.graph.features[0].definition.sketch;};
   const onCut=()=>!!activeSketch&&activeSketch!==baseId();
   const entities=()=>(onCut()?result?.sketches?.[activeSketch]:result?.entities)??sketchOf(effective())?.entities??[];
   const uid=()=>crypto.randomUUID();
   function toolStatus(){return !current?'New (Ctrl+N) starts a part.':mode==='solid'?'Middle-drag to orbit · Shift+middle-drag to pan · wheel to zoom · F to fit.':tool.tool==='select'?'Click an edge to select · Ctrl-click adds to selection · double-click a dimension to edit.':tool.anchor?(tool.tool==='circle'?'Click a point on the circle to set its size · Esc cancels.':'Click the next corner to finish · Shift aligns a line · Esc cancels.'):tool.tool==='circle'?'Click the circle center · inside an outline it becomes a hole when extruded.':tool.tool==='line'?'Click the first endpoint · endpoints snap · Esc cancels.':'Click the first corner. This replaces the current sketch with a dimensioned rectangle.';}
   function refresh(includePanel=true){
    if(disposed)return;const shown=effective();let ghost:(LinearEntity|SketchEntity)[]=[];
    if(shown&&tool.anchor&&tool.cursor&&tool.tool==='circle'){const radius=Math.hypot(tool.cursor[0]-tool.anchor[0],tool.cursor[1]-tool.anchor[1]);if(radius>shown.tolerance.linearMm)ghost=[{id:'preview',kind:'circle',center:tool.anchor,radius,construction:false}];}
    else if(shown&&tool.anchor&&tool.cursor&&tool.tool!=='select')try{ghost=makeLinearEntities({tool:tool.tool==='line'?'line':'corner-rectangle',anchors:[tool.anchor,tool.cursor],ids:tool.tool==='line'?['preview']:['preview1','preview2','preview3','preview4'],construction:false,tolerance:shown.tolerance});}catch{/* A zero-length hover is a preview, never a committed segment. */}
    viewport.update({content:shown,sketch:sketchOf(shown),context:onCut()?(result?.entities??shown?.graph.features[0].definition.sketch.entities??[]):[],entities:entities(),view,selected:tool.selected,preview:ghost,solid:result?.solid??null,mode,state:status==='error'?'error':result?.dof===0?'fully':'under'});
    hint.textContent=exportMessage||toolStatus();hint.dataset.tool=tool.tool;stage.dataset.tool=mode==='sketch'?tool.tool:'orbit';
    if(includePanel)properties.update({content:shown,activeSketch:onCut()?activeSketch:'',selected:tool.selected,state:status,message,result});
    if(current&&document.activeElement===document.body&&!document.querySelector('dialog[open]'))stage.focus();
   }
   function build(next:CADContent,identity:string){
    jobIdentity=identity;result=null;
    if(!next.graph.features[0].definition.sketch.entities.length&&!bossOf(next)){worker.cancel();status='idle';message='Draw a closed sketch, then extrude it.';refresh();return;}
    status='busy';message='Rebuilding in the CAD worker…';refresh();worker.submit(identity,next);
   }
   function commit(action:CADAction,label:string){
    if(!content||!current)return;
    try{const next=editCADContent({content,action,sketch:activeSketch||undefined});host.commit({...current,value:next},label,current.identity);}catch(cause){status='error';message=cause instanceof Error?cause.message:String(cause);refresh();}
   }
   function transaction(title:string,fields:DialogSpec['fields'],initial:DialogSpec['initial'],action:(values:DialogSpec['initial'])=>CADAction,solid=false){
    if(!current||!content)return;const original=current,source=content,previousMode=mode;
    if(solid)mode='solid';tool={...tool,anchor:null,cursor:null};
    host.dialog({title,fields,initial,validate(values){try{return{ok:true,value:JSON.parse(JSON.stringify(editCADContent({content:source,action:action(values),sketch:activeSketch||undefined})))}}catch(cause){return{ok:false,error:{code:'cad.input',message:cause instanceof Error?cause.message:String(cause)}};}},
     preview(value){preview=value as unknown as CADContent;build(preview,`preview-${++previewSequence}`);},
     commit(value){preview=null;host.commit({...original,value},title,original.identity);},
     cancel(){preview=null;mode=previousMode;build(source,original.identity);},
    });
   }
   function length(source:unknown){if(!content)throw new Error('Create a part first.');return evaluateDimension({expression:{source:String(source),kind:'length'},context:evaluateVariables({variables:content.variables,units:content.units}).context}).value;}
   function edit(request:PropertyEdit){
    if(disposed||!content)return;const sketch=sketchOf(content)!;
    if(request.command==='cad.dimension'){
     const d=sketch.dimensions.find(d=>d.id===request.id);if(d)transaction('Edit dimension',[{key:'source',label:`Length (${content.units} or expression)`,type:'text'}],{source:d.value.source},v=>({kind:'dimension',id:d.id,source:String(v.source)}));
    }else if(request.command==='cad.removeConstraint'&&request.id)commit({kind:'remove-constraint',id:request.id},'Remove constraint');
    else if(request.command==='cad.editSketch'&&request.id){activeSketch=request.id===content.graph.features[0].id?'':request.id;mode='sketch';tool={...tool,anchor:null,cursor:null,selected:[]};refresh();host.invalidate();}
    else if(request.command==='cad.removeFeature'&&request.id){if(activeSketch===request.id)activeSketch='';commit({kind:'remove-feature',id:request.id},'Delete feature');}
    else if(request.command==='cad.cutDepth'&&request.id){
     const cut=laterOf(content).find(f=>f.id===request.id);if(!cut||cut.kind!=='pocket')return;
     transaction('Cut depth',[{key:'mode',label:'Extent',type:'select',choices:[{value:'through',label:'Through all'},{value:'blind',label:'To a depth'}]},{key:'depth',label:`Depth (${content.units} or expression)`,type:'text'}],
      {mode:cut.definition.extent.kind,depth:cut.definition.extent.kind==='blind'?cut.definition.extent.distance.source:'5'},v=>({kind:'cut-extent',id:cut.id,depth:v.mode==='through'?null:String(v.depth)}),true);
    }
    else if(request.command==='cad.editEdges'&&request.id){const f=laterOf(content).find(f=>f.id===request.id);if(f&&f.kind!=='pocket')edgeDialog(f.kind,f.id,f.definition.edges,f.definition.size.source);}
    else command(request.command);
   }
   function edgeDialog(feature:'fillet'|'chamfer',id:string,edges:EdgeSet,size:string){
    if(!content)return;
    transaction(feature==='fillet'?'Fillet (rounded edges)':'Chamfer (bevelled edges)',[{key:'edges',label:'Edges',type:'select',choices:[{value:'vertical',label:'Vertical edges (corners)'},{value:'top',label:'Top edges'},{value:'bottom',label:'Bottom edges'},{value:'all',label:'All edges'}]},{key:'size',label:`${feature==='fillet'?'Radius':'Distance'} (${content.units} or expression)`,type:'text'}],
     {edges,size},v=>({kind:'edge-feature',id,feature,edges:v.edges as EdgeSet,size:String(v.size)}),true);
   }
   function command(id:string){
    if(!content)return;
    if(id==='tool.cancel'){exporter.cancel();worker.cancel();preview=null;tool=cadToolInput({state:tool,event:{kind:'cancel'},endpoints:[],tolerance:content.tolerance.linearMm}).state;build(content,current!.identity);return;}
    if(id==='cad.exportSTEP'){void exporter.run({content,name:`${current?.title.trim()||'part'}.step`});return;}
    if(id==='tool.confirm'){if(tool.anchor&&tool.cursor)pointer(tool.cursor,null,false,false);return;}
    if(['cad.select','cad.line','cad.rectangleTool','cad.circleTool'].includes(id)){mode='sketch';tool=cadToolInput({state:tool,event:{kind:'tool',tool:id==='cad.select'?'select':id==='cad.line'?'line':id==='cad.circleTool'?'circle':'rectangle'},endpoints:[],tolerance:content.tolerance.linearMm}).state;refresh();host.invalidate();return;}
    if(id==='cad.exportSTL'){void exportSTL();return;}
    if(id==='cad.circle'){
     const prefix=uid();
     transaction('Circle dimensions',[{key:'diameter',label:`Diameter (${content.units} or expression)`,type:'text'},{key:'x',label:'Center X (mm)',type:'number'},{key:'y',label:'Center Y (mm)',type:'number'}],{diameter:'10',x:0,y:0},v=>({kind:'circle',prefix,diameter:String(v.diameter),center:[Number(v.x),Number(v.y)]}));return;
    }
    if(id==='cad.sketch'||id==='cad.solid'){mode=id==='cad.sketch'?'sketch':'solid';refresh();return;}
    if(id==='view.fit'){viewport.fit();return;}
    if(id==='edit.selectAll'){tool={...tool,selected:sketchOf(content)!.entities.map(e=>e.id)};refresh();return;}
    if(id==='cad.units.mm'||id==='cad.units.inch'){const units=id==='cad.units.mm'?'mm':'inch';try{localStorage.setItem(UNITS_KEY,units);}catch{/* Defaults are a convenience. */}if(content.units!==units)commit({kind:'units',units},units==='mm'?'Metric units':'Imperial units');return;}
    if(id==='cad.addCut'){const cutId=uid();activeSketch='';mode='sketch';tool={...tool,anchor:null,cursor:null,selected:[]};commit({kind:'add-cut',id:cutId},'Add cut');if(content&&laterOf(content).some(f=>f.id===cutId)){activeSketch=cutId;refresh();host.invalidate();}return;}
    if(id==='cad.fillet'||id==='cad.chamfer'){edgeDialog(id==='cad.fillet'?'fillet':'chamfer',uid(),'vertical',id==='cad.fillet'?(content.units==='inch'?'0.125':'3'):(content.units==='inch'?'0.0625':'1'));return;}
    if(['cad.parallel','cad.perpendicular','cad.equal','cad.coincident'].includes(id)){if(tool.selected.length===2)commit({kind:'relation',id:uid(),relation:id.slice(4) as 'parallel',entities:[tool.selected[0]!,tool.selected[1]!]},id.slice(4)[0]!.toUpperCase()+id.slice(5));return;}
    if(id==='edit.delete'){if(tool.selected.length)commit({kind:'remove',ids:tool.selected},'Delete sketch geometry');return;}
    if(id==='cad.horizontal'||id==='cad.vertical'){if(tool.selected.length===1)commit({kind:'constraint',id:uid(),entity:tool.selected[0]!,axis:id==='cad.horizontal'?'horizontal':'vertical'},'Add constraint');return;}
    if(id==='cad.removeExtrude'){commit({kind:'remove-extrude'},'Delete extrusion');mode='sketch';refresh();return;}
    if(id==='cad.extrude'){
     const feature=bossOf(content);const featureId=feature?.id??uid();
     transaction('Extrude',[{key:'depth',label:`Depth (${content.units} or expression)`,type:'text'}],{depth:feature?.definition.extent.distance.source??'10'},v=>({kind:'extrude',id:featureId,depth:String(v.depth)}),true);return;
    }
    if(id==='cad.rectangle'){
     const prefix=uid(),sketch=sketchOf(content)!;
     transaction('Rectangle dimensions',[{key:'width',label:`Width (${content.units})`,type:'text'},{key:'height',label:`Height (${content.units})`,type:'text'},{key:'x',label:'Corner X (mm)',type:'number'},{key:'y',label:'Corner Y (mm)',type:'number'}],{width:sketch.dimensions[0]?.value.source??'100',height:sketch.dimensions[1]?.value.source??'60',x:firstSegment(sketch.entities)?.a[0]??0,y:firstSegment(sketch.entities)?.a[1]??0},v=>({kind:'rectangle',prefix,width:String(v.width),height:String(v.height),origin:[Number(v.x),Number(v.y)]}));return;
    }
    if(id==='cad.lineCoordinates'){
     const id=uid();transaction('Line coordinates',['x1','y1','x2','y2'].map(key=>({key,label:`${key.toUpperCase()} (${content!.units})`,type:'text'})),{x1:'0',y1:'0',x2:'40',y2:'0'},v=>({kind:'line',id,a:[length(v.x1),length(v.y1)],b:[length(v.x2),length(v.y2)]}));
    }
   }
   function pointer(point:[number,number],hit:string|null,ctrl:boolean,shift:boolean,move=false){
    if(!content)return;const endpoints=entities().flatMap(e=>e.kind==='segment'?[e.a,e.b]:e.kind==='circle'?[e.center]:[]),a=viewport.point({x:0,y:0}),b=viewport.point({x:8,y:0});
    const next=cadToolInput({state:tool,event:{kind:move?'move':'click',point,hit,ctrl,shift},endpoints,tolerance:Math.max(content.tolerance.linearMm,Math.abs(b[0]-a[0]))});tool=next.state;
    if(next.intent.kind==='line')commit({kind:'line',id:uid(),a:next.intent.a,b:next.intent.b},'Draw line');
    else if(next.intent.kind==='circle'){if(next.intent.radius>content.tolerance.linearMm)commit({kind:'circle',prefix:uid(),diameter:`${+(next.intent.radius*2).toFixed(3)} mm`,center:next.intent.center},'Draw circle');else refresh();}
    else if(next.intent.kind==='rectangle')commit({kind:'rectangle',prefix:uid(),width:`${next.intent.width} mm`,height:`${next.intent.height} mm`,origin:next.intent.origin},'Draw rectangle');
    else refresh(!move);
   }
   async function exportSTL(){
    const solid=result?.solid;if(!solid||!current)return;
    try{
     const file=writeSTL({name:current.title,meshes:[solid],unitScaleToMm:1}),saved=await fileAccess({op:'save',name:`${current.title.trim()||'part'}.stl`,mime:file.mime,bytes:file.bytes},files);
     if('cancelled' in saved)return;exportMessage=saved.ok?`Exported ${saved.value.name}.`:`${saved.error.code}: ${saved.error.message}`;hint.dataset.exportState=saved.ok?'done':'error';
    }catch(cause){exportMessage=`STL export failed: ${cause instanceof Error?cause.message:String(cause)}`;hint.dataset.exportState='error';}
    refresh(false);
   }
   const dimensionEdit=(event:Event)=>{if(event.type==='keydown'&&!['Enter',' '].includes((event as KeyboardEvent).key))return;const target=event.target as Element;const id=target.closest('[data-dimension-id]')?.getAttribute('data-dimension-id');if(id){event.preventDefault();event.stopPropagation();edit({command:'cad.dimension',id});}};stage.addEventListener('dblclick',dimensionEdit);stage.addEventListener('keydown',dimensionEdit);
   return{
    render(snapshot,nextView){
     const changed=snapshot?.identity!==current?.identity;current=snapshot;view=nextView;
     if(changed){exporter.cancel();exportMessage='';delete hint.dataset.exportState;preview=null;content=snapshot?value(snapshot):null;if(activeSketch&&!(content&&laterOf(content).some(f=>f.id===activeSketch&&f.kind==='pocket')))activeSketch='';tool={...tool,anchor:null,cursor:null,selected:tool.selected.filter(id=>content?.graph.features[0].definition.sketch.entities.some(e=>e.id===id))};if(content)build(content,snapshot!.identity);else{worker.cancel();result=null;refresh();}}else refresh();
    },
    model(){
     const enabled=!!current,item=(id:string,label:string,icon:string,shortcut='',toolbar=false)=>({id,label,icon,shortcut,toolbar,enabled});
     return{menus:[{id:'sketch',label:'Sketch',items:[item('cad.rectangle','Rectangle dimensions…','rectangle','',true),item('cad.lineCoordinates','Line coordinates…','line'),item('cad.circle','Circle dimensions…','ellipse'),item('cad.sketch','Edit sketch','grid'),item('cad.horizontal','Horizontal constraint','ruler'),item('cad.vertical','Vertical constraint','ruler'),item('edit.selectAll','Select all','select','Ctrl+A'),item('edit.delete','Delete selected','delete','Delete')]},{id:'solid',label:'Solid',items:[item('cad.extrude','Extrude…','extrude','E',true),item('cad.solid','Solid view','cad','',true),item('cad.removeExtrude','Delete extrusion','delete'),item('view.fit','Zoom to fit','fit','F',true),{...item('cad.addCut','Cut (pocket or hole)…','delete'),enabled:enabled&&!!(content&&bossOf(content))},{...item('cad.fillet','Fillet (round edges)…','ellipse'),enabled:enabled&&!!(content&&bossOf(content))},{...item('cad.chamfer','Chamfer (bevel edges)…','extrude'),enabled:enabled&&!!(content&&bossOf(content))},item('cad.units.mm','Metric units (mm)','ruler'),item('cad.units.inch','Imperial units (inch)','ruler'),{...item('cad.exportSTEP','Export STEP','export','',true),enabled:enabled&&!!(content&&bossOf(content))},{...item('cad.exportSTL','Export STL (3D printing)','export'),enabled:enabled&&!!result?.solid}]}],
     tools:[{active:enabled&&tool.tool==='select',id:'cad.select',label:'Select',icon:'select',shortcut:'V',enabled,status:'Click an edge to select it.'},{active:enabled&&tool.tool==='line',id:'cad.line',label:'Line',icon:'line',shortcut:'L',enabled,status:'Click two endpoints to draw a line.'},{active:enabled&&tool.tool==='rectangle',id:'cad.rectangleTool',label:'Rectangle',icon:'rectangle',shortcut:'R',enabled,status:'Click two corners to replace the outline with a rectangle.'},{active:enabled&&tool.tool==='circle',id:'cad.circleTool',label:'Circle',icon:'ellipse',shortcut:'C',enabled,status:'Click the center, then a point on the circle.'}],panels:[{id:'cad-properties',title:'Part',content:panel}]};
    },context:()=>({viewRole:mode==='sketch'?'sketch2d':'cad3d',activeTool:tool.tool,status:exportMessage||toolStatus()}),command,
    gesture(gesture){if(mode!=='sketch'||gesture.type!=='pointer')return;if(gesture.phase==='cancel'){tool={...tool,anchor:null,cursor:null};refresh();}else if(gesture.phase==='down'&&gesture.button===0)pointer(viewport.point(gesture.point),viewport.hit(gesture.point),gesture.ctrl,gesture.shift);else if(gesture.phase==='move')pointer(viewport.point(gesture.point),null,gesture.ctrl,gesture.shift,true);},
    dispose(){if(disposed)return;disposed=true;exporter.dispose();worker.dispose();stage.removeEventListener('dblclick',dimensionEdit);stage.removeEventListener('keydown',dimensionEdit);viewport.dispose();properties.dispose();host.root.replaceChildren();},
   };
  },
 };
}
