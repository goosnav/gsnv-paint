/** C61 illustrative mapping; correctness is gated by the sibling testbench. */
import {makeCircularEntities} from './sketch-circular-primitives.ts';
import {sketchGeometryProgram} from './sketch-geometry-program.ts';
const tolerance={linearMm:1e-7,angularRad:1e-9,relative:1e-10};
const entities=[
  ...makeCircularEntities({tool:'circle',anchors:[[0,0],[10,0]],construction:false,ids:['circle'],tolerance}),
  ...makeCircularEntities({tool:'arc-center-point',anchors:[[30,0],[40,0],[30,-10]],construction:false,ids:['clockwise'],tolerance}),
];
console.log(JSON.stringify(sketchGeometryProgram({entities,reservedIds:['future-dimension'],tolerance}),null,2));
