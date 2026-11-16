/**
 * PURPOSE    Define the named starting canvases offered by New image.
 * KIND       CORE
 * CONTRACT   Presets contain pixel dimensions and the complete initial drawing style.
 *            Matching accepts either orientation, but requires the same style.
 * GUARANTEES No raster allocation or persistence; every preset fits MAX_PIXELS.
 * TUNING     Print densities are sizing guides, not embedded export metadata.
 * TESTBENCH  node --import tsx --test src/image/image-settings.test.ts
 */
import { MAX_PIXELS } from './raster-ops.ts';
import type { DialogSpec } from '../shared/dialog.ts';

type Values = DialogSpec['initial'];
type Style = { background: 'white' | 'transparent'; mode: 'pixel-art' | 'smooth'; colours: string; dither: 'none' };
export type NewImagePreset = Readonly<Style & { id: string; label: string; width: number; height: number; ppi?: number }>;
const paper: Style = { background: 'white', mode: 'pixel-art', colours: 'full', dither: 'none' };
const screen: Style = { ...paper, mode: 'smooth' };
const squareSide = Math.floor(Math.sqrt(MAX_PIXELS));

export const NEW_IMAGE_PRESETS: readonly NewImagePreset[] = Object.freeze([
  { ...paper, id: 'letter', label: 'US Letter · 8.5 × 11 in', width: 2550, height: 3300, ppi: 300 },
  { ...paper, id: 'comic-64', label: 'Comic page · 64 colours', width: 3300, height: 2550, ppi: 300, background: 'transparent', colours: '64' },
  { ...paper, id: 'half-letter', label: 'Half Letter · 5.5 × 8.5 in', width: 1650, height: 2550, ppi: 300 },
  { ...paper, id: 'a4', label: 'A4 · 210 × 297 mm', width: 2480, height: 3508, ppi: 300 },
  { ...paper, id: 'square-max', label: `Maximum square · ${squareSide} × ${squareSide}`, width: squareSide, height: squareSide, background: 'transparent' },
  { ...screen, id: 'square-social', label: 'Square post · 1:1', width: 1080, height: 1080 },
  { ...screen, id: 'portrait-social', label: 'Portrait post · 4:5', width: 1080, height: 1350 },
  { ...screen, id: 'reels', label: 'Reels / Stories · 9:16', width: 1080, height: 1920 },
  { ...screen, id: 'youtube-thumbnail', label: 'YouTube thumbnail · HD', width: 1280, height: 720 },
  { ...screen, id: 'youtube-4k', label: 'YouTube thumbnail · 4K', width: 3840, height: 2160 },
  { ...paper, id: 'poster-tabloid', label: 'Poster · 11 × 17 in', width: 2640, height: 4080, ppi: 240 },
  { ...paper, id: 'poster-18x24', label: 'Poster · 18 × 24 in', width: 2700, height: 3600, ppi: 150 },
  { ...paper, id: 'small-canvas', label: 'Small canvas · 800 × 600', width: 800, height: 600 },
].map(preset => Object.freeze(preset as NewImagePreset)));

export function newImagePresetValues(preset: NewImagePreset): Values {
  return { preset: preset.id, width: preset.width, height: preset.height, background: preset.background, mode: preset.mode, colours: preset.colours, dither: preset.dither };
}

export function matchingNewImagePreset(values: Readonly<Values>): NewImagePreset | undefined {
  return NEW_IMAGE_PRESETS.find(preset =>
    ((values.width === preset.width && values.height === preset.height) || (values.width === preset.height && values.height === preset.width)) &&
    values.background === preset.background && values.mode === preset.mode && values.colours === preset.colours && values.dither === preset.dither);
}
