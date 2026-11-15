import test from 'node:test';import assert from 'node:assert/strict';
import {imageOutput} from './image-output.ts';
test('PU-07 full colour retains bytes, strict output applies palette after opacity/blend composition',()=>{
 const raster={width:2,height:1,data:new Uint8ClampedArray([127,127,127,255,40,90,120,100])};
 assert.deepEqual(imageOutput(raster,{mode:'pixel-art',palette:null}).data,raster.data);
 assert.deepEqual([...imageOutput(raster,{mode:'pixel-art',palette:{colours:[[0,0,0],[255,255,255]],dither:'none'}}).data],[0,0,0,255,0,0,0,0]);
 assert.deepEqual([...raster.data],[127,127,127,255,40,90,120,100]);
});
