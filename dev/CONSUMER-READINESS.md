# Consumer readiness — active work, not a release claim

For a desktop creator, gsnv-paint turns local models, images, footage, documents and audio into editable projects and useful exported files through one browser application; completion requires the requested workflows, recovery and exports to work without a backend, plus the original acceptance and distribution gates.

Authority: original requirements in `requirements.json`, the owner's additions in [the current plan](PLAN-2026-11-12.md), and the 2026-11-13 request for consumer usability, Spreadsheet and Code. Latest inspected commit: `73405de`. Preserve inherited dirty paths in `src/document/`, `src/app/main.ts`, `src/shared/icons.ts`, `src/shared/keymap.ts`, `src/shared/keymap.test.ts`, `src/video/video-workspace.ts` and their screenshots. The old module-map status text is historical where later checkpoints explicitly supersede it; current behavior must be verified from source/tests.

## Critical journeys and acceptance ledger

| ID | Journey / expected visible outcome | Evidence and status | Owner / next check |
|---|---|---|---|
| CR-CAD-01 | Create the specified rounded plate, four holes and pocket; change width; STEP export/re-import matches exact volumes | PASS for the specified plate: actual production builder and browser construction, dependent positions, width change, units and STEP round trip | Parent: native production-builder golden and browser workflow |
| CR-CAD-02 | Change display/document units without resizing the physical part or losing expressions | REPAIRED/PASS: physical geometry and source dependencies preserved through mm/inch and native round trips | Parent: D27 unit binding regression and native rebuild |
| CR-CAD-03 | Failed features identify their feature and preserve editable history; recovery produces the right solid, repeated rebuilding releases native state | UNVERIFIED beyond existing narrow errors | Runtime audit and parent: negative tests and browser recovery |
| CR-EDIT-01 | Image/Photo/Video edit, save, reopen and export through real UI; retain original full acceptance requirements | PARTIAL: working subsets are committed; original golden/performance/full Video requirements are not proven | Existing native/browser suites plus gap audit |
| CR-DOC-01 | Type/style a document, insert image/table, save/reopen and produce correct PDF | PASS for DOC-001–003 bounded workflow; native OS print dialog remains untested | Workflow/security audit then parent integration |
| CR-SLD-01 | Build/present slides with text/images/shapes and export PDF; save/reopen stays editable | UNVERIFIED; implementation absent | Planned after CAD repairs/Document |
| CR-AUD-01 | Import audio, inspect waveform, select/edit/fade/normalize, undo/reopen and export WAV with expected samples | UNVERIFIED; implementation absent | Owner confirmed the planned audio editor; no composition/piano roll |
| CR-SHEET-01 | Edit a workbook with formulas, fill, format, sort/filter; CSV/XLSX and native round-trips preserve supported values/formulas | UNVERIFIED; newly requested, implementation absent | Contract/module map before implementation |
| CR-CODE-01 | Edit files, run/stop code, see output/errors, preview web files, save/reopen; opened code never runs automatically or reads app projects | UNVERIFIED; newly requested, implementation absent | Owner confirmed browser JavaScript, HTML/CSS and Python; contract/map and runtime isolation tests first |
| CR-REL-01 | Offline web use and identical static M1a local payload; documented clean launch and supported-platform smoke | UNVERIFIED; source launcher exists, packaged release incomplete | Keep original release gates; no acceptance claim |

## Baseline evidence (2026-11-13, Linux x64)

Repair contract for shared/CAD keyboard access: S10 arrow navigation visits every rendered workspace in both directions, wrapping once. C56 exposes committed sketch lines/circles as named, focusable pressed-state buttons; previews are not controls. C58 Enter/Space selects one, Ctrl+Enter/Space toggles a multi-selection, and asynchronous redraw retains the same entity focus. These actions select geometry without drawing or changing model history. Unit and real-browser regressions cover the seam.

`npm test`: exit 0, **573 pass / 0 fail / 0 skipped**. `npm run build`: exit 0. The build retains its vendor conditional Node import and main-bundle size warnings. These results include inherited Document code but do not prove every user journey. Raw baseline logs are in `/tmp/gsnv-20261113-baseline-tests.txt` and `/tmp/gsnv-20261113-baseline-build.txt` during this run; durable evidence is recorded with each repaired checkpoint.

The isolated codebase-audit collector at `/tmp/gsnv-consumer-audit-20261113` passed source inventory, marker inspection, git whitespace/conflict checks and TypeScript. Tokei, shellcheck, Ruff, radon, vulture, mypy, bandit, ESLint, gitleaks, Semgrep and Trivy checks were SKIPPED/unavailable; dependency advisory freshness was not checked by that offline collector. No complexity grade or security pass is inferred from unavailable tools. Repository-native tests/build run separately, and read-only runtime, browser and security specialists inspect reachable paths.

## Verified repair checkpoint

See [consumer repair evidence](CONSUMER-REPAIR-CHECKPOINT.md): 610 existing-editor unit tests, 32 Chrome browser tests, build and Wrangler dry-run. Native acceptance volumes and dependent hole/pocket positions pass. Missing consumer features and distribution gates above remain open. The next authoring workspaces are being implemented under the committed authoring map.
