# Connected revolve checkpoint

The bounded production feature is connected: one root sketch produces an
editable revolve boss around its vertical (+V) axis. Angle expressions, sketch
dimensions and variables drive native worker rebuilds. The feature supports
signed partial/full turns on XY/XZ/YZ, native save/open/recovery, undo/redo and
STEP export. The [contract](CAD-REVOLVE-INCREMENT.md) defines the exact limits.
This checkpoint is not full CAD, product release or human acceptance.

## Source and geometry

C50 accepts the exact `[Sketch, Revolve]` source union without broadening
`bossOf`; C76 adds C79 as its third collaborator and validates angle expressions
using angular tolerance. C51 still commits one revision per edit. Native files
remain version 1 S15 containers with editable sources and no mesh/handle cache.
A lone extrusion may be explicitly replaced while retaining its ID; downstream
features prohibit replacement. Extrusion-only operations remain unavailable on
a revolve.

The worker uses actual PlaneGCS results, C79's analytic profile recipe, C78's
OpenCascade executor, and C72's plane transform once. Editor display and STEP
share this path. Empty, open, crossing-axis, multi-region/holed or invalid-angle
sources flag the feature; failed or stale builds cannot export a previous solid.
Underivable source remains editable. The +V-only limit is shown in the dialog;
Revolve has an original glyph and Shift+E shortcut. Preview/cancel stays outside
history; Enter commits, Esc cancels. A tree row opens its angle source.

Native fixtures preserve the literal volume/area/COM/bounds/cap oracles in the
contract. Variable tube radii, signed angles, all default planes and mm/inch
STEP round-trips are tested. Circle sections and axis-touching polygons exercise
torus/cylinder results. The original plate golden remains unchanged:
`56654.424808105` and `68654.424808105` mm³, including STEP re-import.

## Observed development checks

| Command / seam | Observed output | Raw evidence |
|---|---|---|
| `node --import tsx --test src/cad/cad-revolve-source.test.ts` before/after implementation | 10 FAIL / 3 PASS → 13 PASS; no skips | [RED](evidence/revolve-source-red.log), [GREEN](evidence/revolve-source-first-run.log) |
| Source/legacy seams | 36 PASS; no failures/skips | [source seams](evidence/revolve-source-seams.log) |
| `node --import tsx --test src/cad/part-revolve.test.ts src/cad/part-builder.test.ts src/cad/acceptance-plate-planes.test.ts` | 6 PASS; no failures/skips | [native build/plate](evidence/part-revolve-green.log) |
| C55/C60 worker lifetime seams | 16 PASS; no failures/skips | [worker lifetime](evidence/revolve-worker-lifetime.log) |
| C58 properties | 1 FAIL / 4 PASS → 5 PASS | [RED](evidence/revolve-properties-red.log), [GREEN](evidence/revolve-properties-green.log) |
| C72 plane/S05 keyboard/S09 icons | 39 PASS; no failures/skips | [controls and plane](evidence/revolve-controls-plane-green.log) |
| C01/C72/production revolve | 24 PASS; no failures/skips | [session and plane](evidence/revolve-session-plane-green.log) |
| New production-browser workflow before connection | 1 FAIL: dialog did not open | [RED](evidence/revolve-browser-red.log) |
| Initial connected production-browser workflow | 2 PASS, exit 0 | [first browser run](evidence/revolve-browser-first-run.log) |
| `npm test` | 978 PASS; 0 failed/cancelled/skipped/todo; exit 0 | [full unit output](evidence/revolve-connected-unit.log) |
| `npm run build` | TypeScript and Vite succeed; exit 0 | [build](evidence/revolve-connected-build.log) |
| Method checker, nine changed bounded bricks | 9 PASS; exit 0 | [final module checks](evidence/revolve-connected-final-modules.log) |

Intermediate failures are retained. Source-union widening exposed a legacy
exhaustive-switch assumption in properties and a test inventory. An empty
profile initially retained an extrusion-specific error phrase; assembly copy
now names the actual feature. The new C37 test initially supplied an explicitly
undefined optional argument; omitting it satisfied exactOptionalPropertyTypes,
and the focused 18-case suite was rerun. These are not silently skipped gates.
C54's header was corrected to describe its existing single display-packet
responsibility after the method checker rejected the earlier wording.
The first staged whitespace check flagged trailing spaces emitted by the test
and build reporters. Stored logs normalize trailing whitespace only; diagnostic
text, intermediate failures and result counts are retained.

## Native failure corrections and review

Independent review reproduced three inherited fault-boundary defects. C72
mistook a thrown `undefined` for its unset ordinary-error marker. C37 cleaned
up after unknown exceptions and swallowed unlink errors. C01 called native
exception helpers after failure and continued some cleanup paths. The
[D29 decision](DECISIONS.md#d29--fail-stop-native-boundaries-during-connected-revolve-verification)
and contract amendment require all unknown/native/cleanup faults to stop later
native calls. Only a locally generated ordinary rejection permits cleanup.
Workers reclaim remaining native memory by termination.

The [C37 repair/review evidence](evidence/revolve-step-fault-review.md) records
2,448 fault injections, 18 focused passes and 62 native seam passes. C01/C72
were independently reviewed after repair. Four older C01 fixture expectations,
two native browser diagnostic strings and two C37 fake-filesystem expectations
were deliberately revised to the stricter contract. Geometry, unit and original
plate goldens were not changed. C01 errors retain JavaScript-only context and
their cause; the browser fixtures still execute genuine native faults and
require worker termination/replacement.

Independent source-edit review also passed 36 tests and 44 additional in-memory
checks for unit-bound angle expressions, ownership, ID collisions and atomic
failed edits. Those extra probes are review evidence, not new committed tests.

## Candidate identity and combined gates

The production build remained frozen throughout browser/hosting verification.
[Manifest evidence](evidence/revolve-connected-manifest.json): build
`27e2f584b22e6ba9b6ad1bbd8b544fc6c1a6506c898f21d96d9e9f13d6a64d95`,
55 assets totaling 41,178,176 bytes. Largest file: 22,942,327 bytes; every
individual asset is strictly below 26,214,400 bytes. Cloudflare's current
[Pages file-size limit](https://developers.cloudflare.com/pages/platform/limits/#file-size)
was rechecked on 2026-11-13: 25 MiB per asset. Chunk-size warnings remain;
this does not establish the original performance targets.

All commands below exited 0. System Chrome **154.0.8037.97**, Linux x64,
1280×720 covered the combined browser and local-host checks. The dedicated
offline command explicitly selected Chrome for Testing **158.0.8127.18**;
the separately documented Chrome 154 persistent-restart failure is not a pass.

| Command | Output | Raw evidence |
|---|---|---|
| `AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 BRIDGE_WORKSPACE_APP=1 node_modules/.bin/playwright test` | `91 passed (4.3m)` | [combined browser](evidence/revolve-connected-browser.log) |
| `node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts` | `1 passed (15.2s)`; exact asset bytes, isolation headers and offline reload | [local Cloudflare host](evidence/revolve-connected-static-host.log) |
| `npm run test:offline-build` | 4 PASS; 0 failed/cancelled/skipped/todo | [offline builder](evidence/revolve-connected-offline-build.log) |
| `GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome node --import tsx dev/run-offline-tests.ts` | `9 passed (1.7m)` | [offline browser](evidence/revolve-connected-offline-browser.log) |
| `npm run test:launcher` | `launcher smoke: PASS`; freshness 1 PASS, 0 failed/cancelled/skipped/todo | [Linux source launcher](evidence/revolve-connected-launcher.log) |
| `WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig` | 60 files read; `No bindings found.`; `--dry-run: exiting now.` | [deployment dry-run](evidence/revolve-connected-deploy-dry-run.log) |
| `npm run test:spec` | TRACE/MAP/LINK PASS; 402 requirements/procedures, 214 acyclic contracts; 47 PASS / 0 FAIL / 355 UNTESTED | [final specification audit](evidence/revolve-connected-spec.log) |

The launcher ran after browser consumers exited. Its output manifest retained
SHA-256 `fca22f09b24ea9d6fbe0613dd6b95335a6ead1c54c8ab2c8cfb42e7b9af21411`,
identical to the tested candidate ([identity record](evidence/revolve-connected-post-launcher.json)). The manifest inventories 55 application assets;
Wrangler's 60-file scan also counts host/offline control files. Dry-run uploads
nothing. The preceding native-executor commit `008e10f` has a
[successful remote Cloudflare check](evidence/kernel-revolve-cloudflare-check.json);
it is not deployment evidence for this new integration.

The 91 browser checks combine production journeys and component fixtures. They
include the unchanged plate golden, editable Image golden, planned waveform
Audio editor, Spreadsheet, browser JS/Python and HTML/CSS Code, and the other
connected editors. The nine offline checks exercise all nine workspaces after
complete browser shutdown with the server stopped, failed updates, recovery,
storage denial and retry. Their CAD journey uses the existing extrusion path;
it does not separately assert an offline revolve interaction.

Final read-only integration review reported 70 focused source/properties/worker/
export/keymap/icon tests passing and no new functional blocker. Reviewed UI
SHA-256: `eb2f0cead210e0292084cbe40aea3b3e5a012e1213eccde74513595f80c4cbc2`.
The reviewer inspected dialog source/history isolation, latest-request identity,
explicit replacement guards, current-result export readiness and text/dialog
shortcut exclusions. No production changes followed that review. Two browser
assertions remain unexecuted: cancel/confirm while the native preview is still
pending, and an explicit STL/solid-view check after failed revolve. Worker tests
cover pending/stale identity, and current browser tests cover failed STEP/capture
readiness; these are not substitutes for those two missing UI assertions.

## Requirement credit and limits

`CAD-071 / V-CAD-071` now passes its complete procedure: a rectangular section
offset from +V creates a closed 360° native solid with analytic volume, then
editing its driving sketch value rebuilds the dependent solid. Native and
production-browser fixtures additionally cover signed angles, expressions,
source persistence, unit changes, default planes and STEP readback. Only
CAD-071 receives new credit; earlier PASS statuses are retained. Current total:
**47 PASS, 0 FAIL, 355 UNTESTED**. UNTESTED includes implemented subsets whose
complete original procedure has not passed, as well as missing features.

No Windows/macOS, native OS file-picker, live-host browser or M1a ZIP acceptance
is claimed. Arbitrary axes, revolve cuts, features after a revolve, broader
selection/history/sketch tools and the original full CAD/Image/Video/performance
requirements remain open. GREEN is a bounded implementation checkpoint, not
owner ACCEPTED or CANDIDATE_FOR_ACCEPTANCE.

Exact requirement status snapshot (inclusive ID ranges):

| Status | Requirement IDs |
|---|---|
| PASS | `SYS-005`, `SYS-010` |
| PASS | `CAD-001–CAD-003`, `CAD-006`, `CAD-015`, `CAD-017`, `CAD-020`, `CAD-025`, `CAD-030`, `CAD-033`, `CAD-043–CAD-044`, `CAD-059`, `CAD-071`, `CAD-116`, `CAD-122–CAD-124` |
| PASS | `IMG-103–IMG-104` |
| PASS | `XWS-001`, `XWS-003` |
| PASS | `REL-001–REL-002`, `REL-005`, `REL-011–REL-012`, `REL-014`, `REL-023`, `REL-028` |
| PASS | `DOC-001–DOC-003` |
| PASS | `SLD-001–SLD-003` |
| PASS | `AUD-001–AUD-003` |
| PASS | `SHEET-001–SHEET-003` |
| PASS | `CODE-001–CODE-003` |
| FAIL | None |
| UNTESTED | `SYS-001–SYS-004`, `SYS-006–SYS-009`, `SYS-011–SYS-016` |
| UNTESTED | `CTL-001–CTL-030` |
| UNTESTED | `CAD-004–CAD-005`, `CAD-007–CAD-014`, `CAD-016`, `CAD-018–CAD-019`, `CAD-021–CAD-024`, `CAD-026–CAD-029`, `CAD-031–CAD-032`, `CAD-034–CAD-042`, `CAD-045–CAD-058`, `CAD-060–CAD-070`, `CAD-072–CAD-115`, `CAD-117–CAD-121` |
| UNTESTED | `IMG-001–IMG-102` |
| UNTESTED | `VID-001–VID-073` |
| UNTESTED | `XWS-002` |
| UNTESTED | `PERF-001–PERF-004` |
| UNTESTED | `REL-003–REL-004`, `REL-006–REL-010`, `REL-013`, `REL-015–REL-022`, `REL-024–REL-027`, `REL-029–REL-032` |
| UNTESTED | `AUTH-001` |
