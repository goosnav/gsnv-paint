// Reproduce original Paint artwork entirely offline using Node's standard library.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { C, PixelCanvas, png } from './xp-pixels.mjs';
import { toolIcons } from './xp-tools.mjs';
import { commandIcons } from './xp-commands.mjs';

const root = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('xp.json', root), 'utf8'));
if (JSON.stringify(manifest.palette) !== JSON.stringify(C)) throw new Error('Documented XP palette differs from artwork.');
mkdirSync(new URL('xp/', root), { recursive: true });
const check = process.argv.includes('--check');
const palette = new Set(Object.values(C).map(hex => hex.slice(1)));
const images = new Set();
for (const [icons, size] of [[toolIcons, manifest.nativeSizes.tools], [commandIcons, manifest.nativeSizes.commands]]) {
  for (const [name, draw] of Object.entries(icons)) {
    const canvas = new PixelCanvas(size); draw(canvas);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const pixel = canvas.data.subarray((y * size + x) * 4, (y * size + x) * 4 + 4);
      if (!pixel[3]) continue;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) throw new Error(`Clipped icon: ${name}`);
      if (!palette.has(Buffer.from(pixel.subarray(0, 3)).toString('hex'))) throw new Error(`Unexpected colour: ${name}`);
    }
    const bytes = png(canvas), target = new URL(`xp/${name}.png`, root);
    if (images.has(bytes.toString('base64'))) throw new Error(`Duplicate icon: ${name}`);
    images.add(bytes.toString('base64'));
    if (check) {
      if (!bytes.equals(readFileSync(target))) throw new Error(`XP artwork differs: ${name}`);
    } else writeFileSync(target, bytes);
  }
}
console.log(`${images.size} Windows XP-style icons verified: native pixels, shared palette, transparent margins.`);
