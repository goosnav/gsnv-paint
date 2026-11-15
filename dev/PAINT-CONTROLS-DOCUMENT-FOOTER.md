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
