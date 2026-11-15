import { pixelPolicy, pixelCoverage } from './image-pixel-policy.ts';
const policy = pixelPolicy();
console.log(policy, [...pixelCoverage({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 127, 255, 0, 0, 128]) }, policy.mode).data]);
