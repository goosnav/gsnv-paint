# Consumer readiness — active work, not a release claim

For a desktop creator, gsnv-paint turns local models, images, footage, documents and audio into editable projects and useful exported files through one browser application; completion requires the requested workflows, recovery and exports to work without a backend, plus the original acceptance and distribution gates.

Authority: original requirements in `requirements.json`, the owner's additions in [the current plan](PLAN-2026-11-12.md), and the 2026-11-13 request for consumer usability, Spreadsheet and Code. The [modeling and offline checkpoint](MODELING-OFFLINE-CHECKPOINT.md) owns the pushed `9496858` candidate's combined results. The subsequent [profile-face increment](CAD-PROFILE-FACE-EVIDENCE.md) records the C77/C59 integration and C65 native-fault caller repair. Baseline inspected commit `73405de` and the earlier repair/authoring counts below are historical. Later evidence supersedes them only within its stated scope.

## Connected revolve checkpoint — bounded combined gates GREEN

The [connected revolve evidence](CAD-REVOLVE-EVIDENCE.md) records 978/978 unit
tests, 91/91 combined browser checks, 9/9 dedicated offline checks, successful
type/build, local Wrangler hosting, Linux source launcher and deployment dry-run.
One root sketch now drives an editable +V-axis revolve boss, with signed angles,
variables, XY/XZ/YZ placement, native persistence/recovery and STEP export.
Independent review also led to C01/C37/C72 native-fault corrections. The original
plate and extrusion geometry oracles are unchanged.

The complete V-CAD-071 procedure now passes. Current totals are **47 PASS / 0 FAIL /
355 UNTESTED**. The remaining full CAD/Image/Video and performance requirements,
live-host browser verification and M1a/platform gates remain open. The planned
waveform Audio editor and browser JavaScript/HTML/CSS/Python Code scope remain
the owner's selected deliverables; composing music and a system terminal are
not added.

## Earlier analytic profile-face checkpoint — bounded combined gates GREEN

The newer [profile-face evidence](CAD-PROFILE-FACE-EVIDENCE.md) records
923/923 unit tests, 51 focused CAD seams, 89/89 combined browser checks,
type/build success, local static-host verification and deployment dry-run.
C77/C59 preserve analytic extrusion geometry; C65 now stops native cleanup
after unknown nested faults. A Slides fixture now maintains chooser
interception from setup; the application was not changed for that timeout.
Its historical attribution stays inferred. No requirement credit was added.
At that checkpoint, production revolve and full consumer/release acceptance
remained open; the connected checkpoint above supersedes only the revolve gap.

## Earlier modeling/offline checkpoint — bounded combined gates GREEN

The parent confirmed **908/908 full unit tests**, production build exit 0,
Linux launcher smoke success and freshness **1/1**, offline builder **4/4**,
Wrangler deployment dry-run exit 0, and **34 bounded module checks**. The candidate build ID is
`9980ea171176a67ab825a15083838fed0849060cd52c8d6857652d75cf6efaa2`:
55 manifest assets, 41,154,578 bytes total, largest asset 22,942,327 bytes.
The total exceeds 25 MiB; each individual asset stays below that file-size bound.

The canonical production-enabled browser command returned **89 passed in
4.0 minutes, exit 0**, including CAD native reopen and the bridge
Save-after-Redo regression. [Raw browser output](evidence/modeling-offline-browser-green.log)
is retained. The dedicated **nine-case offline gate passed** on explicit Chrome
for Testing 158; the real local Wrangler static-host check passed **1/1** on
system Chrome 154. The latter browser's independent persistent-restart/download
crash remains a separate recorded failure, not an offline-update pass.
[README commands](../README.md#develop) describe both browser selections.

The earlier CAD Open failures are historical. A captured repeated failure
proved an asynchronous test chooser-interception race. The two golden fixtures
now keep public `page.on('filechooser', ...)` listeners from initial setup;
their original actions, timeouts and assertions remain. No application patch
was made for that issue. Attribution of the earlier uninstrumented failures
remains inferred; [diagnosis and RED evidence](CAD-REOPEN-DIAGNOSIS.md) are kept.

After reviewing the full procedures, the parent credited CAD-020, CAD-025,
CAD-030, CAD-033, XWS-001, XWS-003 and SYS-010. That checkpoint's ledger totaled
**46 PASS / 0 FAIL / 356 UNTESTED**; IMG-103/104 were already PASS. These counts
describe tested requirements, not full product or owner acceptance.

## Critical journeys and acceptance ledger

| ID | Journey / expected visible outcome | Evidence and status | Owner / next check |
|---|---|---|---|
| CR-CAD-01 | Create the specified rounded plate, four holes and pocket; change width; STEP export/re-import matches exact volumes | PASS for the specified plate: actual production builder and browser construction, dependent positions, width change, units and STEP round trip | Parent: native production-builder golden and browser workflow |
| CR-CAD-02 | Change display/document units without resizing the physical part or losing expressions | REPAIRED/PASS: physical geometry and source dependencies preserved through mm/inch and native round trips | Parent: D27 unit binding regression and native rebuild |
| CR-CAD-03 | Failed features identify their feature and preserve editable history; recovery produces the right solid, repeated rebuilding releases native state | UNVERIFIED beyond existing narrow errors | Runtime audit and parent: negative tests and browser recovery |
| CR-EDIT-01 | Image/Photo/Video edit, save, reopen and export through real UI; retain original full acceptance requirements | PARTIAL: working subsets are committed; IMG-103/104 now pass the exact production golden and editable native roundtrip; performance/full Video requirements are not proven | Existing native/browser suites plus gap audit |
| CR-DOC-01 | Type/style a document, insert image/table, save/reopen and produce correct PDF | PASS for DOC-001–003 bounded workflow; native OS print dialog remains untested | Workflow/security audit then parent integration |
| CR-SLD-01 | Build/present slides with text/images/shapes and export PDF; save/reopen stays editable | PASS for SLD-001–003: editable objects, native reopen and independently parsed PDF | Production Chrome and PDF evidence in AUTHORING-CHECKPOINT.md |
| CR-AUD-01 | Import audio, inspect waveform, select/edit/fade/normalize, undo/reopen and export WAV with expected samples | PASS for AUD-001–003: waveform edits, native recovery and literal PCM16 WAV output | Physical audio hardware and non-WAV codecs untested |
| CR-SHEET-01 | Edit a workbook with formulas, fill, format, sort/filter; CSV/XLSX and native round-trips preserve supported values/formulas | PASS for SHEET-001–003: formula/range/format/sort/filter and bounded XLSX/CSV/native workflows | Supported subset only; no claim of full Excel compatibility |
| CR-CODE-01 | Edit files, run/stop code, see output/errors, preview web files, save/reopen; opened code never runs automatically or reads app projects | PASS for CODE-001–003: local editing, JS/Python run/stop and isolated script-free HTML/CSS preview | Production runtime isolation tests; no system shell or external packages |
| CR-XWS-01 | Send a whole Image to the Video bin, a current Video frame to Image, or a transparent CAD view to Image; preserve sources and editable targets | PASS for XWS-001/003 after the combined gate. Current Video raster transfer works, but XWS-002 remains UNTESTED because corrections are absent | [Transfer contract/evidence](CROSS-WORKSPACE.md) and current checkpoint; no broad Video acceptance |
| CR-REL-01 | Offline web use and identical static M1a local payload; documented clean launch and supported-platform smoke | PARTIAL: SYS-010 offline procedure, local Wrangler host and Linux source launcher checks pass. M1a package, Windows/macOS and live hosting remain unverified | Keep original release gates; no acceptance claim |

## Historical baseline evidence (2026-11-13, Linux x64)

Repair contract for shared/CAD keyboard access: S10 arrow navigation visits every rendered workspace in both directions, wrapping once. C56 exposes committed sketch lines/circles as named, focusable pressed-state buttons; previews are not controls. C58 Enter/Space selects one, Ctrl+Enter/Space toggles a multi-selection, and asynchronous redraw retains the same entity focus. These actions select geometry without drawing or changing model history. Unit and real-browser regressions cover the seam.

`npm test`: exit 0, **573 pass / 0 fail / 0 skipped**. `npm run build`: exit 0. The build retains its vendor conditional Node import and main-bundle size warnings. These results include inherited Document code but do not prove every user journey. Raw baseline logs are in `/tmp/gsnv-20261113-baseline-tests.txt` and `/tmp/gsnv-20261113-baseline-build.txt` during this run; durable evidence is recorded with each repaired checkpoint.

The isolated codebase-audit collector at `/tmp/gsnv-consumer-audit-20261113` passed source inventory, marker inspection, git whitespace/conflict checks and TypeScript. Tokei, shellcheck, Ruff, radon, vulture, mypy, bandit, ESLint, gitleaks, Semgrep and Trivy checks were SKIPPED/unavailable; dependency advisory freshness was not checked by that offline collector. No complexity grade or security pass is inferred from unavailable tools. Repository-native tests/build run separately, and read-only runtime, browser and security specialists inspect reachable paths.

## Verified repair checkpoint

See [consumer repair evidence](CONSUMER-REPAIR-CHECKPOINT.md): 610 existing-editor unit tests, 32 Chrome browser tests, build and Wrangler dry-run. Native acceptance volumes and dependent hole/pocket positions pass. Missing consumer features and distribution gates above remain open. The added workspaces and STEP import are covered by [the authoring checkpoint](AUTHORING-CHECKPOINT.md).

## Authoring and imported-CAD checkpoint

All nine workspace adapters are connected to the common shell. [Authoring evidence](AUTHORING-CHECKPOINT.md) records that earlier checkpoint's tested scope. CAD-116 passes the real consumer STEP import workflow, including multiple solids and exact source retention. The newer [CAD modeling evidence](CAD-MODELING-EVIDENCE.md) covers default planes, editable centered rectangles/polygons and construction exclusion. Production revolve now passes the bounded CAD-071 procedure in the connected checkpoint above; its earlier native API proof alone did not establish that result.

[Snapshot transfers](CROSS-WORKSPACE.md), [Video export focus](VIDEO-EXPORT-FOCUS.md), [exact-revision recovery and Save availability](RECOVERY-CONSISTENCY.md), and [offline installation](OFFLINE-WORKFLOW.md) now pass their bounded combined regression gates; the current checkpoint records the exact evidence and credit. Remaining CAD tools, Video corrections, broader Image/Video and performance requirements, live hosting and M1a/platform distribution are still open. No CANDIDATE_FOR_ACCEPTANCE or owner acceptance is claimed.


[Image acceptance evidence](IMAGE-ACCEPTANCE.md) adds persistent selections, exact IMG-103/104 goldens and a corrected typed zoom control. This closes those two acceptance procedures only; it does not imply the full original Image feature list is implemented.
