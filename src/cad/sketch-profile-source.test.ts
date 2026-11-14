import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeSketchProfile, type ProfileSource } from './sketch-profile-source.ts';
import { evaluateVariables } from './named-variables.ts';
const length=(source:string)=>({source,kind:'length' as const});
const tolerance={linearMm:1e-7,angularRad:1e-9,relative:1e-9};
const context=evaluateVariables({variables:[{name:'width',expression:length('30')}],units:'mm'}).context;
const rectangle:ProfileSource={id:'r',kind:'center-rectangle',entityIds:['a','b','c','d'],center:[length('10'),length('10')],width:length('width'),height:length('20'),construction:false};
const run=(profile:ProfileSource)=>materializeSketchProfile({profile,context,tolerance});
test('C71 rectangle literal bounds retain the exact center after a driving width changes',()=>{
  const before=structuredClone(rectangle),output=run(rectangle);
  assert.deepEqual(output.entities.map(e=>e.a),[[-5,0],[25,0],[25,20],[-5,20]]);assert.deepEqual(output.fixedEntityIds,['a','b','c','d']);
  const changed=materializeSketchProfile({profile:rectangle,context:evaluateVariables({variables:[{name:'width',expression:length('40')}],units:'mm'}).context,tolerance});
  assert.deepEqual(changed.entities.map(e=>e.a),[[-10,0],[30,0],[30,20],[-10,20]]);assert.deepEqual(rectangle,before);
  output.entities[0]!.a[0]=999;output.fixedEntityIds.pop();assert.deepEqual(rectangle,before);assert.deepEqual(run(rectangle).entities[0]!.a,[-5,0]);
});
test('C71 regular polygon preserves winding, radius, rotation and construction with analytic area',()=>{
  const p:ProfileSource={id:'p',kind:'regular-polygon',sides:6,entityIds:['a','b','c','d','e','f'],center:[length('2'),length('-3')],radius:length('10'),rotation:{source:'90 deg',kind:'angle'},construction:true};
  const result=run(p),vertices=result.entities.map(e=>e.a);
  assert.ok(Math.hypot(vertices[0]![0]-2,vertices[0]![1]-7)<1e-10);
  for(const [i,e]of result.entities.entries()){assert.ok(e.construction);assert.deepEqual(e.b,result.entities[(i+1)%6]!.a);assert.ok(Math.abs(Math.hypot(e.a[0]-2,e.a[1]+3)-10)<1e-10);}
  const area=vertices.reduce((s,a,i)=>{const b=vertices[(i+1)%6]!;return s+a[0]*b[1]-a[1]*b[0];},0)/2;assert.ok(Math.abs(area-150*Math.sqrt(3))<1e-10);
});
test('C71 rejects malformed sources, mismatched IDs, limits, dimensions and numerical collapse',()=>{
  const polygon={id:'p',kind:'regular-polygon',sides:3,entityIds:['a','b','c'],center:[length('0'),length('0')],radius:length('10'),rotation:{source:'0',kind:'angle'},construction:false};
  const bad:unknown[]=[null,{}, {...rectangle,extra:true},{...rectangle,kind:'ellipse'},{...rectangle,id:' '},{...rectangle,construction:'false'},
    {...rectangle,entityIds:['a','b','c','c']},{...rectangle,entityIds:['a']},{...rectangle,center:[length('0')]},{...rectangle,center:[{source:'1',kind:'angle'},length('0')]},
    {...rectangle,width:length('0')},{...rectangle,height:length('-1')},{...rectangle,width:length('1e-8')},{...rectangle,width:{source:'20',kind:'scalar'}},
    {...rectangle,width:{source:'20',kind:'length',unknown:true}},{...rectangle,center:[length('1e30 mm'),length('0')]},
    ...[0,2,3.5,129,NaN].map(sides=>({...polygon,sides})),{...polygon,radius:length('0')},{...polygon,rotation:{source:'1',kind:'length'}}];
  for(const profile of bad)assert.throws(()=>run(profile as ProfileSource),JSON.stringify(profile));
  const getters={...rectangle};Object.defineProperty(getters,'id',{get(){throw Error('getter executed');},enumerable:true});assert.throws(()=>run(getters),{name:'SketchProfileSourceError'});
  assert.throws(()=>run({...rectangle,width:length('missing')}),/missing|unknown/i);
});
