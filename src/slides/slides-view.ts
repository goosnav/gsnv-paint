/**
 * PURPOSE    Expose an editable slide canvas through DOM controls.
 * KIND       SHELL
 * CONTRACT   IN: live root and intent callbacks, then validated deck/selected IDs on update.
 *            OUT: update/flush/dispose; one action per completed move/resize, pending inputs flush synchronously.
 *            RAISES: TypeError for invalid host; invalid pending values make flush throw after onError
 *            so shared save cannot silently omit an edit. Event handlers show errors without escaping.
 * GUARANTEES No document mutation; cancelled previews make no edit; property focus survives refresh.
 * TUNING     Typing pause 400 ms; arrow movement 1 logical pixel, Shift 10.
 * DECISIONS  D1: Properties own text input, while canvas elements own selection and movement. Alternative:
 *            contentEditable inside draggable objects conflates caret and drag gestures. Revisit if rich text is added.
 * LIMITS     One selected element; resize uses the bottom-right handle. Rotation remains numeric.
 * TESTBENCH  src/slides/slides-view.test.ts -- run with: node --import tsx --test src/slides/slides-view.test.ts
 */
import { slidesDocument, type SlidesDocument, type SlidesAction } from './slides-document.ts';
import { slidesScene } from './slides-scene.ts';
type Model = { deck: SlidesDocument | null; slideId: string | null; elementId: string | null };
type Request = { root: HTMLElement; onAction(action: SlidesAction): void; onSelect(slideId: string, elementId: string | null): void; onCommand(command: string): void; onError(message: string): void };
const STYLE = `
.slides-stage{position:absolute;inset:0;display:grid;grid-template-rows:auto minmax(0,1fr);background:var(--xp-workspace,#808080)}
.slides-toolbar{display:flex;flex-wrap:wrap;gap:3px;padding:4px;background:var(--xp-face,#ece9d8);border-bottom:1px solid #888}
.slides-toolbar button{font-size:11px}.slides-body{display:grid;grid-template-columns:150px minmax(120px,1fr) 200px;min-height:0}.slides-body>[hidden]{display:none}
.slides-list{margin:0;padding:8px 6px 8px 24px;overflow:auto;background:var(--xp-face,#ece9d8);border-right:1px solid #777}
.slides-list button{width:100%;padding:7px 4px;overflow-wrap:anywhere;text-align:left;margin-bottom:6px;background:#fff;border:1px solid #999;min-height:48px}
.slides-list button[aria-current=true]{outline:2px solid #316ac5;background:#e1ebff}.slides-list small{display:block;max-height:32px;overflow:hidden;color:#555}
.slides-canvas-area{overflow:auto;padding:18px;min-width:0;display:grid;align-content:start;justify-items:center}
.slides-surface{position:relative;box-shadow:2px 3px 5px #0008;flex-shrink:0;touch-action:none}.slides-surface>.slides-scene{transform-origin:top left}
.slides-surface [data-element-id]{cursor:move;user-select:none}.slides-surface [aria-pressed=true]{outline:2px dashed #1850a2;outline-offset:-2px}
.slides-resize{position:absolute;right:0;bottom:0;width:16px;height:16px;background:#fff;border:2px solid #1850a2;cursor:nwse-resize;padding:0}
.slides-properties{padding:8px;overflow:auto;background:var(--xp-face,#ece9d8);border-left:1px solid #777}.slides-properties h3{font-size:12px;margin:6px 0}
.slides-properties label{display:grid;grid-template-columns:62px minmax(0,1fr);gap:5px;align-items:center;margin:5px 0}.slides-properties input,.slides-properties select,.slides-properties textarea{min-width:0;width:100%;box-sizing:border-box}
.slides-properties label:has(textarea){display:block}.slides-properties textarea{margin-top:4px;height:95px;resize:vertical;white-space:pre-wrap}
.slides-empty{padding:20px;color:#fff;text-align:center;grid-column:1/-1}.slides-empty[hidden]{display:none}.slides-stage[hidden]{display:none}
@media(max-width:900px){.slides-body{grid-template-columns:110px minmax(100px,1fr) 170px}.slides-canvas-area{padding:10px}}
`;
export function slidesView({ root, onAction, onSelect, onCommand, onError }: Request): { update(model: Model): void; flush(): void; dispose(): void } {
  if (!root?.ownerDocument?.defaultView || !root.isConnected) throw new TypeError('A live Slides host is required.');
  const doc = root.ownerDocument, win = doc.defaultView!;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = doc.createElement(tag); e.className = cls; e.textContent = text; return e; };
  const stage = node('div','slides-stage'), style = node('style'), toolbar = node('div','slides-toolbar'), body = node('div','slides-body'); style.textContent = STYLE;
  const list = node('ol','slides-list'), area = node('div','slides-canvas-area'), surface = node('div','slides-surface'), properties = node('aside','slides-properties'), empty = node('div','slides-empty');
  list.setAttribute('aria-label','Slides'); properties.setAttribute('aria-label','Slide and element properties'); surface.dataset.slidesSurface = ''; surface.tabIndex = 0;
  empty.append(node('h2','','Create a presentation'), node('p','','Add slides, text, pictures and shapes, then present or export a PDF.'));
  const create = node('button','xp-button','New blank presentation'); create.type = 'button'; create.onclick = () => onCommand('slides.new'); empty.append(create);
  area.append(surface); body.append(list,area,properties,empty); stage.append(style,toolbar,body); root.append(stage);
  for (const [id,label] of [['add','New slide'],['duplicate','Duplicate'],['delete','Delete slide'],['up','Move up'],['down','Move down'],['text','Text'],['image','Picture…'],['rectangle','Rectangle'],['ellipse','Ellipse'],['deleteElement','Delete element'],['front','Bring forward'],['back','Send backward'],['present','Present'],['pdf','Export PDF…']]) {
    const button = node('button','xp-button',label); button.type = 'button'; button.dataset.slidesCommand = `slides.${id}`; button.title = label!;
    button.onclick = () => safe(() => { flush(); onCommand(button.dataset.slidesCommand!); }); toolbar.append(button);
  }
  let model: Model = { deck:null,slideId:null,elementId:null }, scene: HTMLElement | null = null, propertyKey = '', timer = 0, disposed = false;
  type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const controls = new Map<string,Control>(), dirty = new Set<string>();
  type Changes = Extract<SlidesAction,{kind:'element-update'}>['changes'];
  let drag: { id: number; element: string; x: number; y: number; original: { x:number;y:number;width:number;height:number;rotation:number }; resize: boolean; changes: Changes } | null = null;
  const safe = (action: () => void) => { try { action(); } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); } };
  function field(key: string, label: string, type: string, choices?: string[]) {
    const wrap = node('label'), control = node(type === 'textarea' ? 'textarea' : choices ? 'select' : 'input') as Control; control.dataset.field = key; control.setAttribute('aria-label',label);
    if (control.tagName === 'INPUT') { (control as HTMLInputElement).type = type; if (type === 'number') (control as HTMLInputElement).step = 'any'; }
    if (choices) for (const value of choices) (control as HTMLSelectElement).append(Object.assign(node('option','',value),{value}));
    const changed = () => { dirty.add(key); win.clearTimeout(timer); timer = win.setTimeout(() => safe(flush), 400); };
    control.addEventListener('input', changed); control.addEventListener('change', () => { dirty.add(key); safe(flush); });
    wrap.append(node('span','',label),control); properties.append(wrap); controls.set(key,control);
  }
  function flush() {
    win.clearTimeout(timer); timer = 0; if (!model.deck || !model.slideId || !dirty.size) return;
    const pending=[...dirty];
    try {
      const values: Record<string,string|number|boolean> = {};
      for (const key of dirty) {
        const control = controls.get(key)!;
        if (control instanceof win.HTMLInputElement && control.type === 'checkbox') values[key] = control.checked;
        else if (control instanceof win.HTMLInputElement && control.type === 'number') { if (!control.value.trim() || !Number.isFinite(control.valueAsNumber)) throw new Error(`${control.getAttribute('aria-label')} needs a finite number.`); values[key] = control.valueAsNumber; }
        else values[key] = control.value;
      }
      const actions:SlidesAction[]=[];
      if ('slideName' in values) actions.push({kind:'slide-name',id:model.slideId,name:String(values.slideName)});
      if ('background' in values) actions.push({kind:'slide-background',id:model.slideId,color:String(values.background)});
      if ('aspect' in values) actions.push({kind:'canvas',width:960,height:values.aspect === '16:9' ? 540 : 720});
      const changes = Object.fromEntries(Object.entries(values).filter(([key]) => !['slideName','background','aspect'].includes(key))) as Changes;
      if (model.elementId && Object.keys(changes).length) actions.push({kind:'element-update',slide:model.slideId,id:model.elementId,changes});
      let candidate=model.deck;for(const action of actions)candidate=slidesDocument({operation:'edit',value:candidate,action});
      dirty.clear();for(const action of actions)onAction(action);
    } catch (cause) { for(const key of pending)dirty.add(key);onError(cause instanceof Error ? cause.message : String(cause)); throw cause; }
  }
  function fit() {
    if (!scene || !model.deck) return;
    const available = area.clientWidth > 36 ? area.clientWidth - 36 : model.deck.width;
    const scale = Math.min(1, available / model.deck.width); scene.style.transform = `scale(${scale})`;
    surface.style.width = `${model.deck.width * scale}px`; surface.style.height = `${model.deck.height * scale}px`;
  }
  function draw() {
    const active = doc.activeElement as HTMLElement | null, focused = surface.contains(active) ? active?.closest<HTMLElement>('[data-element-id]')?.dataset.elementId : undefined, resizeFocus = active?.hasAttribute('data-resize');
    surface.replaceChildren(); scene = null; const { deck, slideId, elementId } = model; if (!deck || !slideId) return;
    scene = slidesScene(doc,deck,slideId);
    for (const item of scene.querySelectorAll<HTMLElement>('[data-element-id]')) {
      item.tabIndex = 0; item.setAttribute('role','button'); item.setAttribute('aria-pressed',String(item.dataset.elementId === elementId));
      item.setAttribute('aria-label',`${item.dataset.elementKind} ${item.dataset.elementId}. Enter selects; arrows move; Shift moves 10 pixels.`); item.title = 'Select or drag. Double-click text to edit.';
      if (item.dataset.elementId === elementId) { const handle = node('button','slides-resize'); handle.type='button'; handle.dataset.resize=''; handle.setAttribute('aria-label','Resize selected element'); handle.title='Drag to resize; arrow keys resize'; item.append(handle); }
      for (const image of item.querySelectorAll('img')) image.addEventListener('error',() => onError('A stored picture could not be decoded. Replace it with a valid image.'));
    }
    surface.append(scene); fit();
    if (focused) { const item = [...scene.querySelectorAll<HTMLElement>('[data-element-id]')].find(e => e.dataset.elementId === focused); (resizeFocus ? item?.querySelector<HTMLElement>('[data-resize]') : item)?.focus({preventScroll:true}); }
  }
  function update(next: Model) {
    if (disposed) return; const redraw=next.deck!==model.deck||next.slideId!==model.slideId||next.elementId!==model.elementId;
    const active=doc.activeElement as HTMLElement|null,hadFocus=root.contains(active),focusedField=active&&properties.contains(active)?active.dataset.field:undefined;
    if (next.deck !== model.deck && drag) drag = null; model = next;
    const { deck, slideId, elementId } = model, slide = deck?.slides.find(s => s.id === slideId), element = slide?.elements.find(e => e.id === elementId);
    empty.hidden = !!deck; list.hidden = area.hidden = properties.hidden = !deck; toolbar.toggleAttribute('inert', !deck);
    const slideIndex=deck?.slides.findIndex(s=>s.id===slideId)??-1,elementIndex=slide?.elements.findIndex(e=>e.id===elementId)??-1;
    for(const button of toolbar.querySelectorAll<HTMLButtonElement>('[data-slides-command]')){const command=button.dataset.slidesCommand!;button.disabled=!deck||command==='slides.delete'&&deck.slides.length===1||command==='slides.up'&&slideIndex===0||command==='slides.down'&&slideIndex===deck.slides.length-1||command==='slides.deleteElement'&&!element||command==='slides.front'&&(!element||elementIndex===slide!.elements.length-1)||command==='slides.back'&&elementIndex<=0;}
    const listFocus = (doc.activeElement as HTMLElement | null)?.dataset.slideButton; list.replaceChildren();
    for (const [index,s] of (deck?.slides ?? []).entries()) { const li=node('li'), button=node('button','',s.name); button.type='button'; button.dataset.slideButton=s.id; button.setAttribute('aria-label',`${index+1}. ${s.name}`); button.setAttribute('aria-current',String(s.id===slideId)); const first=s.elements.find(e=>e.kind==='text'); if(first?.kind==='text')button.append(node('small','',first.text)); button.onclick=()=>safe(()=>{flush();onSelect(s.id,null);}); li.append(button);list.append(li);if(listFocus===s.id)button.focus({preventScroll:true}); }
    const key = `${slideId}/${elementId}/${element?.kind}`;
    if (key !== propertyKey) { win.clearTimeout(timer); dirty.clear(); controls.clear(); properties.replaceChildren(); propertyKey=key;
      if (slide) { properties.append(node('h3','','Slide')); field('slideName','Slide name','text'); field('background','Background','color'); field('aspect','Aspect ratio','text',['16:9','4:3']); }
      if (element) { properties.append(node('h3','','Selected element')); for(const [key,label]of[['x','X'],['y','Y'],['width','Width'],['height','Height'],['rotation','Rotation']])field(key!,label!,'number');
        if(element.kind==='text'){field('text','Text','textarea');field('fontSize','Font size','number');field('fontFamily','Font','text',['Arial','Georgia','Courier New']);field('color','Text color','color');field('align','Alignment','text',['left','center','right']);field('bold','Bold','checkbox');field('italic','Italic','checkbox');}
        else if(element.kind==='image')field('alt','Picture description','textarea');else{field('fill','Fill','color');field('stroke','Outline','color');field('strokeWidth','Line width','number');}
      } else if(slide)properties.append(node('p','','Select an element to edit its position, size and content.'));
    }
    const values = { ...element, slideName:slide?.name, background:slide?.background, aspect:deck && Math.abs(deck.width/deck.height-4/3)<0.001 ? '4:3' : '16:9' } as Record<string,unknown>;
    for(const [key,control]of controls)if(!dirty.has(key)){if(control instanceof win.HTMLInputElement&&control.type==='checkbox')control.checked=!!values[key];else if(control.value!==String(values[key]??''))control.value=String(values[key]??'');}
    if(redraw)draw();
    if(hadFocus&&doc.activeElement===doc.body)(controls.get(focusedField??'')??surface).focus({preventScroll:true});
  }
  surface.addEventListener('pointerdown',event=>safe(()=>{
    if(event.button!==0||!model.deck||!model.slideId)return;flush();const item=(event.target as HTMLElement).closest<HTMLElement>('[data-element-id]');if(!item){onSelect(model.slideId,null);return;}
    const id=item.dataset.elementId!, e=model.deck.slides.find(s=>s.id===model.slideId)?.elements.find(e=>e.id===id);if(!e)return;
    const resize=!!(event.target as HTMLElement).closest('[data-resize]');onSelect(model.slideId,id);drag={id:event.pointerId,element:id,x:event.clientX,y:event.clientY,original:{x:e.x,y:e.y,width:e.width,height:e.height,rotation:e.rotation},resize,changes:{}};
    const selected=[...surface.querySelectorAll<HTMLElement>('[data-element-id]')].find(e=>e.dataset.elementId===id);(resize?selected?.querySelector<HTMLElement>('[data-resize]'):selected)?.focus({preventScroll:true});
    surface.setPointerCapture?.(event.pointerId);event.preventDefault();
  }));
  const preview=(event:PointerEvent)=>{if(!drag||drag.id!==event.pointerId||!model.deck)return;const scale=surface.getBoundingClientRect().width/model.deck.width||1,dx=(event.clientX-drag.x)/scale,dy=(event.clientY-drag.y)/scale,o=drag.original;
    if(drag.resize){const angle=o.rotation*Math.PI/180;drag.changes={width:Math.max(.1,o.width+dx*Math.cos(angle)+dy*Math.sin(angle)),height:Math.max(.1,o.height-dx*Math.sin(angle)+dy*Math.cos(angle))};}else drag.changes={x:o.x+dx,y:o.y+dy};
    const item=[...surface.querySelectorAll<HTMLElement>('[data-element-id]')].find(e=>e.dataset.elementId===drag!.element);if(item)Object.assign(item.style,drag.resize?{width:`${drag.changes.width}px`,height:`${drag.changes.height}px`}:{left:`${drag.changes.x}px`,top:`${drag.changes.y}px`});event.preventDefault();};
  surface.addEventListener('pointermove',preview);
  const end=(event:PointerEvent)=>safe(()=>{if(!drag||drag.id!==event.pointerId)return;if(event.type==='pointerup')preview(event);const gesture=drag;drag=null;surface.releasePointerCapture?.(event.pointerId);
    if(event.type==='pointerup'&&model.slideId&&Object.entries(gesture.changes).some(([key,value])=>value!==gesture.original[key as keyof typeof gesture.original]))onAction({kind:'element-update',slide:model.slideId,id:gesture.element,changes:gesture.changes});draw();});
  surface.addEventListener('pointerup',end);surface.addEventListener('pointercancel',end);surface.addEventListener('lostpointercapture',end);
  surface.addEventListener('keydown',event=>safe(()=>{if(!model.deck||!model.slideId)return;if(event.key==='Escape'){const id=drag?.id;drag=null;if(id!==undefined)surface.releasePointerCapture?.(id);draw();event.preventDefault();return;}const item=(event.target as HTMLElement).closest<HTMLElement>('[data-element-id]');if(!item)return;
    const id=item.dataset.elementId!,e=model.deck.slides.find(s=>s.id===model.slideId)!.elements.find(e=>e.id===id)!;
    if(['Enter',' '].includes(event.key)){flush();onSelect(model.slideId,id);event.preventDefault();return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&!event.ctrlKey&&!event.metaKey&&!event.altKey){flush();onSelect(model.slideId,id);const step=event.shiftKey?10:1,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0,resize=(event.target as HTMLElement).hasAttribute('data-resize');onAction({kind:'element-update',slide:model.slideId,id,changes:resize?{width:Math.max(.1,e.width+dx),height:Math.max(.1,e.height+dy)}:{x:e.x+dx,y:e.y+dy}});event.preventDefault();}
    if(event.key==='Delete'){flush();onSelect(model.slideId,id);onCommand('slides.deleteElement');event.preventDefault();}
  }));
  surface.addEventListener('dblclick',event=>{if((event.target as HTMLElement).closest('[data-element-kind="text"]'))controls.get('text')?.focus();});
  const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(fit):null;observer?.observe(area);win.addEventListener('resize',fit);
  return {update,flush,dispose(){if(disposed)return;disposed=true;win.clearTimeout(timer);observer?.disconnect();win.removeEventListener('resize',fit);root.replaceChildren();}};
}
