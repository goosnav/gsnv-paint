import { paintPolicyShape, resizePolicyRaster } from './image-policy-drawing.ts';
import { createRaster } from './raster-ops.ts';
for (const mode of ['pixel-art', 'smooth'] as const) {
  const raster = createRaster(4, 4, [0, 0, 0, 0]);
  paintPolicyShape(raster, { kind: 'shape', shape: 'ellipse', a: [0, 0], b: [3, 3], size: 1, stroke: null, fill: [240, 20, 30, 255] }, mode);
  console.log(mode, 'ellipse alpha rows:');
  for (let y = 0; y < 4; y++) console.log(Array.from({ length: 4 }, (_, x) => raster.data[(y * 4 + x) * 4 + 3]).join(' '));
}
console.log('Smooth resize of one opaque pixel:', Array.from(resizePolicyRaster(createRaster(1, 1, [10, 20, 30, 255]), 3, 1, 'smooth').data));
