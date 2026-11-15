# Paint icon refinement — 2026-11-15

Owner-approved scope: Paint tools should have classic Paint-like slender proportions,
solid objects, restrained colour and native pixel edges. Preserve the existing top
workspace icons, all tool behaviour and comfortable button targets. This supersedes
PU-03's outline-only presentation, not its local-asset/licensing requirements.

## Contract and module map

- **PIR-01:** All 19 Paint tools have distinct, recognizable 16px artwork. Use
  unmodified Fugue 3.5.6 shadowless colour PNGs for physical objects and a few
  one-bit raster derivatives of already-vendored Tabler selection/shape symbols.
  Do not stretch icons to fill their buttons or change Microsoft assets.
- **PIR-02:** Paint's common command icons share the bitmap treatment. Other
  workspaces and the top workspace switcher retain their current SVG artwork.
- **PIR-03:** Existing labels, shortcuts, selected/disabled feedback, 32px desktop
  targets and 40px touch targets remain. Pixel art uses nearest-neighbour display.
- **PIR-04:** Icons remain bundled/offline, with pinned sources, hashes, a
  reproducible asset builder and visible attribution plus distributed notices.

Existing SHELL brick `shared/icons` gains an optional Paint theme while preserving
its SVG element return type/accessibility contract. Local PNGs are embedded inside
that element. `shared/chrome` selects the theme only for Image commands; its header
is unchanged. Asset generation is development-only; no new runtime dependency.
Help gains searchable icon credits. Pixel/image/geometry/timeline CORE is unchanged.

## Verification plan

- Unit/catalog/provenance tests: PIR-01/02/04, including safe local image references,
  byte-identical source PNGs, native dimensions and unchanged workspace SVG output.
- Existing chrome/browser tests and a focused live-app check: PIR-01/02/03/04,
  including Paint tool selection, context switching, decoded images and attribution.
- Inspect screenshots at actual size at DPR 1/2 and a touch viewport. Compare the
  top workspace switcher's pixels with the pre-change capture. Emulation does not
  establish physical iOS acceptance.
- Typecheck/build and the existing unit suite must pass before push. Record actual
  commands/results below; do not treat missing checks as passes.

Status: contract/map ready; implementation authorized by the owner's current request
and standing BATCH authorization. Final visual acceptance remains with the owner.

## Completed verification

PIR-01, PIR-02, PIR-03 and PIR-04: **PASS** within the checks below. Implemented
32 unmodified Fugue sources and five thin Tabler raster masks, mapped to 19 tools,
a separate Free Transform symbol and Paint's common commands (56 mappings).
Existing workspace glyphs are unchanged. Icon credits are searchable in Help;
the Help footer links to the locally shipped attribution page.

- `npm test`: **1,215 passed, 0 failed, 0 skipped** (41.3s).
- `npm run build`: **PASS**; TypeScript and production Vite build completed.
  Existing large-chunk advisory remains; no build errors.
- `npx playwright test src/shared/paint-icons.browser.spec.ts
  src/shared/icons.browser.spec.ts src/shared/chrome.browser.spec.ts
  src/image/image-upgrade-visual.browser.spec.ts`: **5 passed** (15.7s).
  Local installed Chrome on Linux; actual-size desktop DPR1/DPR2 and 390px touch
  emulation. Verified all 19 images decode at 16×16, all toolbar sizes, selection,
  labels/shortcuts, menu layering, workspace round trip and visible attribution.
  The production preview also received the existing visual smoke check.
- `node vendor/paint-icons/rasterize.mjs --check`: **PASS** — 5 pinned masks
  reproduced exactly with binary coverage.
- `node vendor/paint-icons/generate.mjs --check`: **PASS** — 32 Fugue hashes,
  37 native bitmaps and 56 mappings verified, using only local files.
- Module header check: icons, chrome, Help dialog and Help index **PASS**.
  Existing chrome soft-cap advisory: 245 implementation lines versus 200.
- `cmp /tmp/workspaces-before.png /tmp/workspaces-after.png`: **identical**
  screenshots of the workspace switcher before/after this change at 1280×720.
- `git diff --check`: **PASS**.

Reviewed screenshots: [desktop](evidence/paint-icon-refinement/desktop.png),
[desktop DPR2](evidence/paint-icon-refinement/desktop-dpr2.png),
[touch emulation](evidence/paint-icon-refinement/touch.png).

No failed requirement IDs in this scoped pass. **Untested:** physical iPhone/iPad,
macOS Safari, Windows, final hosted publication and owner aesthetic acceptance.
The broader application's readiness ledger is unchanged. Status: **GREEN / ready
for owner visual acceptance**, not a new claim that every editor is complete.

## Owner revision — stronger classic Paint artwork

The owner rejected the Fugue-first appearance: too muted and thin. PIR-01 is reset
for a new source/art direction: fuller, recognizable Windows 95/XP-era Paint
objects, stronger colour, hard pixels, retained familiar pencil. This is an asset
revision of the same SHELL brick, with unchanged interaction/public API. The
existing switcher remains out of scope. Do not equate passing tests with approval
of the artwork.

Use the independently authored ReactOS Paint tool strip (LGPL-2.0-or-later),
Mark James's Silk common commands (CC BY 2.5), and retained complementary assets
where no replacement is clearer. Preserve pinned originals, source/license
availability and transformation recipes. Run the artwork through the app's own
palette quantizer on a 16px grid; inspect colour, silhouettes and spacing in the
real UI before committing the implementation. Test existing accessibility and
workspace isolation plus source hashes, binary coverage and palette membership.

### Revised implementation and verification

The original visual design above is **owner-rejected**, despite its passing
technical checks. This revision replaces eleven main tools with the ReactOS Paint
strip, seventeen commands/tools with Silk, and keeps complementary shapes such as
the pencil. The 37 source bitmaps map to 56 catalog names, using a documented
32-colour palette, stronger saturation/contrast and binary coverage. Native 16px
artwork displays at **24px in the toolbox**, 16px in the common toolbar, within
unchanged button targets. Earlier “do not enlarge” guidance is superseded by this
owner-directed proportion correction. Other workspace artwork remains untouched.

PIR-01–04 automated verification: **PASS**, none failed or skipped:

- `npm test`: **1,216 passed, 0 failed, 0 skipped**, exit 0 (36.9s).
- `npm run build`: **PASS**, exit 0; TypeScript and production build (3.06s).
  Existing bundle-size advisory remains.
- `npx playwright test src/shared/paint-icons.browser.spec.ts
  src/shared/icons.browser.spec.ts src/shared/chrome.browser.spec.ts
  src/image/image-upgrade-visual.browser.spec.ts`: **6 passed**, exit 0 (12.5s).
  The added palette/coverage test first failed on the previous artwork (940
  partially transparent pixels), then passed on the revised assets. Existing
  checks cover tool activation, label/shortcut preservation, 32px/40px targets,
  desktop DPR1/2, 390px touch emulation, credits and the unchanged switcher.
- `node --import tsx vendor/paint-icons/build-classic.mjs --check`: **PASS**,
  exit 0; 37 classic icons reproduced exactly using pinned sources and the app's
  quantizer. No application logic was imported from another editor.
- `node vendor/paint-icons/generate.mjs --check`: **PASS**, exit 0;
  32 retained Fugue + 22 new source hashes, 37 bitmaps and 56 mappings verified.
- Module check: icons and chrome **PASS**, existing chrome 245-line soft advisory.
- Reviewed actual-size screenshots: [desktop](evidence/paint-icon-classic/desktop.png),
  [DPR2](evidence/paint-icon-classic/desktop-dpr2.png),
  [touch emulation](evidence/paint-icon-classic/touch.png).

Source licenses, unchanged originals, colour recipes and directly editable PNGs
ship in `public/licenses/classic-paint-artwork.zip`, linked from Help credits.
The ReactOS-derived artwork remains LGPL-2.0-or-later; independent app logic is
unchanged. Untested: physical iPhone/iPad, macOS Safari, Windows and hosted rollout.
**GREEN for technical checks; owner visual acceptance remains pending.**
