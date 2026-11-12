# Image workspace (Paint + Photoshop/GIMP essentials) — provisional GREEN

[D20](DECISIONS.md#d20--deliver-a-working-paint-style-image-workspace-before-the-full-layer-roster) introduced a paint-style editor. The 2026-11-12 plan (item 2) extends it with the Photoshop/GIMP functionality people use most. The full I01–I37 roster stays planned; this working increment is I50–I57 plus IMAGE-APP. Nothing is human-ACCEPTED.

## Tools (shortcut)

| Group | Tools |
|---|---|
| Move and select | Move (V), Rectangle select (S), Ellipse select (M), Lasso (Q), Magic wand (W). Shift adds to the selection, Ctrl subtracts. Selections are pixel masks shown with marching ants; dragging inside one moves its pixels. |
| Paint | Pencil (P, hard pixels), Brush (B: size, hardness, opacity, flow), Airbrush (A: sprays while held), Eraser (E: to transparency; to the secondary colour on the bottom layer), Clone stamp (C: Ctrl-click sets the source), Blur brush (U), Smudge (K: the brush carries picked-up colour; Strength), Fill (G: tolerance, contiguous), Gradient (N: linear/radial, to the secondary colour or transparent) |
| Draw | Text (T), Line (L), Rectangle (R), Ellipse (O): outline, fill or both; Shift for squares, circles and 45° |
| Colour | Pick colour (I), 28-colour XP palette, exact colour inputs, X swap, D defaults |

Every numeric option is an XP trackbar paired with a typed number box (applied on Enter or blur). `[` and `]` change brush size; a ring follows the cursor at the brush's footprint. All painting, fills, gradients, text and adjustments are clipped to the selection.

## Layers, adjustments, filters

- **Layers:** new, duplicate, delete, move up/down, visibility, rename (double-click), opacity, blend mode (normal, multiply, screen, overlay, darken, lighten, difference), merge down, flatten. Paste and Import as layer create new layers.
- **Adjustments** (live preview, OK/Cancel): Brightness/Contrast, Hue/Saturation, Levels, Curves (outputs at 64/128/192 through a monotone curve), Colour balance, Desaturate, Invert, Sepia, Posterize, Threshold.
- **Filters:** Gaussian blur, Unsharp mask, Add noise, Pixelate, Find edges, Emboss.
- **Image:** Open image as a new document, Export PNG (flattened), Resize, Canvas size, Crop to selection, rotate, flip.
- **Files:** `.gsnv-image` projects store each layer as its own asset; projects from the single-layer version still open.

## Verification — 2026-11-12

| Check | Result |
|---|---|
| `image-composite.test.ts` | Golden pixels for all seven blend modes, opacity, transparency, hidden layers; masked merge with soft edges |
| `image-adjust.test.ts` | Identity settings, known values for brightness/contrast/levels/curves/threshold/posterize/hue/desaturate, monotone curves, premultiplied blur, unsharp edges, pixelate averages, seeded noise, region limits |
| `image-brush.test.ts` | Smudge carry and fade, soft falloff, flow accumulation, gap-free strokes, deterministic spray, paint/erase/clone/filter coverage, gradients, rectangle/ellipse/lasso masks, contiguous/global wand, mask algebra |
| `image-content.test.ts` | Tile sharing per layer, stack edits reusing tiles, byte-exact layered round trip, legacy single-layer decode, rejection cases |
| IMAGE-APP browser tests (production build, Chrome 154) | Pencil/rectangle/fill/pick/move pixels, undo/redo, two-layer project round trip with exact bytes per layer, PNG export, Open image, reopen, recovery. Second test: brush clipped to an ellipse selection, layer opacity 50 % (exact grey), screen blend, invert, Brightness/Contrast preview and cancel, Levels, Gaussian blur, merge down, text, resize, canvas size, crop, with the exact history labels |
| `npm test` / `npm run test:browser` | 562 / 22 pass |

## Limits

No layer masks, groups or editable text layers. Selections are hard-edged (no feather). Colour editing is opaque. Images are limited to 4096 × 4096 pixels. Pen pressure is not used. Other browsers and operating systems are untested.
