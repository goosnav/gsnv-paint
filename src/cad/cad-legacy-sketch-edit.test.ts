import test from 'node:test';
import assert from 'node:assert/strict';
import { editLegacySketch, type LegacySketchAction } from './cad-legacy-sketch-edit.ts';
import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent } from './edit-cad-content.ts';
import { manageSketchProfiles } from './sketch-profile-edit.ts';
test('C75 legacy sketch actions retain sources, own data and leave revision to the router',()=>{
  const original=editableCADContent({operation:'new'});let content=original;
  const edit=(action:LegacySketchAction)=>{content=editLegacySketch({content,action});assert.equal(content.graph.revision,0);};
  edit({kind:'rectangle',prefix:'r',width:'30',height:'20',origin:['10','10']});edit({kind:'dimension',id:'r-width',source:'40'});edit({kind:'edit-position',id:'r-origin',x:'15',y:'5'});
  edit({kind:'circle',prefix:'hole',diameter:'4',center:[20,15]});edit({kind:'line',id:'free',a:[50,0],b:[60,0]});edit({kind:'line',id:'other',a:[50,4],b:[60,4]});
  edit({kind:'constraint',id:'horizontal',entity:'free',axis:'horizontal'});edit({kind:'relation',id:'same',relation:'equal',entities:['free','other']});
  edit({kind:'remove-constraint',id:'horizontal'});edit({kind:'remove',ids:['free','other']});
  assert.equal(content.graph.features[0].definition.sketch.dimensions[0]!.value.source,'40');
  const before=structuredClone(content);assert.throws(()=>edit({kind:'remove',ids:['foreign']}));assert.deepEqual(content,before);
  edit({kind:'clear'});assert.deepEqual(content.graph.features[0].definition.sketch.entities,[]);assert.deepEqual(original,editableCADContent({operation:'new'}));
});
test('C75 target isolation and controlled profiles survive a legacy rectangle replacement',()=>{
  let content=editableCADContent({operation:'new'}),sketch=content.graph.features[0].definition.sketch;
  Object.assign(sketch,manageSketchProfiles({sketch,usedIds:['sketch-1'],context:{units:'mm',variables:{}},tolerance:content.tolerance,action:{kind:'add-profile',profile:{id:'p',kind:'center-rectangle',entityIds:['a','b','c','d'],center:[{source:'50',kind:'length'},{source:'50',kind:'length'}],width:{source:'10',kind:'length'},height:{source:'10',kind:'length'},construction:true}}}));
  const replaced=editLegacySketch({content,action:{kind:'rectangle',prefix:'r',width:'20',height:'10'}});assert.equal(replaced.graph.features[0].definition.sketch.profiles!.length,1);assert.equal(replaced.graph.features[0].definition.sketch.entities.length,8);
  assert.throws(()=>editLegacySketch({content:replaced,action:{kind:'remove',ids:['a']}}),/profile|detach/i);
  content=editCADContent({content:replaced,action:{kind:'extrude',id:'boss',depth:'5'}});content=editCADContent({content,action:{kind:'add-cut',id:'cut'}});const base=structuredClone(content.graph.features[0]);
  const result=editLegacySketch({content,sketch:'cut',action:{kind:'circle',prefix:'cut-hole',diameter:'2',center:[5,5]}});assert.deepEqual(result.graph.features[0],base);assert.equal(result.graph.revision,content.graph.revision);
});
