import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { quantizeImage } from './image-quantize.ts';
import type { RGB, PixelPolicy } from './image-pixel-policy.ts';
type Palette = NonNullable<PixelPolicy['palette']>;
const BW: readonly RGB[] = [[0, 0, 0], [255, 255, 255]];
const image = (width: number, pixels: number[][]) => ({ width, height: pixels.length / width, data: new Uint8ClampedArray(pixels.flat()) });
const codes = (data: Uint8ClampedArray) => Array.from({ length: data.length / 4 }, (_, i) => data[i * 4 + 3] === 0 ? '.' : data[i * 4] === 0 ? 'B' : 'W').join('');

test('No dither picks first equal-distance swatch and binary alpha; hidden RGB is canonical clear', () => {
  const r = image(4, [[100, 0, 0, 255], [255, 255, 255, 127], [255, 255, 255, 128], [40, 10, 20, 0]]), before = r.data.slice();
  const out = quantizeImage(r, { colours: [[0, 0, 0], [200, 0, 0]], dither: 'none' });
  assert.deepEqual([...out.data], [0, 0, 0, 255, 0, 0, 0, 0, 200, 0, 0, 255, 0, 0, 0, 0]); assert.deepEqual(r.data, before);
});

test('Bayer and Floyd–Steinberg grayscale outputs match literal 4x4 goldens', () => {
  const r = image(4, Array.from({ length: 16 }, () => [128, 128, 128, 255]));
  assert.equal(codes(quantizeImage(r, { colours: BW, dither: 'none' }).data), 'WWWWWWWWWWWWWWWW');
  assert.equal(codes(quantizeImage(r, { colours: BW, dither: 'bayer' }).data), 'BWBWWBWBBWBWWBWB');
  assert.equal(codes(quantizeImage(r, { colours: BW, dither: 'floyd-steinberg' }).data), 'WBWBBWBWWBWBBWBW');
});

test('Ordered alpha dithering preserves coverage while distributing both colour choices', () => {
  const r = image(4, Array.from({ length: 16 }, () => [128, 128, 128, 128]));
  const result = codes(quantizeImage(r, { colours: BW, dither: 'bayer' }).data);
  assert.equal([...result].filter(c => c === '.').length, 8); assert.equal([...result].filter(c => c === 'B').length, 4); assert.equal([...result].filter(c => c === 'W').length, 4);
  const white = image(4, Array.from({ length: 16 }, () => [255, 255, 255, 128]));
  assert.equal(codes(quantizeImage(white, { colours: BW, dither: 'floyd-steinberg' }).data), 'W.W..W.WW.W..W.W');
});

test('Every dither guarantees palette-only opaque colours; transparent islands stay clear and runs deterministic', () => {
  const colours: RGB[] = [[12, 24, 36], [210, 40, 70], [250, 240, 230]], r = image(13, Array.from({ length: 13 * 11 }, (_, i) => [i * 17 % 256, i * 43 % 256, i * 71 % 256, i % 7 === 0 ? 0 : i * 23 % 256]));
  const allowed = new Set(colours.map(c => c.join(','))), before = r.data.slice();
  for (const dither of ['none', 'bayer', 'floyd-steinberg'] as const) {
    const out = quantizeImage(r, { colours, dither }); assert.deepEqual(out.data, quantizeImage(r, { colours, dither }).data);
    for (let i = 0; i < out.data.length; i += 4) {
      assert.ok(out.data[i + 3] === 0 || out.data[i + 3] === 255);
      if (out.data[i + 3]) assert.ok(allowed.has([...out.data.subarray(i, i + 3)].join(','))); else assert.deepEqual([...out.data.subarray(i, i + 4)], [0, 0, 0, 0]);
      if (!r.data[i + 3]) assert.equal(out.data[i + 3], 0);
    }
  }
  assert.deepEqual(r.data, before);
});

test('Quantization handles one pixel and rejects invalid policy/raster input atomically', () => {
  const r = image(1, [[200, 200, 200, 255]]);
  for (const dither of ['none', 'bayer', 'floyd-steinberg'] as const) assert.equal(quantizeImage(r, { colours: BW, dither }).data.length, 4);
  for (const p of [null, { colours: [], dither: 'none' }, { colours: BW, dither: 'random' }]) assert.throws(() => quantizeImage(r, p as Palette), RangeError);
  assert.throws(() => quantizeImage({ ...r, width: 2 }, { colours: BW, dither: 'none' }), RangeError);
});

test('Accelerated nearest lookup matches an independent exhaustive RGB distance oracle', () => {
  const colours: RGB[] = Array.from({ length: 32 }, (_, i) => [i * 7 % 256, i * 31 % 256, i * 53 % 256]);
  const pixels = Array.from({ length: 1001 }, (_, i) => [i * 23 % 256, i * 97 % 256, i * 61 % 256, 255]);
  const out = quantizeImage(image(1001, pixels), { colours, dither: 'none' });
  pixels.forEach((p, i) => {
    let id = 0, distance = Infinity;
    colours.forEach((c, index) => { const d = c.reduce((sum, channel, j) => sum + (channel - p[j]!) ** 2, 0); if (d < distance) { distance = d; id = index; } });
    assert.deepEqual([...out.data.subarray(i * 4, i * 4 + 4)], [...colours[id]!, 255]);
  });
});

test('Dithered joint colour/alpha conserves average coverage and premultiplied tone', () => {
  const r = image(64, Array.from({ length: 64 * 64 }, () => [128, 128, 128, 128]));
  for (const dither of ['bayer', 'floyd-steinberg'] as const) {
    const out = quantizeImage(r, { colours: BW, dither }).data; let tone = 0, coverage = 0;
    for (let i = 0; i < out.length; i += 4) { tone += out[i]!; coverage += out[i + 3]!; }
    assert.ok(Math.abs(tone / 4096 - 128 * 128 / 255) < 2); assert.ok(Math.abs(coverage / 4096 - 128) < 2);
  }
});

test('allocation-free matching preserves pre-optimization palette/dither output goldens', () => {
  const width = 23, height = 17, data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set([p * 73 % 256, (p * 137 + 21) % 256, (p * 211 + 17) % 256, p % 11 === 0 ? 0 : (p * 59 + 13) % 256], p * 4);
  const expected = [
    '1160d615d0540ddcfba5b93bd3529e26a939237134958dda3f24920e1c2b9d00', '1c54fa54da1150241b96786d8cdffe90104475d41c9b5ecf1ba7958f8e630ec2', 'ee8f26290585d3d2ac5be3ca85aa5445525e9fb23d8e646bf4f283c94e0aa82a',
    'f3a77ac8bcad9143c6a0c8353275acf3f39f8e6425113cd59eb03bcc4846e126', '19e454e1e22e3ea6cea831ffbd1c3a4e0188700d6c713d68319544d7f626dc69', '210c2b4ca7d8d6e88e603dac3fe897cc76a33c25da9acce365ea80952ecc158a',
  ];
  let index = 0;
  for (const count of [64, 256]) for (const dither of ['none', 'bayer', 'floyd-steinberg'] as const) {
    const colours: RGB[] = Array.from({ length: count }, (_, i) => [i, i * 31 % 256, i * 53 % 256]);
    assert.equal(createHash('sha256').update(quantizeImage({ width, height, data }, { colours, dither }).data).digest('hex'), expected[index++]);
  }
});

test('nearest and Bayer remain exact beyond the bounded RGB cache capacity', () => {
  const width = 257, height = 257, pixels = width * height, data = new Uint8ClampedArray(pixels * 4), colours: RGB[] = Array.from({ length: 64 }, (_, i) => [i * 3, i * 31 % 256, i * 53 % 256]);
  for (let p = 0; p < pixels; p++) data.set([p >> 16 & 255, p >> 8 & 255, p & 255, 255], p * 4);
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (const dither of ['none', 'bayer'] as const) {
    const out = quantizeImage({ width, height, data }, { colours, dither });
    for (let p = 0; p < pixels; p++) {
      const rgb = Array.from(data.subarray(p * 4, p * 4 + 3));
      const order = colours.map((c, id) => ({ id, distance: c.reduce((sum, n, i) => sum + (n - rgb[i]!) ** 2, 0) })).sort((a, b) => a.distance - b.distance || a.id - b.id);
      const first = colours[order[0]!.id]!, second = colours[order[1]!.id]!, delta = second.map((n, i) => n - first[i]!);
      const fraction = Math.max(0, Math.min(1, delta.reduce((sum, n, i) => sum + (rgb[i]! - first[i]!) * n, 0) / delta.reduce((sum, n) => sum + n * n, 0)));
      const threshold = (matrix[(Math.floor(p / width) % 4) * 4 + p % width % 4]! + .5) / 16;
      assert.deepEqual(Array.from(out.data.subarray(p * 4, p * 4 + 4)), [...(dither === 'bayer' && threshold < fraction ? second : first), 255]);
    }
  }
});
