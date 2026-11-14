import test from 'node:test';
import assert from 'node:assert/strict';
import { editableCADContent } from './editable-cad-content.ts';
import { materializeSketchProfile, type ProfileSource } from './sketch-profile-source.ts';
const length=(source:string)=>({source,kind:'length' as const});
const profile:ProfileSource={id:'r',kind:'center-rectangle',entityIds:['a','b','c','d'],center:[length('10'),length('10')],width:length('30'),height:length('20'),construction:false};
function source(){const c=editableCADContent({operation:'new'}),s=c.graph.features[0].definition.sketch;Object.assign(s,{profiles:[structuredClone(profile)],entities:materializeSketchProfile({profile,context:{units:'mm',variables:{}},tolerance:c.tolerance}).entities});return c;}
test('C50 optional profile sources own their data and reject foreign or conflicting references',()=>{
  const content=source(),decoded=editableCADContent({operation:'read',value:content});assert.deepEqual(decoded,content);assert.notEqual(decoded,content);
  const bad=(change:(s:any)=>void)=>{const c=source();change(c.graph.features[0].definition.sketch);assert.throws(()=>editableCADContent({operation:'read',value:c}),{name:'CADContentError'});};
  bad(s=>s.profiles=null);bad(s=>s.profiles.push(s.profiles[0]));bad(s=>s.profiles[0].id='sketch-1');bad(s=>s.entities.pop());bad(s=>s.profiles[0].entityIds[0]='missing');
  bad(s=>s.profiles[0].center[0]=length('missing'));bad(s=>s.profiles[0].width=length('0'));bad(s=>s.entities[0].construction=true);
  bad(s=>s.constraints.push({id:'fixed',kind:'fix',entityIds:['a'],pointRoles:['a'],inferred:false}));
  bad(s=>s.dimensions.push({id:'dim',kind:'linear',entityIds:['a'],anchors:[[0,0],[1,0]],label:[0,0],value:length('2')}));
  const legacy=editableCADContent({operation:'new'});assert.deepEqual(editableCADContent({operation:'read',value:legacy}),legacy);assert.ok(!Object.hasOwn(legacy.graph.features[0].definition.sketch,'profiles'));
});
