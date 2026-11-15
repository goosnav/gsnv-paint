import { downpixelImage } from './image-downpixel.ts';
const source = { width: 4, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]) };
console.log('Two logical pixels retained on four-pixel canvas:', [...downpixelImage(source, { width: 2, height: 1, resize: false }).data]);
