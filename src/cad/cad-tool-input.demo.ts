import {cadToolInput,type CADToolState} from './cad-tool-input.ts';
let state:CADToolState={tool:'line',anchor:null,cursor:null,selected:[]};
for(const point of [[0,0],[20,30]] as [number,number][]){const result=cadToolInput({state,event:{kind:'click',point,hit:null,ctrl:false,shift:false},endpoints:[],tolerance:.01});state=result.state;console.log(result);}
