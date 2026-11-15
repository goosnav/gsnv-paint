# Sharp pixel rendering in Paint

2026-11-14. Bounded owner-requested rendering increment; human acceptance pending.

## Behavior and terminology

The requested display method is nearest-neighbor rendering. Bicubic interpolation
blends pixels; Gaussian blur is a separate operation. Paint now defaults to
**Sharp pixels (nearest)** under View → View settings → Canvas rendering. A
32 × 32 black/white image at 550% zoom is checked from a real browser screenshot:
its displayed interior contains exactly black and white. Smooth previews live;
Cancel restores the original setting. The setting edits neither pixels nor history.
Existing gray or soft pixels remain distinct pixels, not silently thresholded.

Default Brush and Eraser coverage is binary rather than the previous soft dab's
antialiased rim. Pencil remains hard. Pixel size 1–32 produces document-aligned
blocks, retaining the full document resolution. Reduced opacity remains an
intentional blend; Smooth edges retains the prior hardness/flow brush path.
Transforms default to Pixels/nearest; Smooth/bilinear remains available. The
original raster survives preview until Apply, and PNG/native reopen preserve the
committed pixels and alpha. No file format or project migration is needed.

I62 accumulates grid coverage; the existing selection/opacity/history pipeline
applies it. Mode D extracts I63's two resampling entry points from I50, preserving
its old transform goldens and bilinear API default. This resolves I50's existing
five-entry checker violation without adding a compatibility cycle. I50 now has
three entry points. I53 and I61 supply controls; IMAGE-APP composes the bricks.

## Evidence and limits

[Spec and contracts](PAINT-PIXEL-DRAWING.md),
[32 × 32 canvas at 550%](evidence/IMAGE-sharp-pixels.png),
[command outputs](evidence/pixel-drawing/).

| Requirement | Result | Verification |
|---|---|---|
| PIX-01 | PASS | I62 binary round/square/1px goldens; browser default Brush, hard Eraser, deliberate Smooth fractional edges |
| PIX-02 | PASS | Grid/partial-edge/off-canvas goldens, invalid input before writes; typed/clamped paired controls; browser coarse-cell uniformity and selection clipping |
| PIX-03 | PASS | I63 nearest source RGBA at 0/37/90 degrees; retained bilinear goldens; transform control callbacks; real 550% screenshot, Smooth preview/Cancel and unchanged history/pixels |
| PIX-04 | PASS | Exact undo/redo, one history entry per hard stroke, selection clipping; transparent alpha only 0/255; exported PNG exact canvas match and native reopen exact match |
| OFFLINE-FRESH-01 | PASS | Deterministically held older cache read and worker-message seam reject eviction; failed older inspection does not block fresh inspection |
| macOS/Safari native UI; Windows; physical iPad | UNTESTED | No platform smoke claim |
| 4000 × 4000 / 20-layer no-visible-lag target | UNTESTED | Not measured by this bounded increment |

The first browser attempt exposed test setup defects: native file-system pickers
were not disabled for Playwright's filechooser/download harness, and repeatedly
transferring millions of individual pixel numbers exhausted the test timeout.
The harness now selects the documented fallback path and computes complete
pixel/channel/block checks inside the browser, returning compact results. No
pixel expectations were relaxed. The existing explicitly soft-brush fixture
selects Smooth; its pixel/history oracles are unchanged. RED logs are retained.

The first full offline run had eight passes and one intermittent eviction-status
failure. Its unchanged isolated recheck passed. Investigation then reproduced a
real race with held-read unit tests: an explicit fresh check reused an audit
started before eviction. S18 now waits out the older audit before inspecting
again; S19 forwards the fresh flag. Both regression tests failed before the fix
and passed after it; a third test covers recovery after the older audit rejects.
Ordinary audits still coalesce, and warm asset fetches add no audit. The initial
failure and diagnostic recheck remain in the evidence directory.

## Command gates

The complete browser run precedes the isolated sampler guard and the verification-
discovered offline repair. The final Image code is covered by the focused
Image suite; the subsequent S18/S19 repair is covered by the complete offline
and static-host suites below. The full unit suite was rerun after both repairs. No failed check is represented as passed.

- `npm test`: `tests 1021`, `pass 1021`, `fail 0`, `skipped 0`.
- `npm run build`: exit 0, TypeScript and Vite production output. Existing
  PlaneGCS node:module externalization and large-chunk warnings remain.
- `AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 BRIDGE_WORKSPACE_APP=1 node_modules/.bin/playwright test`:
  `117 passed (4.9m)`, zero failed/skipped.
- Review then found a geometry-only transform demo could expose a sampler without
  an implementation callback because its CSS overrode hidden. The optional control
  is now only attached when supported. Its new assertion first failed, then
  `node --import tsx --test src/image/image-transform-view.test.ts` passed both tests.
  After rebuilding, `node_modules/.bin/playwright test src/image/image-pixel-drawing.browser.spec.ts src/image/image-navigation.browser.spec.ts`
  passed all `9` browser checks (`19.5s`), including touch pointer navigation.
- `python3 <goosnav-modular-coding-method>/scripts/check_module.py src/image/pixel-stroke.ts src/image/raster-ops.ts src/image/raster-transform.ts src/image/image-palette.ts src/image/image-transform-view.ts src/shared/offline-cache.ts src/shared/offline-worker.ts`:
  PASS for all seven changed bricks, including S18/S19. S18 retains a
  soft-cap warning at 212 implementation lines, below the 300-line hard limit. IMAGE-APP remains the composition assembly.
- `npm run test:spec`: trace/map/link PASS; 402 requirements/procedures, 220
  contracts; original ledger `PASS 47; FAIL 0; UNTESTED 355`. This is a metadata
  audit, not execution of those product requirements.
- `npm run test:launcher`: `launcher smoke: PASS`; freshness `pass 1`, `fail 0`,
  `skipped 0`. Linux launch/process behavior only.
- `npm run test:offline-build`: `pass 4`, `fail 0`, `skipped 0`.
- `WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig`:
  exit 0, `Read 61 files`, `No bindings found`, `--dry-run: exiting now`. A dry run
  validates configuration/upload preparation; it is not a live deployment.

- `GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome node --import tsx dev/run-offline-tests.ts --grep 'eviction and denied' --repeat-each 3`:
  `3 passed (21.4s)`, zero failed/skipped, after the S18/S19 fix.

- `GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome node --import tsx dev/run-offline-tests.ts`:
  `9 passed (1.6m)`, zero failed/skipped. All nine workspaces edit/export after a
  complete browser shutdown with the server stopped; dirty-tab update behavior,
  denied storage, eviction repair and the real local launcher also pass.

- `node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts`:
  `1 passed (11.0s)`; Cloudflare-compatible static assets preserve required
  isolation headers and the complete installed build works offline.

**GREEN / CANDIDATE_FOR_ACCEPTANCE.** PIX-01–04 and OFFLINE-FRESH-01 pass;
no failing final gate and no skipped check counted as a pass. I62/I63 and the
amended bricks await human acceptance.

Main browser checks ran in Chrome 154.0.8037.97 on Linux x64 at 1280 × 720.
Persistent offline checks use bundled Chrome for Testing 158 on Linux x64.
The demo log shows I62 coarse coverage and I63 exact RGB enlargement as a human
sanity check; it is not counted as test evidence.

Original product ledger remains separate: this increment does not claim closure
of the whole creative-suite backlog or unmeasured performance targets.
