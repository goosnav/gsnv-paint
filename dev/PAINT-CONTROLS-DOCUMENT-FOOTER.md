# Consistent Paint controls and clean document footers

2026-11-14 owner-requested increment, existing BATCH authorization.
Mode A amendment before implementation; human acceptance remains with the owner.

## Intent and scope

Keep the compact XP-inspired UI and existing workflows. Reuse the Layers trackbar
and button/field classes for navigation and expanded colour entry. Make a small
set of unclear Paint glyphs more recognizable at 24px. Put optional PDF footer
settings in the top Document menu; plain documents have no app footer by default.
No new image format, colour-space restriction, PDF engine, backend or account work.

## Requirements and verification

- **STYLE-01 / I59:** Zoom slider uses the same XP trackbar as Layers; +/-/Fit and
  percentage use shared buttons/fields. Mouse, keyboard, touch, map and collapse
  behavior remain unchanged. Verify classes, computed styles, browser navigation
  regressions and desktop/touch screenshots.
- **COLOUR-01 / I53:** Keep the 28 compact swatches. A collapsed “More colours”
  section expands to foreground/background selection, Red/Green/Blue sliders and
  numeric inputs (integer 0–255), hex entry and a live colour sample. These controls
  use the same XP trackbar/field/label layout as tool options and Layers.
- **COLOUR-02 / I53:** Sliders apply live; typed values apply on Enter/blur. Clamp
  valid channel values to 0–255. Invalid or empty input never changes the colour;
  hex errors are visible, Escape restores the current colour. Keep swatches,
  native colour inputs, swapping and expanded controls synchronized. Disabled
  palette emits no edits. Colour selection changes no document/history; the next
  stroke uses the chosen exact RGB. Verify unit callbacks and a production stroke.
- **ICON-01 / S09:** Refine busy Paint pencil, brush, eraser, wand, fill and gradient
  silhouettes on the existing 24px grid. Preserve accessible names and shortcuts.
  Original paths only for replacements; no Microsoft/Adobe assets or runtime
  requests. Keep third-party licenses for retained icons. Verify existing catalog
  tests and inspect the actual Paint toolbar plus glyph sheet.
- **FOOTER-01 / DOC-CONTENT:** Explicitly blank all top/bottom print margin boxes
  by default, including corners; optional page number is the only app-generated
  footer. Preserve page dimensions, margins, HTML and project format. Verify real
  Chromium PDFs with browser headers/footers enabled, using extracted text for
  two pages, both with and without app page numbers. Browser behavior beyond
  supported CSS must be described honestly.
- **FOOTER-02 / DOCUMENT-APP:** “PDF footer…” in the top Document menu opens the
  page-number setting (off by default) and explains browser print header/footer
  controls. Apply is one undoable settings edit; Cancel preserves settings.
  Existing Page setup remains compatible. Export explains how to disable browser
  date/title/address headers when the browser does not honor margin-box CSS.
  Verify menu access, cancel/apply, undo/redo, project round-trip and print output.

## Bricks and order

Existing I59 SHELL: DOM ports unchanged, only shared styling classes.
Existing I53 SHELL: PaletteModel/PaletteChange ports unchanged; expanded control
state belongs to the panel. No raster edits or history writes.
Existing S09 SHELL: IconRequest and output unchanged; six original path replacements.
Existing DOC-CONTENT CORE: pageCss output explicitly owns print margin boxes.
Existing DOCUMENT-APP assembly: existing dialog/history/print ports; menu routing.

All affected bricks are CONTRACTED for this increment. First tests, then changes
in that order, followed by built-app journeys, screenshots, spec/build/deploy
checks, evidence and a main push. Preserve the original product readiness ledger.

## Decisions

RGB sliders plus typed hex are predictable, keyboard-friendly, and reuse existing
controls. A custom colour wheel would add interaction and touch complexity without
improving precision; reconsider if requested after using RGB.

Browser-native PDF preserves selectable text and existing layout. Print options
belong to the browser; web code cannot change the user's print-dialog preference.
Chromium experiments show empty strings in top/bottom *including corner* margin
boxes suppress date/title/address/counters; content:none does not. Keep page
margins intact. Safari/macOS print dialogs are untested here, so show concise
browser-footer guidance instead of claiming universal suppression.
Reference: https://developer.chrome.com/blog/print-margins

## Print-layout boundary correction

The structural checker found DOC-CONTENT already exposed seven function declarations
(including three overload declarations). Mode D moves page sizing/defaults/print CSS
into **DOC-PAGE CORE**, `document-page.ts`, with existing exact output tests unchanged.
Its ports are `DEFAULT_PAGE`, `pageInches(PageSetup): [number,number]` and
`pageCss(PageSetup): string`, with validated setup as the precondition. It has no
dependencies or side effects. Test all three sizes, both orientations, clean margin
boxes and optional numbers; a console demo prints the default/numbered CSS.
DOC-CONTENT retains content/HTML validation and serialization and uses a single
generic signature instead of repeated overload declarations. No persisted or public
application behavior changes. DOCUMENT-APP imports the page functions directly.

## Verification report

GREEN for this bounded increment; human acceptance and the broader consumer release
remain open. Runtime verification: Chrome 154.0.8037.97, Linux x64, desktop 1280×720
and touch-emulated 1024×768. No physical iPad, Safari, macOS or Windows smoke claim.

| Requirement | Result | Evidence |
|---|---|---|
| STYLE-01 | PASS | Shared classes, reviewed desktop/touch screenshots, zoom/map/touch/keyboard regressions |
| COLOUR-01, COLOUR-02 | PASS | Expanded RGB/hex callbacks, validation, disabled/disposal, exact `[36,125,198,255]` stroke, no history edit for colour selection |
| ICON-01 | PASS | Catalog/accessibility tests, local glyph sheet and 24px production toolbar review; original replacement paths |
| FOOTER-01 | PASS in tested Chromium | Real two-page PDFs with `displayHeaderFooter:true`; extracted text contains only body text, plus 1/2 when opted in |
| FOOTER-02 | PASS | Top menu, Cancel/Apply, single history edit, undo/redo, existing project round trip and page setup |
| Other browsers' native print behavior | UNTESTED | Export and footer dialog explain browser-owned headers/footers |

Commands and output (all final commands exited 0, no skipped checks):

```text
npm test
tests 1027; pass 1027; fail 0; cancelled 0; skipped 0

node_modules/.bin/playwright test src/image/image-navigation.browser.spec.ts src/image/image-pixel-drawing.browser.spec.ts src/image/image-clipboard.browser.spec.ts src/document/document-workspace.browser.spec.ts src/shared/icons.browser.spec.ts
22 passed (40.2s)

npm run build
tsc --noEmit && vite build; built in 1.25s

node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts
1 passed (10.9s): complete isolated static build, exact bytes, offline reload

WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig
Read 61 files; No bindings found; --dry-run: exiting now

npm run test:spec
TRACE PASS: 402 requirements, 402 verification procedures
MAP PASS: 220 original tracked contracts
LINK PASS
Original requirement ledger: PASS 47; FAIL 0; UNTESTED 355
```

The original ledger is unchanged; this focused UI increment does not complete the
original CAD/Image/Video scope. Build retains the existing chunk-size and PlaneGCS
node:module warnings. Static asset size/isolation gates pass.

Full logs: [unit](evidence/paint-controls-unit.log),
[browser](evidence/paint-controls-browser.log), [build](evidence/paint-controls-build.log),
[static host](evidence/paint-controls-static-host.log),
[deployment dry-run](evidence/paint-controls-deploy.log).
`check_module.py` passes all five affected bricks ([output](evidence/paint-controls-modules.log));
the Document workspace remains an assembly. The page demo prints literal default
Letter and numbered A4 layout rules ([output](evidence/paint-controls-page-demo.log)).

Reviewed artifacts: [expanded colours and navigator](evidence/IMAGE-consistent-controls.png),
[touch layout](evidence/PAINT-controls-touch.png),
[glyph sheet](evidence/PAINT-controls-glyph-sheet.png),
[clean PDF](evidence/DOCUMENT-clean-footer.pdf),
[numbered PDF](evidence/DOCUMENT-numbered-footer.pdf).
PDF text assertions require Poppler `pdftotext` (documented in README); no missing
tool is reported as a pass.

Retained diagnosis: initial new Navigator/palette tests failed as intended (7 pass,
2 fail); new footer policy test failed as intended (2 pass, 1 fail). The first
browser run had 13 pass and one test selector failure because Open matched both
menu and toolbar; the test now selects the toolbar explicitly. A later run made
while the full unit suite was executing timed out in the pre-existing Document
Ctrl+O round-trip test (17 pass, 1 fail). Its unchanged isolated rerun passed, and
the final sequential 22-test suite passed. No assertions were weakened. One early
unit command wrapper exited 143 after printing its successful totals; the final
unit command above exited 0. Structural checking exposed DOC-CONTENT's inherited
seven declarations; the characterized page extraction and generic serializer
resolved it. DOC-PAGE's purpose wording was clarified after the checker mistook
the conjunction in “page size and margins” for separate responsibilities.

Tuning: shared trackbar visuals stay in `theme.css`; navigator placement and palette
spacing stay in `image-workspace.css`; glyphs in `PAINT_PATHS`; paper dimensions and
clean-margin policy in DOC-PAGE. Re-run the corresponding exact-value/unit and
browser journeys when changing these. Do not turn off the map touch cancellation
or replace the empty margin-box strings with `content:none`.
