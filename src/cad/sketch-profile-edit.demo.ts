import { manageSketchProfiles } from './sketch-profile-edit.ts';
const sketch={entities:[],constraints:[],dimensions:[]};
console.log(manageSketchProfiles({sketch,usedIds:[],context:{units:'mm',variables:{}},tolerance:{linearMm:1e-7,angularRad:1e-9,relative:1e-9},action:{kind:'add-profile',profile:{id:'r',kind:'center-rectangle',entityIds:['a','b','c','d'],center:[{source:'0',kind:'length'},{source:'0',kind:'length'}],width:{source:'30',kind:'length'},height:{source:'20',kind:'length'},construction:false}}}));
