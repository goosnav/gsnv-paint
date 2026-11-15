# Classic Paint artwork — owner revision, 2026-11-15

The owner rejected the previous thin, muted Fugue-first set. Paint now uses fuller
source silhouettes, a stronger 32-colour palette and binary coverage. Toolbox
images have 16×16 source pixels displayed at 24 CSS pixels with nearest-neighbour
sampling inside unchanged 32px desktop / 40px touch buttons. Common toolbar/menu
icons stay 16px. Workspace tabs and other editors are unchanged.

## Sources and licenses

- **ReactOS Paint**, independently authored tool strip by Benedikt Freisen, 2009,
  and ReactOS contributors. **LGPL-2.0-or-later**. Acquired from the author's
  maintained standalone RPaint repository, pinned commit
  `825ab84c3f23400c084f310e8b492b654ab064f6`. `reactos/iconbar.bmp` is byte-identical
  to the original ReactOS submission `1ef38b9a3c9a635a44662f770d01aeb16386cf4d`.
  The resource declaration, upstream README and full LGPL text are preserved.
  Eleven tiles supply lasso, rectangle selection, eraser, bucket, eyedropper,
  brush, airbrush, text, line, rectangle and ellipse. The magenta key is made
  transparent; tiles are cropped and colour-processed. These derivatives remain
  LGPL-2.0-or-later. This is not extracted Microsoft artwork.
- **Silk**, Mark James, **CC BY 2.5**, creator's repository pinned at
  `ae40eb194a6e4e86ad64d677611868c3d22d3c2a`. Seventeen PNGs supply common commands,
  the wand and transform handles. Upstream notice is `silk/README.txt`.
- **Fugue 3.5.6**, copyright 2013 Yusuke Kamiyamane, **CC BY 3.0**. Selected
  complementary shapes, including the familiar pencil, remain. The original
  32-file subset and source hashes remain archived unchanged; current rendered
  versions have stronger saturation/contrast and a restricted palette.
- **Tabler 3.52.0**, copyright 2020–2026 Paweł Kuna, **MIT**. Move and ellipse
  selection use 2.25-unit source strokes rasterized onto the 16px grid. Earlier
  thin shape derivatives remain archived; current drawing shapes come from Paint.

`provenance.json` records source URLs/commits/hashes, every tool mapping and each
colour-processing recipe. The visible Help credits link to the creator/project
pages, full notices and a locally shipped artwork source ZIP. The source ZIP
contains the preferred, directly editable PNGs plus original BMP/PNG/SVG sources,
licenses and recipes; no app logic is incorporated from another editor.

## Reproduce or replace

```sh
node --import tsx vendor/paint-icons/build-classic.mjs
node --import tsx vendor/paint-icons/build-classic.mjs --check
node vendor/paint-icons/generate.mjs
node vendor/paint-icons/generate.mjs --check
```

The development-only builder uses installed Chrome/Playwright for decoding and
the app's `quantizeImage` CORE for colour mapping. It retains source geometry,
removes only ReactOS's exact magenta key, applies each recipe's saturation and
contrast, then maps to the listed RGB palette without dithering. The New page
receives a one-pixel grey keyline so it remains visible against the toolbar.
No processing, packages or network requests are needed at runtime.

Manual recipe: saturation uses luminance `0.2126R + 0.7152G + 0.0722B` and scales
each channel's distance from it; contrast scales distance from 128. Clamp/round
channels to bytes. Alpha below 128 becomes transparent; other pixels become
opaque. Choose the nearest listed palette RGB by squared Euclidean distance,
with the first colour winning ties. Directly editable output PNGs are in
`classic/`; no proprietary tool or hidden source is needed to change them.

The reviewed PNGs are embedded by `generate.mjs` into `paint-bitmaps.ts`. Runtime
SVG wrappers only supply accessibility, layout and local PNG display. Prefer
reviewing the actual toolbox over enlarged contact sheets; passing tests does
not imply owner approval of artwork.
