// Development-only: make five thin, one-bit selection/shape masks from pinned MIT SVGs.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
const root = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('provenance.json', root), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const item of Object.values(manifest.derived)) {
    const source = readFileSync(new URL(item.source, root));
    if (createHash('sha256').update(source).digest('hex') !== item.sourceSha256) throw new Error(`Source changed: ${item.source}`);
    const paths = [...source.toString().matchAll(/<path d="([^"]+)"\s*\/>/g)].map(match => match[1]);
    if (!paths.length) throw new Error(`No paths: ${item.source}`);
    const data = await page.evaluate(paths => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d'); ctx.scale(2 / 3, 2 / 3);
      ctx.lineWidth = 1.5; ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      for (const path of paths) ctx.stroke(new Path2D(path));
      const pixels = ctx.getImageData(0, 0, 16, 16);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = 39; pixels.data[i + 1] = 45; pixels.data[i + 2] = 52;
        pixels.data[i + 3] = pixels.data[i + 3] >= 96 ? 255 : 0;
      }
      ctx.putImageData(pixels, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
    }, paths);
    const bytes = Buffer.from(data, 'base64');
    if (process.argv.includes('--check')) {
      if (!bytes.equals(readFileSync(new URL(item.file, root)))) throw new Error(`Raster differs: ${item.file}`);
    } else writeFileSync(new URL(item.file, root), bytes);
  }
} finally { await browser.close(); }
console.log('5 pinned Tabler masks rasterized at 16px with binary coverage.');
