import { createImageEffects, type ImageEffectsRequest } from './image-effects-client.ts';
const effects = createImageEffects(), canvas = document.querySelector('canvas')!, context = canvas.getContext('2d')!, status = document.querySelector('#status')!;
const source = { width: 256, height: 128, data: new Uint8ClampedArray(256 * 128 * 4) };
for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) source.data.set([x, x, x, 255], (y * 256 + x) * 4);
context.putImageData(new ImageData(source.data, 256, 128), 0, 0);
async function run(request: ImageEffectsRequest) {
  status.textContent = 'Processing…';
  try { const result = await effects.run(request); canvas.width = result.width; canvas.height = result.height; context.putImageData(new ImageData(result.data as Uint8ClampedArray<ArrayBuffer>, result.width, result.height), 0, 0); status.textContent = `Finished ${result.width} × ${result.height}`; }
  catch (cause) { status.textContent = cause instanceof Error ? cause.message : String(cause); }
}
document.querySelector('#quantize')!.addEventListener('click', () => { void run({ kind: 'quantize', raster: source, palette: { colours: [[0, 0, 0], [255, 255, 255]], dither: 'floyd-steinberg' } }); });
document.querySelector('#downpixel')!.addEventListener('click', () => { void run({ kind: 'downpixel', raster: source, width: 16, height: 8, resize: false }); });
document.querySelector('#stop')!.addEventListener('click', () => effects.cancel());
window.addEventListener('pagehide', () => effects.dispose(), { once: true });
