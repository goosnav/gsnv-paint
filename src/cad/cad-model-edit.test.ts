import test from 'node:test';
import assert from 'node:assert/strict';
import { editCADModel, type ModelAction } from './cad-model-edit.ts';
import { editableCADContent } from './editable-cad-content.ts';
import { editLegacySketch } from './cad-legacy-sketch-edit.ts';
import { cadExpressionPolicy } from './cad-expression-policy.ts';
import { manageSketchProfiles } from './sketch-profile-edit.ts';
test('C76 model actions own data, preserve revision and retain all parameter sources through units',()=>{
  const original=editableCADContent({operation:'new'});let content=original;
  const edit=(action:ModelAction)=>{content=editCADModel({content,action});assert.equal(content.graph.revision,0);assert.equal(content.graph.rollback,content.graph.features.length);};
  edit({kind:'variable',name:'width',source:'40'});content=editLegacySketch({content,action:{kind:'rectangle',prefix:'r',width:'width',height:'20'}});
  edit({kind:'extrude',id:'boss',depth:'10'});edit({kind:'plane',plane:'YZ'});edit({kind:'add-cut',id:'cut'});edit({kind:'cut-extent',id:'cut',depth:'3'});
  edit({kind:'edge-feature',id:'f',feature:'fillet',edges:'vertical',size:'1'});edit({kind:'edge-feature',id:'f',feature:'fillet',edges:'top',size:'2'});
  const before=structuredClone(content);edit({kind:'units',units:'inch'});edit({kind:'units',units:'mm'});assert.equal(content.graph.features[0].definition.sketch.dimensions[0]!.value.source,'width');
  assert.throws(()=>edit({kind:'remove-variable',name:'width'}));assert.deepEqual(original,editableCADContent({operation:'new'}));assert.equal(before.units,'mm');
  edit({kind:'remove-feature',id:'f'});edit({kind:'remove-feature',id:'cut'});edit({kind:'remove-extrude'});assert.equal(content.graph.features.length,1);
  edit({kind:'variable',name:'unused',source:'2',dimensionKind:'scalar'});edit({kind:'remove-variable',name:'unused'});
});
test('C76 inventories profile expressions for physical unit binding and dependent-variable validation',()=>{
  let content=editCADModel({content:editableCADContent({operation:'new'}),action:{kind:'variable',name:'radius',source:'10'}}),sketch=content.graph.features[0].definition.sketch;
  Object.assign(sketch,manageSketchProfiles({sketch,usedIds:['sketch-1'],context:cadExpressionPolicy({units:content.units,variables:content.variables,linearMm:content.tolerance.linearMm}).context,tolerance:content.tolerance,action:{kind:'add-profile',profile:{id:'p',kind:'regular-polygon',sides:3,entityIds:['a','b','c'],center:[{source:'4',kind:'length'},{source:'-2',kind:'length'}],radius:{source:'radius',kind:'length'},rotation:{source:'30',kind:'angle'},construction:false}}}));
  const before=structuredClone(content);assert.throws(()=>editCADModel({content,action:{kind:'remove-variable',name:'radius'}}),/radius/);assert.throws(()=>editCADModel({content,action:{kind:'variable',name:'radius',source:'0'}}));assert.deepEqual(content,before);
  content=editCADModel({content,action:{kind:'units',units:'inch'}});const p=content.graph.features[0].definition.sketch.profiles![0]!;assert.equal(p.kind,'regular-polygon');assert.match(p.center[0].source,/mm/);
});
