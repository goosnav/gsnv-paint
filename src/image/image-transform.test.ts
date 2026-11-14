import test from 'node:test';
import assert from 'node:assert/strict';
import { imageTransform } from './image-transform.ts';
const box = { x:10,y:20,width:100,height:50,angle:0 };
const drag=(handle:string,dx:number,dy:number,extra={})=>imageTransform({op:'drag',box,handle,start:{x:0,y:0},end:{x:dx,y:dy},...extra});
test('resize anchors opposite corner and constrains proportions on Shift',()=>{
 assert.deepEqual(drag('se',100,50),{x:10,y:20,width:200,height:100,angle:0});
 assert.deepEqual(drag('nw',-100,-50),{x:-90,y:-30,width:200,height:100,angle:0});
 assert.deepEqual(drag('e',50,0),{x:10,y:20,width:150,height:50,angle:0});
 assert.deepEqual(drag('se',100,0,{shift:true}),{x:10,y:20,width:200,height:100,angle:0});
 assert.equal(drag('nw',1000,1000).width,1);
});
test('move and rotated resize operate in image coordinates',()=>{
 assert.deepEqual(drag('move',30,-10),{...box,x:40,y:10});
 const rotated=imageTransform({op:'drag',box:{...box,angle:90},handle:'e',start:{x:0,y:0},end:{x:0,y:50}});
 assert.equal(rotated.width,150); assert.ok(Math.abs(rotated.x+15)<1e-8); assert.equal(rotated.y,45);
});
test('rotation snaps and invalid or excessive allocations are rejected',()=>{
 const rotated=imageTransform({op:'drag',box,handle:'rotate',start:{x:60,y:-20},end:{x:125,y:45},shift:true});assert.equal(rotated.angle,90);
 assert.throws(()=>imageTransform({op:'validate',box:{...box,width:0}}),/positive/i);
 assert.throws(()=>imageTransform({op:'validate',box:{...box,width:50000,height:50000}}),/limit/i);
 assert.throws(()=>drag('unknown',1,1),/handle/i);
 assert.throws(()=>drag('move',NaN,1),/finite/i);
 assert.throws(()=>imageTransform({op:'validate',box:{} as typeof box}),/finite/i);
});
