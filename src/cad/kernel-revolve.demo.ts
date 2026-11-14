/** C78 illustration, not a connected editor or an acceptance test. */
import { kernelFixture } from './kernel-test-fixture.ts';
import { revolveRecipe } from './revolve-recipe.ts';
import { buildRevolvedSolid } from './kernel-revolve.ts';

const f = await kernelFixture();
const recipe = revolveRecipe({
  operation: 'profile', sketchId: 'section',
  source: { kind: 'revolve', operation: 'boss', sketchId: 'section', profileLoopIds: [], targetBodyIds: [],
    axis: { kind: 'sketch-axis', sketchId: 'section', axis: 'v' }, angle: { source: '-90 deg', kind: 'angle' } },
  entities: [{ id: 'circle', kind: 'circle', center: [20, 6], radius: 3, construction: false }],
  context: { units: 'mm', variables: {} }, tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 },
});
const token = buildRevolvedSolid({ session: f.session, recipe });
const { volume, area, center } = f.measure(token);
f.session.release(token);
console.log(JSON.stringify({ sweepDegrees: -90, volumeMm3: volume, areaMm2: area, centerMm: center, retainedAfterRelease: f.retained.size }, null, 2));
