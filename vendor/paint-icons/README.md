# Native Paint icons

Paint uses **Fugue Icons 3.5.6**, copyright 2013 Yusuke Kamiyamane, licensed under
[Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
[Official source](https://p.yusukekamiyamane.com/). The 32 selected shadowless
16×16 PNGs are **unmodified** generic interface objects; no logo/trademark icons
or the archive's separately licensed exceptions are included. `FUGUE-README.txt`
is the unmodified upstream notice; an identical copy ships with the application.
The archive URL, SHA-256, individual source paths/hashes and mappings are pinned
in `provenance.json`. No archive-wide runtime dependency is included.

Five selection/shape symbols come from the previously pinned **Tabler Icons
3.52.0**, MIT, copyright 2020–2026 Paweł Kuna (`../tabler/`). Those derivatives
use 1.5-unit square/miter strokes rendered on a 16px grid, then alpha threshold
96/255 gives one-bit coverage. This keeps the lasso, ellipse selection and basic
shapes thin. The rest of the set uses solid colour objects rather than enlarged
outline geometry. These derivations do not modify the upstream SVGs.

All artwork is embedded as PNG data in `src/shared/paint-bitmaps.ts`. The runtime
creates an SVG accessibility wrapper with a local image child; no assets are
fetched. The icon is 16 CSS pixels inside the existing larger click/touch target.
Nearest-neighbour display preserves its pixel edges. Workspace tabs are unchanged.
Attribution is visible under Help → Icon credits and in distributed notices.

```sh
node vendor/paint-icons/rasterize.mjs         # rebuild the five derivatives (local Chromium)
node vendor/paint-icons/rasterize.mjs --check # compare exact PNGs with the pinned derivation
node vendor/paint-icons/generate.mjs          # embed reviewed local assets
node vendor/paint-icons/generate.mjs --check  # verify source hashes/dimensions/catalog offline
```

The raster script requires the repository's Playwright and installed Chrome,
not a network connection. Review native-size output when updating the browser or
sources. Do not enlarge icons to fill their buttons, introduce Microsoft artwork,
or apply this theme to the top workspace switcher or other editors.
