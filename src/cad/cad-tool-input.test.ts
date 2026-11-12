import {test} from 'node:test';import assert from 'node:assert/strict';
import {cadToolInput,type CADToolState} from './cad-tool-input.ts';
const state:CADToolState={tool:'line',anchor:null,cursor:null,selected:[]};
const click=(point:[number,number])=>({kind:'click',point,hit:null,ctrl:false,shift:false} as const);
const run=(s:CADToolState,event:Parameters<typeof cadToolInput>[0]['event'])=>cadToolInput({state:s,event,endpoints:[[0,0],[10,0]],tolerance:.1});
test('C57 two clicks with endpoint snap commit exact geometry and cancel preserves document selection',()=>{
 const first=run(state,click([.05,0]));assert.deepEqual(first,{state:{...state,anchor:[0,0],cursor:[0,0]},intent:{kind:'none'}});
 const second=run(first.state,click([10.04,0]));assert.deepEqual(second.intent,{kind:'line',a:[0,0],b:[10,0]});assert.equal(second.state.anchor,null);
 const cancel=run(first.state,{kind:'cancel'});assert.equal(cancel.state.anchor,null);assert.equal(cancel.intent.kind,'none');assert.equal(state.anchor,null);
 const aligned=run(first.state,{...click([10,2]),shift:true});assert.deepEqual(aligned.intent,{kind:'line',a:[0,0],b:[10,0]});
});
test('C57 rectangle direction, previews and multi-selection are deterministic',()=>{
 let s=run(state,{kind:'tool',tool:'rectangle'}).state;s=run(s,click([20,30])).state;
 const move=run(s,{...click([10,10]),kind:'move'});assert.equal(move.intent.kind,'none');assert.deepEqual(move.state.cursor,[10,10]);
 assert.deepEqual(run(s,click([10,10])).intent,{kind:'rectangle',origin:[10,10],width:10,height:20});
 s=run(s,{kind:'tool',tool:'select'}).state;s=run(s,{...click([0,0]),hit:'a'}).state;s=run(s,{...click([0,0]),hit:'b',ctrl:true}).state;assert.deepEqual(s.selected,['a','b']);
 s=run(s,{...click([0,0]),hit:'a',ctrl:true}).state;assert.deepEqual(s.selected,['b']);
 assert.throws(()=>run(state,click([Infinity,0])),TypeError);
 assert.throws(()=>cadToolInput({state,event:{kind:'cancel'},endpoints:[],tolerance:0}),TypeError);
});
test('C57 circle tool commits center and snapped radius point',()=>{
 let s=run(state,{kind:'tool',tool:'circle'}).state;s=run(s,click([5,5])).state;assert.deepEqual(s.anchor,[5,5]);
 assert.deepEqual(run(s,click([10.05,0])).intent,{kind:'circle',center:[5,5],radius:Math.hypot(5,5)});
 assert.deepEqual(run(s,click([5,9])).intent,{kind:'circle',center:[5,5],radius:4});
});
