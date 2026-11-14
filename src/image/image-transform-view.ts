/**
 * PURPOSE    Provide on-canvas controls for a raster selection transform.
 * KIND       SHELL
 * CONTRACT   IN: DOM root and lifecycle callbacks; update supplies oriented image
 *            bounds, active state and effective view. OUT: update/dispose and validated
 *            geometry callbacks. RAISES: callback/geometry failures go to onError.
 * GUARANTEES Pointer/touch capture never reaches paint; cancelled drags restore
 *            their starting bounds. DOM controls never write pixels or history.
 * TUNING     Screen-size handles are styled by image-workspace.css; Shift constrains.
 * DECISIONS  D1: Geometry belongs to image-transform, rendering to this adapter.
 *            Alternative: mutate raster on every pointer event; rejected for quality.
 *            Revisit if a non-raster transform surface is introduced.
 * LIMITS     On-screen handles can be outside the viewport; Fit/typed values remain available.
 * TESTBENCH  src/image/image-transform-view.test.ts — node --import tsx --test src/image/image-transform-view.test.ts
 */
import { imageTransform, type TransformBox } from './image-transform.ts';
type State={box:TransformBox;active:boolean;view:{x:number;y:number;zoom:number}};
type Ports={root:HTMLElement;onBegin():void;onChange(box:TransformBox):void;onApply():void;onCancel():void;onError(cause:unknown):void};
export function imageTransformView(ports:Ports){
 const doc=ports.root.ownerDocument,box=doc.createElement('div'),bar=doc.createElement('form');box.className='image-transform-box';bar.className='image-transform-controls';bar.setAttribute('aria-label','Free transform');box.hidden=bar.hidden=true;ports.root.append(box,bar);
 let state:State|null=null,drag:{id:number;target:HTMLElement;box:TransformBox;start:{x:number;y:number};handle:string}|null=null,disposed=false;
 const listeners:(()=>void)[]=[],fields=new Map<keyof TransformBox,HTMLInputElement>();
 const listen=(node:HTMLElement,type:string,fn:(event:any)=>void)=>{node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));};
 const safely=(action:()=>void)=>{try{action();}catch(cause){ports.onError(cause);}};
 const point=(event:PointerEvent)=>{const bounds=ports.root.getBoundingClientRect(),v=state!.view;return{x:(event.clientX-bounds.left-v.x)/v.zoom,y:(event.clientY-bounds.top-v.y)/v.zoom};};
 const handles:Record<string,string>={move:'Move selection',nw:'Resize top left',n:'Resize top',ne:'Resize top right',e:'Resize right',se:'Resize bottom right',s:'Resize bottom',sw:'Resize bottom left',w:'Resize left',rotate:'Rotate selection'};
 for(const [id,label] of Object.entries(handles)){const button=doc.createElement('button');button.type='button';button.dataset.transformHandle=id;button.setAttribute('aria-label',label);button.title=`${label} · Shift constrains`;box.append(button);
  listen(button,'pointerdown',event=>{if(!state||event.button!==0||drag)return;event.preventDefault();event.stopPropagation();const before={...state.box},start=point(event);safely(()=>{ports.onBegin();drag={id:event.pointerId,target:button,box:before,start,handle:id};button.setPointerCapture(event.pointerId);button.focus();});});
 }
 const keep=doc.createElement('input');keep.type='checkbox';keep.setAttribute('aria-label','Keep transform proportions');
 for(const [key,label] of Object.entries({x:'X',y:'Y',width:'W',height:'H',angle:'°'}) as [keyof TransformBox,string][]){const wrap=doc.createElement('label'),input=doc.createElement('input');wrap.textContent=label;input.type='number';input.step=key==='angle'?'1':'1';if(key==='width'||key==='height')input.min='1';input.setAttribute('aria-label',`Transform ${key}`);fields.set(key,input);wrap.append(input);bar.append(wrap);
  listen(input,'change',()=>safely(()=>{if(!state?.active)return;const value=Number(input.value);if(!input.value.trim())throw new Error('Enter a transform value.');const next={...state.box,[key]:value};if(keep.checked&&(key==='width'||key==='height')){const factor=value/state.box[key];next.width=state.box.width*factor;next.height=state.box.height*factor;}const checked=imageTransform({op:'validate',box:next});ports.onBegin();ports.onChange(checked);}));
 }
 function flush(){
  if(!state?.active)return;const next={...state.box};for(const [key,input] of fields){if(!input.value.trim())throw new Error('Enter a transform value.');next[key]=Number(input.value);}ports.onChange(imageTransform({op:'validate',box:next}));
 }
 const apply=()=>{flush();ports.onApply();};
 const keepLabel=doc.createElement('label');keepLabel.append(keep,doc.createTextNode('Link'));bar.append(keepLabel);
 for(const [label,callback] of [['Apply transform',apply],['Cancel transform',ports.onCancel]] as const){const button=doc.createElement('button');button.type='button';button.textContent=label.split(' ')[0]!;button.setAttribute('aria-label',label);listen(button,'click',()=>safely(callback));bar.append(button);}
 listen(bar,'submit',event=>{event.preventDefault();safely(apply);});
 listen(box,'pointermove',event=>{if(!drag||drag.id!==event.pointerId||!state)return;safely(()=>ports.onChange(imageTransform({op:'drag',box:drag!.box,start:drag!.start,end:point(event),handle:drag!.handle,shift:event.shiftKey,keep:keep.checked})));});
 const finish=(event:PointerEvent)=>{if(!drag||event.pointerId!==drag.id)return;const previous=drag;drag=null;if(event.type==='pointercancel')safely(()=>ports.onChange(previous.box));if(previous.target.hasPointerCapture(previous.id))previous.target.releasePointerCapture(previous.id);};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(box,type,finish);
 for(const root of [box,bar]){
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','wheel','contextmenu'])listen(root,type,event=>event.stopPropagation());
  listen(root,'keydown',event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();safely(ports.onCancel);}else if(event.key==='Enter'&&!(event.target instanceof doc.defaultView!.HTMLButtonElement)){event.stopPropagation();event.preventDefault();(doc.activeElement as HTMLElement)?.blur();safely(apply);}});
 }
 function update(next:State|null){
  if(disposed)return;state=next;box.hidden=!next;bar.hidden=!next?.active;
  if(!next){if(drag){const previous=drag;drag=null;if(previous.target.hasPointerCapture(previous.id))previous.target.releasePointerCapture(previous.id);}return;}
  const b=next.box,v=next.view;box.dataset.active=String(next.active);box.dataset.compact=String(!next.active&&(b.width*v.zoom<48||b.height*v.zoom<48));Object.assign(box.style,{left:`${v.x+(b.x+b.width/2)*v.zoom}px`,top:`${v.y+(b.y+b.height/2)*v.zoom}px`,width:`${b.width*v.zoom}px`,height:`${b.height*v.zoom}px`,transform:`translate(-50%,-50%) rotate(${b.angle}deg)`});
  for(const [key,input] of fields)if(doc.activeElement!==input)input.value=String(Math.round(b[key]*100)/100);
 }
 return{update,flush,dispose(){if(disposed)return;update(null);disposed=true;listeners.forEach(fn=>fn());box.remove();bar.remove();}};
}
