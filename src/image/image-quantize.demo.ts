import { quantizeImage } from './image-quantize.ts';
import { presetPalette } from './image-palette-core.ts';
const raster = { width: 4, height: 4, data: Uint8ClampedArray.from(Array.from({ length: 16 }, () => [128, 128, 128, 255]).flat()) };
for (const dither of ['none', 'bayer', 'floyd-steinberg'] as const) {
  const out = quantizeImage(raster, { colours: [[0, 0, 0], [255, 255, 255]], dither });
  console.log(dither, Array.from({ length: 4 }, (_, y) => Array.from({ length: 4 }, (_, x) => out.data[(y * 4 + x) * 4] ? '□' : '■').join('')).join('\n'));
}

if (process.argv.includes('--benchmark')) {
  const source = { width: 800, height: 600, data: new Uint8ClampedArray(800 * 600 * 4) };
  for (let i = 0; i < source.data.length; i += 4) { const pixel = i / 4; source.data.set([pixel % 256, Math.floor(pixel / 800) % 256, Math.floor(pixel / 100) % 256, 255], i); }
  console.log('CPU quantization only; not a browser frame-rate benchmark:', process.version, process.platform);
  for (const dither of ['none', 'bayer', 'floyd-steinberg'] as const) {
    const times: number[] = [];
    for (let i = 0; i < 3; i++) { const start = performance.now(); quantizeImage(source, { colours: presetPalette(16), dither }); times.push(Math.round(performance.now() - start)); }
    console.log(`${dither}: 800×600, 16 colours; ${times.join(', ')} ms`);
  }
}
