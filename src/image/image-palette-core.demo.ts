import { generatePalette, presetPalette } from './image-palette-core.ts';
console.log('Four fixed swatches:', presetPalette(4));
console.log('Two extracted swatches:', generatePalette({ width: 4, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 16, 0, 0, 255, 240, 0, 0, 255, 255, 0, 0, 255]) }, 2));
