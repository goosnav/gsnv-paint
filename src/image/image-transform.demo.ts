import { imageTransform } from './image-transform.ts';
console.log(imageTransform({op:'drag',box:{x:10,y:20,width:100,height:50,angle:0},handle:'se',start:{x:110,y:70},end:{x:210,y:120},shift:true}));
