import { makeLinearEntities } from './sketch-linear-primitives.ts';

const tolerance = { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-10 };
const plate = makeLinearEntities({ tool: 'corner-rectangle', anchors: [[0, 0], [100, 60]],
  ids: ['bottom', 'right', 'top', 'left'], construction: false, tolerance });
const pocket = makeLinearEntities({ tool: 'center-rectangle', anchors: [[50, 30], [60, 40]],
  ids: ['pocket-bottom', 'pocket-right', 'pocket-top', 'pocket-left'], construction: false, tolerance });
console.log(JSON.stringify({ plate, pocket }, null, 2));
