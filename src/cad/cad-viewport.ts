/**
 * PURPOSE    Render the current CAD view.
 * KIND       SHELL
 * CONTRACT   IN: live host, C50 content, S04 view, solved entities, selection, preview
 *            and optional C54 mesh. OUT: update/fit/point/hit/dispose, stable SVG/GL roots.
 *            RAISES: TypeError for invalid host; unavailable WebGL displays an error.
 * GUARANTEES No document mutation, network requests or geometry kernel substitutes.
 * TUNING     PIXELS_PER_MM=4; SKETCH_MARGIN=70; solid material and grid colors below.
 * DECISIONS  D1: Lazy WebGL creation preserves sketch editing without GPU support.
 *            Alternative: initialize both renderers immediately. Revisit if: load measurements justify it.
 * LIMITS     C50 subset, one solid; full selection/display modes remain in C29/C30.
 * TESTBENCH  src/cad/cad-viewport.test.ts -- run with: node --import tsx --test src/cad/cad-viewport.test.ts
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CADContent, SketchEntity, Sketch } from './editable-cad-content.ts';
import type { SolidPreview } from './extrude-preview.ts';
import type { View2D } from '../shared/view-transform.ts';
import type { LinearEntity } from './sketch-linear-primitives.ts';
type Drawn = LinearEntity|SketchEntity;
export type CADView = {content:CADContent|null;sketch?:Sketch|undefined;context?:readonly Drawn[];entities:readonly Drawn[];view:View2D;selected:string[];preview:readonly Drawn[];solid:SolidPreview|null;mode:'sketch'|'solid';state:'under'|'fully'|'error'};
type Handle={update(model:CADView):void;fit():void;point(point:{x:number;y:number}):[number,number];hit(point:{x:number;y:number}):string|null;dispose():void};
export function cadViewport(host:HTMLElement):Handle {
  if(!host?.ownerDocument)throw new TypeError('CAD viewport needs a live DOM host.');
  const document=host.ownerDocument, ns='http://www.w3.org/2000/svg', PIXELS_PER_MM=4, SKETCH_MARGIN=70;
  const svg=document.createElementNS(ns,'svg'),stage=document.createElement('div'),notice=document.createElement('p');
  svg.classList.add('cad-sketch');svg.setAttribute('aria-label','XY sketch');stage.className='cad-solid';notice.className='cad-viewport-notice';
  host.append(svg,stage,notice);
  let model:CADView|undefined,disposed=false,renderer:THREE.WebGLRenderer|null=null,controls:OrbitControls|null=null;
  let mesh:THREE.Mesh|null=null,edges:THREE.LineSegments|null=null,lastSolid:SolidPreview|null=null;
  let scale=PIXELS_PER_MM,origin:{x:number;y:number}|null=null;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#dfe6ef');
  const camera=new THREE.OrthographicCamera(-150,150,100,-100,0.01,1e8);camera.up.set(0,0,1);
  scene.add(new THREE.AmbientLight(0xffffff,1.6));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(100,-200,350);scene.add(light);
  const size=()=>({width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)});
  const base=()=>origin??{x:SKETCH_MARGIN,y:size().height-SKETCH_MARGIN};
  const screen=(p:readonly[number,number])=>({x:(base().x+p[0]*scale)*(model?.view.zoom??1)+(model?.view.pan.x??0),y:(base().y-p[1]*scale)*(model?.view.zoom??1)+(model?.view.pan.y??0)});
  function element(tag:string,attrs:Record<string,string|number>={},text?:string){const node=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;}
  function drawSketch(){
    if(!model)return;
    const focused=document.activeElement,focusKey=focused&&svg.contains(focused)?focused.getAttribute('data-entity-id')??focused.getAttribute('data-dimension-id'):null;
    svg.replaceChildren();const {width,height}=size();svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const step=10**Math.ceil(Math.log10(24/(scale*model.view.zoom))),zero=screen([0,0]),pitch=step*scale*model.view.zoom;
    for(let x=((zero.x%pitch)+pitch)%pitch;x<width;x+=pitch)svg.append(element('line',{x1:x,y1:0,x2:x,y2:height,stroke:'#dfe5ee'}));
    for(let y=((zero.y%pitch)+pitch)%pitch;y<height;y+=pitch)svg.append(element('line',{x1:0,y1:y,x2:width,y2:y,stroke:'#dfe5ee'}));
    svg.append(element('line',{x1:0,y1:zero.y,x2:width,y2:zero.y,stroke:'#d79a9a'}),element('line',{x1:zero.x,y1:0,x2:zero.x,y2:height,stroke:'#8fbf9a'}));
    const color=model.state==='error'?'#c50f0f':model.state==='fully'?'#1c7a1c':'#0b3fb5';
    // When a cut sketch is active, the base outline is shown faintly for reference (not selectable).
    for(const entity of model.context??[]){
      if(entity.kind==='segment'){const a=screen(entity.a),b=screen(entity.b);svg.append(element('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#a9b4c2','stroke-dasharray':'3 3','pointer-events':'none'}));}
      else if(entity.kind==='circle'){const c=screen(entity.center);svg.append(element('circle',{cx:c.x,cy:c.y,r:entity.radius*scale*model.view.zoom,fill:'none',stroke:'#a9b4c2','stroke-dasharray':'3 3','pointer-events':'none'}));}
    }
    for(const entity of [...model.entities,...model.preview])if(entity.kind==='segment'){
      const a=screen(entity.a),b=screen(entity.b),selected=model.selected.includes(entity.id),preview=model.preview.includes(entity);
      const group=element('g',{'data-entity-id':entity.id,'data-selected':String(selected)});
      if(!preview){group.setAttribute('role','button');group.setAttribute('data-view-geometry','');group.setAttribute('tabindex','0');group.setAttribute('aria-pressed',String(selected));group.setAttribute('aria-label',`Line ${model.entities.indexOf(entity)+1}. Enter selects; Ctrl+Enter adds or removes selection.`);}
      const attrs={x1:a.x,y1:a.y,x2:b.x,y2:b.y};group.append(element('line',{...attrs,stroke:'transparent','stroke-width':14}));
      group.append(element('line',{...attrs,stroke:selected?'#ff7a00':color,'stroke-width':selected?3:2,'stroke-dasharray':preview?'5 4':'none','pointer-events':'none'}));
      for(const p of [a,b])group.append(element('circle',{cx:p.x,cy:p.y,r:3,fill:'#fff',stroke:color,'pointer-events':'none'}));svg.append(group);
    }else if(entity.kind==='circle'){
      const c=screen(entity.center),r=entity.radius*scale*model.view.zoom,selected=model.selected.includes(entity.id),preview=model.preview.includes(entity);
      const group=element('g',{'data-entity-id':entity.id,'data-selected':String(selected)});
      if(!preview){group.setAttribute('role','button');group.setAttribute('data-view-geometry','');group.setAttribute('tabindex','0');group.setAttribute('aria-pressed',String(selected));group.setAttribute('aria-label',`Circle ${model.entities.indexOf(entity)+1}. Enter selects; Ctrl+Enter adds or removes selection.`);}
      group.append(element('circle',{cx:c.x,cy:c.y,r,fill:'none',stroke:'transparent','stroke-width':14}));
      group.append(element('circle',{cx:c.x,cy:c.y,r,fill:'none',stroke:selected?'#ff7a00':color,'stroke-width':selected?3:2,'stroke-dasharray':preview?'5 4':'none','pointer-events':'none'}));
      group.append(element('path',{d:`M${c.x-4} ${c.y}h8M${c.x} ${c.y-4}v8`,stroke:color,'pointer-events':'none'}));svg.append(group);
    }
    const sketch=model.sketch??model.content?.graph.features[0].definition.sketch;
    for(const c of sketch?.constraints??[]){
      const e=model.entities.find(e=>e.id===c.entityIds[0]);if(!e||e.kind==='point')continue;
      if(e.kind==='circle'){const p=screen(e.center);svg.append(element('text',{x:p.x+6,y:p.y-6,fill:color,'font-size':11},'⌖'));continue;}
      const a=screen(e.a),b=screen(e.b);svg.append(element('text',{x:(a.x+b.x)/2+7,y:(a.y+b.y)/2-7,fill:color,'font-size':11},c.kind==='horizontal'?'H':c.kind==='vertical'?'V':'⌖'));
    }
    for(const d of sketch?.dimensions??[]){
      const e=model.entities.find(e=>e.id===d.entityIds[0]);if(!e||e.kind==='point')continue;
      const measured=e.kind==='circle'?e.radius*2:Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]);
      const display=`${+(measured/(model.content?.units==='inch'?25.4:1)).toPrecision(8)}${model.content?.units==='inch'?' in':''}`;
      if(e.kind==='circle'){
        const p=screen([e.center[0]+e.radius*Math.SQRT1_2,e.center[1]+e.radius*Math.SQRT1_2]);
        svg.append(element('text',{'data-dimension-id':d.id,role:'button',tabindex:0,'aria-label':`Edit dimension ${d.value.source}`,x:p.x+6,y:p.y-6,fill:'#000','font-size':13,class:'cad-dimension'},`⌀ ${display}`));continue;
      }
      const a=screen(e.a),b=screen(e.b),horizontal=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y);
      svg.append(element('text',{'data-dimension-id':d.id,role:'button',tabindex:0,'aria-label':`Edit dimension ${d.value.source}`,x:(a.x+b.x)/2+(horizontal?0:20),y:(a.y+b.y)/2+(horizontal?23:0),fill:'#000','font-size':13,'text-anchor':'middle',class:'cad-dimension'},display));
    }
    if(focusKey){const replacement=[...svg.querySelectorAll<SVGElement>('[data-entity-id],[data-dimension-id]')].find(node=>node.getAttribute('data-entity-id')===focusKey||node.getAttribute('data-dimension-id')===focusKey);(replacement??host).focus();}
  }
  function clearSolid(){
    if(mesh){scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh=null;}
    if(edges){scene.remove(edges);edges.geometry.dispose();(edges.material as THREE.Material).dispose();edges=null;}lastSolid=null;
  }
  function drawSolid(){if(renderer&&!disposed)renderer.render(scene,camera);}
  function resize(){
    if(disposed)return;drawSketch();if(renderer){const {width,height}=size();renderer.setSize(width,height);const half=camera.top;camera.left=-half*width/height;camera.right=-camera.left;camera.updateProjectionMatrix();drawSolid();}
  }
  function startGL(){
    if(renderer)return true;
    try{
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(document.defaultView?.devicePixelRatio??1,2));renderer.domElement.setAttribute('aria-label','CAD solid viewport');stage.append(renderer.domElement);
      controls=new OrbitControls(camera,renderer.domElement);controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};controls.zoomToCursor=true;controls.enableDamping=false;controls.addEventListener('change',drawSolid);resize();return true;
    }catch(cause){notice.textContent=`3D view unavailable: ${cause instanceof Error?cause.message:String(cause)}. Sketch editing remains available.`;renderer?.dispose();renderer=null;return false;}
  }
  function fit(){
    if(model?.mode==='solid'&&mesh&&controls){
      const bounds=new THREE.Box3().setFromObject(mesh),center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3());
      const radius=Math.max(extent.length(),1),{width,height}=size();camera.top=radius*.65*Math.max(1,height/width);camera.bottom=-camera.top;camera.zoom=1;camera.position.copy(center).add(new THREE.Vector3(radius,-radius,radius*.85));controls.target.copy(center);controls.update();resize();
    }else if(model){
      const points=model.entities.flatMap(e=>e.kind==='segment'?[e.a,e.b]:e.kind==='circle'?[[e.center[0]-e.radius,e.center[1]-e.radius] as const,[e.center[0]+e.radius,e.center[1]+e.radius] as const]:[e.p]);if(!points.length)return;
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),{width,height}=size();
      scale=Math.max(.001,Math.min((width-100)/Math.max(1,maxX-minX),(height-100)/Math.max(1,maxY-minY)))/model.view.zoom;
      origin={x:(width/2-model.view.pan.x)/model.view.zoom-(maxX+minX)/2*scale,y:(height/2-model.view.pan.y)/model.view.zoom+(maxY+minY)/2*scale};drawSketch();
    }
  }
  const Resize=document.defaultView?.ResizeObserver,observer=Resize?new Resize(resize):null;observer?.observe(host);
  return{
    update(value){
      if(disposed)return;model=value;svg.style.display=value.mode==='sketch'?'block':'none';stage.hidden=value.mode!=='solid';notice.textContent='';
      if(value.mode==='sketch'){drawSketch();return;}
      if(!startGL())return;
      if(value.solid!==lastSolid){clearSolid();if(value.solid){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(value.solid.positions,3));geometry.setIndex(new THREE.BufferAttribute(value.solid.indices,1));geometry.computeVertexNormals();
        mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xa8bfd6,metalness:.08,roughness:.6}));scene.add(mesh);
        edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x1d3b5c}));scene.add(edges);lastSolid=value.solid;fit();
      }}
      if(!value.solid)notice.textContent='No solid to display. Create a closed sketch, then extrude it.';drawSolid();
    },fit,
    point(p){const zoom=model?.view.zoom??1,pan=model?.view.pan??{x:0,y:0};return[((p.x-pan.x)/zoom-base().x)/scale,(base().y-(p.y-pan.y)/zoom)/scale];},
    hit(p){const rect=host.getBoundingClientRect(),target=document.elementFromPoint?.(rect.left+p.x,rect.top+p.y);return target&&host.contains(target)?target.closest('[data-entity-id]')?.getAttribute('data-entity-id')??null:null;},
    dispose(){if(disposed)return;disposed=true;observer?.disconnect();controls?.dispose();clearSolid();renderer?.dispose();renderer?.forceContextLoss();host.replaceChildren();},
  };
}
