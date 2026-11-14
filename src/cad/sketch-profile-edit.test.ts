import test from 'node:test';
import assert from 'node:assert/strict';
import { manageSketchProfiles } from './sketch-profile-edit.ts';
import { materializeSketchProfile, type ProfileSource } from './sketch-profile-source.ts';
const length=(source:string)=>({source,kind:'length' as const});
const profile:ProfileSource={id:'r',kind:'center-rectangle',entityIds:['a','b','c','d'],center:[length('10'),length('10')],width:length('30'),height:length('20'),construction:false};
const context={units:'mm' as const,variables:{}},tolerance={linearMm:1e-7,angularRad:1e-9,relative:1e-9};
type Sketch={name:string;entities:ReturnType<typeof materializeSketchProfile>['entities'];constraints:{entityIds:string[];position?:{entityIds:string[]}}[];dimensions:{entityIds:string[]}[];profiles:ProfileSource[]};
const fresh=():Sketch=>({name:'unchanged',entities:[],constraints:[],dimensions:[],profiles:[]});
const run=(sketch:Sketch,action?:Parameters<typeof manageSketchProfiles>[0]['action'],usedIds:string[]=[])=>manageSketchProfiles({sketch,...(action?{action}:{}),usedIds,context,tolerance});
test('C73 add/edit/detach/remove are owned and preserve center, identities and unrelated content',()=>{
  const original=fresh(),a=run(original,{kind:'add-profile',profile});assert.deepEqual(original,fresh());assert.equal(a.entities.length,4);assert.equal(a.name,'unchanged');
  const b=run(a,{kind:'edit-profile',profile:{...profile,width:length('40')}});assert.deepEqual(b.entities[0]!.a,[-10,0]);assert.deepEqual(a.entities[0]!.a,[-5,0]);
  const detached=run(b,{kind:'detach-profile',id:'r'});assert.deepEqual(detached.profiles,[]);assert.deepEqual(detached.entities,b.entities);assert.notEqual(detached.entities,b.entities);
  const deleted=run(b,{kind:'remove-profile',id:'r'});assert.deepEqual(deleted.entities,[]);assert.deepEqual(deleted.profiles,[]);
  b.profiles[0]!.center[0].source='999';assert.equal(profile.center[0].source,'10');
});
test('C73 construction toggles complete groups and free members, rejecting partial or foreign IDs atomically',()=>{
  const a=run(fresh(),{kind:'add-profile',profile}),before=structuredClone(a);
  const b=run(a,{kind:'construction',ids:['a','b','c','d'],enabled:true});assert.ok(b.entities.every(e=>e.construction));assert.ok(b.profiles[0]!.construction);
  for(const ids of [[],['a'],['a','b','c','d','missing'],['a','a','b','c','d']])assert.throws(()=>run(a,{kind:'construction',ids,enabled:true}),{name:'SketchProfileEditError'});
  const free=run(a,{kind:'detach-profile',id:'r'});assert.equal(run(free,{kind:'construction',ids:['a'],enabled:true}).entities.filter(e=>e.construction).length,1);assert.deepEqual(a,before);
});
test('C73 validates membership/overlap/references and never repairs an invalid original collection',()=>{
  const a=run(fresh(),{kind:'add-profile',profile});
  const bad:Sketch[]=[{...a,profiles:[profile,profile]},{...a,entities:a.entities.slice(1)},
    {...a,entities:a.entities.map(e=>({...e,construction:true}))},{...a,constraints:[{entityIds:['a']}]},{...a,dimensions:[{entityIds:['b']}]},
    {...a,constraints:[{entityIds:['free'],position:{entityIds:['c']}}]}];
  for(const sketch of bad){const before=structuredClone(sketch);assert.throws(()=>run(sketch),{name:'SketchProfileEditError'});assert.throws(()=>run(sketch,{kind:'remove-profile',id:'r'}));assert.deepEqual(sketch,before);}
  for(const usedIds of [['r'],['b']])assert.throws(()=>run(fresh(),{kind:'add-profile',profile},usedIds),{name:'SketchProfileEditError'});
  assert.throws(()=>run(a,{kind:'add-profile',profile}),/ID|exist|used/i);
  assert.throws(()=>run(a,{kind:'edit-profile',profile:{...profile,entityIds:['d','c','b','a']}}),/member/i);
  for(const kind of ['edit-profile','detach-profile','remove-profile'] as const)assert.throws(()=>run(fresh(),kind==='edit-profile'?{kind,profile}:{kind,id:'r'}),/exist/i);
});
test('C73 detach materializes current expressions while read validation preserves original seeds',()=>{
  const a=run(fresh(),{kind:'add-profile',profile});const source=a.profiles[0]!;if(source.kind!=='center-rectangle')throw Error('rectangle');source.width=length('50');
  assert.deepEqual(run(a).entities[0]!.a,[-5,0]);assert.deepEqual(run(a,{kind:'detach-profile',id:'r'}).entities[0]!.a,[-15,0]);
});
