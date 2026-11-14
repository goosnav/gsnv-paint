# Save/export discovery and Image-first startup

Owner request, 2026-11-14: make exported files discoverable from Save; File →
Save opens a submenu, the toolbar Save opens a popup, Image precedes CAD, and
Paint tools use clearer XP/Photoshop-like pixel icons. Existing phase BATCH
authorization applies after this contract is committed. This is a bounded UI
change; native project codecs and exporter algorithms are unchanged.

For a creator finishing work, Save offers an editable project or the workspace's
available output formats, complete when the selected existing save/export path
opens and produces the expected file without losing editable work.

## Contracts and order

1. **S22 save-choices — CORE — GREEN.** `saveChoices({workspace,
   projectEnabled,commands})` receives one of the nine workspace IDs, a boolean,
   and unique `{id:string,enabled:boolean}` commands. Returns owned ordered
   `{id,label,description,shortcut,icon,enabled}[]`: native project first, then
   only the existing export commands declared by that workspace. Availability
   mirrors the current command model. No substring/label guessing, codecs, I/O,
   or mutation. Reject malformed/unknown workspace or duplicate/malformed
   commands with TypeError. No dependencies. Sibling test/demo cover all nine
   mappings, absent/disabled commands, ownership, malformed input and golden.
2. **S11 dialog amendment.** Optional text `description` and `confirmLabel`
   (default OK) support a clear Save popup using the existing select field.
   Values stay text, Cancel/Esc do nothing, focus restores and Enter activates
   the selected action exactly once. Existing transactional behavior remains.
3. **S10 chrome amendment.** A menu item may have one nonempty level of leaf
   `children`. The menu occurrence opens an accessible side submenu on click,
   hover or Right; its toolbar occurrence dispatches the parent command (Save
   popup). Up/Down/Home/End stay within the active level; Left/Esc closes the
   child first and restores its parent; Tab/outside closes all. Disabled entries
   never dispatch. In-place reconciliation preserves focused child identities
   and open levels across status updates, and repairs focus if an entry vanishes.
   Reject empty/nested/malformed children. No domain policy. S09 dependency only.
   Workspace order is Image, CAD, Photo, Video, Document, Slides, Audio,
   Spreadsheet, Code. Keyboard tab navigation follows that rendered order.
4. **A-SHELL integration.** Image is the startup workspace when its adapter is
   available, otherwise the first available workspace in the same order. File
   → Save lists project plus exports. Toolbar Save opens an S11 choice dialog;
   a visible Export button opens export-only choices. Ctrl+S still saves the
   project directly. Choices route to existing commands after pending edits
   flush and current availability is rechecked. Cancel does not write a file.
   Project saving alone changes the saved baseline; export does not. Parent and
   child controls share availability with keyboard/programmatic dispatch.
   Existing per-workspace history, epochs, recovery and async-save guards remain.
5. **S09/Image presentation amendment.** Use a pinned MIT Pixelarticons subset
   from `halfmage/pixelarticons`, plus original matching glyphs for uncovered
   tools. Preserve upstream license/provenance locally and in static output.
   No Microsoft/Adobe assets, runtime icon fetch or icon package execution.
   Paint icons use filled paths on their native 24×24 grid in 32px targets;
   other workspaces retain their current glyphs. Rectangle selection uses a
   marquee, distinct from the move arrow. Tool IDs/shortcuts/status/behavior stay.

## Verification

- S22 literal choices and negative cases; S11 backward compatibility, labels,
  Cancel/Enter/focus; S10 nested pointer/keyboard routing, disabled items and
  reconciliation. Run affected modules through the method checker.
- A-SHELL seams: Image startup/order, Save popup cancellation, direct project
  shortcut, nested project save, export routing, availability and pending edits.
- Real Chromium at 1280×720: Image first; draw, toolbar Save → PNG download;
  File → Save → project download/reopen; visible Export; keyboard submenu;
  Document/Slides PDF choices and representative other-workspace choices.
  Inspect screenshot/tool icons and no console errors. Existing CAD browser
  fixtures explicitly select CAD instead of relying on the changed startup.
- Final unit suite, TypeScript/build, combined browser suite, spec trace audit
  and Cloudflare dry-run. No source-build command runs while another browser
  check consumes dist. Push main without force; inspect remote Cloudflare check.

No new formats, broader editor functions, OS assets, backend or new release
claims. Original broad requirement statuses remain unchanged; this request gets
its own concrete UI evidence. GREEN is not human acceptance.


## Requirement mapping

This owner-requested increment refines N-002 (consistent controls) and N-007
(distributable software). S09/S10/S11/S22 and A-SHELL support CTL-001–006,
CTL-009–010, CTL-016 and CTL-027–029. CTL-004 and REL-017 are explicitly
amended to allow the requested free licensed Paint icon subset; the ban on
Microsoft assets in REL-018 remains. The broad all-tools/all-workspaces
requirements keep their prior statuses; no partial check is promoted to PASS.

| Request criterion | Evidence | Outcome |
|---|---|---|
| Toolbar Save popup; File → Save submenu; visible Export | S22/S10/S11 and app-save unit tests; production save-export and chrome-commit browser tests | PASS |
| Existing file formats, pending edits, Cancel and Ctrl+S; exports retain unsaved project state | Explicit all-nine format unit map; flush/failure/readiness regressions; native PNG/project roundtrip and Document/Slides PDF browser output | PASS |
| Image before CAD and at startup | S10/A-SHELL tests; production Image-first screenshot and keyboard tab order | PASS |
| Better pixel Paint tool icons, licensed and locally bundled | 19 glyphs inspected at 24 px in 32 px targets; exact upstream SVG/hash/license check; zero remote icon loads | PASS |

Unchanged original ledger: 47 PASS, 0 FAIL, 355 UNTESTED. Native OS file
pickers/print choosers, Windows/macOS shells, other browsers, complete original
editor scope and M1a packaged-release acceptance remain outside this UI
checkpoint. PDF checks inspect printable content and render it through Chromium;
they do not automate an operating system Save as PDF dialog.

## Verification record — 2026-11-14

The final runtime build is frozen during browser/hosting checks. The [asset
record](evidence/save-assets.json) identifies its SHA-256 build ID and every-file
size check. The largest file is the unchanged OpenCascade WASM at 22,942,327
bytes, below 26,214,400 bytes. Cloudflare's [Pages asset limit](https://developers.cloudflare.com/pages/platform/limits/)
was checked on 2026-11-14 and remains 25 MiB. The [deployment dry run](evidence/save-deploy-dry-run.log)
uses the committed static-assets configuration and exits without uploading.

| Command | Actual output / evidence |
|---|---|
| `npm test` | `tests 993; pass 993; fail 0; skipped 0` — [unit log](evidence/save-unit-green.log) |
| `npm run typecheck` | `tsc --noEmit`, exit 0 — [type log](evidence/save-types-green.log) |
| `npm run build` | Production build completed — [build log](evidence/save-build-green.log). Existing large-chunk advisory remains; no build error. |
| `AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 BRIDGE_WORKSPACE_APP=1 node_modules/.bin/playwright test` | `93 passed (4.3m)` — [combined browser log](evidence/save-combined-browser-green.log) |
| `node_modules/.bin/playwright test src/app/save-export.browser.spec.ts src/shared/chrome-commit.browser.spec.ts` | `3 passed (6.9s)` — [focused browser log](evidence/save-browser-green.log) |
| `npm run test:offline-build` | `tests 4; pass 4; fail 0; skipped 0` — [manifest log](evidence/save-offline-build.log) |
| `npm run test:spec` | `402 unique requirements`, `215 unique contracts`, trace/map/link PASS; status `47 PASS; 0 FAIL; 355 UNTESTED` — [spec log](evidence/save-spec.log) |
| `WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig` | `No bindings found. --dry-run: exiting now.` — [dry-run log](evidence/save-deploy-dry-run.log) |
| `node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts` | `1 passed (10.8s)`; 56 exact cached assets, isolation, offline reload, zero page errors — [static-host log](evidence/save-static-host.log) |
| `GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome node --import tsx dev/run-offline-tests.ts --grep 'survives complete Chrome shutdown'` | `1 passed (36.2s)`; all nine offline editor journeys — [cold log](evidence/save-cold-offline-green.log), [browser/build record](evidence/save-cold-offline.json) |
| Modular checker on S09/S10/S11/S22 | Four PASS; S10 soft size warning at 242 implementation lines, below the 300-line limit — [checker log](evidence/save-modules.log) |
| Pinned icon hash/path/license inspection | All 11 upstream SVGs match source hashes and compiled paths; exact license retained in source/public/dist — [provenance log](evidence/save-icon-provenance.log) |

Production browser runs use installed Chrome **154.0.8037.97 on Linux x64** at
1280×720. The combined suite includes production workflows and component
fixtures, not 93 separate end-to-end journeys. PNG output and reopened native
layers compare the SHA-256 of every RGBA pixel, not a screenshot similarity.
The pixel palette, Save popup and File submenu were visually inspected:
[Image palette](evidence/SAVE-EXPORT-image.png),
[Save popup](evidence/SAVE-EXPORT-popup.png),
[Save submenu](evidence/SAVE-EXPORT-menu.png).

The focused read-only reviewer found two P2 defects: hover then click closed the
Save branch, and direct submenu export bypassed pending-edit flush. Both were
reproduced in [RED regressions](evidence/save-review-red.log), repaired, and
re-reviewed with 31 chrome/app-save tests passing and no remaining findings.
Click now opens idempotently; export flushes before re-reading availability and
aborts a failed or invalidating flush. No native picker activation is replayed.

Earlier failures remain as evidence. S22/S11/S10 have their pre-implementation
RED logs. The first assembly fixture lacked pointer-capture shims; the genuine
baseline behavioral RED is `save-assembly-baseline-red.log`. Subsequent fixture
repairs count completed writable closes instead of stream chunks and supply
write permission on reused handles. `save-review-first.log` and
`save-unit-first.log` retain an old test's hidden-pane assumption; the fixture
now selects its intended CAD editor. The first focused browser run used an
ambiguous size selector; the second spent its timeout serializing million-item
pixel arrays, corrected to byte hashes with the same pixel-exact assertion.
The first combined run passed 91 and failed two CAD-transfer fixtures that had
relied on CAD startup. Explicit CAD selection fixes their setup; the final
combined run passes all 93. No expected output or behavior assertion was removed.

The cold offline workflow uses the explicit **Chrome for Testing 158.0.8127.18**
executable on Linux x64, consistent with the existing harness's documented
Chrome 154 persistent-profile download issue. The other eight offline cases
were not rerun in this bounded UI checkpoint. Its first attempt stopped on an
old toolbar `file.save` selector; the offline helpers now focus `file.saveOptions`
and exercise its Continue button, preserving the native-save assertion. See
[the retained failed run](evidence/save-cold-offline-first.log). Historical
checkpoint PNGs remain unchanged; the three new captures above show this UI.

All checks listed above have completed with the final source; no skipped or
unavailable check is recorded as a pass. GREEN applies to this bounded
increment. Owner acceptance and the unfinished product requirements remain open.
