# Open files, canvas navigation and graphical transforms

Date: 2026-11-14. Incremental owner-requested work; human acceptance remains with
the owner. This does not close the original product's outstanding requirements.

## Delivered behavior

- Open, File > Open and Ctrl+O accept native projects and the active workspace's
  supported ordinary files. All nine existing importers are connected. Native
  projects still route to their own workspace. Imported media never becomes a
  native project save destination. Cancellation, changed-revision guards,
  recovery and replacement consent are retained.
- Image uses the existing original white/black arrow cursor. A compact corner
  navigator provides a collapsible thumbnail, view outline, drag-to-pan, +/-
  controls, logarithmic zoom slider, typed percentage and Fit. Mouse, keyboard,
  touch pointer and pen-compatible pointer capture use the same view controls.
- Image selections have graphical resize/rotation handles and an inline numeric
  control bar. Ctrl+T starts a transform for a selection or the whole layer.
  Shift constrains proportions or rotation; Enter/Apply commits once, Esc/Cancel
  restores the source. Save flushes even a still-focused numeric edit. Preview
  reuses original pixels; final sampling uses existing bilinear raster logic.

Ordinary-file behavior follows existing import semantics: Image/Photo/Audio/CAD/
Document/Spreadsheet open a new editable document after validation; Video and
Code add media/source to the current project or create one when empty. Slides
inserts a supported raster picture, creating a deck if empty. PPTX/PDF/DOCX and
other unimplemented import codecs are not advertised.

## Trace and verification

Contracts: [Open](OPEN-FILES-UX.md), [Navigator](IMAGE-NAVIGATOR.md),
[Graphical transform](IMAGE-FREE-TRANSFORM.md), [assembly](APP-SHELL.md).

| IDs | Evidence | Result |
|---|---|---|
| OPEN-01, OPEN-02 | S07/S13 supplied-file, no-read picker, byte limits, cancellation, native-container tests | PASS |
| OPEN-03, OPEN-04 | A-SHELL routing/stale revision/consent tests; production Open tests in all nine workspaces | PASS |
| OPEN-05, OPEN-06 | Native handle isolation and compatible native filter tests; browser port interception | PASS |
| NAV-01–NAV-04 | Navigator unit tests; production mouse/keyboard/touch, wheel synchronization, unchanged pixel hash/history | PASS |
| XFORM-01 | Anchored/rotated resize, aspect ratio, move, snap, invalid dimensions and allocation bounds | PASS |
| XFORM-02, XFORM-03 | Production handle drag, rotation/move, typed dimensions, touch, exact cancel, single undo/redo, saved visible result | PASS |
| Original IMG-103/104 golden | Existing pixel array, selection mask and project round-trip oracle unchanged | PASS |
| Physical iPad/Safari, pen hardware, native OS picker dialogs, Windows/macOS | Not exercised in this increment | UNTESTED |

The browser tests cover Chromium touch emulation, not a physical iPad. Native
picker options and native-handle writes are exercised through controlled ports;
actual OS dialogs are untested. No skipped check is counted as passing.

## Commands and output

All final checks below passed. No failures or skips remain in these executed
checks. Production app assets were held fixed during each browser run.

```text
npm run build
  tsc --noEmit; Vite production build completed (61 static assets)
  Existing large-chunk advisory remains; no build error.

npm test
  tests 1006; pass 1006; fail 0; cancelled 0; skipped 0; todo 0

AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 \
BRIDGE_WORKSPACE_APP=1 node_modules/.bin/playwright test
  108 passed (5.2m)
  Chrome 154.0.8037.97, Linux x64, 1280x720

GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome \
node --import tsx dev/run-offline-tests.ts
  9 passed (1.8m)
  Chrome for Testing 158.0.8127.18, Linux x64
  Cold browser restart, server stopped, editing/export in all nine workspaces;
  failed updates, dirty tabs, eviction/retry and actual local launcher covered.

node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts
  1 passed (13.1s)
  Local Cloudflare static host serves isolated assets and works offline.

node_modules/.bin/wrangler deploy --dry-run --no-autoconfig
  Wrangler 4.160.1; Read 61 files from assets directory
  Total Upload: 0.31 KiB / gzip: 0.22 KiB
  No bindings found. --dry-run: exiting now.

npm run test:spec
  TRACE PASS: 402 requirements and verification procedures, 8 needs
  MAP PASS: 218 contracts, <=3 collaborators, no cycles
  LINK PASS: local links resolve, all 18 conceptual owners bound
  Original ledger: PASS 47; FAIL 0; UNTESTED 355

check_module.py (Goosnav modular method)
  PASS: file-access.ts, project-files.ts, image-navigator.ts,
        image-transform.ts, image-transform-view.ts

git diff --check
  Exit 0, no output
```

Earlier red/regression runs led to the repairs below. One additional test launch
was refused because another suite already owned its dev-server port; it executed
no tests and is not counted. Its tests subsequently passed in the final suite.
No OS picker dialog, physical tablet or untested browser is represented as passing.

## Findings repaired during verification

- Small selections at 1:1 had their gestures intercepted by constant-size handles.
  Automatic handles now wait for a 48px minimum on both screen axes. Explicit
  Free transform still exposes them. Existing pixel/selection goldens were not
  changed. The legacy rotation journey now uses the replacement inline control,
  with all prior pixel and history assertions preserved.
- A focused dimension field could emit a late change when Save hid the controls,
  starting a second transform. Hidden/inactive fields now cannot restart a tool.
  A real Ctrl+S download test checks the resulting pixels, size and history count.
- Native picker filters reject suffixes above 16 code points. The unchanged
  `.gsnv-spreadsheet` suffix is 17. S07 and early Save destination acquisition now
  omit an incompatible native filter; suggested names/formats stay unchanged,
  and HTML inputs retain their extension filters. This follows the
  [File System Access specification](https://wicg.github.io/file-system-access/#api-filepickeroptions).
- Selected Video media can have an empty or generic MIME type; the existing
  supported filename extension determines the decoder type consistently.
- Photo validates a candidate before replacement and displays failures even in
  an empty workspace. RAW imports perform a validation decode before the existing
  development pipeline; this increment makes no RAW throughput claim.

## Visual evidence and demos

[Active transform](evidence/IMAGE-free-transform.png) and
[navigator with applied transform](evidence/IMAGE-navigator-transform.png) were
visually reviewed at 1280×720.

Standalone demos via the Vite dev server:
`/src/image/image-navigator.demo.html` and
`/src/image/image-transform-view.demo.html`.
Geometry demo: `node --import tsx src/image/image-transform.demo.ts`.

## Limits retained

Video's existing import path buffers media; the shared picker adds no payload
read before dispatch. Unsupported browser codecs report failures. The navigator
thumbnail shows the raster canvas while the floating transform remains in the
main view. The original readiness ledger remains 47 PASS / 0 FAIL / 355 UNTESTED;
this bounded update is not full consumer-product or packaged-release acceptance.
