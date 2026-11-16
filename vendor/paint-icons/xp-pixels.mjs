// Original integer-grid artwork helpers. No rasterizer, font, browser or network needed.
// Copyright (c) 2026 Goosnav LLC. MIT; see XP-LICENSE.txt.
import { deflateSync } from 'node:zlib';

export const C = Object.freeze({
  ink: '#202020', gray: '#808080', light: '#c0c0c0', white: '#ffffff',
  blue: '#0055aa', sky: '#80bfff', navy: '#003366', yellow: '#ffdf60',
  gold: '#c89020', brown: '#804020', red: '#c04040', pink: '#ffb0b0',
  green: '#208020', paleGreen: '#a0d080', skin: '#f0c890',
});

export class PixelCanvas {
  constructor(size) { this.size = size; this.data = new Uint8Array(size * size * 4); }
  pixel(x, y, colour) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('Artwork must use integer pixels.');
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) throw new Error(`Pixel outside canvas: ${x}, ${y}`);
    const offset = (y * this.size + x) * 4;
    this.data.set([parseInt(colour.slice(1, 3), 16), parseInt(colour.slice(3, 5), 16), parseInt(colour.slice(5, 7), 16), 255], offset);
  }
  rect(x, y, width, height, colour) {
    for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) this.pixel(column, row, colour);
  }
  line(x1, y1, x2, y2, colour, width = 1) {
    const dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
    const dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.rect(x1, y1, width, width, colour);
      if (x1 === x2 && y1 === y2) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x1 += sx; }
      if (twice <= dx) { error += dx; y1 += sy; }
    }
  }
  poly(points, fill, stroke) {
    if (fill) {
      const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
      for (let y = Math.min(...ys); y <= Math.max(...ys); y++) for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i], [xj, yj] = points[j];
          if ((yi > y + .5) !== (yj > y + .5) && x + .5 < (xj - xi) * (y + .5 - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.pixel(x, y, fill);
      }
    }
    if (stroke) for (let i = 0; i < points.length; i++) this.line(...points[i], ...points[(i + 1) % points.length], stroke);
  }
  ellipse(x, y, width, height, fill, stroke) {
    const inside = (px, py) => ((px + .5 - x - width / 2) / (width / 2)) ** 2 + ((py + .5 - y - height / 2) / (height / 2)) ** 2 <= 1;
    for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
      if (!inside(px, py)) continue;
      const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
      if (edge && stroke) this.pixel(px, py, stroke);
      else if (fill) this.pixel(px, py, fill);
    }
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}
export function png(canvas) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.size, 0); header.writeUInt32BE(canvas.size, 4);
  header[8] = 8; header[9] = 6; // RGBA8; unfiltered rows, no interlace.
  const rows = Buffer.alloc(canvas.size * (canvas.size * 4 + 1));
  for (let y = 0; y < canvas.size; y++) rows.set(canvas.data.subarray(y * canvas.size * 4, (y + 1) * canvas.size * 4), y * (canvas.size * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
