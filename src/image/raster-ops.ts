/**
 * PURPOSE    Draw and transform straight-alpha RGBA rasters for the Image workspace.
 * KIND       CORE
 * CONTRACT   IN: Raster {width,height,data} with data.length = width*height*4 and an operation.
 *            paintRaster mutates the caller-owned working raster and returns the changed
 *            pixel rectangle (null when nothing changed); transformRaster returns a new raster.
 *            Points are document pixel coordinates; colors are [r,g,b,a] bytes.
 *            RAISES: RangeError for invalid sizes, colors, rectangles or nonfinite points.
 * GUARANTEES Deterministic, aliased pixel output identical in browsers and Node; no DOM.
 *            Strokes, outlines and fills clip to the raster; transforms never alias input.
 * TUNING     MAX_PIXELS bounds a single raster (64 MiB of RGBA). Brush stamps are round
 *            for 'round' and square for 'square'; outline width grows inward.
 * DECISIONS  D1: Aliased rasterization rather than antialiasing, matching classic paint
 *            tools and keeping flood fill boundaries closed. Revisit if: a smooth brush
 *            family is required.
 * LIMITS     No layers, blend modes or selection masks; selections are rectangles.
 * TESTBENCH  src/image/raster-ops.test.ts -- run with: node --import tsx --test src/image/raster-ops.test.ts
 */
export type Raster = { width: number; height: number; data: Uint8ClampedArray };
export type RGBA = readonly [number, number, number, number];
export type Rect = { x: number; y: number; width: number; height: number };
type Point = readonly [number, number];
export type PaintOp =
  | { kind: 'stroke'; points: readonly Point[]; size: number; color: RGBA; tip: 'round' | 'square' }
  | { kind: 'rectangle' | 'ellipse'; a: Point; b: Point; size: number; stroke: RGBA | null; fill: RGBA | null }
  | { kind: 'fill'; point: Point; color: RGBA }
  | { kind: 'clear'; rect: Rect; color: RGBA }
  | { kind: 'blit'; source: Raster; x: number; y: number; mode: 'replace' | 'over' };
export type TransformOp =
  | { kind: 'flip'; axis: 'horizontal' | 'vertical' }
  | { kind: 'rotate'; turns: 1 | 2 | 3 }
  | { kind: 'invert' }
  | { kind: 'crop'; rect: Rect }
  | { kind: 'resize'; width: number; height: number }
  | { kind: 'canvas'; width: number; height: number; fill: RGBA };

export const MAX_PIXELS = 4096 * 4096;

export function createRaster(width: number, height: number, fill: RGBA): Raster {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new RangeError(`Image size must be whole pixels between 1 and ${MAX_PIXELS} pixels in total.`);
  color(fill);
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill.some(v => v !== 0)) for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width, height, data };
}

function color(value: RGBA): RGBA {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) throw new RangeError('Colors are four integer bytes.');
  return value;
}
function checkRaster(r: Raster) {
  if (!r || !Number.isInteger(r.width) || !Number.isInteger(r.height) || r.width < 1 || r.height < 1 || !(r.data instanceof Uint8ClampedArray) || r.data.length !== r.width * r.height * 4) throw new RangeError('Invalid raster.');
}
function checkPoint(p: Point) { if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) throw new RangeError('Points must be finite.'); }
function checkSize(size: number) { if (!Number.isInteger(size) || size < 1 || size > 512) throw new RangeError('Tool size must be a whole number from 1 to 512.'); }

/** Accumulates the changed area while writing clipped pixels. */
function writer(r: Raster) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  return {
    set(x: number, y: number, c: RGBA) {
      if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
      const i = (y * r.width + x) * 4, d = r.data;
      if (d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2] && d[i + 3] === c[3]) return;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3];
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    },
    rect(): Rect | null { return x1 < x0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }; },
  };
}

function stamp(size: number, tip: 'round' | 'square'): Point[] {
  const offsets: Point[] = [], start = -Math.floor((size - 1) / 2), centre = (size - 1) / 2, limit = (size / 2) ** 2 + 1e-9;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (tip === 'square' || (i - centre) ** 2 + (j - centre) ** 2 <= limit) offsets.push([start + i, start + j]);
  return offsets;
}

function box(a: Point, b: Point) {
  const x0 = Math.floor(Math.min(a[0], b[0])), y0 = Math.floor(Math.min(a[1], b[1])), x1 = Math.floor(Math.max(a[0], b[0])), y1 = Math.floor(Math.max(a[1], b[1]));
  return { x0, y0, x1, y1 };
}

export function paintRaster(raster: Raster, op: PaintOp): Rect | null {
  checkRaster(raster);
  const out = writer(raster);
  if (op.kind === 'stroke') {
    checkSize(op.size); color(op.color); if (!op.points.length) throw new RangeError('A stroke needs at least one point.'); op.points.forEach(checkPoint);
    const tip = stamp(op.size, op.tip), pts = op.points.map(p => [Math.floor(p[0]), Math.floor(p[1])] as const);
    const dab = (x: number, y: number) => { for (const [dx, dy] of tip) out.set(x + dx, y + dy, op.color); };
    dab(pts[0]![0], pts[0]![1]);
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1]!, [bx, by] = pts[k]!, steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 1; s <= steps; s++) dab(Math.round(ax + (bx - ax) * s / steps), Math.round(ay + (by - ay) * s / steps));
    }
  } else if (op.kind === 'rectangle' || op.kind === 'ellipse') {
    checkPoint(op.a); checkPoint(op.b); checkSize(op.size);
    if (op.stroke) color(op.stroke); if (op.fill) color(op.fill);
    const { x0, y0, x1, y1 } = box(op.a, op.b), t = op.size;
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
    const inside = (x: number, y: number, ex: number, ey: number) => ex > 0 && ey > 0 && ((x + 0.5 - cx) / ex) ** 2 + ((y + 0.5 - cy) / ey) ** 2 <= 1;
    for (let y = Math.max(0, y0); y <= Math.min(raster.height - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(raster.width - 1, x1); x++) {
      let outer: boolean, edge: boolean;
      if (op.kind === 'rectangle') { outer = true; edge = x < x0 + t || x > x1 - t || y < y0 + t || y > y1 - t; }
      else { outer = inside(x, y, rx, ry); edge = outer && !inside(x, y, rx - t, ry - t); }
      if (!outer) continue;
      if (edge && op.stroke) out.set(x, y, op.stroke); else if (op.fill) out.set(x, y, op.fill);
    }
  } else if (op.kind === 'fill') {
    checkPoint(op.point); color(op.color);
    const sx = Math.floor(op.point[0]), sy = Math.floor(op.point[1]), { width: w, height: h, data } = raster;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    const s = (sy * w + sx) * 4, target = [data[s]!, data[s + 1]!, data[s + 2]!, data[s + 3]!];
    if (target.every((v, i) => v === op.color[i])) return null;
    const match = (x: number, y: number) => { const i = (y * w + x) * 4; return data[i] === target[0] && data[i + 1] === target[1] && data[i + 2] === target[2] && data[i + 3] === target[3]; };
    const stack: number[] = [sx, sy];
    while (stack.length) {
      const y = stack.pop()!, x = stack.pop()!;
      if (!match(x, y)) continue;
      let left = x, right = x;
      while (left > 0 && match(left - 1, y)) left--;
      while (right < w - 1 && match(right + 1, y)) right++;
      for (let i = left; i <= right; i++) out.set(i, y, op.color);
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= h) continue;
        let run = false;
        for (let i = left; i <= right; i++) { const m = match(i, ny); if (m && !run) stack.push(i, ny); run = m; }
      }
    }
  } else if (op.kind === 'clear') {
    color(op.color); const r = clip(op.rect, raster);
    for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) out.set(x, y, op.color);
  } else if (op.kind === 'blit') {
    checkRaster(op.source); if (!Number.isInteger(op.x) || !Number.isInteger(op.y)) throw new RangeError('Paste position must be whole pixels.');
    const src = op.source.data, pixel: [number, number, number, number] = [0, 0, 0, 0];
    for (let y = Math.max(0, -op.y); y < op.source.height && y + op.y < raster.height; y++) for (let x = Math.max(0, -op.x); x < op.source.width && x + op.x < raster.width; x++) {
      const i = (y * op.source.width + x) * 4, sa = src[i + 3]!;
      if (op.mode === 'replace' || sa === 255) { pixel[0] = src[i]!; pixel[1] = src[i + 1]!; pixel[2] = src[i + 2]!; pixel[3] = sa; }
      else {
        if (sa === 0) continue;
        const j = ((y + op.y) * raster.width + x + op.x) * 4, d = raster.data, da = d[j + 3]! * (255 - sa) / 255, a = sa + da;
        for (let c = 0; c < 3; c++) pixel[c] = Math.round((src[i + c]! * sa + d[j + c]! * da) / a);
        pixel[3] = Math.round(a);
      }
      out.set(x + op.x, y + op.y, pixel);
    }
  } else throw new RangeError('Unknown paint operation.');
  return out.rect();
}

/** Intersects a rectangle with the raster bounds; empty rectangles are returned with zero extent. */
export function clip(rect: Rect, raster: { width: number; height: number }): Rect {
  if (![rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isInteger) || rect.width < 0 || rect.height < 0) throw new RangeError('Rectangles use whole, nonnegative pixel extents.');
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  return { x, y, width: Math.max(0, Math.min(raster.width, rect.x + rect.width) - x), height: Math.max(0, Math.min(raster.height, rect.y + rect.height) - y) };
}

export function transformRaster(raster: Raster, op: TransformOp): Raster {
  checkRaster(raster);
  const { width: w, height: h, data } = raster;
  const remap = (width: number, height: number, source: (x: number, y: number) => number) => {
    const next = createRaster(width, height, [0, 0, 0, 0]);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = source(x, y) * 4, j = (y * width + x) * 4; next.data[j] = data[i]!; next.data[j + 1] = data[i + 1]!; next.data[j + 2] = data[i + 2]!; next.data[j + 3] = data[i + 3]!; }
    return next;
  };
  if (op.kind === 'flip') return remap(w, h, (x, y) => op.axis === 'horizontal' ? y * w + (w - 1 - x) : (h - 1 - y) * w + x);
  if (op.kind === 'rotate') {
    if (op.turns === 2) return remap(w, h, (x, y) => (h - 1 - y) * w + (w - 1 - x));
    if (op.turns === 1) return remap(h, w, (x, y) => (h - 1 - x) * w + y);
    if (op.turns === 3) return remap(h, w, (x, y) => x * w + (w - 1 - y));
    throw new RangeError('Rotation is a whole number of quarter turns.');
  }
  if (op.kind === 'invert') {
    const next = { width: w, height: h, data: new Uint8ClampedArray(data) };
    for (let i = 0; i < next.data.length; i += 4) { next.data[i] = 255 - data[i]!; next.data[i + 1] = 255 - data[i + 1]!; next.data[i + 2] = 255 - data[i + 2]!; }
    return next;
  }
  if (op.kind === 'crop') {
    const r = clip(op.rect, raster); if (!r.width || !r.height) throw new RangeError('The crop area is outside the image.');
    return remap(r.width, r.height, (x, y) => (y + r.y) * w + x + r.x);
  }
  if (op.kind === 'resize') {
    return remap(op.width, op.height, (x, y) => Math.min(h - 1, Math.floor((y + 0.5) * h / op.height)) * w + Math.min(w - 1, Math.floor((x + 0.5) * w / op.width)));
  }
  if (op.kind === 'canvas') {
    const next = createRaster(op.width, op.height, op.fill);
    paintRaster(next, { kind: 'blit', source: raster, x: 0, y: 0, mode: 'replace' });
    return next;
  }
  throw new RangeError('Unknown image transform.');
}

/** Scales (percent) and rotates (degrees, clockwise) a raster about its centre into a new raster sized to the
 *  rotated bounds. Bilinear sampling on premultiplied alpha; pixels outside the source are transparent. */
export function affineRaster(raster: Raster, { scaleX, scaleY, angle }: { scaleX: number; scaleY: number; angle: number }): Raster {
  checkRaster(raster);
  if (![scaleX, scaleY, angle].every(Number.isFinite) || scaleX <= 0 || scaleY <= 0) throw new RangeError('Scale must be positive and the angle finite.');
  const sx = scaleX / 100, sy = scaleY / 100, t = angle * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t), w = raster.width * sx, h = raster.height * sy;
  const W = Math.max(1, Math.round(Math.abs(w * cos) + Math.abs(h * sin))), H = Math.max(1, Math.round(Math.abs(w * sin) + Math.abs(h * cos)));
  const out = createRaster(W, H, [0, 0, 0, 0]), src = raster.data, rw = raster.width, rh = raster.height;
  const at = (x: number, y: number, c: number) => { if (x < 0 || y < 0 || x >= rw || y >= rh) return 0; const i = (y * rw + x) * 4; return c === 3 ? src[i + 3]! : src[i + c]! * src[i + 3]! / 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - W / 2, dy = y + 0.5 - H / 2, u = (cos * dx + sin * dy) / sx + rw / 2 - 0.5, v = (-sin * dx + cos * dy) / sy + rh / 2 - 0.5;
    if (u < -1 || v < -1 || u > rw || v > rh) continue;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, px: number[] = [];
    for (let c = 0; c < 4; c++) px.push((at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy);
    const o = (y * W + x) * 4, a = px[3]!; if (a <= 0) continue;
    out.data[o] = Math.round(px[0]! * 255 / a); out.data[o + 1] = Math.round(px[1]! * 255 / a); out.data[o + 2] = Math.round(px[2]! * 255 / a); out.data[o + 3] = Math.round(a);
  }
  return out;
}
