# Paint artwork

## Active artwork — Windows XP-style, 2026-11-16

Paint uses **19 native 24px tool icons and 18 native 16px command icons**, drawn
as one original pixel-art set by Goosnav LLC. Familiar pencil, brush, bucket,
selection and geometric symbols fit the application's Windows XP-style controls.
Extended tools use the same line weight and saturated colour accents.

The colour revision increases saturation and brightness in the blue, yellow,
orange, pink and green ramps. Neutral outlines and highlights retain their
contrast. The Fill icon uses a simpler metal pail with one open rim, a visible
handle and a connected blue paint stream and puddle.

The artwork uses a shared 15-colour palette on an integer pixel grid, with binary
alpha and a transparent outer margin. There is no antialiasing, drop shadow or
automatic black-contour pass. The toolbox displays 24px artwork at 24 CSS pixels;
commands use their native 16px size. Existing 32px desktop / 40px touch targets,
labels, shortcuts and selected states are preserved. Other workspaces retain
their existing vector artwork.

The original artwork and its builder are **MIT licensed**; see `XP-LICENSE.txt`
and the shipped `public/licenses/paint-xp.LICENSE.txt`. These are newly drawn
icons, not extracted Microsoft artwork. `xp.json` records the palette, native
sizes, source files and license. The editable source is `xp-tools.mjs` and
`xp-commands.mjs`, using the integer drawing operations in `xp-pixels.mjs`.
The generated PNGs live in `xp/`.

### Reproduce the active set offline

```sh
node vendor/paint-icons/build-xp.mjs
node vendor/paint-icons/build-xp.mjs --check
node vendor/paint-icons/generate.mjs
node vendor/paint-icons/generate.mjs --check
python3 vendor/paint-icons/package-sources.py
python3 vendor/paint-icons/package-sources.py --check
```

The artwork builder uses only the Node standard library, including its PNG
encoder. No browser, renderer package or network request is needed. The archive
packager uses the Python standard library. `generate.mjs` embeds the reviewed
PNGs and native-size metadata into `src/shared/paint-bitmaps.ts`; the existing
accessible SVG wrapper displays them locally at runtime.

`public/licenses/classic-paint-artwork.zip` contains the active editable sources,
PNGs and license, alongside earlier artwork and its original notices. Review
the native-size icons as well as an enlarged sheet after editing. Pixel checks
protect rendering invariants; they do not establish visual acceptance.

## Archived illustrated artwork — 2026-11-15

The previous 19-tool set combined GIMP, KolourPaint and Font Awesome artwork at
24px. It used hard coverage, colour adjustments, a gold lasso and wand stars,
and an added near-black contour inside every silhouette. These files remain in
`illustrated/` for source and license continuity; they are no longer the active
Paint tool icons.

`illustrated.json` pins each original URL, commit, author, hash, per-file license
and colour recipe. Originals are in `illustrated-sources/`, including editable
KolourPaint SVGZs. GIMP's theme notice supplies CC BY-SA 4.0 where no file-specific
license is present. Explicit file metadata takes precedence:

- Selections, lasso, brush, blur, smudge and text: **CC BY-SA 2.0**.
- Move, pencil, clone and gradient: **CC BY-SA 4.0**.
- Bucket: **GPL 2.0**.

The derivatives retain those licenses. GIMP contributors include Jakub Steiner,
Klaus Staedtler, Andreas Nilsson and Barak Itkin. KolourPaint artwork is credited
to Nuno Pinheiro, Danny Allen, Clarence Dang and Kristof Borrey under its project
BSD redistribution terms. Font Awesome Free 6.7.2 artwork is copyright 2024
Fonticons, Inc., under CC BY 4.0. Full notices ship locally and in the source ZIP.
No software implementation from these projects is used.

The archived `build-illustrated.mjs` rasterized vectors at 22px within a 24px
canvas, or centered native 22px PNGs. Alpha below 112 became transparent and the
remaining coverage opaque. Per-tool colour recipes retained interior shading.
The final pass changed occupied pixels adjoining transparency to `#101010`,
including internal holes; it did not expand silhouettes. Dark details received
the documented per-tool threshold, while white selection dashes were removed.
This processing belongs to the archived revision, not the active XP-style set.

## Archived 16px artwork — 2026-11-15

An earlier set used 16px source icons displayed at 24 CSS pixels, with a shared
32-colour palette and hard coverage. Its generated files remain in `classic/`;
the earlier Fugue and Tabler derivatives also remain archived. Their sources:

- **ReactOS Paint / RPaint**, original tool strip copyright 2009 Benedikt Freisen
  and ReactOS contributors, **LGPL-2.0-or-later**. Source commit
  `825ab84c3f23400c084f310e8b492b654ab064f6` in the author's maintained RPaint
  repository. `reactos/iconbar.bmp` is byte-identical to the original ReactOS
  submission `1ef38b9a3c9a635a44662f770d01aeb16386cf4d`. Eleven tiles supplied
  lasso, rectangle selection, eraser, bucket, eyedropper, brush, airbrush, text,
  line, rectangle and ellipse. The exact magenta key was made transparent and
  colours adjusted. Derivatives remain LGPL-2.0-or-later. Original resource
  declaration, README and full license are retained. This is independently
  authored artwork, not extracted Microsoft assets.
- **Silk**, Mark James, **CC BY 2.5**, creator's repository commit
  `ae40eb194a6e4e86ad64d677611868c3d22d3c2a`. Seventeen PNGs supplied commands,
  the wand and transform handles. Original notice: `silk/README.txt`.
- **Fugue 3.5.6**, copyright 2013 Yusuke Kamiyamane, **CC BY 3.0**. The original
  32-file subset, source hashes and notice remain unchanged. Archived derived
  versions increased saturation/contrast and used a restricted palette.
- **Tabler 3.52.0**, copyright 2020–2026 Paweł Kuna, **MIT**. Archived move and
  ellipse-selection icons used 2.25-unit strokes rasterized onto a 16px grid.
  Other workspaces still use the adopted original SVG geometry.

`provenance.json` retains the source URLs, pinned commits, hashes and recipes,
alongside the active mapping. The archived `build-classic.mjs` uses installed
Chrome/Playwright for decoding and the app's `quantizeImage` for colour mapping.
Its recipe scales each channel's distance from luminance
`0.2126R + 0.7152G + 0.0722B` by saturation, scales distance from 128 by contrast,
then clamps/rounds to bytes. Alpha below 128 becomes transparent. RGB maps to the
nearest palette entry by squared Euclidean distance; the first wins ties. The
New page receives an additional one-pixel grey keyline. Output PNGs in
`classic/` can also be edited directly.

Full licenses, creator links, editable sources and recipes remain available from
Help → Icon credits and the local artwork source ZIP. Historical source files
and notices are retained independently of the active original artwork.
