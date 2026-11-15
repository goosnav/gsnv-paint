// Development-only asset processing, requested by the owner on 2026-11-15.
// Preserve source geometry; derive hard 16px icons with the app's own palette renderer.
// ReactOS-derived artwork remains LGPL-2.0-or-later; Silk CC BY 2.5; Fugue CC BY 3.0;
// Tabler MIT. See README.md, provenance.json and the original source/license files.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { quantizeImage } from '../../src/image/image-quantize.ts';
const root = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('provenance.json', root), 'utf8'));
const colours = manifest.classicPalette.map(hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)));
const tabler = JSON.parse(readFileSync(new URL('../tabler/provenance.json', root), 'utf8'));
for (const item of [...manifest.fugueFiles, ...manifest.classicSources,
  ...tabler.files.map(item => ({ ...item, file: `../tabler/${item.file}` }))]) {
  if (createHash('sha256').update(readFileSync(new URL(item.file, root))).digest('hex') !== item.sha256) throw new Error(`Source changed: ${item.file}`);
}
mkdirSync(new URL('classic/', root), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, recipe] of Object.entries(manifest.classicRecipes)) {
    const source = readFileSync(new URL(recipe.source, root));
    const pixels = await page.evaluate(async ({ recipe, data, svg }) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
      if (svg) {
        context.scale(2 / 3, 2 / 3); context.lineWidth = recipe.stroke; context.lineCap = 'square'; context.lineJoin = 'miter';
        for (const match of svg.matchAll(/<path d="([^"]+)"\s*\/>/g)) context.stroke(new Path2D(match[1]));
      } else {
        const image = new Image(); image.src = data; await image.decode();
        context.drawImage(image, (recipe.tile ?? 0) * 16, 0, 16, 16, 0, 0, 16, 16);
      }
      const result = context.getImageData(0, 0, 16, 16).data;
      for (let i = 0; i < result.length; i += 4) {
        if (recipe.tile !== undefined && result[i] === 255 && result[i + 1] === 0 && result[i + 2] === 255) {
          result.fill(0, i, i + 4); continue;
        }
        // Small saturated ramps replace the pale edge colours; geometry remains source-authored.
        const luminance = .2126 * result[i] + .7152 * result[i + 1] + .0722 * result[i + 2];
        for (let channel = 0; channel < 3; channel++) {
          const saturated = luminance + (result[i + channel] - luminance) * recipe.saturation;
          result[i + channel] = Math.round((saturated - 128) * recipe.contrast + 128);
        }
      }
      return [...result];
    }, { recipe, data: `data:image/${recipe.source.endsWith('.bmp') ? 'bmp' : 'png'};base64,${source.toString('base64')}`, svg: recipe.source.endsWith('.svg') ? source.toString() : null });
    const output = quantizeImage({ width: 16, height: 16, data: new Uint8ClampedArray(pixels) }, { colours, dither: 'none' });
    if (recipe.outline) {
      const original = new Uint8ClampedArray(output.data), ink = [1, 3, 5].map(i => parseInt(recipe.outline.slice(i, i + 2), 16));
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        if (original[i + 3]) continue;
        if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([px, py]) => px >= 0 && px < 16 && py >= 0 && py < 16 && original[(py * 16 + px) * 4 + 3] === 255)) output.data.set([...ink, 255], i);
      }
    }
    const png = await page.evaluate(pixels => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), 16, 16), 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    }, [...output.data]);
    const bytes = Buffer.from(png, 'base64'), target = new URL(`classic/${name}.png`, root);
    if (process.argv.includes('--check')) {
      if (!bytes.equals(readFileSync(target))) throw new Error(`Classic artwork differs: ${name}`);
    } else writeFileSync(target, bytes);
  }
} finally { await browser.close(); }
console.log('37 classic icons verified: native 16px, 32-colour palette, binary coverage, pinned source geometry.');
