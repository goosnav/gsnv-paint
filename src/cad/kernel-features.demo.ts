/** Existing cut/edge-feature illustration; geometric assertions live in tests. */
import { kernelFixture } from './kernel-test-fixture.ts';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { applyFeature } from './kernel-features.ts';

const f = await kernelFixture();
const plate = buildLinearPrism({ session: f.session, polygon: [[0, 0], [100, 0], [100, 60], [0, 60]], depth: 10 });
const rounded = applyFeature(f.session, plate, { kind: 'fillet', set: 'vertical', size: 5 });
console.log(JSON.stringify({ part: '100 × 60 × 10 mm plate; R5 vertical corners', volumeMm3: f.measure(rounded).volume }, null, 2));
f.session.release(rounded);
console.log(`Retained shapes after release: ${f.retained.size}`);
