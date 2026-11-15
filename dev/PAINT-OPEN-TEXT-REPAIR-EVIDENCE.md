# Paint Open, text, clipboard and update visibility repair

2026-11-14. Bounded owner-requested repair; human acceptance remains pending.

## Findings and changes

The live `https://paint.goosnav.shop/` returned build
`de6d22055321679436a94822f4b5931dc3a54693cc9f4c22e371f88f0c8d6cf4` with the exact
JavaScript/CSS asset names from the previously pushed 7056a11 build. Free
transform is in those live assets; the screenshot lacks that toolbar action.
An older cached tab is therefore likely, but the user's browser cache was not
inspected. S21 independently reproduced a waiting update labelled only “Ready
offline” in its collapsed footer. It now says “Update ready — reopen”, with
visible styling and save/close/reopen instructions. No forced reload, storage
clearing, skipWaiting, or document changes were added.

The main Open command uses an unrestricted chooser on both API and fallback
paths. This removes OS filtering as a reason for disabled images. Existing
supported-extension routing and codec/native-container validation are unchanged;
source image handles never become project save destinations. Import-specific
choosers keep their filters. Automated assignment bypasses OS selection rules,
so tests explicitly inspect the empty filter before assigning PNG/JPEG/projects.
Native macOS chooser behavior was not tested.

Text Enter was a confirmed application bug: S11 left the textarea event alone,
then S12's global dialog shortcut called preventDefault. A real browser test
produced `HelloWorld` after typing Hello, Enter, World. S11 now stops propagation
without preventing the newline. Ctrl/Cmd+Enter still confirms. A native color
field previews the chosen text color; Cancel leaves history/pixels unchanged.
Placing text opens the existing graphical transform, with mouse/touch handles
and typed dimensions. Escape retains the placed text; Apply records the transform.
Text remains rasterized on placement; editable text objects are not claimed.

The toolbar now exposes Copy canvas and Paste. Copy canvas encodes the visible
composite to the system clipboard as PNG, retaining alpha and excluding selection
outlines and controls. It starts the write during activation and reports success
only after completion. A denied write explains Export PNG and retains the internal
copy. With no Image document, native Ctrl/Cmd+V opens clipboard image pixels at
source dimensions. With an existing canvas, Paste centers a new layer and exposes
Free transform. Oversized input fits within 80% of the canvas while the active
transform retains the full source. Cancel keeps the inserted layer; Undo removes
it. Text fields retain native paste; non-image/invalid content and stale reads do
not mutate the document.

## Verification notes

The new unit regressions first failed on the combined picker filter, hidden
waiting-update label, unsupported color field and consumed textarea Enter.
The browser text regression also failed on the missing newline before the fix.
Clipboard browser tests initially failed on blank-document paste and missing
Copy canvas/Paste actions. Tests use real Chromium system clipboard PNG writes,
native paste events, image reads and pixel assertions, with injected denial,
invalid-content and delayed-completion cases for failure behavior.

Two test corrections preserve the underlying product oracles:

- The offline round-trip helper previously waited for “Current state”, which is
  also true on the blank document created before Open. One run read zero painted
  pixels before reopening completed. It now waits for the saved title without a
  dirty marker before checking pixels and exact native project/assets equality.
- The new transform test initially assumed scaling antialiased glyphs increases
  the count of *exactly* matching solid-color pixels. Bilinear sampling does not
  guarantee that. Undo now compares the complete canvas PNG against the captured
  original, while resize checks dimensions, row extent, preview history isolation,
  redo and reopen. Existing raster golden outputs were not regenerated.

An earlier full browser run (before the clipboard increment) had 108 passes and
one Save submenu focus failure. The unchanged focused test passed on recheck,
and the final complete run passed all 113 tests. The first run and recheck are
retained with the final evidence; no focus assertion was removed or loosened.

Older text workflow coverage now explicitly applies the automatic transform
stage and expects that additional history entry; its pixel checks are unchanged.

## Gates

Evidence: [command outputs](evidence/open-text-clipboard-repair/).

| Requirement IDs | Status | Evidence |
|---|---|---|
| OPEN-07 | PASS | S07/A-SHELL chooser filter assertions; actual PNG/JPEG/project routing and source-handle protection |
| OPEN-08 | PASS | S21 collapsed update summary, focus preservation; production waiting-worker test |
| TEXT-01 | PASS | S11/S12 native newline seam, color validation and preview/commit/cancel |
| TEXT-02, TEXT-03 | PASS | Real browser multiline/color pixels, Cancel, resize handles, typed dimensions, undo/redo and native reopen |
| CLIP-01 | PASS | System PNG readback matches visible composite dimensions, alpha and sampled pixels; denial reports fallback |
| CLIP-02 | PASS | Blank native paste opens original size; existing-canvas paste creates a layer and active full-source transform; oversized fit/Cancel/Undo |
| CLIP-03 | PASS | Native image paste and native textbox paste; text/invalid-image rejection; permission failure and late workspace completion |
| Native macOS/Safari clipboard and chooser UI; physical iPad | UNTESTED | No platform claim; Chromium touch event coverage is not a physical-device smoke |

Commands and final outputs:

- `npm test`: `tests 1010`, `pass 1010`, `fail 0`, `skipped 0`.
- `npm run build`: exit 0; TypeScript and Vite production output. Existing
  PlaneGCS `node:module` externalization and chunk-size warnings remain.
- `npm run typecheck`: exit 0 after the final browser test additions.
- `AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 BRIDGE_WORKSPACE_APP=1 node_modules/.bin/playwright test`:
  `113 passed (4.8m)`, zero failed/skipped.
- `npm run test:spec`: trace/map/link PASS; `402` requirements/procedures,
  `218` module contracts; original ledger `PASS 47; FAIL 0; UNTESTED 355`.
- `python3 <goosnav-modular-coding-method>/scripts/check_module.py src/shared/dialog.ts src/shared/offline-status.ts`:
  PASS for both changed bricks. IMAGE-APP/A-SHELL remain composition assemblies.
- `npm run test:launcher`: `launcher smoke: PASS`, freshness test `pass 1`,
  `fail 0`, `skipped 0`. Linux process/loopback behavior only.
- `npm run test:offline-build`: `pass 4`, `fail 0`, `skipped 0`.

- `GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome node --import tsx dev/run-offline-tests.ts`:
  `9 passed (1.6m)`, zero failed/skipped. Includes all nine workspaces after a
  complete browser shutdown with the server stopped, and dirty two-tab A→B updates.
- `node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts`:
  `1 passed (10.9s)`; Wrangler serves exact isolated assets and the complete
  installed build works offline.
- `WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig`:
  exit 0; `Read 61 files`, `No bindings found`, `--dry-run: exiting now`.
  This is configuration/upload preparation, not a live Cloudflare deployment.

Bounded increment: **GREEN / CANDIDATE_FOR_ACCEPTANCE**. No failing final gate;
no skipped check is counted as a pass. Human acceptance remains the owner's.

Main browser tests used Chrome 154.0.8037.97 on Linux x64; persistent offline tests used bundled Chrome for Testing 158 on Linux x64. Safari/macOS native dialogs and physical iPad
are untested. Original full-product requirements remain separately tracked;
these changes do not claim closure of that backlog.
