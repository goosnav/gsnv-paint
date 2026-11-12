import { test } from 'node:test'; import assert from 'node:assert/strict';
import { develop, blur, toLinear, toDisplay, type LinearImage } from './develop.ts';
import { defaultSettings, mergeSettings, readSettings, PRESETS, type DevelopSettings } from './develop-settings.ts';
import { autoTone } from './auto-tone.ts';

const flat = (w: number, h: number, rgb: [number, number, number]): LinearImage => { const data = new Float32Array(w * h * 3); for (let i = 0; i < w * h; i++) data.set(rgb, i * 3); return { width: w, height: h, data }; };
const none = (change: Partial<DevelopSettings> = {}) => mergeSettings(defaultSettings(), { sharpenAmount: 0, noiseColor: 0, ...change });
const px = (r: { rgba: Uint8ClampedArray; width: number }, x: number, y: number) => [...r.rgba.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 3)];

test('P-DEVELOP display images round-trip unchanged at neutral settings; raw mid-grey renders near 0.48', () => {
  const grey = toLinear(118 / 255), out = develop({ image: flat(4, 3, [grey, toLinear(30 / 255), toLinear(200 / 255)]), settings: none(), kind: 'display' });
  assert.deepEqual(px(out, 1, 1), [118, 30, 200]); assert.equal(out.width, 4); assert.equal(out.histogram.reduce((s, v) => s + v, 0), 4 * 12);
  const raw = develop({ image: flat(2, 2, [0.18, 0.18, 0.18]), settings: none(), kind: 'raw' });
  assert.ok(Math.abs(px(raw, 0, 0)[0]! - Math.round(toDisplay(0.2) * 255)) <= 1); assert.ok(px(raw, 0, 0).every(v => v === px(raw, 0, 0)[0]));
});

test('P-DEVELOP exposure is in stops, white balance warms/cools, monochrome removes chroma', () => {
  const image = flat(2, 2, [0.1, 0.1, 0.1]), at = (s: Partial<DevelopSettings>) => px(develop({ image, settings: none(s), kind: 'display' }), 0, 0);
  assert.ok(Math.abs(at({ exposure: 1 })[0]! - Math.round(toDisplay(0.2) * 255)) <= 1);
  const warm = at({ temperature: 60 }), cool = at({ temperature: -60 }), magenta = at({ tint: 50 });
  assert.ok(warm[0]! > warm[2]! && cool[2]! > cool[0]!); assert.ok(magenta[1]! < magenta[0]!);
  const mono = px(develop({ image: flat(2, 2, [0.4, 0.1, 0.05]), settings: none({ profile: 'mono' }), kind: 'display' }), 0, 0);
  assert.ok(Math.abs(mono[0]! - mono[1]!) <= 1 && Math.abs(mono[1]! - mono[2]!) <= 1);
});

test('P-DEVELOP tone sliders move the right regions and the parametric curve stays monotone', () => {
  const ramp: LinearImage = { width: 64, height: 1, data: new Float32Array(64 * 3).map((_, i) => toLinear(Math.floor(i / 3) / 63)) };
  const lum = (s: Partial<DevelopSettings>) => { const r = develop({ image: ramp, settings: none(s), kind: 'display' }); return Array.from({ length: 64 }, (_, x) => r.rgba[x * 4]!); };
  const base = lum({}), shadows = lum({ shadows: 80 }), highlights = lum({ highlights: -80 }), contrast = lum({ contrast: 60 });
  assert.ok(shadows[10]! > base[10]! + 5 && Math.abs(shadows[60]! - base[60]!) <= 4);
  assert.ok(highlights[55]! < base[55]! - 5 && Math.abs(highlights[8]! - base[8]!) <= 3);
  assert.ok(contrast[10]! < base[10]! && contrast[55]! > base[55]!);
  const curve = lum({ curveShadows: 100, curveHighlights: -100 }); assert.ok(curve[8]! > base[8]! && curve[56]! < base[56]!);
  for (const values of [shadows, highlights, contrast, curve]) for (let i = 1; i < 64; i++) assert.ok(values[i]! >= values[i - 1]! - 1, 'tone stays monotone');
});

test('P-DEVELOP vibrance protects saturated colour more than saturation; mixer hue shifts only its band', () => {
  const image: LinearImage = { width: 2, height: 1, data: new Float32Array([0.3, 0.2, 0.15, 0.6, 0.02, 0.02]) };
  const chroma = (s: Partial<DevelopSettings>) => { const r = develop({ image, settings: none(s), kind: 'display' }); return [0, 1].map(x => { const [a, b, c] = px(r, x, 0); return Math.max(a!, b!, c!) - Math.min(a!, b!, c!); }); };
  const base = chroma({}), vib = chroma({ vibrance: 80 }), sat = chroma({ saturation: 80 });
  assert.ok(vib[0]! / base[0]! > vib[1]! / base[1]!); assert.ok(sat[1]! > base[1]!);
  const blue = flat(1, 1, [0.02, 0.05, 0.5]), red = flat(1, 1, [0.5, 0.03, 0.03]);
  const hueBlue = mergeSettings(none(), { hue: [0, 0, 0, 0, 0, 100, 0, 0] });
  assert.notDeepEqual(px(develop({ image: blue, settings: hueBlue, kind: 'display' }), 0, 0), px(develop({ image: blue, settings: none(), kind: 'display' }), 0, 0));
  assert.deepEqual(px(develop({ image: red, settings: hueBlue, kind: 'display' }), 0, 0), px(develop({ image: red, settings: none(), kind: 'display' }), 0, 0));
});

test('P-DEVELOP geometry: quarter turns, flip, crop and straighten produce exact output sizes and mappings', () => {
  const image: LinearImage = { width: 3, height: 2, data: new Float32Array(18) }; image.data.set([1, 1, 1], 0); // white top-left pixel
  const corner = (s: Partial<DevelopSettings>) => { const r = develop({ image, settings: none(s), kind: 'display' }); return { size: [r.width, r.height], white: Array.from({ length: r.width * r.height }, (_, i) => r.rgba[i * 4]! > 200 ? i : -1).filter(i => i >= 0) }; };
  assert.deepEqual(corner({}), { size: [3, 2], white: [0] });
  assert.deepEqual(corner({ quarterTurns: 1 }), { size: [2, 3], white: [1] });
  assert.deepEqual(corner({ quarterTurns: 2 }), { size: [3, 2], white: [5] });
  assert.deepEqual(corner({ quarterTurns: 3 }), { size: [2, 3], white: [4] });
  assert.deepEqual(corner({ flip: true }), { size: [3, 2], white: [2] });
  assert.deepEqual(corner({ crop: { x: 1 / 3, y: 0, width: 2 / 3, height: 1 } }).size, [2, 2]);
  const straight = develop({ image: flat(100, 60, [0.2, 0.2, 0.2]), settings: none({ straighten: 10 }), kind: 'display' });
  assert.deepEqual([straight.width, straight.height], [100, 60]); assert.ok(straight.rgba.every((v, i) => i % 4 === 3 || v > 100), 'no empty corners after straighten');
  assert.deepEqual([develop({ image: flat(10, 10, [0, 0, 0]), settings: none({ crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } }), kind: 'display', ignoreCrop: true }).width], [10]);
});

test('P-DEVELOP blur preserves mean and flat fields; detail, effects and presets stay valid and deterministic', () => {
  const plane = new Float32Array(100).map((_, i) => i % 10); const b = blur(plane, 10, 10, 2);
  assert.ok(Math.abs(b.reduce((s, v) => s + v, 0) / 100 - 4.5) < 0.6); assert.deepEqual([...blur(new Float32Array(9).fill(3), 3, 3, 1)], new Array(9).fill(3));
  const noisy: LinearImage = { width: 40, height: 30, data: new Float32Array(3600).map((_, i) => toLinear(0.4 + 0.2 * Math.sin(i * 1.7))) };
  const full = none({ sharpenAmount: 80, noiseLuminance: 40, noiseColor: 40, clarity: 40, texture: 30, dehaze: 30, vignette: -60, grain: 50 });
  const one = develop({ image: noisy, settings: full, kind: 'raw' }), two = develop({ image: noisy, settings: full, kind: 'raw' });
  assert.deepEqual(one.rgba, two.rgba); assert.ok(one.rgba.every(Number.isFinite));
  const vig = develop({ image: flat(41, 41, [0.18, 0.18, 0.18]), settings: none({ vignette: -100 }), kind: 'display' });
  assert.ok(px(vig, 0, 0)[0]! < px(vig, 20, 20)[0]! - 20);
  for (const preset of Object.values(PRESETS)) readSettings(mergeSettings(defaultSettings(), preset));
  assert.throws(() => develop({ image: { width: 2, height: 2, data: new Float32Array(3) }, settings: none(), kind: 'raw' }), RangeError);
});

test('P-AUTO brightens a dark frame, darkens a bright one and stays inside slider ranges', () => {
  const scene = (gain: number): LinearImage => ({ width: 32, height: 32, data: new Float32Array(32 * 32 * 3).map((_, i) => gain * (0.02 + 0.3 * ((Math.floor(i / 3) % 32) / 31) ** 2)) });
  const dark = autoTone({ image: scene(0.15), settings: defaultSettings(), kind: 'raw' }), bright = autoTone({ image: scene(20), settings: defaultSettings(), kind: 'raw' });
  assert.ok(dark.exposure! > 1); assert.ok(bright.exposure! < -0.5);
  for (const result of [dark, bright]) readSettings(mergeSettings(defaultSettings(), result));
});
