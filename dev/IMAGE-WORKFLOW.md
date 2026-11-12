# Working Image increment — provisional GREEN

The production entry now registers an Image workspace beside CAD ([D20](DECISIONS.md#d20--deliver-a-working-paint-style-image-workspace-before-the-full-layer-roster)). I50–I53 and IMAGE-APP are GREEN component/assembly checkpoints; the full I01–I37 roster (layers, masks, blend modes, adjustments, freehand selections) remains PLANNED. No brick is human-ACCEPTED.

## Supported workflow

New creates an 800 × 600 white image (fitted to the window). Tools, with shortcuts: Select (S), Pencil (P, 1 px), Brush (B, round), Eraser (E, paints the secondary colour), Fill (G), Pick colour (I, returns to the previous tool), Line (L), Rectangle (R), Ellipse (O), Text (T). Left button uses the primary colour, right button the secondary. Shift draws squares/circles and snaps lines to 45°. X swaps colours, D restores black/white. The Colours panel holds the 28-swatch palette (click primary, right-click secondary), exact colour inputs, tool size (1–512 px) and the shape style (outline, fill, outline and fill).

Select drags a rectangle; dragging inside lifts and moves it (the vacated area becomes the secondary colour). The selection floats until Enter, a click outside it or a tool change places it; Esc discards it. Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V (system clipboard image when the browser allows it, otherwise the in-app clipboard), Delete and Crop to selection work on it. The Image menu adds Import image (PNG/JPEG/GIF/WebP/BMP), Export PNG, Resize, Canvas size, rotate, flip, invert, clear, zoom to fit (F) and actual pixels. Wheel zooms around the cursor; Space-drag or middle-drag pans.

Every completed action is one history entry; Ctrl+Z/Ctrl+Y and the History panel work as in CAD. Ctrl+S saves an editable `.gsnv-image` project (S15 container, one raw rgba8 asset); local recovery is automatic.

## Verification — 2026-11-12

Environment: Linux x64, Chrome 154.0.8037.97 headless at 1280 × 720.

| Command | Result |
|---|---|
| `npm test` | 537 tests, 537 pass (includes I50–I53 testbenches and the S05/S10/A-SHELL amendments) |
| `npm run typecheck` | exit 0 |
| `npm run test:browser` | 21 tests, 21 pass (two IMAGE-APP production tests) |

The IMAGE-APP production test checks exact canvas pixels after pencil, rectangle outline, flood fill, right-click colour pick and a selection move; undo/redo; rotate and undo; native project download with the exact saved pixel bytes; PNG export (signature and 800 × 600 header); import of that PNG; reopening the project; and local recovery after reload. The second test covers text, Shift-circle with outline-and-fill, resize with kept aspect ratio, canvas size and crop, with the exact history labels. [Production screenshot](evidence/IMAGE-APP-production.png).

During integration the browser tests found two defects that are now fixed: menu enablement (e.g. Crop) did not refresh after canvas gestures, which led to the shell `invalidate()` hook; and a test-harness timing issue where Chrome ignores a second file chooser opened within ~100 ms of the previous one (the test waits; users are unaffected).

## Limits

Single raster layer; rectangular selection only; opaque colour editing (imported transparency is preserved and composited); images up to 4096 × 4096 pixels; aliased drawing; text is rasterized on commit and is not re-editable. Pen pressure is not used. Native file-picker interaction, other browsers and other operating systems are untested for this increment.
