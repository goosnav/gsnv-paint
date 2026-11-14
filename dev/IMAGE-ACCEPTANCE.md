# Image golden and persistent selection increment

Mode A map for the already requested IMG-103/IMG-104 and shared undo/recovery
behavior. The user preauthorizes BATCH after this map is committed. No brick
is human-ACCEPTED. The existing I51/IMAGE-APP are GREEN implementations under
rework; their revised contracts become GREEN only after the gates below.

## I58 `image/image-selection-state.ts` — CORE — CONTRACTED

Purpose: produce an owned, canonical selection snapshot.

IN: `{width:number,height:number,mask:Uint8Array|null}`. Sizes are positive
integers, total at most 16,777,216 pixels. A supplied mask has exactly one byte
per pixel, uses an ordinary ArrayBuffer and is not detached. Zero means
excluded, 255 fully selected, intermediate bytes preserve partial coverage.

OUT: `ImageSelection|null`, where `ImageSelection={mask:Uint8Array,bounds:Rect}`.
The output owns a byte copy. Its record and bounds are frozen; callers treat
reachable bytes as immutable. Empty masks and null canonicalize to null.
Bounds are the smallest integer rectangle containing all nonzero coverage.

RAISES: RangeError for invalid dimensions, mask type/length or shared backing
memory. DEPS: none. No I/O, mutation, randomness, or selection-shape decisions.
Tests: literal partial-coverage rectangle, one pixel, empty/null, edges,
dimensions at both limits, malformed/detached/shared masks, ownership and
round-trip/idempotence. Run: `node --import tsx --test src/image/image-selection-state.test.ts`.

## I51 selection contract revision — CORE — CONTRACTED

The immutable document gains `selection:ImageSelection|null`. New and legacy
documents have null. A new `selection` operation accepts `{previous,mask}`
and uses I58; updates and same-size stack changes retain the selection.
Resizing the stack clears it. Existing raster ownership/tile-sharing remains.

The common native envelope stays version 1; the domain layout is explicitly
versioned as `encoding:'rgba8-layers-v2'`. Its required selection field is null
or `{encoding:'gray8',asset:'selection'}`. A non-null selection has a separate
raw gray8 asset of exactly width×height bytes. Decode validates exact fields,
references, dimensions, duplicate/missing assets and coverage bytes before
returning any document. `rgba8` and `rgba8-layers` still migrate with null
selection. Unknown future layouts fail readably. Encode preserves every
layer byte, including RGB underneath zero alpha, and owns the selection
asset bytes. Selection bounds are derived, never trusted from a file.

DEPS: I50, I54, I58. Tests extend `image-content.test.ts`: literal v2 records
and bytes, legacy migration, invalid assets/schema, immutable history sharing,
all-byte round-trip, partial selection preservation and resize invalidation.

## IMAGE-APP assembly revision — CONTRACTED

Each completed selection replace/add/subtract/invert/all/none is one history
entry only when bytes change. Marquee preview and floating moves remain
uncommitted. Completed moves/text placement commit their resulting selection
together with pixels; no nested commit during render. Cancel restores the
committed selection. Painting and layer changes preserve it. Undo/redo,
native Open and recovery restore the selection in the same snapshot as the
pixels; opening a different same-size image cannot inherit an old selection.

On geometry transforms, the current implementation deliberately clears the
selection in the same history entry; undo restores it. This bounded revision
does not implement the broader I20 selection-transform contract. Existing
adjustment/filter formulas and transparent pixel values must not change.

## Acceptance gates

1. IMG-103 runs the exact recorded 32×24 sequence through real CORE modules
   and production browser controls. Compare all 3,072 composite bytes with
   `src/image/fixtures/acceptance-rgba.json`, independently derived/reviewed.
2. I58 RED→GREEN, then I51 revised tests RED→GREEN, then assembly tests.
3. IMG-104 saves/reopens the exact golden and compares canonical layer names,
   IDs/order, visibility/opacity/blend, active layer, all layer bytes, selection
   bytes and resulting composite. It edits a retained layer after reopening.
   This fixture has no text or layer masks; separate text/mask requirements
   remain untested, never inferred from this result.
4. Browser checks prove selection undo/redo, Esc cancellation of a floating
   move, selection-only autosave/recovery, and legacy/different document Open.
   Full previous Image browser cases remain cumulative; history expectations
   explicitly add completed selection operations, never discard pixel checks.

Status and exact evidence will be appended after execution. Product acceptance
and untested platforms remain with the user.

## Typed image zoom correction — contracted assembly rework

The production acceptance run exposed a view defect: setting Zoom to 800%
multiplied the image's centering offset and moved a 32×24 document outside the
viewport. The shared percentage also ignored Image's local Fit scale. This
correction is required for the existing typed-control requirement; it adds no
new tool and changes no raster algorithm or shared S04 contract.

A-SHELL's optional `EditorView.viewSettings():void` lets an adapter that owns
an additional view transform present its own settings dialog. The existing
shared dialog remains the fallback. Dispatch still applies the same enabled,
modal and lifecycle guards; it never commits a document by itself.

IMAGE-APP supplies this callback. Zoom (%) is the **effective** pixel scale,
1–6400%, initially the current scale after Fit/wheel zoom. Horizontal and
vertical offset fields are explicitly labelled in screen pixels and start at
zero for this dialog. Every preview derives from the original placement,
zooms around the viewport center using S04, then applies those typed offsets.
It never compounds successive previews. OK keeps the view; Cancel/Esc restores
the original local scale/offset exactly. Document pixels, selection and history
are unchanged. Wheel zoom continues to preserve its cursor anchor.

Gate before GREEN: a shell unit seam proves adapter dispatch and preserves
existing fallback cases; a production Image test proves visible 800% zoom,
live preview/cancel, exact typed offsets, correct percent after Fit, and
wheel-anchor invariance. The IMG-103/104 test must still edit the reopened
selected layer through a visible pixel after typed zoom, with the same exact
pixel expectation. No golden may be weakened to accommodate this defect.

## Executed gates — GREEN, 2026-11-13 (Linux x64, Chrome 154)

- `node --import tsx --test 'src/image/*.test.ts'`: **38 pass, 0 fail,
  0 skipped**, exit 0. I58's missing-export RED preceded its implementation;
  the revised I51 failed its two new selection cases before implementation.
  [Full unit output](evidence/image-selection-unit.log).
- `npx tsc --noEmit`: exit 0. `check_module.py` passes I51 and I58; both
  sibling demos run and print the exact v2 layout and partial coverage.
- `node --import tsx --test src/app/app-shell.test.ts`: **32 pass, 0 fail,
  0 skipped**, exit 0. The new adapter-owned view-settings seam first failed
  with zero calls where one was required.
- `npx vite build --outDir /tmp/gsnv-image-selection-dist`: exit 0. This is
  an emitted production bundle, not a development-server-only check.
- `GSNV_TEST_DIST=/tmp/gsnv-image-selection-dist npx playwright test src/image/image-acceptance.browser.spec.ts src/image/image-workspace.browser.spec.ts`:
  **5 passed (21.6s)**, exit 0. [Full browser output](evidence/image-selection-browser.log).
  The typed-zoom test first failed with its image center 3,248 CSS pixels
  from the expected center. It now proves live 800% preview, Cancel, typed
  offsets, wheel anchoring, correct percent after Fit, and unchanged history.

The independent coordinate oracle review reproduced all 3,072 golden bytes
and SHA-256 without application imports. IMG-103/104 are recorded PASS for
their exact specified document. Selection undo/redo, floating-move cancel,
selection-only IndexedDB recovery and older-layout Open also pass. The two
existing Image workflows retain their pixel assertions; their history lists
now explicitly include completed selection edits. The first existing case
explicitly deselects after reopen before painting outside the restored mask.

[Inspected 800% production capture](evidence/IMG-103104-production.png): the
small document remains visible and the reopened layer can be edited through
its selected pixel. This capture includes the checkerboard/selection overlay;
it does not replace the exact raw RGBA oracle.

No text/layer-mask functionality, 4000×4000/20-layer performance, physical pen,
other OS or other browser pass is inferred. These remain separate open gates.
No brick is human-ACCEPTED.
