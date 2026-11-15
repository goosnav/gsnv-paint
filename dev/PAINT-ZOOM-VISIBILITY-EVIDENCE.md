# Paint zoom visibility verification

2026-11-14. I59 SHELL amendment under the owner's BATCH authorization. Status:
GREEN / CANDIDATE_FOR_ACCEPTANCE. Human acceptance remains with the owner.

## What changed

The existing lower-right control now says **Zoom** and stays visible without a
file, with disabled controls and “Open or create an image”. Once opened, the map
has a “Drag map to move view” hint. Collapsing the map leaves minus, slider, plus,
percentage and Fit visible. Pointer controls request view changes only.

A fresh visit to paint.goosnav.shop before this increment showed the prior
“Navigator” panel after New at 1280x720; it was hidden without a document. This
observation does not establish what a previously open user tab was serving.

Touch regression: Chromium's native touch gesture after a map drag swallowed the
next button tap. Reproduced with two plain buttons outside the app. Preventing
the map's native touchstart default while retaining pointer capture resolved it;
the unchanged drag-then-plus assertion passes. A later test assertion incorrectly
expected workspace switching to remove the panel from the DOM. A-SHELL intentionally
retains hidden editors, so the test now checks hidden/visible behavior, preserving
all pixel and history assertions. No application change was made for that assertion.

## Trace

| IDs | Result | Evidence |
|---|---|---|
| NAV-01–04 | PASS | Existing arrow, mouse/keyboard/wheel/map, collapse and view-only journeys |
| NAV-05 | PASS | Visible empty state; disabled inert controls; Zoom label; map guidance |
| NAV-06 | PASS | 1280x720 desktop and 1024x768 touch-emulated Chromium: controls contained and hit-testable; Open PNG; touch map then zoom preserves chosen center; workspace return; identical pixels/history |
| XFORM-01–03 regression | PASS | Navigator suite retains handles, typed values, rotation, touch, saved transform, undo/redo |
| Sharp pixel rendering regression | PASS | 32x32 black/white source at 550% produces only 0/255 screen samples; Smooth preview introduces intermediate values; cancel restores sharp view without changing source |
| Physical iPad, Safari, macOS, Windows | UNTESTED | No physical-device or OS claim |

No failing or skipped checks in the final executed suites. Original product-wide
ledger remains 47 PASS / 0 FAIL / 355 UNTESTED; this increment is not full product
acceptance. Full offline multi-workspace suite was not rerun; static-host offline
coverage was run on this build.

## Commands and output

```text
node --import tsx --test src/image/image-navigator.test.ts
  Initial RED: 1 pass, 2 fail (old hidden empty behavior)
  Final: 3 pass, 0 fail, 0 skipped; exit 0

npm test
  1022 tests; 1022 pass; 0 fail; 0 skipped; exit 0
  Full suite preceded the touchstart guard. I59's 3 unit tests were rerun after it.

npm run build
  tsc --noEmit; Vite built 165 modules; exit 0
  Existing PlaneGCS node:module externalization and large-chunk advisories remain.

node_modules/.bin/playwright test src/image/image-navigation.browser.spec.ts \
  src/image/image-pixel-drawing.browser.spec.ts src/image/image-clipboard.browser.spec.ts
  14 passed (27.7s); exit 0; Chrome 154.0.8037.97 Linux x64

node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts
  1 passed (11.0s); exit 0; complete isolated build served offline

WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig
  Read 61 files; Total Upload 0.31 KiB; No bindings; dry-run exiting; exit 0

npm run test:spec
  TRACE PASS: 402 requirements / 402 verification procedures
  MAP PASS: 220 contracts, <=3 collaborators, no cycles
  LINK PASS; original ledger PASS 47 / FAIL 0 / UNTESTED 355

python3 <goosnav-modular-coding-method>/scripts/check_module.py src/image/image-navigator.ts
  PASS: src/image/image-navigator.ts; exit 0

git diff --check
  exit 0
```

Standalone demo `/src/image/image-navigator.demo.html` was opened in Chromium:
Zoom in changed 80% to 100%; the map remained visible. This is a visual sanity
check, not a substitute for tests. Visually reviewed screenshots:
[desktop](evidence/IMAGE-zoom-desktop.png) and
[touch-emulated layout](evidence/IMAGE-zoom-touch.png).

Tuning: I59 declares thumbnail dimensions and 1–6400% range in its header;
`image-workspace.css` sets corner spacing, typography and coarse-pointer sizes.
The containment/hit-test journey guards these layout choices. No pixel algorithms,
project formats, hosted backend or local launcher were changed.
