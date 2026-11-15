/**
 * PURPOSE    Coordinate the Paint automation workflow.
 * KIND       SHELL
 * CONTRACT   Assembly: createImageAutomation(ports) exposes command/model/observe/navigate/dispose
 *            and canReplayClipboard(), true only while the last actual clipboard write
 *            matches the effective recipe's last copy/cut step, including after Undo.
 *            Records committed semantic edits, edits portable recipes, previews copies.
 * GUARANTEES Opening actions never executes them. Apply is one undoable host commit.
 * TUNING     Recipe/script/worker limits belong to their CORE and SHELL leaves.
 * DECISIONS  D1: Keep automation state separate from document history; recording
 *            checkpoints follow image identities through Undo/Redo. Alternative: DOM event
 *            macros, rejected because replay must adapt to different images.
 *            Revisit if: recording expands beyond semantic image operations.
 * LIMITS     Script and batch use explicit commands; filesystem capability varies.
 * TESTBENCH  src/image/image-automation.browser.spec.ts
 * DEMO       npm run dev; Automation menu in Image.
 */
import {imageRecorder,type ImageRecordingState} from './image-recorder.ts';
import {imageRecipe} from './image-recipe.ts';
import {createImageReplay} from './image-replay-client.ts';
import {fileAccess,type FilePorts} from '../shared/file-access.ts';
import {imageActionsDialog} from './image-actions-dialog.ts';
import {createRecipeScript} from './image-recipe-script.ts';
import type {DialogSpec} from '../shared/dialog.ts';
import type {ImageContent} from './image-content.ts';
import type {ImageOperation,ImageRecipe,ImageRecipeAsset} from './image-operation-types.ts';
type Edit={operation:ImageOperation;reference:{width:number;height:number};assets?:readonly ImageRecipeAsset[]};
type Ports={root:HTMLElement;files:FilePorts;read():ImageContent|null;commit(value:ImageContent,label:string):void;preview(value:ImageContent|null):void;dialog(spec:DialogSpec):void;notice(text:string):void;invalidate():void;flush():void;batch(recipe:ImageRecipe):void};
export function createImageAutomation(ports:Ports){
 const document=ports.root.ownerDocument,worker=createImageReplay(),scriptRoot=document.createElement('div');ports.root.append(scriptRoot);const script=createRecipeScript({root:scriptRoot});
 let recording:ImageRecordingState|null=null,recipe:ImageRecipe={format:'gsnv-actions',version:1,name:'My action',steps:[],assets:[],output:'png'},disposed=false,intent=0,clipboardStepId:string|null=null;
 const effectiveClipboardId=()=>recipe.steps.findLast(step=>step.enabled&&step.operation.kind==='clipboard')?.id??null;
 const error=(cause:unknown)=>ports.notice(cause instanceof Error?cause.message:String(cause));
 const status=()=>recording?.status==='recording'?`Recording · ${recipe.steps.length} steps`:recording?.reason??'';
 const change=()=>{ports.invalidate();if(status())ports.notice(status());};
 function stop(){ports.flush();if(recording){recording=imageRecorder({kind:'stop',state:recording});recipe=recording.recipe;recording=null;}clipboardStepId=null;change();}
 function editor(){stop();const original=ports.read();if(!original)return;
   ports.dialog(imageActionsDialog({document,recipe,source:original,onChange(next){intent++;recipe=next;},onPreview(next){ports.preview(null);return worker.run(original,next);},onStop(){worker.cancel();},onApply(next){recipe=next;ports.preview(null);ports.notice('Applying action…');void worker.run(original,next).then(value=>{if(!disposed&&ports.read()===original){ports.commit(value,`Action: ${next.name}`);ports.notice(`Applied ${next.name}.`);}else ports.notice('Image changed; the action was not applied.');}).catch(error);},onClose(){worker.cancel();ports.preview(null);}}));
 }
 async function save(){stop();try{const result=await fileAccess({op:'save',name:`${recipe.name}.gsnv-actions`,mime:'application/octet-stream',bytes:imageRecipe({operation:'encode',value:recipe})},ports.files);if(!('cancelled'in result))ports.notice(result.ok?'Saved editable actions.':result.error.message);}catch(cause){error(cause);}}
 async function open(){stop();const token=++intent;try{const result=await fileAccess({op:'pick',accept:{'application/octet-stream':['.gsnv-actions']}},ports.files);if('cancelled'in result)return;if(!result.ok)throw new Error(result.error.message);if(result.value.file.size>192*1024*1024)throw new Error('Actions files must be at most 192 MiB.');const decoded=imageRecipe({operation:'decode',bytes:new Uint8Array(await result.value.file.arrayBuffer())});if(disposed||token!==intent)return;recipe=decoded;recording=null;ports.notice(`Opened ${recipe.name}; choose Actions to preview or apply.`);change();}catch(cause){error(cause);}}
 function scriptDialog(){intent++;stop();const original=ports.read();if(!original)return;let generated:ImageRecipe|null=null,closed=false,latestSource='';
  const body=document.createElement('div'),buttons=document.createElement('div'),run=document.createElement('button'),halt=document.createElement('button'),report=document.createElement('p');run.type=halt.type='button';run.textContent='Build recipe';halt.textContent='Stop';halt.disabled=true;report.setAttribute('role','status');body.append(buttons,report);buttons.append(run,halt);
  body.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.isComposing||!(event.target instanceof document.defaultView!.HTMLButtonElement))return;event.preventDefault();event.stopPropagation();event.target.click();});
  const wake=()=>body.closest('dialog')?.querySelector('textarea')?.dispatchEvent(new Event('input',{bubbles:true}));
  run.onclick=()=>{const source=latestSource;generated=null;run.disabled=true;halt.disabled=false;report.textContent='Running isolated JavaScript…';wake();void script.run(source,{width:original.width,height:original.height,layerCount:original.layers.length}).then(value=>{if(!closed&&source===latestSource){generated=value;report.textContent=`${value.steps.length} validated steps ready. Use recipe opens Actions for preview.`;}}).catch(cause=>{if(!closed)report.textContent=cause instanceof Error?cause.message:String(cause);}).finally(()=>{if(!closed){run.disabled=false;halt.disabled=true;wake();}});};halt.onclick=()=>script.stop();
  ports.dialog({title:'JavaScript actions',confirmLabel:'Use recipe',previewElement:body,description:'JavaScript runs offline in an isolated worker. It receives image dimensions and builds validated operations, never file access or raw pixels. Use add(ops.adjust({kind:"invert"})), ops.resize(width,height), ops.downpixel(width,height,resize), ops.selectionAll(), ops.layerNew(name), or add a documented operation. Opening does not run code.',fields:[{key:'source',label:'JavaScript recipe',type:'text',multiline:true}],initial:{source:'// Add operations, or return an array of operations.\nadd(ops.adjust({kind: "invert"}));'},validate(v){const text=String(v.source);if(text!==latestSource){latestSource=text;generated=null;if(run.disabled){script.stop();report.textContent='Code changed. Build the recipe again.';}}return generated?{ok:true,value:null}:{ok:false,error:{code:'recipe.script',message:'Choose Build recipe, then review the generated steps in Actions.'}};},preview(){},commit(){closed=true;script.stop();if(generated){recipe=generated;queueMicrotask(editor);}},cancel(){closed=true;script.stop();}});
 }
 return{
  observe(before:ImageContent,after:ImageContent,label:string,operations:readonly Edit[]|null){if(!recording)return;recording=imageRecorder({kind:'observe',state:recording,before,after,label,operations});recipe=recording.recipe;if(recording.status!=='recording')clipboardStepId=null;else if(operations?.some(edit=>edit.operation.kind==='clipboard'))clipboardStepId=effectiveClipboardId();change();},
  navigate(image:ImageContent){if(recording?.status==='recording'){recording=imageRecorder({kind:'navigate',state:recording,image});recipe=recording.recipe;if(recording.status!=='recording')clipboardStepId=null;change();}},
  model(){const has=!!ports.read(),running=recording?.status==='recording';return{id:'automation',label:'Automation',items:[{id:'automation.record',label:'Start recording',enabled:has&&!running},{id:'automation.stop',label:'Stop recording',enabled:running},{id:'automation.actions',label:'Actions…',enabled:has},{id:'automation.open',label:'Open actions…',enabled:true},{id:'automation.save',label:'Save actions…',enabled:recipe.steps.length>0},{id:'automation.script',label:'JavaScript actions…',enabled:has},{id:'automation.batch',label:'Batch process…',enabled:has&&recipe.steps.some(s=>s.enabled)}].map(item=>({...item,shortcut:''}))};},
  command(id:string){intent++;if(id==='automation.record'){ports.flush();clipboardStepId=null;const image=ports.read();if(image){recording=imageRecorder({kind:'start',image,name:'My action'});recipe=recording.recipe;change();}}else if(id==='automation.stop')stop();else if(id==='automation.actions')editor();else if(id==='automation.save')void save();else if(id==='automation.open')void open();else if(id==='automation.script')scriptDialog();else if(id==='automation.batch'){stop();ports.batch(recipe);}},
  status,
  canReplayClipboard(){return recording?.status==='recording'&&clipboardStepId!==null&&effectiveClipboardId()===clipboardStepId;},
  dispose(){intent++;disposed=true;worker.dispose();script.dispose();scriptRoot.remove();recording=null;clipboardStepId=null;}
 };
}
