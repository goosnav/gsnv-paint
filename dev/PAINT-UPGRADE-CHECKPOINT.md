# Paint upgrade candidate — 2026-11-15

Implements the owner-approved [PU-01–16 plan](PAINT-UPGRADE-2026-11.md).
Baseline `1129065`; specification/map commits `73edda3`, `0894f55` preceded
implementation. BATCH authorization covered the mapped bricks. Owner acceptance
remains open; this is a candidate, not a claim that the original creative suite
is complete. The original ledger remains **47 PASS, 0 FAIL, 355 UNTESTED**.

## Delivered behavior

- Opaque menus cover the toolbar. Shared offline Help provides search, FAQ,
  tutorials and safe navigation to tools, including custom font import.
- A local MIT-licensed Tabler subset replaces Paint/common icons. The white
  Goosnav mark has an aligned 24 px derivative; no Microsoft assets are shipped.
- An untouched first launch opens a white 800×600 canvas after recovery handling.
  New offers dimensions, background, Pixel art/Smooth and colour-limit choices.
- Pixel art changes generated text/shape coverage and default resampling, not
  just CSS. Optional strict palettes apply consistently to final composite
  pixels, PNG, clipboard and transfers. Existing source layers remain editable.
  None, Bayer and Floyd–Steinberg dithering and reversible Down-pixel previews
  are available. Native v3 projects retain these settings; old pixels migrate
  without implicit conversion.
- Automation records semantic drawing, selections, transformations, layer and
  processing edits. Undo/Redo updates the recorded steps. Text and external
  images embed committed pixels; internal copy/paste uses each replay input.
  Actions can be edited, saved, reopened, previewed and applied as one undo step.
- Explicit JavaScript recipe authoring runs in the existing isolated runtime,
  with metadata and validated operations. Batch previews input sizes, processes
  sequentially and writes a new timestamped output child or a labelled ZIP.
  Originals are never output targets. Progress, cancellation and error reports
  distinguish decode failures from destination failures.

Exact recipe schema and limits: [IMAGE-ACTIONS-V1.md](IMAGE-ACTIONS-V1.md).
Persistence and rendering: [IMAGE-WORKFLOW.md](IMAGE-WORKFLOW.md).
Remaining work, ordered with CAD first: [CONSUMER-GAPS-2026-11.md](CONSUMER-GAPS-2026-11.md).

## Verification record

Evidence is in [the committed log directory](evidence/paint-upgrade/).
Upgrade result: **PU-01–PU-16 PASS; 0 FAIL; 0 UNTESTED** within the test scope below. Bricks are GREEN; owner acceptance remains open.

| Requirement | Status | Evidence |
|---|---|---|
| PU-01 | PASS | Actual opaque-menu pixel/click, keyboard and resize browser checks |
| PU-02 | PASS | Help search/focus units; offline font lookup, FAQ and narrow-touch browser journeys |
| PU-03 | PASS | Vendored license/hash tests; inspected DPR 1/2 glyph/logo screenshots |
| PU-04 | PASS | Safe starter/recovery units; New/cancel/settings/browser replacement checks |
| PU-05 | PASS | v3 policy native round trip, malformed records and exact legacy migration tests |
| PU-06 | PASS | Custom TTF/OTF coverage, shape and transform equality; unchanged-transform raster regression |
| PU-07 | PASS | Strict RGB/alpha properties; final viewport/PNG/clipboard/bridge output parity |
| PU-08 | PASS | Deterministic palette/dither goldens, editable swatches, cancel and single Undo |
| PU-09 | PASS | Down-pixel golden/worker/cancel tests; actual Chromium and WebKit previews/resize/Undo |
| PU-10 | PASS | Validated shared operations, interactive/replay equivalence and resource-bound tests |
| PU-11 | PASS | Full edit replay, Undo/Redo, cancelled edits, text assets and clipboard provenance regressions |
| PU-12 | PASS | Actions editing/round trip/preview/apply/Undo, stale-open and keyboard browser tests |
| PU-13 | PASS | Chromium and WebKit isolated JavaScript, explicit Run/Stop, spoof/limits/storage/network/offline checks |
| PU-14 | PASS | Per-step mixed-size goldens and distinct-size batch previews |
| PU-15 | PASS | Real Chromium directory handles preserve originals; WebKit ZIP; collision/failure/Stop/report tests |
| PU-16 | PASS | 1,214 units, 160 main browser checks plus final 46-check regression, WebKit 20, offline 9, static host and documented gap audit |

These are bounded upgrade results. Physical devices, unavailable native APIs and
the 355 original unverified requirements are not promoted to PASS.

| Gate | Command | Observed result |
|---|---|---|
| Units | `npm test` | **1,214 passed, 0 failed, 0 skipped (38.6s)** including final recovery and worker repairs |
| Types | `npm run typecheck` | **Exit 0**, included in final `npm run build` |
| Specification | `npm run test:spec` | 402 unique requirements; 220 module contracts; links PASS; 47/0/355 ledger |
| Main production browser | `node_modules/.bin/playwright test` after production build | **160 passed (7.7m)**, Chromium 154.0.8037.97 before final portability repairs; **46/46 affected browser checks passed (2.1m)** afterward, command below |
| WebKit Paint workflows | `LD_LIBRARY_PATH=/tmp/paint-webkit-deps/usr/lib/x86_64-linux-gnu node_modules/.bin/playwright test --config dev/paint-upgrade-webkit.playwright.config.ts` | **20 passed (1.4m)**, Linux WebKit 27.2; directory-writing case excluded because that API is unavailable, not credited |
| Isolated recipe script, WebKit | `IMAGE_RECIPE_SCRIPT_TEST_PORT=4221 LD_LIBRARY_PATH=/tmp/paint-webkit-deps/usr/lib/x86_64-linux-gnu npx playwright test --config src/image/image-recipe-script.webkit.playwright.config.ts` | **7 passed (37.5s)** on disposable production build |
| Isolated recipe script, Chromium | `IMAGE_RECIPE_SCRIPT_TEST_PORT=4222 npx playwright test --config src/image/image-recipe-script.playwright.config.ts` | **7 passed (36.6s)** on disposable production build |
| Code runtime, Chromium | `npx playwright test --config src/code/code-runtime.playwright.config.ts` | **8 passed (40.7s)**, including Python offline, security and Stop |
| Complete offline gate | `GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome node --import tsx dev/run-offline-tests.ts` | **9 passed (1.7m)**, explicit Chrome for Testing 158.0.8127.18; all nine editors with server stopped, failed updates, native unload, recovery and local launcher |
| Cloudflare local static host | `playwright test --config dev/static-host.playwright.config.ts` | **1 passed (19.9s)**, final 59-asset production cache with isolation and offline reload |
| Static deployment validation | `WRANGLER_SEND_METRICS=false wrangler deploy --dry-run --no-autoconfig` | **Exit 0**, 64 static files, no bindings; dry run, no upload |
| Offline build controls | `npm run test:offline-build` | **4 passed**, 0 failed/skipped |
| Linux source launcher | `npm run test:launcher` | **launcher smoke: PASS**, freshness test **1 passed**; automatic OS browser opening disabled |
| Module contracts | Goosnav modular method `check_module.py` over the 40 paths in `module-checks.log` | **40 PASS**; includes new leaves plus touched recovery/Photo controls |

During portability verification, the diagnostic storage reader also required ArrayBuffer decoding after recovery changed formats. Its initial failure was in evidence collection; the final complete offline rerun above uses the corrected reader and retains all saved-byte/recovery assertions.

The default system Chromium 154 crashes with SIGSEGV after a download in the
persistent-profile offline update test. The unchanged test passes on explicit
Chrome for Testing 158.0.8127.18. Do not report that Chromium 154 offline check as
a pass or silently switch executables. This is also documented in the existing
[offline workflow](OFFLINE-WORKFLOW.md).

Final affected-browser command (46 passed):

```sh
node_modules/.bin/playwright test \
  src/image/image-automation.browser.spec.ts \
  src/image/image-upgrade.browser.spec.ts \
  src/image/image-batch.browser.spec.ts \
  src/shared/recovery-store.browser.spec.ts \
  src/app/app-shell.browser.spec.ts src/app/open-files.browser.spec.ts \
  src/app/save-export.browser.spec.ts src/code/code-workspace.browser.spec.ts \
  src/code/code-runtime.browser.spec.ts --output /tmp/paint-candidate-chrome-results
```

Final static build: `7b45ef68dcff218ff74041fb08cf70f5a4a35b43c8603b177df8828d23f1f5a8`.
The integrity manifest contains 59 assets, 41,408,850 bytes. Largest asset:
OpenCascade WASM, 22,942,327 bytes, below the
[Cloudflare Pages 25 MiB per-file limit](https://developers.cloudflare.com/pages/platform/limits/#file-size).
Vite reports a bundle-size advisory for the large app chunk; this is not a
performance acceptance result.

## Visual review and limits

Inspected actual-size desktop screenshots at DPR 1 and 2 and a 390×844 touch
viewport Help dialog: [DPR 1](evidence/paint-upgrade/chrome-dpr1.png),
[DPR 2](evidence/paint-upgrade/chrome-dpr2.png),
[narrow Help](evidence/paint-upgrade/help-touch-390.png). These are Linux browser
checks, not physical iPhone/iPad, Apple Pencil, macOS or Windows acceptance.

Nearest-neighbour enlargement exposes stored pixels sharply. It cannot restore
detail already removed by blur or JPEG, and thresholding small text may lose thin
strokes. Explicit palette reduction can remove stored intermediate colours;
Smooth mode and intentional soft brush/filter operations remain available.
Placed text remains rasterized, not an editable text layer. Native OS picker UI
is untested; folder tests use real browser file handles with injected selection.
Scripts have size/deadline checks, not a hard browser heap quota. Batch recursion
is off and ZIP has a 128 MiB bound. No full-suite performance target is newly
credited. No new universal ZIP or cross-OS launcher acceptance is claimed.
