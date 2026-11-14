/**
 * PURPOSE    Render editable CAD properties.
 * KIND       SHELL
 * CONTRACT   IN: live host, model status/content/selection, edit callback.
 *            OUT: update/dispose; feature tree, dimension edits, constraint removal,
 *            measurements and visible failures. Buttons request typed source dialogs.
 *            RAISES: TypeError for invalid host/callback.
 * GUARANTEES User strings stay text; no model calculations or native handles.
 * TUNING     None; property presentation styles live in cad-workspace.css.
 * DECISIONS  D1: Open transaction dialogs for dimensions. Alternative: committing each
 *            keystroke would flood history. Revisit if: inline transactions are implemented.
 * LIMITS     C50 subset only; caller owns validation, live previews and commits.
 * TESTBENCH  src/cad/cad-properties.test.ts -- run with: node --import tsx --test src/cad/cad-properties.test.ts
 */
import { bossOf, laterOf, type CADContent } from './editable-cad-content.ts';
import { cadExpressionPolicy } from './cad-expression-policy.ts';
const NAMES: Record<string, string> = { horizontal: 'Horizontal', vertical: 'Vertical', fix: 'Fixed point', parallel: 'Parallel', perpendicular: 'Perpendicular', equal: 'Equal length', coincident: 'Coincident' };
import type { CADBuild } from './cad-worker-client.ts';
export type CADProperties = { content:CADContent|null;activeSketch?:string;selected:string[];state:'idle'|'busy'|'ready'|'error';message:string;result:CADBuild|null };
export type PropertyEdit = {command:string;id?:string};
export function cadProperties(ports:{root:HTMLElement;onEdit(edit:PropertyEdit):void}):{update(model:CADProperties):void;dispose():void}{
 const {root,onEdit}=ports;if(!root?.ownerDocument||typeof onEdit!=='function')throw new TypeError('CAD properties need a host and edit callback.');
 const document=root.ownerDocument;let disposed=false;
 const node=(tag:string,text?:string)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
 const button=(label:string,edit:PropertyEdit,enabled=true)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=!enabled;b.onclick=()=>{if(!disposed)onEdit(edit);};return b;};
 return{
  update(model){
   if(disposed)return;root.replaceChildren();root.className='cad-properties';
   const status=node('p',model.message);status.className='cad-build-status';status.dataset.state=model.state;status.setAttribute('role','status');root.append(status);
   if(!model.content){root.append(node('p','Choose New (Ctrl+N) to start a part. Draw a closed sketch, then extrude it.'));return;}
   const {content}=model,active=laterOf(content).find(f=>f.id===model.activeSketch&&f.kind==='pocket'),sketch=active&&active.kind==='pocket'?active.definition.sketch:content.graph.features[0].definition.sketch,boss=bossOf(content);
   const display=(source:string,suffix=false)=>{try{const value=cadExpressionPolicy({units:content.units,variables:content.variables,linearMm:content.tolerance.linearMm,parameters:[{expression:{source,kind:'length'}}]}).values[0]!/(content.units==='inch'?25.4:1);return `${+value.toPrecision(8)}${content.units==='inch'?' in':suffix?' mm':''}`;}catch{return source;}};
   const units=node('div');units.className='cad-units';units.append(node('span','Units '));
   for(const u of ['mm','inch'] as const){const b=button(u==='mm'?'Metric (mm)':'Imperial (in)',{command:`cad.units.${u}`});b.setAttribute('aria-pressed',String(content.units===u));units.append(b);}root.append(units);
   const planes=node('div');planes.className='cad-units';planes.append(node('span','Sketch plane '));for(const plane of ['XY','XZ','YZ']){const b=button(plane,{command:`cad.plane.${plane}`});b.setAttribute('aria-pressed',String(plane===sketch.plane));planes.append(b);}root.append(planes);
   root.append(node('h3','Variables'),button('Add variable…',{command:'cad.addVariable'}));
   for(const variable of content.variables){const row=node('div');row.className='cad-constraint';row.append(button(`${variable.name} = ${variable.expression.source}`,{command:'cad.editVariable',id:variable.name}),button(`Delete ${variable.name}`,{command:'cad.removeVariable',id:variable.name}));root.append(row);}
   root.append(node('h3','Feature tree'));
   const tree=node('ol');tree.className='cad-feature-tree';
   for(const f of content.graph.features){
    const item=node('li'),failed=model.state==='error'&&(model.message.startsWith(f.name)||(model.message.startsWith('Extrude')&&f.kind==='extrude')||(model.message.startsWith('Sketch')&&f.kind==='sketch'));
    item.dataset.featureId=f.id;item.dataset.failed=String(failed);
    const current=f.kind==='sketch'?!active:f.id===model.activeSketch;
    if(f.kind==='sketch'){const b=button(`${failed?'! ':''}${f.name}`,{command:'cad.editSketch',id:f.id});b.setAttribute('aria-pressed',String(current));item.append(b,node('small',`${f.definition.sketch.plane} plane`));}
    else if(f.kind==='extrude')item.append(button(`${failed?'! ':''}${f.name}`,{command:'cad.extrude'}),node('small',display(f.definition.extent.distance.source,true)));
    else if(f.kind==='pocket'){const b=button(`${failed?'! ':''}${f.name}`,{command:'cad.editSketch',id:f.id});b.setAttribute('aria-pressed',String(current));item.append(b,button('Depth…',{command:'cad.cutDepth',id:f.id}),button('Delete',{command:'cad.removeFeature',id:f.id}),node('small',f.definition.extent.kind==='through'?'Through all':`Depth ${display(f.definition.extent.distance.source,true)}`));}
    else item.append(button(`${failed?'! ':''}${f.name}`,{command:'cad.editEdges',id:f.id}),button('Delete',{command:'cad.removeFeature',id:f.id}),node('small',`${f.kind==='fillet'?'Radius':'Distance'} ${display(f.definition.size.source,true)} · ${f.definition.edges} edges`));
    tree.append(item);
   }root.append(tree);
   const add=node('div');add.className='cad-add';add.append(button(boss?'Edit extrusion…':'Extrude…',{command:'cad.extrude'},content.graph.features[0].definition.sketch.entities.length>0),button('Cut…',{command:'cad.addCut'},!!boss),button('Fillet…',{command:'cad.fillet'},!!boss),button('Chamfer…',{command:'cad.chamfer'},!!boss));root.append(add);
   root.append(node('h3','Profiles'));
   for(const profile of sketch.profiles??[]){
    const row=node('div');row.className='cad-profile';const label=profile.kind==='center-rectangle'?`Centered rectangle · ${display(profile.width.source)} × ${display(profile.height.source)}`:`${profile.sides}-sided polygon · radius ${display(profile.radius.source)}`;
    const edit=button(`${label}${profile.construction?' · construction':''}`,{command:'cad.editProfile',id:profile.id});edit.dataset.profileId=profile.id;edit.title=`Center: ${profile.center.map(v=>v.source).join(', ')}`;
    row.append(edit,button('Detach profile',{command:'cad.detachProfile',id:profile.id}),button(profile.construction?'Make solid profile':'Make construction',{command:'cad.profileConstruction',id:profile.id}),button('Delete profile',{command:'cad.removeProfile',id:profile.id}));root.append(row);
   }
   root.append(node('h3',active?`Dimensions (${active.name})`:'Dimensions'));
   if(!sketch.dimensions.length)root.append(node('p',sketch.profiles?.length?'Edit profile dimensions using the profile buttons above.':active?'Draw circles or rectangles to cut. Circle dimensions and Rectangle dimensions place exact shapes.':'Use Rectangle dimensions or Circle dimensions to create a driven profile.'));
   for(const d of sketch.dimensions){const b=button(`${d.kind==='diameter'?'Diameter':d.id.endsWith('width')?'Width':d.id.endsWith('height')?'Height':'Length'}: ${display(d.value.source)}`,{command:'cad.dimension',id:d.id});b.dataset.editId=d.id;b.title=`Expression: ${d.value.source}`;root.append(b);}
   for(const c of sketch.constraints){if(!c.position)continue;const position=c.position,entity=sketch.entities.find(e=>e.id===c.entityIds[0]),label=entity?.kind==='circle'?'Circle center':position.entityIds.length===4?'Rectangle origin':'Fixed point';const b=button(`${label}: ${display(position.x.source)}, ${display(position.y.source)}`,{command:'cad.editPosition',id:c.id});b.dataset.positionId=c.id;b.title=`X: ${position.x.source}; Y: ${position.y.source}`;root.append(b);}
   const picked=model.selected.map(id=>sketch.entities.find(e=>e.id===id)).filter(Boolean),lines=picked.filter(e=>e!.kind==='segment').length;
   const controlled=(sketch.profiles??[]).some(p=>p.entityIds.some(id=>model.selected.includes(id))),free=!controlled;
   root.append(node('h3',model.selected.length?`Selection (${model.selected.length})`:'Selection · Ctrl-click to pick two'));
   const relate=node('div');relate.className='cad-relations';
   relate.append(button('Horizontal',{command:'cad.horizontal'},free&&picked.length===1&&lines===1),button('Vertical',{command:'cad.vertical'},free&&picked.length===1&&lines===1),
    button('Parallel',{command:'cad.parallel'},free&&picked.length===2&&lines===2),button('Perpendicular',{command:'cad.perpendicular'},free&&picked.length===2&&lines===2),button('Equal',{command:'cad.equal'},free&&picked.length===2&&lines===2),
    button('Coincident',{command:'cad.coincident'},free&&picked.length===2),button('Delete selected',{command:'edit.delete'},free&&model.selected.length>0));root.append(relate);
   if(free&&picked.length)root.append(button(picked.every(e=>e!.construction)?'Use selected as profile':'Make selected construction',{command:'cad.construction'}));
   if(controlled)root.append(node('p','Edit the profile parameters above, or detach it before changing individual edges.'));
   const constraints=sketch.constraints.filter(c=>c.entityIds.some(id=>model.selected.includes(id)));
   for(const c of constraints){const label=NAMES[c.kind]??c.kind,row=node('div');row.className='cad-constraint';row.append(node('span',`${label}${c.inferred?' · automatic':''}`));const b=button('Remove',{command:'cad.removeConstraint',id:c.id});b.dataset.removeConstraint=c.id;b.setAttribute('aria-label',`Remove ${c.kind} constraint ${c.id}`);row.append(b);root.append(row);}
   if(model.result){root.append(node('h3','Inspection'));const r=model.result;root.append(node('p',r.dof===0?'Fully defined sketch':`Under-defined sketch · ${r.dof} degrees of freedom`));
    if(r.solid){const dl=node('dl');for(const[label,value]of[['Volume',`${r.solid.volume.toFixed(3)} mm³`],['Surface area',`${r.solid.area.toFixed(3)} mm²`],['Center of mass',`${r.solid.center.map(n=>n.toFixed(3)).join(', ')} mm`]]){dl.append(node('dt',label),node('dd',value));}root.append(dl);}
   }
  },dispose(){if(disposed)return;disposed=true;root.replaceChildren();},
 };
}
