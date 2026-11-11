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
import type { CADContent } from './editable-cad-content.ts';
import type { SolidPreview } from './extrude-preview.ts';
import type { View2D } from '../shared/view-transform.ts';
import type { LinearEntity } from './sketch-linear-primitives.ts';
export type CADView = {content:CADContent|null;entities:readonly LinearEntity[];view:View2D;selected:string[];preview:readonly LinearEntity[];solid:SolidPreview|null;mode:'sketch'|'solid';state:'under'|'fully'|'error'};
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
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6edf4');
  const camera=new THREE.OrthographicCamera(-150,150,100,-100,0.01,1e8);camera.up.set(0,0,1);
  scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(100,-200,350);scene.add(light);
  const size=()=>({width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)});
  const base=()=>origin??{x:SKETCH_MARGIN,y:size().height-SKETCH_MARGIN};
  const screen=(p:readonly[number,number])=>({x:(base().x+p[0]*scale)*(model?.view.zoom??1)+(model?.view.pan.x??0),y:(base().y-p[1]*scale)*(model?.view.zoom??1)+(model?.view.pan.y??0)});
  function element(tag:string,attrs:Record<string,string|number>={},text?:string){const node=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;}
  function drawSketch(){
    if(!model)return;svg.replaceChildren();const {width,height}=size();svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const step=10**Math.ceil(Math.log10(24/(scale*model.view.zoom))),zero=screen([0,0]),pitch=step*scale*model.view.zoom;
    for(let x=((zero.x%pitch)+pitch)%pitch;x<width;x+=pitch)svg.append(element('line',{x1:x,y1:0,x2:x,y2:height,stroke:'#d7e0e8'}));
    for(let y=((zero.y%pitch)+pitch)%pitch;y<height;y+=pitch)svg.append(element('line',{x1:0,y1:y,x2:width,y2:y,stroke:'#d7e0e8'}));
    svg.append(element('line',{x1:0,y1:zero.y,x2:width,y2:zero.y,stroke:'#bd9898'}),element('line',{x1:zero.x,y1:0,x2:zero.x,y2:height,stroke:'#91af9c'}));
    const color=model.state==='error'?'#b83c32':model.state==='fully'?'#237448':'#2364a8';
    for(const entity of [...model.entities,...model.preview])if(entity.kind==='segment'){
      const a=screen(entity.a),b=screen(entity.b),selected=model.selected.includes(entity.id),preview=model.preview.includes(entity);
      const group=element('g',{'data-entity-id':entity.id,'data-selected':String(selected)});
      const attrs={x1:a.x,y1:a.y,x2:b.x,y2:b.y};group.append(element('line',{...attrs,stroke:'transparent','stroke-width':14}));
      group.append(element('line',{...attrs,stroke:selected?'#d97413':color,'stroke-width':selected?3:2,'stroke-dasharray':preview?'5 4':'none','pointer-events':'none'}));
      for(const p of [a,b])group.append(element('circle',{cx:p.x,cy:p.y,r:3,fill:'#fff',stroke:color,'pointer-events':'none'}));svg.append(group);
    }
    const sketch=model.content?.graph.features[0].definition.sketch;
    for(const c of sketch?.constraints??[]){
      const e=model.entities.find(e=>e.id===c.entityIds[0]);if(!e||e.kind!=='segment')continue;
      const a=screen(e.a),b=screen(e.b);svg.append(element('text',{x:(a.x+b.x)/2+7,y:(a.y+b.y)/2-7,fill:color,'font-size':11},c.kind==='horizontal'?'H':c.kind==='vertical'?'V':'⌖'));
    }
    for(const d of sketch?.dimensions??[]){
      const e=model.entities.find(e=>e.id===d.entityIds[0]);if(!e||e.kind!=='segment')continue;
      const a=screen(e.a),b=screen(e.b),horizontal=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y);
      svg.append(element('text',{'data-dimension-id':d.id,role:'button',tabindex:0,'aria-label':`Edit dimension ${d.value.source}`,x:(a.x+b.x)/2+(horizontal?0:20),y:(a.y+b.y)/2+(horizontal?23:0),fill:'#23384f','font-size':13,'text-anchor':'middle',class:'cad-dimension'},d.value.source));
    }
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
      const points=model.entities.flatMap(e=>e.kind==='segment'?[e.a,e.b]:[e.p]);if(!points.length)return;
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
        mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x9ebbd3,metalness:.08,roughness:.64}));scene.add(mesh);
        edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x344c64}));scene.add(edges);lastSolid=value.solid;fit();
      }}
      if(!value.solid)notice.textContent='No solid to display. Create a closed sketch, then extrude it.';drawSolid();
    },fit,
    point(p){const zoom=model?.view.zoom??1,pan=model?.view.pan??{x:0,y:0};return[((p.x-pan.x)/zoom-base().x)/scale,(base().y-(p.y-pan.y)/zoom)/scale];},
    hit(p){const rect=host.getBoundingClientRect(),target=document.elementFromPoint?.(rect.left+p.x,rect.top+p.y);return target&&host.contains(target)?target.closest('[data-entity-id]')?.getAttribute('data-entity-id')??null:null;},
    dispose(){if(disposed)return;disposed=true;observer?.disconnect();controls?.dispose();clearSolid();renderer?.dispose();renderer?.forceContextLoss();host.replaceChildren();},
  };
}
