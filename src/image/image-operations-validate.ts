/**
 * PURPOSE    Validate portable Image operation records.
 * KIND       CORE
 * CONTRACT   Assembly: composes operation schemas, effect validation and pixel policy.
 *            validateImageOperation(unknown) returns an owned frozen operation.
 *            RAISES: RangeError before execution for unknown fields, unsafe sizes,
 *            missing values or invalid parameters. No coercion or implicit defaults.
 * GUARANTEES No I/O, execution, state edits or arbitrary property dispatch.
 * TUNING     One million samples per operation; finite coordinates within ±1e6.
 * DECISIONS  D1: Exact field schemas make imported and script operations identical.
 *            Revisit if a separately versioned forward-compatible format arrives.
 *            Alternative: permissive defaults, rejected for portable replay.
 * LIMITS     Layer/asset existence depends on execution state; checked by executor.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { adjustRaster } from './image-adjust.ts';
import { pixelPolicy } from './image-pixel-policy.ts';
import { MAX_PIXELS } from './raster-ops.ts';
import type { ImageOperation } from './image-operation-types.ts';
type Validator = (v: unknown) => unknown;
const bad = (message = 'Malformed image operation.'): never => { throw new RangeError(message); };
const number = (lo: number, hi: number, integer = false): Validator => v => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!integer || Number.isInteger(v)) ? v : bad('Image operation number is outside its allowed range.');
const choice = (...values: (string | number)[]): Validator => v => values.includes(v as string) ? v : bad('Unknown image operation choice.');
const bool: Validator = v => typeof v === 'boolean' ? v : bad();
const text: Validator = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 256 && !/[\u0000-\u001f]/.test(v) ? v : bad('Operation names need 1–256 printable characters.');
const id: Validator = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v) ? v : bad('Invalid asset identifier.');
const coord = number(-1e6, 1e6), unit = number(0, 1), index = number(0, 99, true);
const tuple = (length: number, check: Validator): Validator => v => Array.isArray(v) && v.length === length ? v.map(check) : bad();
const point = tuple(2, coord), color = tuple(4, number(0, 255, true));
const nullable = (check: Validator): Validator => v => v === null ? null : check(v);
function record(value: unknown, schema: Record<string, Validator>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== Object.keys(schema).sort().join()) bad('Image operation has missing or unknown fields.');
  const input = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(schema).map(([key, check]) => [key, check(input[key])]));
}
const list = (check: Validator, min = 1, max = 1e6): Validator => v => Array.isArray(v) && v.length >= min && v.length <= max ? v.map(check) : bad('Too many or too few operation samples.');
function dimensions(value: unknown): unknown {
  const r = record(value, { width: number(1, MAX_PIXELS, true), height: number(1, MAX_PIXELS, true) });
  if ((r.width as number) * (r.height as number) > MAX_PIXELS) bad('Image operation exceeds the pixel limit.');
  return r;
}
const rect: Validator = value => { const r = record(value, { x: coord, y: coord, width: number(1, MAX_PIXELS), height: number(1, MAX_PIXELS) }); if ((r.width as number) * (r.height as number) > MAX_PIXELS) bad('Transform exceeds the pixel limit.'); return r; };
const maskShape: Validator = value => {
  const v = value as Record<string, unknown>;
  return v?.kind === 'polygon' ? record(value, { kind: choice('polygon'), points: list(point, 3) }) : record(value, { kind: choice('rectangle', 'ellipse'), a: point, b: point });
};
const transform: Validator = value => {
  const v = value as Record<string, unknown>, kind = choice('flip', 'rotate', 'invert', 'crop', 'resize', 'canvas')(v?.kind);
  if (kind === 'flip') return record(value, { kind: choice(kind), axis: choice('horizontal', 'vertical') });
  if (kind === 'rotate') return record(value, { kind: choice(kind), turns: choice(1, 2, 3) });
  if (kind === 'invert') return record(value, { kind: choice(kind) });
  if (kind === 'crop') return record(value, { kind: choice(kind), rect: b => { const r = rect(b) as Record<string, number>; if (!Object.values(r).every(Number.isInteger)) bad('Crop uses whole pixels.'); return r; } });
  const r = record(value, { kind: choice(kind as string), width: number(1, MAX_PIXELS, true), height: number(1, MAX_PIXELS, true), ...(kind === 'canvas' ? { fill: color } : {}) });
  dimensions({ width: r.width, height: r.height }); return r;
};
const adjustment: Validator = value => {
  const v = value as Record<string, unknown>, fields: Record<string, string[]> = {
    brightnessContrast: ['brightness', 'contrast'], hueSaturation: ['hue', 'saturation', 'lightness'], levels: ['inBlack', 'inWhite', 'gamma', 'outBlack', 'outWhite'], curves: ['shadows', 'midtones', 'highlights'], colorBalance: ['cyanRed', 'magentaGreen', 'yellowBlue'],
    desaturate: [], invert: [], sepia: [], posterize: ['levels'], threshold: ['level'], gaussianBlur: ['radius'], unsharpMask: ['amount', 'radius', 'threshold'], addNoise: ['amount', 'monochrome', 'seed'], pixelate: ['size'], findEdges: [], emboss: [],
  };
  if (!v || typeof v.kind !== 'string' || !Object.hasOwn(fields, v.kind)) bad('Unknown adjustment.');
  const r = record(value, { kind: choice(v.kind as string), ...Object.fromEntries(fields[v.kind as string]!.map(key => [key, key === 'monochrome' ? bool : key === 'seed' ? number(0, 0xffffffff, true) : number(-1e6, 1e6)])) });
  adjustRaster({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, r as unknown as Parameters<typeof adjustRaster>[1]); return r;
};
function freeze(value: unknown): unknown { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
export function validateImageOperation(value: unknown): ImageOperation {
  const v = value as Record<string, unknown>, kind = v?.kind;
  let schema: Record<string, Validator>;
  if (kind === 'stroke') schema = { tool: choice('pencil', 'brush', 'eraser', 'airbrush', 'clone', 'blur', 'smudge'), segments: list(segment => record(segment, { points: list(point), seed: number(0, 0xffffffff, true) })), options: o => record(o, { size: number(1, 500, true), pixelSize: number(1, 32, true), edge: choice('pixel', 'smooth'), hardness: unit, opacity: unit, flow: unit, strength: unit, density: number(1, 200, true) }), color, background: color, cloneOffset: nullable(point) };
  else if (kind === 'shape') schema = { shape: choice('line', 'rectangle', 'ellipse'), a: point, b: point, size: number(1, 500, true), stroke: nullable(color), fill: nullable(color) };
  else if (kind === 'fill') schema = { point, color, opacity: unit, tolerance: number(0, 255), contiguous: bool, sample: choice('active', 'merged') };
  else if (kind === 'gradient') schema = { shape: choice('linear', 'radial'), a: point, b: point, start: color, end: color };
  else if (kind === 'selection') {
    const action = v.action;
    schema = { action: choice('all', 'none', 'invert', 'shape', 'wand') };
    if (action === 'shape') Object.assign(schema, { shape: maskShape, mode: choice('replace', 'add', 'subtract', 'intersect') });
    if (action === 'wand') Object.assign(schema, { point, tolerance: number(0, 255), contiguous: bool, sample: choice('active', 'merged'), mode: choice('replace', 'add', 'subtract', 'intersect') });
  } else if (kind === 'layer') {
    const action = v.action;
    schema = { action: choice('select', 'duplicate', 'delete', 'mergeDown', 'new', 'rename', 'visibility', 'opacity', 'blend', 'reorder', 'flatten') };
    if (action !== 'new' && action !== 'flatten') schema.index = index;
    if (action === 'new' || action === 'rename') schema.name = text;
    if (action === 'visibility') schema.visible = bool;
    if (action === 'opacity') schema.opacity = unit;
    if (action === 'blend') schema.blend = choice('normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference');
    if (action === 'reorder') schema.to = index;
  } else if (kind === 'clipboard') schema = { action: choice('copy', 'cut'), source: choice('selection', 'canvas'), background: color };
  else if (kind === 'delete') schema = { background: color };
  else if (kind === 'paste') schema = { source: s => { const k = (s as { kind?: unknown })?.kind; return record(s, { kind: choice('clipboard', 'asset'), ...(k === 'asset' ? { id } : {}) }); }, name: text, box: rect, sampling: choice('nearest', 'bilinear'), select: bool };
  else if (kind === 'move') schema = { dx: coord, dy: coord, background: color };
  else if (kind === 'affine') schema = { ...('asset' in v ? {asset:id} : {}), ...('clipboard' in v ? { clipboard: flag => flag === true ? true : bad('Clipboard transform must use true.') } : {}), box: box => { const b = record(box, { x: coord, y: coord, width: number(1, MAX_PIXELS), height: number(1, MAX_PIXELS), angle: number(-36000, 36000) }); const t = (b.angle as number) * Math.PI / 180, w = b.width as number, h = b.height as number, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t)); if (Math.max(1, Math.round(w * c + h * s)) * Math.max(1, Math.round(w * s + h * c)) > MAX_PIXELS) bad('Rotated output exceeds the pixel limit.'); return b; }, sampling: choice('nearest', 'bilinear'), background: color };
  else if (kind === 'adjust') schema = { adjustment };
  else if (kind === 'transform') schema = { transform };
  else if (kind === 'policy') schema = { policy: pixelPolicy };
  else if (kind === 'downpixel') schema = { width: number(1, MAX_PIXELS, true), height: number(1, MAX_PIXELS, true), resize: bool };
  else return bad('Unknown image operation.');
  const result = record(value, { kind: choice(kind as string), ...schema }) as unknown as ImageOperation;
  if (result.kind === 'stroke') { if (result.segments.reduce((n, s) => n + s.points.length, 0) > 1e6) bad('A stroke exceeds one million samples.'); if (result.tool === 'clone' && result.cloneOffset === null) bad('Clone needs a source offset.'); }
  if (result.kind === 'shape' && result.shape === 'line' && result.stroke === null) bad('A line needs a stroke colour.');
  if (result.kind === 'clipboard' && result.action === 'cut' && result.source === 'canvas') bad('Cut requires a selection; canvas copy is read-only.');
  if (result.kind === 'affine' && result.clipboard && result.asset !== undefined) bad('Transform source must be clipboard or asset, not both.');
  if (result.kind === 'downpixel') dimensions({ width: result.width, height: result.height });
  return freeze(result) as ImageOperation;
}
