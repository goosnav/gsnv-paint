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

## Owner revision — recognizable tool illustrations

The owner rejected the 16px quantized set as incomprehensible. Its technical
checks remain historical evidence, not visual acceptance. Direction: classic
desktop painting tools, illustrated, vivid and immediately recognizable. Avoid
abstract outlines, oversized rounded silhouettes and decorative pixel noise.

Mode A delta to the existing `shared/icons` SHELL brick (2026-11-15):

- **PIR-01:** Replace the Paint toolbox artwork with individually reviewed tool
  illustrations on a native 24px grid, displayed at 24px. Retain object details
  and useful shading instead of crushing every image into the previous shared
  32-colour palette. Physical tools have distinct familiar silhouettes; shapes
  remain simple, and selections have dashed boundaries. Review every tool at
  actual size. Owner aesthetic acceptance is separate from automated checks.
- **PIR-02:** The 16px common command artwork, workspace switcher and other
  workspaces remain unchanged. The shared renderer must support native 16px and
  24px bitmap dimensions without changing its public API.
- **PIR-03:** Preserve all names, tooltips/shortcuts, command IDs, 32px desktop /
  40px touch targets, selected state and keyboard behavior. No drawing behavior
  or image-rendering setting changes.
- **PIR-04:** Use attributed, pinned open artwork and ship its source, licenses
  and deterministic generation recipe locally. No runtime asset fetches.

Map: development-only asset recipes -> generated local PNG catalog -> existing
`shared/icons` -> existing Paint chrome. No new runtime module or dependency.
The image CORE and workspace feature modules remain unchanged. Existing catalog,
provenance and browser testbenches will be updated for the native dimensions and
source contract; retain isolation/accessibility assertions. Verify typecheck,
build, offline assets, Chrome desktop DPR1/2 and touch emulation, and visually
inspect actual toolbox screenshots. Physical Apple devices remain untested.

Status: CONTRACTED; implementation covered by the current owner request and
standing BATCH authorization. Previous artwork is owner-rejected.

### Illustrated-tool verification

The 19 toolbox tools now use native 24px, individually reviewed raster artwork:
GIMP tool illustrations, KolourPaint's spray can / eraser / eyedropper / shapes,
and a Font Awesome star-tipped wand. The gold lasso, dotted selection boundaries,
black text A and shaded physical objects have distinct silhouettes. Stronger
colour and hard coverage retain internal shading. All 16px common commands,
Free Transform, button sizes, tool behavior and workspace icons are preserved.

| ID | Result | Evidence |
| --- | --- | --- |
| PIR-01 | PASS: technical; owner visual acceptance pending | 19 distinct native 24px images; no partially transparent edge pixels or clipped outer margin; actual-size desktop and touch review |
| PIR-02 | PASS | Original non-Paint catalog tests; Photo/Image round trip; workspace strip RGB pixels identical to previous desktop capture |
| PIR-03 | PASS | All 19 tools activated at DPR1, DPR2 and 390px touch emulation; labels/shortcuts, pressed states and 32px/40px targets retained |
| PIR-04 | PASS | Pinned source hashes, exact generator output, offline license/source archive, local credits and no external requests in glyph browser check |

No failed IDs in this scoped revision. **Untested:** physical iPhone/iPad,
macOS Safari, Windows, live hosted rollout and owner aesthetic acceptance.
The broad application ledger remains 47 PASS / 0 FAIL / 355 UNTESTED; this icon
revision does not establish full-suite consumer readiness.

Commands and observed output (all final commands exit 0):

- `node --import tsx --test src/shared/icons.test.ts src/shared/icons.vendor.test.ts`:
  **23 passed, 0 failed, 0 skipped**. Before implementation the revised native-size
  contract had two expected failures (16px instead of 24px).
- `npm test`: **1,249 passed, 0 failed, 0 skipped** (42.6s).
- `npm run build`: TypeScript and production build **PASS** (Vite 4.45s).
  Existing large-chunk advisory remains; no errors.
- `npx playwright test src/shared/paint-icons.browser.spec.ts src/shared/icons.browser.spec.ts src/shared/chrome.browser.spec.ts src/image/image-upgrade-visual.browser.spec.ts`:
  **6 passed** (14.4s), installed desktop Chrome on Linux. Menu layering and
  toolbar interaction regressions also pass.
- Production Chrome smoke via Vite preview: **PASS** — all 19 native 24px images
  decode, Brush activates, local credits load, no page errors.
- `node vendor/paint-icons/build-illustrated.mjs --check`: **19 illustrated tools
  verified: native 24px, hard coverage, preserved source shading.**
- `node --import tsx vendor/paint-icons/build-classic.mjs --check`: **37 classic
  icons verified**; retained command/archived artwork is unchanged.
- `node vendor/paint-icons/generate.mjs --check`: **32 Fugue + 22 classic + 28
  illustrated source hashes, 37 native bitmaps and 56 mappings verified.**
- `python3 vendor/paint-icons/package-sources.py --check`: **Artwork source
  archive verified: current and archived sources, licenses, recipes and builders.**
- `npm run test:offline-build`: **4 passed, 0 failed, 0 skipped**.
- `npm run test:spec`: **TRACE PASS / MAP PASS / LINK PASS**.
- `npx wrangler deploy --dry-run --no-autoconfig`: **81 assets read; no bindings;
  dry run exited successfully**. No actual deployment is claimed.
- Module checker: **PASS: src/shared/icons.ts**.
- Workspace strip comparison: no differing RGB pixels in `(528,3)-(1245,29)`
  against the previous `paint-icon-classic/desktop.png` at 1280×720.

Reviewed evidence: [desktop](evidence/paint-icon-illustrated/desktop-dpr1.png),
[DPR2](evidence/paint-icon-illustrated/desktop-dpr2.png),
[touch emulation](evidence/paint-icon-illustrated/touch-dpr2.png), and
[production](evidence/paint-icon-illustrated/production.png).

Tuning is confined to `vendor/paint-icons/illustrated.json` and its pinned source
artwork; regenerate PNGs, catalog and source ZIP after changes. Runtime/public API
and drawing logic are unchanged. Status: **GREEN / CANDIDATE_FOR_ACCEPTANCE**.

## Owner revision — black outlines (2026-11-15)

The owner finds the illustrated objects too close to clip art and requests the
defined black outlines of classic Paint. Previous technical checks are retained
as historical evidence; they do not establish visual acceptance.

Mode A delta: refine the existing S09 development-only artwork recipes. Keep
PIR-01's native 24px objects, adding a crisp one-pixel dark contour and stronger
material separation where useful. Preserve slender tools, readable interior
colour, dashed selection gaps and the transparent outer margin. Review the
actual-size toolbox, including desktop DPR1/2 and touch emulation. Do not apply
an indiscriminate thick border that turns thin tools into solid blobs.

PIR-02/03/04 are unchanged: workspace icons and common commands, interaction,
accessible labels, pinned sources and offline distribution remain intact.
The dependency map stays asset recipes -> PNG catalog -> S09 -> Paint chrome.
No CORE, runtime API, new dependency or drawing change is needed. Existing
catalog/provenance/browser testbenches cover the refinement, followed by build
and offline checks. Owner aesthetic acceptance and physical-device smoke tests
remain separate. Status: CONTRACTED; standing BATCH authorization applies.

### Outline revision verification

The 19 native 24px tools now have crisp near-black edges. Contours stay inside
their original silhouettes, with stronger existing dark detail on the brush,
stamp and bucket. Selection dashes retain transparent gaps. Following the
owner's follow-up, **the text A keeps its original interior gradient and bevel
detail**; it is not converted to a solid black glyph. Colours and useful shading
remain inside the outlined objects. No runtime logic or controls changed.

| ID | Result | Evidence |
| --- | --- | --- |
| PIR-01 | PASS: technical; final visual acceptance pending | All 19 decoded images have hard coverage, dark boundary pixels and an unclipped margin; native-size inspection at DPR1/2 and touch size; A shading retained |
| PIR-02 | PASS | Non-Paint renderer/catalog checks; workspace strip RGB-identical to the previous desktop capture; common command artwork unchanged |
| PIR-03 | PASS | All 19 tools activate with their existing labels, shortcuts, pressed states and 32px/40px targets; menus and Help remain reachable |
| PIR-04 | PASS | Pinned original hashes, reproducible PNG/catalog/archive, local credits and source distribution |

No failing IDs remain in this scoped revision. **Untested:** physical iPhone /
iPad, macOS Safari, Windows and live hosted rollout. The application-wide ledger
is still 47 PASS / 0 FAIL / 355 UNTESTED; it is not a readiness claim for every
workspace. Full application unit tests were not rerun for this artwork-only
change; the affected icon tests and shared-chrome/browser checks were executed.

Final commands and output:

- `node --import tsx --test src/shared/icons.test.ts src/shared/icons.vendor.test.ts`:
  **23 passed, 0 failed, 0 skipped** (3.6s).
- `npx playwright test src/shared/paint-icons.browser.spec.ts src/shared/icons.browser.spec.ts src/shared/chrome.browser.spec.ts src/image/image-upgrade-visual.browser.spec.ts`:
  **6 passed** (14.7s), installed Chrome on Linux. The first concurrent run had
  5 passes and one production-preview HTTP failure while the build replaced
  `dist`. Re-running against the completed, stable build passed all six; no app
  code change or skipped test was used to resolve that test-ordering error.
- `npm run build`: TypeScript and Vite production build **PASS** (Vite 1.79s).
  Existing kernel `node:module` browser-externalization and large-chunk advisories
  remain; no build errors.
- `npm run test:offline-build`: **4 passed, 0 failed, 0 skipped**.
- `npm run test:spec`: **TRACE PASS / MAP PASS / LINK PASS**.
- `node vendor/paint-icons/build-illustrated.mjs --check`: **19 illustrated tools
  verified: native 24px, hard coverage, black contours, original silhouettes.**
- `node vendor/paint-icons/generate.mjs --check`: **32 Fugue + 22 classic + 28
  illustrated source hashes, 37 native bitmaps and 56 mappings verified.**
- `python3 vendor/paint-icons/package-sources.py --check`: **Artwork source
  archive verified: current and archived sources, licenses, recipes and builders.**
- `npx wrangler deploy --dry-run --no-autoconfig`: **81 assets read, no bindings,
  dry run exited successfully**. This is not an actual Cloudflare deployment.
- Workspace strip comparison: **identical RGB pixels**, `(528,3)-(1245,29)`
  against `paint-icon-illustrated/desktop-dpr1.png`.

Reviewed evidence: [desktop](evidence/paint-icon-outlines/desktop-dpr1.png),
[DPR2](evidence/paint-icon-outlines/desktop-dpr2.png),
[touch emulation](evidence/paint-icon-outlines/touch-dpr2.png),
[production](evidence/paint-icon-outlines/production.png).

S09 status: **GREEN / CANDIDATE_FOR_ACCEPTANCE**.
