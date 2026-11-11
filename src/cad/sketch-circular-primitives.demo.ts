/** C08 illustrative geometry; automated assertions live in the sibling testbench. */
import {makeCircularEntities,type CircularRequest} from './sketch-circular-primitives.ts';
const base={construction:false,tolerance:{linearMm:1e-7,angularRad:1e-9,relative:1e-10}};
const cases:CircularRequest[]=[
  {...base,tool:'circle',anchors:[[0,0],[10,0]],ids:['circle']},
  {...base,tool:'arc-three-point',anchors:[[0,0],[10,10],[20,0]],ids:['arc']},
  {...base,tool:'arc-tangent',anchors:[[0,0],[10,10]],tangent:[1,0],ids:['tangent']},
  {...base,tool:'arc-center-point',anchors:[[0,0],[10,0],[-10,0],[0,10]],ids:['major-arc']},
  {...base,tool:'slot',anchors:[[0,0],[20,0]],widthMm:8,ids:['side-a','cap-b','side-b','cap-a']},
];
for(const input of cases)console.log(JSON.stringify({tool:input.tool,entities:makeCircularEntities(input)},null,2));
