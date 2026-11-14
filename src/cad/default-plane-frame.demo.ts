import { defaultPlaneFrame } from './default-plane-frame.ts';
for(const plane of ['XY','XZ','YZ'] as const)console.log(plane,defaultPlaneFrame(plane));
