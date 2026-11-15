/**
 * PURPOSE    Navigate a raster canvas without a wheel using a quiet corner control.
 * KIND       SHELL
 * CONTRACT   IN: DOM root, onZoom/onCenter/onFit ports; update receives canvas,
 *            revision, effective screen placement and viewport size, or null.
 *            OUT: update/dispose; view requests only. RAISES: invalid port TypeError.
 * GUARANTEES No pixel/document writes; thumbnail drag uses pointer capture and
 *            never bubbles into drawing. One scheduled thumbnail redraw per frame.
 *            Zoom stays visible without a document; empty controls are disabled.
 *            Map starts collapsed on phones; the user's subsequent choice is kept.
 * TUNING     Preview 168x88 screen pixels; zoom 1–6400%, +/- factor 1.25.
 * DECISIONS  D1: Native inputs and a collapsible map keep keyboard/touch access.
 *            Alternative: gesture-only navigation; rejected for discoverability.
 *            Revisit if the host provides a shared navigator for other workspaces.
 *            D2: Keep an explanatory disabled panel before Open; hiding it made
 *            zoom undiscoverable. Revisit if the workspace has a dedicated start page.
 * LIMITS     Thumbnail shows the raster canvas; floating overlays stay in the editor.
 * TESTBENCH  src/image/image-navigator.test.ts — node --import tsx --test src/image/image-navigator.test.ts
 */
type State = {image: HTMLCanvasElement; revision: unknown; view: {x:number;y:number;zoom:number}; viewport: {width:number;height:number}};
type Ports = {root: HTMLElement; onZoom(value:number):void; onCenter(point:{x:number;y:number}):void; onFit():void};
export function imageNavigator(ports: Ports) {
  if (!ports.root || [ports.onZoom,ports.onCenter,ports.onFit].some(v => typeof v !== 'function')) throw new TypeError('Navigator requires DOM and view callbacks.');
  const doc = ports.root.ownerDocument, win = doc.defaultView!, cleanups: (()=>void)[] = [];
  const root = doc.createElement('section'); root.className = 'image-navigator'; root.setAttribute('aria-label','Canvas zoom and navigation');
  const details = doc.createElement('details'), summary = doc.createElement('summary'); details.open = !win.matchMedia?.('(max-width: 500px)').matches; summary.textContent = 'Zoom'; summary.title = 'Show or collapse the canvas map'; details.append(summary);
  const map = doc.createElement('button'); map.type = 'button'; map.className = 'navigator-map'; map.setAttribute('aria-label','Pan canvas preview'); map.title = 'Drag to position the view · Arrow keys pan';
  const thumbnail = doc.createElement('canvas'), frame = doc.createElement('span'); thumbnail.width = 168; thumbnail.height = 88; frame.className = 'navigator-frame'; frame.setAttribute('aria-hidden','true'); const empty = doc.createElement('span'); empty.className = 'navigator-empty'; empty.textContent = 'Open or create an image';
  const hint = doc.createElement('p'); hint.className = 'navigator-hint'; hint.textContent = 'Drag map to move view';
  map.append(thumbnail,frame,empty); details.append(map,hint);
  const row = doc.createElement('div'); row.className = 'navigator-controls';
  const button = (name:string,label:string,action:()=>void) => { const b = doc.createElement('button'); b.type='button'; b.className='xp-button'; b.textContent=label; b.title=name; b.setAttribute('aria-label',name); b.addEventListener('click',action); row.append(b); return b; };
  const minus = button('Zoom out','−',()=>state&&ports.onZoom(Math.max(.01,state.view.zoom/1.25)));
  const slider = doc.createElement('input'); slider.type='range'; slider.className='xp-range'; slider.min='0'; slider.max='1000'; slider.step='1'; slider.setAttribute('aria-label','Canvas zoom'); row.append(slider);
  const plus = button('Zoom in','+',()=>state&&ports.onZoom(Math.min(64,state.view.zoom*1.25)));
  const percent = doc.createElement('input'); percent.type='number'; percent.className='xp-field'; percent.min='1'; percent.max='6400'; percent.step='1'; percent.setAttribute('aria-label','Zoom percent');
  const lower = doc.createElement('div'); lower.className='navigator-values'; lower.append(percent,doc.createTextNode('%'));
  const fit = button('Fit image','Fit',()=>state&&ports.onFit()); lower.append(fit); root.append(details,row,lower); ports.root.append(root);
  let state:State|null=null, previousRevision:unknown, previousImage:HTMLCanvasElement|undefined, raf=0, disposed=false, pointer:number|null=null;
  let imageBox={x:0,y:0,width:168,height:88};
  const listen = (node:HTMLElement,type:string,handler:(event:any)=>void,options?:AddEventListenerOptions) => {node.addEventListener(type,handler,options);cleanups.push(()=>node.removeEventListener(type,handler,options));};
  const center = () => state ? {x:(state.viewport.width/2-state.view.x)/state.view.zoom,y:(state.viewport.height/2-state.view.y)/state.view.zoom} : {x:0,y:0};
  function move(event:PointerEvent) {
    if(!state)return; const box=map.getBoundingClientRect();
    ports.onCenter({x:Math.max(0,Math.min(1,(event.clientX-box.left-imageBox.x)/imageBox.width))*state.image.width,y:Math.max(0,Math.min(1,(event.clientY-box.top-imageBox.y)/imageBox.height))*state.image.height});
  }
  // This map owns touch movement; prevent the browser's drag gesture from swallowing the next tap.
  listen(map,'touchstart',event=>event.preventDefault(),{passive:false});
  listen(map,'pointerdown',event=>{if(event.button!==0||pointer!==null)return;event.preventDefault();map.focus();pointer=event.pointerId;map.setPointerCapture(pointer!);move(event);});
  listen(map,'pointermove',event=>{if(pointer===event.pointerId)move(event);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(map,type,event=>{if(pointer===event.pointerId){const id=pointer;pointer=null;if(map.hasPointerCapture(id!))map.releasePointerCapture(id!);}});
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','wheel','contextmenu'])listen(root,type,event=>event.stopPropagation());
  listen(map,'keydown',event=>{if(!state)return;const delta:{[key:string]:[number,number]}={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const d=delta[event.key];if(!d)return;event.preventDefault();event.stopPropagation();const c=center();ports.onCenter({x:Math.max(0,Math.min(state.image.width,c.x+d[0]*state.viewport.width/state.view.zoom/10)),y:Math.max(0,Math.min(state.image.height,c.y+d[1]*state.viewport.height/state.view.zoom/10))});});
  listen(slider,'input',()=>state&&ports.onZoom(Number(slider.value)===1000?64:.01*Math.pow(6400,Number(slider.value)/1000)));
  const typed = () => {if(!state)return;const value=Number(percent.value);if(!Number.isFinite(value)||value<1||value>6400){percent.setAttribute('aria-invalid','true');return;}percent.removeAttribute('aria-invalid');ports.onZoom(value/100);};
  listen(percent,'change',typed);listen(percent,'keydown',event=>{if(event.key==='Enter'){event.stopPropagation();typed();}else if(event.key==='Escape'){event.stopPropagation();if(state)percent.value=String(Math.round(state.view.zoom*10000)/100);percent.removeAttribute('aria-invalid');}});
  function update(next:State|null) {
    if(disposed)return;state=next;
    map.disabled=slider.disabled=percent.disabled=fit.disabled=!next;
    frame.hidden=hint.hidden=!next;empty.hidden=!!next;thumbnail.style.visibility=next?'visible':'hidden';
    minus.disabled=!next||next.view.zoom<=.01;plus.disabled=!next||next.view.zoom>=64;
    if(!next){
      if(raf){win.cancelAnimationFrame(raf);raf=0;}
      previousImage=undefined;previousRevision=undefined;
      percent.value='';percent.removeAttribute('aria-invalid');slider.value='0';slider.setAttribute('aria-valuetext','No image open');
      return;
    }
    const {image,view,viewport}=next, k=Math.min(168/image.width,88/image.height);
    imageBox={x:(168-image.width*k)/2,y:(88-image.height*k)/2,width:image.width*k,height:image.height*k};
    const left=Math.max(0,Math.min(image.width,-view.x/view.zoom)),top=Math.max(0,Math.min(image.height,-view.y/view.zoom));
    const right=Math.max(left,Math.min(image.width,(viewport.width-view.x)/view.zoom)),bottom=Math.max(top,Math.min(image.height,(viewport.height-view.y)/view.zoom));
    Object.assign(frame.style,{left:`${imageBox.x+left*k}px`,top:`${imageBox.y+top*k}px`,width:`${(right-left)*k}px`,height:`${(bottom-top)*k}px`});
    if(doc.activeElement!==percent)percent.value=String(Math.round(view.zoom*10000)/100);
    slider.value=String(Math.max(0,Math.min(1000,Math.log(view.zoom/.01)/Math.log(6400)*1000)));slider.setAttribute('aria-valuetext',`${Math.round(view.zoom*100)} percent`);
    if(previousImage!==image||previousRevision!==next.revision){previousImage=image;previousRevision=next.revision;if(!raf)raf=win.requestAnimationFrame(()=>{raf=0;if(disposed||!state)return;const ctx=thumbnail.getContext('2d');ctx?.clearRect(0,0,168,88);ctx?.drawImage(state.image,imageBox.x,imageBox.y,imageBox.width,imageBox.height);});}
  }
  update(null);
  return {update,dispose(){if(disposed)return;disposed=true;if(raf)win.cancelAnimationFrame(raf);cleanups.forEach(fn=>fn());root.remove();state=null;}};
}
