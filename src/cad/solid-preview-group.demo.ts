import { combineSolidPreviews } from './solid-preview-group.ts';
const solid={positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2]),volume:1,area:3,center:[0,0,0] as [number,number,number]};
console.log(combineSolidPreviews([{id:'body-1',solid},{id:'body-2',solid:{...solid,volume:3,center:[4,0,0]}}]));
