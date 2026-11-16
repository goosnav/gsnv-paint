// Development-only artwork adapter. Source geometry and license metadata remain
// untouched in illustrated-sources; each reviewed recipe produces one 24px PNG.
// No network access or new runtime dependency. See README.md and illustrated.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
const root = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('illustrated.json', root), 'utf8'));
for (const source of manifest.sources) {
  if (createHash('sha256').update(readFileSync(new URL(source.file, root))).digest('hex') !== source.sha256)
    throw new Error(`Source changed: ${source.file}`);
}
mkdirSync(new URL('illustrated/', root), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, recipe] of Object.entries(manifest.recipes)) {
    const source = readFileSync(new URL(recipe.source, root));
    const png = await page.evaluate(async ({ data, svg, recipe, size, padding }) => {
      if (recipe.wandColours) {
        const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const geometry = parsed.querySelector('path').getAttribute('d');
        // Colour the three existing stars, preserving Font Awesome's path geometry.
        svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><defs><clipPath id="stars"><rect width="192" height="224"/><rect x="192" width="128" height="128"/><rect x="352" y="288" width="192" height="192"/></clipPath></defs><path fill="#272727" d="${geometry}"/><path fill="#edaa00" clip-path="url(#stars)" d="${geometry}"/></svg>`;
      }
      const image = new Image();
      image.src = svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : data;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
      context.drawImage(image, padding, padding, size - padding * 2, size - padding * 2);
      const raster = context.getImageData(0, 0, size, size);
      const tint = recipe.tint?.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
      for (let i = 0; i < raster.data.length; i += 4) {
        if (raster.data[i + 3] < recipe.alphaCutoff) { raster.data.fill(0, i, i + 4); continue; }
        const luminance = .2126 * raster.data[i] + .7152 * raster.data[i + 1] + .0722 * raster.data[i + 2];
        for (let channel = 0; channel < 3; channel++) {
          const value = tint ? tint[0][channel] + (tint[1][channel] - tint[0][channel]) * luminance / 255
            : luminance + (raster.data[i + channel] - luminance) * recipe.saturation;
          raster.data[i + channel] = Math.round((value - 128) * recipe.contrast + 128);
        }
        // Hard coverage supplies the pixel edge; retain the artist's internal shading.
        raster.data[i + 3] = 255;
      }
      context.putImageData(raster, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { data: `data:image/png;base64,${source.toString('base64')}`,
      svg: recipe.source.endsWith('.svg') ? source.toString() : null, recipe,
      size: manifest.size, padding: manifest.padding });
    const target = new URL(`illustrated/${name}.png`, root), bytes = Buffer.from(png, 'base64');
    if (process.argv.includes('--check')) {
      if (!bytes.equals(readFileSync(target))) throw new Error(`Illustrated artwork differs: ${name}`);
    } else writeFileSync(target, bytes);
  }
} finally { await browser.close(); }
console.log(`${Object.keys(manifest.recipes).length} illustrated tools verified: native 24px, hard coverage, preserved source shading.`);
