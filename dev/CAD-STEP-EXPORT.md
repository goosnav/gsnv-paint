# STEP output from the working CAD editor — provisional GREEN

The production CAD toolbar now exports the current solid as STEP. A fresh worker rebuilds the committed sketch and extrusion with PlaneGCS/OpenCascade, writes the analytic B-rep, and delivers bytes through S07. Export leaves the editable document, history and unsaved state unchanged. Esc, document changes and disposal cancel preparation and writes before native close begins; an invalid sketch produces a readable error with no downloaded file. Once close starts, the file commit must finish or fail. The app reports that saving is finishing and refuses replacement until its outcome is known.

C37, C59 and C60 are GREEN. STEP-APP is the third provisional CAD assembly rung after CAD-A1 and CAD-APP. Human ACCEPTED remains empty. The complete Phase 2 gate and release candidate are still open.

## Contracts and decisions

- **C37 `step-exchange` — SHELL:** import/export through the real STEP translators using C01's worker-local tokens. Reads reject erroneous/unknown entities and failed entity translations, require complete root transfer and validated positive-volume solids, and reject mixed surfaces/wires. Returned import tokens are non-parametric geometry; the future document import assembly must retain source bytes and allocate document IDs. Temporary native wrappers/files are released on normal paths. Native faults require worker termination. The production app exposes export only at this checkpoint.
- **C59 `kernel-linear-prism` — SHELL:** constructs C53's validated polygon as a wire, face and signed prism, validates the solid, and transfers one wrapper to C01. C54 now consumes this token instead of owning a second implementation of construction. Its public contract and numeric assertions are unchanged. The existing test resources gained the full lifecycle port, and a new assertion verifies that no shape token remains after preview generation.
- **C60 `cad-step-export` — SHELL:** owns the user-activated picker, source snapshot, fresh worker, 30-second watchdog, cancellation, file handoff and error status. Native writes are guarded until close begins. In-flight close is irreversible: cancellation/replacement reports “save is finishing,” and the eventual success/failure remains visible. Disposal suppresses late UI without claiming to revoke an in-flight commit. Browser download success is a handoff, not proof of durable disk storage.

The map was committed as `8732e92` before C59/C60 implementation. The existing C37 contract already belonged to the committed phase map. D17 records the extraction and export wiring. No C05 contract or implementation was changed.

The real STEP test found an important unit mismatch: `SetWriteLengthUnit(25.4)` alone scaled coordinates to inches but the exposed transfer overload still labelled the file in millimetres. The corrected adapter sets the model units and temporarily sets/restores `write.step.unit`. Tests alternate mm → inch → mm, check the file's unit records, dispose source bodies, and re-import into canonical mm before measuring. The numerical and unit expectations were retained. This is recorded with pinned upstream sources in [D17](DECISIONS.md#d17--native-step-exchange-and-output-from-the-working-editor).

Independent review found two additional defects before push. Actual `WritableStream` tests reproduced a committed file after the app reported cancellation; the explicit commit state now follows the [stream close semantics](https://streams.spec.whatwg.org/#writable-stream-finish-in-flight-close). A real two-body STEP assembly with a broken shell reference imported only the undamaged child even though every root reported transfer success. C37 now checks loaded entities and all mapped transfer results via the pinned [OCCT `GetStatsTransfer` implementation](https://github.com/Open-Cascade-SAS/OCCT/blob/V8_0_1/src/DataExchange/TKXSBase/XSControl/XSControl_Reader.cxx). Another malformed copy with an empty shell passed those native checks, so the free-topology scan now includes shells and wires as well as faces, edges and vertices. Regressions keep the valid assembly's 6000/210 mm³ volumes and require rejection of both damaged copies. Each regression was observed RED before its fix.

The follow-up independent review found no remaining Critical or Important issues in this increment and independently reran all 25 C37/C59/C60 tests successfully. It did not claim coverage of native picker UI, other platforms, hosted deployment or the remaining CAD scope.

## Verification

Environment: Linux x64, Node 24.21.0, desktop Chrome 154.0.8037.97 headless at 1280×720. No other browser/OS or native OS picker was smoke-tested for this increment.

| Command | Result | Output |
|---|---|---|
| `npm test` | 470 tests, 470 pass, 0 fail, 0 skipped; exit 0 | [unit log](evidence/STEP-APP-unit.txt) |
| `npm run test:browser` | Production build plus 18 tests, 18 pass, 0 skipped; exit 0 | [browser log](evidence/STEP-APP-browser.txt) |
| `npx wrangler deploy --dry-run --no-autoconfig` | 17 static files read, no bindings, dry run completed; exit 0 | [deploy log](evidence/STEP-APP-deploy.txt) |
| `npx wrangler dev --local --ip 127.0.0.1 --port 43761` + Chrome smoke | STEP download succeeds; HTML/export worker/WASM return 200 with COOP/COEP/CORP; isolation true; no page errors | [local Cloudflare runtime](evidence/STEP-APP-cloudflare-runtime.txt) |
| Goosnav checker on C37, C59, C60 and modified C54 | All four pass; exit 0 | [checker log](evidence/STEP-APP-checkers.txt) |
| `npm run test:spec` | 386 requirements, 169 contracts, trace/map/link closure | [spec log](evidence/STEP-APP-spec.txt) |

The production browser downloads a 100×60×10 solid and independently re-imports the bytes in a separate native kernel context after the export worker has terminated: **60000 mm³**. Editing width to 120 produces **72000 mm³** on the next download. Source history and the unsaved indicator are unchanged, and no external application requests occur. A second browser case holds the real export-worker module request and observes actual termination on Esc and on a committed source edit; releasing the old response does not download a file. Deleting the profile then exporting produces a readable error, and Undo restores the part.

C37's fake resource cases cover closed/stale sessions, translator status failures, entity load/translation failures, invalid/empty/partial/mixed geometry, unit setting/restoration, native faults, write failures, ownership and cleanup. Its real C01/OCCT smoke covers multiple solids including a cylinder, strict unit records, source disposal, mm/inch readback and a damaged assembly child. C59's real seam includes reversed extrusion depth through STEP readback. C60's fake browser cases additionally cover picker cancellation/permissions, native write-close ordering, write aborts, malformed replies, replacement jobs, disposal and timeout. Real `WritableStream` cases cover deferred successful close, failed close/retry and disposal during close. These do not claim native OS-picker UI coverage.

Each new testbench was observed RED at its unimplemented entry point. The production test was RED because Export STEP was not present. A checker finding required making the rejected alternative explicit in C37's header. The Node worker-error fake uses an Event with a message because Node does not supply the browser ErrorEvent constructor; the same failure expectation remains. Final tests preserve geometry, file, cancellation and state assertions.

All three native demos ran, and the C60 browser demo at `/dev/fixtures/cad-step-export.html` downloaded `Untitled part.step`; [illustrative output](evidence/STEP-APP-demos.txt) is separate from automated test evidence. The [production screenshot](evidence/STEP-APP-production.png) was visually inspected. Earlier checkpoint screenshots were preserved instead of overwritten by the regression run.

Vite still reports the solver's conditional `node:module` import and a main bundle above its 500 kB recommendation. The real worker/browser checks pass. Every static file is below Cloudflare's 26,214,400-byte limit; the largest remains **22,942,327 bytes** ([asset inventory](evidence/STEP-APP-assets.json)). Live Cloudflare authentication/upload and the hosted deployment were not exercised.

## Requirement status and remaining work

**16 PASS / 0 FAIL / 370 UNTESTED**, unchanged. PASS IDs: SYS-005, CAD-001, CAD-002, CAD-003, CAD-006, CAD-043, CAD-044, CAD-059, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028. Every other ID remains UNTESTED in [requirements.json](requirements.json) and [06-TRACEABILITY.md](06-TRACEABILITY.md).

CAD-113 still requires the specified hole/fillet part and complete independent exchange validation. CAD-116 still requires the native import feature-tree workflow. CAD-124 still requires the full fillet/hole/pocket acceptance plate. The basic prism and cylinder tests are component evidence and do not close those requirements. STL/3MF/DXF, drawing sheets, the rest of CAD, Image, Video, offline caching, cross-workspace actions, corresponding-source release archives and M1a packaging remain required.

## How to tune and maintain

C37 owns translator unit choices and resource cleanup; its mm/inch round-trip is the regression guard. C59 has no tunable geometric approximation; it consumes the caller's validated polygon and signed depth. C54 retains the existing display tessellation settings, which do not affect STEP output. C60's named `WATCHDOG_MS` controls only the export deadline; fake-clock tests cover its timeout path. Menu labels and status placement live in `cad-workspace.ts`/CSS. The production export browser tests are the seam gate when changing source ownership, worker messages or file handoff.
