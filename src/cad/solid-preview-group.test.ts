import test from 'node:test';
import assert from 'node:assert/strict';
import { combineSolidPreviews } from './solid-preview-group.ts';
import type { SolidPreview } from './extrude-preview.ts';
const triangle = (x=0,volume=2):SolidPreview => ({ positions:new Float32Array([x,0,0,x+1,0,0,x,1,0]),indices:new Uint32Array([0,1,2]),volume,area:3,center:[x,0,0] });
test('C67 retains every ordered triangle and exact sum of body measurements', () => {
  const first=triangle(),second=triangle(10,6),bodies=[{id:'one',solid:first},{id:'two',solid:second}],before=structuredClone(bodies);
  const result=combineSolidPreviews(bodies);
  assert.deepEqual([...result.solid.positions],[0,0,0,1,0,0,0,1,0,10,0,0,11,0,0,10,1,0]);
  assert.deepEqual([...result.solid.indices],[0,1,2,3,4,5]);
  assert.equal(result.solid.volume,8);assert.equal(result.solid.area,6);assert.deepEqual(result.solid.center,[7.5,0,0]);
  assert.deepEqual(result.bodies,[{id:'one',volume:2,area:3,center:[0,0,0]},{id:'two',volume:6,area:3,center:[10,0,0]}]);
  result.solid.positions.fill(99);result.solid.indices.fill(0);result.bodies[0]!.center[0]=9;
  assert.deepEqual(bodies,before);
});
test('C67 rejects malformed groups and resource or arithmetic overflow before publication', () => {
  const fail={name:'SolidPreviewError'};
  assert.throws(()=>combineSolidPreviews([]),fail);
  assert.throws(()=>combineSolidPreviews([{id:'',solid:triangle()}]),fail);
  assert.throws(()=>combineSolidPreviews([{id:'same',solid:triangle()},{id:'same',solid:triangle()}]),fail);
  for(const change of [
    (v:SolidPreview)=>v.volume=0,(v:SolidPreview)=>v.volume=NaN,(v:SolidPreview)=>v.area=-1,
    (v:SolidPreview)=>v.center[0]=Infinity,(v:SolidPreview)=>v.positions[0]=NaN,
    (v:SolidPreview)=>v.positions=new Float32Array(4),(v:SolidPreview)=>v.indices=new Uint32Array(2),
    (v:SolidPreview)=>v.indices[0]=3,(v:SolidPreview)=>v.indices=new Uint32Array(),
    (v:SolidPreview)=>v.positions=new Float32Array(15_000_003),
  ]){const v=triangle();change(v);assert.throws(()=>combineSolidPreviews([{id:'one',solid:v}]),fail);}
  assert.throws(()=>combineSolidPreviews([{id:'one',solid:{...triangle(),volume:Number.MAX_VALUE}},{id:'two',solid:{...triangle(),volume:Number.MAX_VALUE}}]),fail);
});
