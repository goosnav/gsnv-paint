import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLinearEntities, type LinearEntity } from './sketch-linear-primitives.ts';
import { linearProfile } from './linear-profile.ts';
const tol={linearMm:1e-7,angularRad:1e-9,relative:1e-9};
const rect=(w=100,h=60)=>makeLinearEntities({tool:'corner-rectangle',anchors:[[0,0],[w,h]],ids:['a','b','c','d'],construction:false,tolerance:tol});
const profile=(entities:LinearEntity[])=>linearProfile({entities,tolerance:tol.linearMm});
test('C53 golden rectangle and reordered/reversed boundaries preserve area',()=>{
 assert.deepEqual(profile(rect()),[[0,0],[100,0],[100,60],[0,60]]);
 for(let w=1;w<=40;w++) {const edges=rect(w,60); const points=profile([edges[2]!,edges[0]!,edges[3]!,edges[1]!].map(e=>e.kind==='segment'?{...e,a:e.b,b:e.a}:e));
 const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length]!;return sum+p[0]*q[1]-q[0]*p[1];},0)/2; assert.equal(area,w*60);}
});
test('C53 open, duplicate, disconnected and self-intersecting profiles are readable errors',()=>{
 const errors=[[],rect().slice(0,3),[...rect(),rect()[0]!],[...rect(),...rect(2,2).map(e=>e.kind==='segment'?{...e,a:[e.a[0]+200,e.a[1]] as const,b:[e.b[0]+200,e.b[1]] as const}:e)]];
 for(const entities of errors)assert.throws(()=>profile(entities),{name:'ProfileError'});
 const points:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[10,10],[0,10],[10,0]];
 assert.throws(()=>profile(points.map((p,i)=>({id:String(i),kind:'segment',construction:false,a:p,b:points[(i+1)%4]!}))),/cross|intersect/);
 assert.deepEqual(profile([...rect(),{id:'construction',kind:'segment',a:[300,300],b:[400,400],construction:true}]),profile(rect()));
 assert.throws(()=>profile([{id:'zero',kind:'segment',a:[0,0],b:[0,0],construction:false}]),/collapsed/);
});
