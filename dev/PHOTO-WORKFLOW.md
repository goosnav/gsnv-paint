# Photo workspace (Lightroom-style develop) — provisional GREEN

[D23](DECISIONS.md#d23--photo-workspace-with-libraw-and-a-scene-linear-develop-pipeline) adds a fourth workspace for making RAW photos look finished without Lightroom's catalogue and long tail of features.

## What it does

- **Import:** Photo → Import photo… (or drop a file on the stage). Camera RAW (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW …) decodes through LibRaw-WASM to 16-bit linear sRGB with camera white balance. JPEG, PNG, WebP, AVIF, HEIC and TIFF decode through the browser where it supports them. The original file is stored unchanged inside the `.gsnv-photo` project.
- **Develop panel:**
  - Live RGB histogram with clipping markers.
  - Auto tone.
  - Colour / B&W profile.
  - Eight presets: Natural, Vivid, Portrait, Landscape, Black & White, Film Warm, Matte, High Key.
  - Crop & geometry: aspect presets, straighten, rotate, flip.
  - Light: Exposure, Contrast, Highlights, Shadows, Whites, Blacks.
  - Colour: Temp, Tint, Vibrance, Saturation.
  - Presence: Texture, Clarity, Dehaze.
  - Parametric tone curve.
  - Colour mixer: hue, saturation and luminance for 8 bands.
  - Detail: sharpening amount, radius and masking; luminance and colour noise reduction.
  - Effects: post-crop vignette, midpoint, grain.
- **Interaction:** double-click a slider label to reset it. `\` toggles before/after; R enters crop (drag the frame or handles, Enter applies, Esc cancels). Ctrl+C / Ctrl+V copy and paste develop settings between photos. Each slider release, preset, Auto, crop or rotation is one history entry.
- **Export:** JPEG (quality 10–100) or PNG, at full size or limited to a long edge of 4096, 2560, 2048 or 1080 px. Export runs the same pipeline at full resolution in a worker.

## How it looks professional

RAW data stays scene-linear through white balance, exposure, dehaze and the tone sliders. The tone sliders act on log luminance around mid-grey, with masks blended 50/50 between the pixel and a large-radius blur (local tone mapping). A filmic (ACES-fitted) base curve then adds a highlight shoulder and mid-tone contrast, calibrated so mid-grey 0.18 renders at sRGB ≈ 0.48. Colour work happens in an opponent luma/chroma space, so saturation and hue changes don't shift brightness. Vibrance protects already-saturated colours and skin hues. Radii scale with image size, so the screen preview and the full-size export match.

## Performance

The preview renders at screen resolution (up to 2400 px), at half that while a slider is moving, in a worker; the latest request wins. On the test machine a 1600 × 1067 frame takes about 0.4 s neutral and up to 1.2 s with every effect on. Full 22 MP export took a few seconds in the browser test.

## Verification — 2026-11-12

| Check | Result |
|---|---|
| `src/photo/develop.test.ts` | Display identity, RAW mid-grey calibration, exposure in stops, WB direction, B&W, region-specific tone sliders, monotone curves, vibrance vs saturation, band-limited hue, all geometry mappings, straighten without empty corners, determinism, vignette, presets valid, Auto direction |
| `src/photo/develop-settings.test.ts`, `photo-content.test.ts` | Validation, clamping, RAW detection, project round trip and rejection cases |
| PHOTO-APP browser test (production build, Chrome 154) | Real LibRaw decode of the 5D Mark III DNG; Auto; B&W (max channel difference ≤ 2); keyboard slider raises brightness; reset; undo; before/after; 1:1 crop; project save with the byte-identical original; 2048 px and full-size JPEG exports with correct dimensions; JPEG import; project reopen |
| `npm test` / `npm run test:browser` | 550 / 22 pass |

[Screenshot](evidence/PHOTO-APP-production.png).

## Limits

Global adjustments only (no brushes or masks), no lens-profile or chromatic-aberration correction, sRGB working gamut, no XMP sidecar interchange. Very large RAW files need several hundred MB of memory during a full-size export. Zooming past fit enlarges the screen-resolution preview rather than rendering 1:1 detail.
