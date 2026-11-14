import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRaster, paintRaster, type Rect } from './raster-ops.ts';
import { imageContent, type LayerMeta } from './image-content.ts';
import { shapeMask, combineMasks, magicWand, applyCoverage } from './image-brush.ts';
import { adjustRaster } from './image-adjust.ts';
import { maskedMerge, compositeLayers } from './image-composite.ts';

test('IMG-103 exact pencil/layer/selection/fill/adjustment/multiply acceptance golden', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/acceptance-rgba.json', import.meta.url), 'utf8')) as {
    width: number; height: number; rows: string[]; palette: Record<string, number[]>; sha256: string;
  };
  const expected = Uint8ClampedArray.from(fixture.rows.flatMap(row => [...row].flatMap(c => fixture.palette[c]!)));
  assert.equal(fixture.rows.length, 24); assert.ok(fixture.rows.every(row => row.length === 32));
  assert.equal(createHash('sha256').update(expected).digest('hex'), fixture.sha256);
  const width = 32, height = 24, rect: Rect = { x: 0, y: 0, width, height };
  let document = imageContent({ operation: 'new', width, height, fill: [0, 0, 0, 0] });
  const pencil = imageContent({ operation: 'raster', value: document, layerId: 'background' });
  paintRaster(pencil, { kind: 'stroke', points: [[1, 1], [12, 1], [12, 8]], size: 1, color: [255, 0, 0, 255], tip: 'square' });
  document = imageContent({ operation: 'update', previous: document, layerId: 'background', raster: pencil });
  const meta: LayerMeta = { id: 'upper', name: 'Layer 2', visible: true, opacity: 1, blend: 'normal' };
  document = imageContent({ operation: 'layers', previous: document, width, height,
    layers: [{ meta: document.layers[0]! }, { meta, raster: createRaster(width, height, [0, 0, 0, 0]) }], activeLayerId: 'upper' });
  const upper = imageContent({ operation: 'raster', value: document, layerId: 'upper' });
  let selection = shapeMask(width, height, { kind: 'rectangle', a: [4, 4], b: [20, 16] });
  const fill = magicWand(upper, 8, 8, 0, true);
  for (let i = 0; i < fill.length; i++) fill[i] = Math.min(fill[i]!, selection[i]!);
  applyCoverage({ raster: upper, base: upper.data.slice(), cov: { width, height, data: Float32Array.from(fill, n => n / 255) }, rect, mode: { kind: 'paint', color: [64, 128, 192, 255] }, opacity: 1 });
  selection = combineMasks(selection, shapeMask(width, height, { kind: 'rectangle', a: [16, 12], b: [28, 20] }), 'add');
  for (const op of [{ kind: 'invert' }, { kind: 'threshold', level: 128 }] as const) {
    const base = upper.data.slice(); adjustRaster(upper, op, rect); maskedMerge({ target: upper, base, mask: selection, rect });
  }
  document = imageContent({ operation: 'update', previous: document, layerId: 'upper', raster: upper });
  document = imageContent({ operation: 'layers', previous: document, width, height,
    layers: document.layers.map(l => ({ meta: l.id === 'upper' ? { ...l, opacity: 0.5, blend: 'multiply' as const } : l })), activeLayerId: 'upper' });
  const actual = new Uint8ClampedArray(expected.length);
  compositeLayers({ width, height, rect, out: actual,
    layers: document.layers.map(l => ({ ...l, raster: imageContent({ operation: 'raster', value: document, layerId: l.id }) })) });
  assert.deepEqual(actual, expected);
  assert.equal(selection.filter(v => v === 255).length, 313, 'union area is 221 + 117 − 25');
});
