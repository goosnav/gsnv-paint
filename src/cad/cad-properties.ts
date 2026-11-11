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
import type { CADContent } from './editable-cad-content.ts';
import type { CADBuild } from './cad-worker-client.ts';
export type CADProperties = { content:CADContent|null;selected:string[];state:'idle'|'busy'|'ready'|'error';message:string;result:CADBuild|null };
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
   const {content}=model,sketch=content.graph.features[0].definition.sketch;
   root.append(node('h3','Feature tree'));
   const tree=node('ol');tree.className='cad-feature-tree';
   for(const f of content.graph.features){
    const item=node('li'),failed=model.state==='error'&&(model.message.startsWith('Extrude')?f.kind==='extrude':f.kind==='sketch');
    item.dataset.featureId=f.id;item.dataset.failed=String(failed);item.append(button(`${failed?'! ':''}${f.name}`,{command:f.kind==='sketch'?'cad.sketch':'cad.extrude'}));
    item.append(node('small',f.kind==='sketch'?'XY plane':`${f.definition.extent.distance.source} ${content.units}`));tree.append(item);
   }root.append(tree);
   root.append(node('h3','Dimensions'));
   if(!sketch.dimensions.length)root.append(node('p','Use Rectangle dimensions to create a driven profile.'));
   for(const d of sketch.dimensions){const b=button(`${d.id.endsWith('width')?'Width':d.id.endsWith('height')?'Height':'Length'}: ${d.value.source}`,{command:'cad.dimension',id:d.id});b.dataset.editId=d.id;root.append(b);}
   root.append(button(content.graph.features[1]?'Edit extrusion…':'Extrude…',{command:'cad.extrude'},sketch.entities.length>0));
   root.append(node('h3',model.selected.length?`Selection (${model.selected.length})`:'Selection'));
   root.append(button('Horizontal',{command:'cad.horizontal'},model.selected.length===1),button('Vertical',{command:'cad.vertical'},model.selected.length===1),button('Delete selected',{command:'edit.delete'},model.selected.length>0));
   const constraints=sketch.constraints.filter(c=>c.entityIds.some(id=>model.selected.includes(id)));
   for(const c of constraints){const row=node('div');row.className='cad-constraint';row.append(node('span',`${c.kind}${c.inferred?' · inferred':''}`));const b=button('Remove',{command:'cad.removeConstraint',id:c.id});b.dataset.removeConstraint=c.id;b.setAttribute('aria-label',`Remove ${c.kind} constraint ${c.id}`);row.append(b);root.append(row);}
   if(model.result){root.append(node('h3','Inspection'));const r=model.result;root.append(node('p',r.dof===0?'Fully defined sketch':`Under-defined sketch · ${r.dof} degrees of freedom`));
    if(r.solid){const dl=node('dl');for(const[label,value]of[['Volume',`${r.solid.volume.toFixed(3)} mm³`],['Surface area',`${r.solid.area.toFixed(3)} mm²`],['Center of mass',`${r.solid.center.map(n=>n.toFixed(3)).join(', ')} mm`]]){dl.append(node('dt',label),node('dd',value));}root.append(dl);}
   }
  },dispose(){if(disposed)return;disposed=true;root.replaceChildren();},
 };
}
