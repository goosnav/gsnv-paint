import {imageOutput} from './image-output.ts';
console.log([...imageOutput({width:1,height:1,data:new Uint8ClampedArray([120,120,120,255])},{mode:'pixel-art',palette:{colours:[[0,0,0],[255,255,255]],dither:'none'}}).data]);
