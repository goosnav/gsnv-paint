/** C77 illustration; assertions and fault injection live in the testbench. */
import { kernelFixture } from './kernel-test-fixture.ts';
import { buildKernelProfileFace } from './kernel-profile-face.ts';

const { session, library } = await kernelFixture();
const result = buildKernelProfileFace({ session, region: {
  outer: { kind: 'polygon', points: [[0, 0], [100, 0], [100, 60], [0, 60]] },
  holes: [{ kind: 'circle', center: [20, 30], radius: 5 }],
} });
if (!result.ok) throw new Error(result.reason);
const properties = new library.GProp_GProps();
library.BRepGProp.SurfaceProperties(result.face, properties, true, false);
console.log(JSON.stringify({ areaMm2: properties.Mass(), faceOwnership: 'caller; no retained session token' }, null, 2));
properties.delete();
result.face.delete();
