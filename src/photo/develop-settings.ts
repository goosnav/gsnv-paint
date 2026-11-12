/**
 * PURPOSE    Define, validate and preset the non-destructive Photo develop settings.
 * KIND       CORE
 * CONTRACT   IN: untrusted JSON (read), partial settings (merge) or a preset name.
 *            OUT: complete owned DevelopSettings with every value finite and inside SLIDERS ranges,
 *            crop inside the unit square, quarter turns 0..3.
 *            RAISES: DevelopSettingsError for unknown keys, wrong types or out-of-range values.
 * GUARANTEES Pure; defaults are the identity edit except the profile's base tone curve.
 * TUNING     SLIDERS holds ranges, steps and labels; PRESETS holds the look presets.
 * DECISIONS  D1: Lightroom-like slider vocabulary and ranges (−100..100, exposure ±5 EV) so users'
 *            existing intuition transfers. Revisit if: an owner requirement names other controls.
 * LIMITS     Global adjustments only; no local masks.
 * TESTBENCH  src/photo/develop-settings.test.ts -- run with: node --import tsx --test src/photo/develop-settings.test.ts
 */
export const BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;
type Bands = [number, number, number, number, number, number, number, number];
export type DevelopSettings = {
  profile: 'color' | 'mono';
  temperature: number; tint: number; exposure: number; contrast: number;
  highlights: number; shadows: number; whites: number; blacks: number;
  texture: number; clarity: number; dehaze: number; vibrance: number; saturation: number;
  curveHighlights: number; curveLights: number; curveDarks: number; curveShadows: number;
  hue: Bands; sat: Bands; lum: Bands;
  sharpenAmount: number; sharpenRadius: number; sharpenMasking: number; noiseLuminance: number; noiseColor: number;
  vignette: number; vignetteMidpoint: number; grain: number;
  crop: { x: number; y: number; width: number; height: number }; straighten: number; quarterTurns: 0 | 1 | 2 | 3; flip: boolean;
};
type Scalar = Exclude<keyof DevelopSettings, 'profile' | 'hue' | 'sat' | 'lum' | 'crop' | 'quarterTurns' | 'flip'>;
export const SLIDERS: Readonly<Record<Scalar, { label: string; min: number; max: number; step: number; fallback: number }>> = {
  temperature: { label: 'Temp', min: -100, max: 100, step: 1, fallback: 0 }, tint: { label: 'Tint', min: -100, max: 100, step: 1, fallback: 0 },
  exposure: { label: 'Exposure', min: -5, max: 5, step: 0.05, fallback: 0 }, contrast: { label: 'Contrast', min: -100, max: 100, step: 1, fallback: 0 },
  highlights: { label: 'Highlights', min: -100, max: 100, step: 1, fallback: 0 }, shadows: { label: 'Shadows', min: -100, max: 100, step: 1, fallback: 0 },
  whites: { label: 'Whites', min: -100, max: 100, step: 1, fallback: 0 }, blacks: { label: 'Blacks', min: -100, max: 100, step: 1, fallback: 0 },
  texture: { label: 'Texture', min: -100, max: 100, step: 1, fallback: 0 }, clarity: { label: 'Clarity', min: -100, max: 100, step: 1, fallback: 0 },
  dehaze: { label: 'Dehaze', min: -100, max: 100, step: 1, fallback: 0 }, vibrance: { label: 'Vibrance', min: -100, max: 100, step: 1, fallback: 0 },
  saturation: { label: 'Saturation', min: -100, max: 100, step: 1, fallback: 0 },
  curveHighlights: { label: 'Highlights', min: -100, max: 100, step: 1, fallback: 0 }, curveLights: { label: 'Lights', min: -100, max: 100, step: 1, fallback: 0 },
  curveDarks: { label: 'Darks', min: -100, max: 100, step: 1, fallback: 0 }, curveShadows: { label: 'Shadows', min: -100, max: 100, step: 1, fallback: 0 },
  sharpenAmount: { label: 'Amount', min: 0, max: 150, step: 1, fallback: 40 }, sharpenRadius: { label: 'Radius', min: 0.5, max: 3, step: 0.1, fallback: 1 },
  sharpenMasking: { label: 'Masking', min: 0, max: 100, step: 1, fallback: 0 }, noiseLuminance: { label: 'Noise reduction', min: 0, max: 100, step: 1, fallback: 0 },
  noiseColor: { label: 'Colour noise', min: 0, max: 100, step: 1, fallback: 25 },
  vignette: { label: 'Vignette', min: -100, max: 100, step: 1, fallback: 0 }, vignetteMidpoint: { label: 'Midpoint', min: 0, max: 100, step: 1, fallback: 50 },
  grain: { label: 'Grain', min: 0, max: 100, step: 1, fallback: 0 },
  straighten: { label: 'Straighten', min: -45, max: 45, step: 0.1, fallback: 0 },
};
const zeros = (): Bands => [0, 0, 0, 0, 0, 0, 0, 0];
export function defaultSettings(): DevelopSettings {
  const scalars = Object.fromEntries(Object.entries(SLIDERS).map(([k, v]) => [k, v.fallback])) as Record<Scalar, number>;
  return { profile: 'color', ...scalars, hue: zeros(), sat: zeros(), lum: zeros(), crop: { x: 0, y: 0, width: 1, height: 1 }, quarterTurns: 0, flip: false };
}
const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'DevelopSettingsError' }); };

export function readSettings(value: unknown): DevelopSettings {
  const v = value as DevelopSettings, base = defaultSettings();
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('Develop settings must be a record.');
  if (Object.keys(v).sort().join() !== Object.keys(base).sort().join()) fail('Develop settings have missing or unknown fields.');
  if (!['color', 'mono'].includes(v.profile)) fail('Profile must be color or mono.');
  for (const [key, range] of Object.entries(SLIDERS)) {
    const n = v[key as Scalar];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < range.min || n > range.max) fail(`${range.label} must be between ${range.min} and ${range.max}.`);
  }
  for (const key of ['hue', 'sat', 'lum'] as const) if (!Array.isArray(v[key]) || v[key].length !== 8 || !v[key].every(n => typeof n === 'number' && Number.isFinite(n) && n >= -100 && n <= 100)) fail('Colour mixer values are eight numbers from −100 to 100.');
  const c = v.crop;
  if (!c || typeof c !== 'object' || Object.keys(c).sort().join() !== 'height,width,x,y' || ![c.x, c.y, c.width, c.height].every(Number.isFinite) || c.width < 0.01 || c.height < 0.01 || c.x < 0 || c.y < 0 || c.x + c.width > 1 + 1e-9 || c.y + c.height > 1 + 1e-9) fail('Crop must lie inside the photo.');
  if (![0, 1, 2, 3].includes(v.quarterTurns) || typeof v.flip !== 'boolean') fail('Rotation must be a quarter turn and flip a boolean.');
  return JSON.parse(JSON.stringify(v)) as DevelopSettings;
}

/** Applies a partial change, clamping scalars into range, and returns a validated copy. */
export function mergeSettings(settings: DevelopSettings, change: Partial<DevelopSettings>): DevelopSettings {
  const next = { ...JSON.parse(JSON.stringify(settings)), ...JSON.parse(JSON.stringify(change)) } as DevelopSettings;
  for (const [key, range] of Object.entries(SLIDERS)) next[key as Scalar] = Math.min(range.max, Math.max(range.min, next[key as Scalar]));
  return readSettings(next);
}

const look = (change: Partial<DevelopSettings>) => change;
export const PRESETS: Readonly<Record<string, Partial<DevelopSettings>>> = {
  Natural: look({ contrast: 8, highlights: -25, shadows: 20, whites: 8, blacks: -6, clarity: 6, vibrance: 14 }),
  Vivid: look({ contrast: 22, highlights: -35, shadows: 25, whites: 12, blacks: -12, clarity: 15, dehaze: 8, vibrance: 35, saturation: 8 }),
  Portrait: look({ exposure: 0.1, contrast: 4, highlights: -30, shadows: 18, texture: -12, clarity: -6, vibrance: 10, sat: [0, -8, -4, 0, 0, 0, 0, 0], lum: [4, 10, 4, 0, 0, 0, 0, 0] }),
  Landscape: look({ contrast: 18, highlights: -45, shadows: 30, whites: 10, blacks: -10, texture: 12, clarity: 18, dehaze: 15, vibrance: 28, sat: [0, 0, 0, 10, 8, 14, 0, 0], lum: [0, 0, 0, -6, 0, -12, 0, 0] }),
  'Black & White': look({ profile: 'mono', contrast: 25, highlights: -20, shadows: 15, whites: 15, blacks: -15, clarity: 15, lum: [8, 12, 10, -6, -10, -18, -6, 4] }),
  'Film Warm': look({ temperature: 12, tint: 4, contrast: 10, highlights: -20, shadows: 10, curveShadows: 18, curveHighlights: -10, vibrance: -6, saturation: -8, grain: 22, vignette: -12 }),
  Matte: look({ contrast: -12, highlights: -20, shadows: 15, curveShadows: 30, curveDarks: 6, curveHighlights: -14, saturation: -14, vignette: -8 }),
  'High Key': look({ exposure: 0.6, contrast: -14, highlights: -30, shadows: 40, whites: 18, blacks: 15, vibrance: 6, saturation: -10 }),
};
