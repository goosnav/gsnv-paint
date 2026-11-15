import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageDownpixelDialog } from './image-downpixel-dialog.ts';
test('PU-09 block size derives nearest logical resolution and rejects enlargement',()=>{
 const spec=imageDownpixelDialog({width:100,height:60,preview(){},commit(){},cancel(){}});
 const a=spec.validate({...spec.initial,block:4});assert.equal(a.ok,true);if(a.ok)assert.deepEqual(a.value,{width:25,height:15,resize:false});
 const b=spec.validate({...spec.initial,method:'dimensions',width:200,height:60});assert.equal(b.ok,false);
 const c=spec.validate({...spec.initial,method:'dimensions',width:20,height:50,keep:true,resize:true});assert.equal(c.ok,true);if(c.ok)assert.deepEqual(c.value,{width:20,height:12,resize:true});
});
test('PU-09 cancel and commit forward only validated values',()=>{
 let preview:any,commit:any,cancel=0;const spec=imageDownpixelDialog({width:32,height:32,preview:v=>preview=v,commit:v=>commit=v,cancel:()=>cancel++});
 const r=spec.validate(spec.initial);assert.equal(r.ok,true);if(r.ok){spec.preview(r.value);spec.commit(r.value);}spec.cancel();assert.deepEqual(preview,commit);assert.equal(cancel,1);
});
