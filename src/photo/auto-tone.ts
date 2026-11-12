/**
 * PURPOSE    Suggest exposure and tone settings from a photo's luminance distribution.
 * KIND       CORE
 * CONTRACT   IN: {image: linear RGB proxy, settings (white balance and geometry are kept), kind}.
 *            OUT: Partial<DevelopSettings> for exposure, contrast, highlights, shadows, whites, blacks and
 *            vibrance, every value inside its slider range.
 *            RAISES: RangeError for malformed images (via develop).
 * GUARANTEES Pure and deterministic; a well-exposed mid-grey frame gets near-zero exposure change.
 * TUNING     TARGET_MEDIAN=0.46 in display terms; percentiles 0.5 % and 99.5 %. Bright scenes that
 *            do not clip are left bright (high-key), only lightly darkened.
 * DECISIONS  D1: Measure the actual rendered output (two develop passes) rather than the input, so the
 *            base curve and white balance are accounted for. Revisit if: auto must run on full resolution.
 * LIMITS     Global statistics; no scene or face detection.
 * TESTBENCH  src/photo/auto-tone.test.ts -- run with: node --import tsx --test src/photo/auto-tone.test.ts
 */
import { develop, type LinearImage } from './develop.ts';
import { defaultSettings, mergeSettings, type DevelopSettings } from './develop-settings.ts';

const TARGET_MEDIAN = 0.46;
function percentiles(histogram: Uint32Array) {
  const luma = histogram.subarray(768, 1024), total = luma.reduce((s, v) => s + v, 0), at = (p: number) => { let sum = 0; for (let i = 0; i < 256; i++) { sum += luma[i]!; if (sum >= p * total) return i / 255; } return 1; };
  return { low: at(0.005), median: at(0.5), high: at(0.995), clipped: (luma[255]! + luma[254]!) / total, crushed: (luma[0]! + luma[1]!) / total };
}

export function autoTone({ image, settings, kind }: { image: LinearImage; settings: DevelopSettings; kind: 'raw' | 'display' }): Partial<DevelopSettings> {
  const base = { ...defaultSettings(), temperature: settings.temperature, tint: settings.tint, profile: settings.profile, sharpenAmount: 0, noiseColor: 0 };
  const measure = (change: Partial<DevelopSettings>) => percentiles(develop({ image, settings: mergeSettings(base, change), kind, ignoreCrop: true }).histogram);
  let exposure = 0;
  for (let pass = 0; pass < 2; pass++) {
    const m = measure({ exposure });
    // Display median ≈ (linear)^(1/2.2); convert the brightness error back into stops.
    let step = 2.2 * Math.log2(TARGET_MEDIAN / Math.max(0.02, m.median)) * 0.7;
    if (step < 0 && m.clipped < 0.003) step *= 0.25;
    exposure = Math.max(-4, Math.min(4, exposure + step));
  }
  const m = measure({ exposure }), round = (v: number) => Math.round(Math.max(-100, Math.min(100, v)));
  return {
    exposure: Math.round(exposure * 20) / 20,
    contrast: round(m.high - m.low < 0.7 ? 18 : 6),
    highlights: round(-20 - m.clipped * 600),
    shadows: round(m.low < 0.04 ? 25 : 10),
    whites: round(Math.max(-40, Math.min(40, (0.96 - m.high) * 150))),
    blacks: round(m.crushed > 0.01 ? 10 : -Math.min(25, m.low * 60)),
    vibrance: 15,
  };
}
