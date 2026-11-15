# Paint local font import

2026-11-14. Owner-requested increment; existing BATCH authority. Acceptance stays
with the owner. Paint's Text dialog is the user-facing entry point for this change.

## Operation and requirements

Import font… appears beside Font. Choose a local TrueType (.ttf) or OpenType (.otf)
file; the browser validates it, selects it, and redraws the existing text preview.
The file stays on this device. No remote font service, account or upload is used.
Imported faces appear in future Text dialogs, including offline after reopening.
Paint currently places raster text, so saved projects and exports retain its exact
appearance without requiring that font on another device. This does not add
editable text layers or change other workspaces' font schemas.

| ID | Requirement | Verification |
| --- | --- | --- |
| FONT-01 | Import TTF and OTF from the Text dialog; preserve typed multiline text, colour and size; preview only a loaded face. | Real-font production browser test with original TTF/CFF OTF fixtures and pixel comparison. |
| FONT-02 | Remember imported fonts on this origin/device; deduplicate identical bytes and distinguish different files with the same name. | IndexedDB/runtime units plus reload/offline browser checks. |
| FONT-03 | Reject unsupported, invalid or >32 MiB files visibly without changing artwork/history; storage failure permits session use with a visible warning. | Unit boundaries and invalid-file browser test. |
| FONT-04 | Picker cancellation preserves fields; dialog cancellation ignores late async results. Pending load blocks OK; keyboard and touch controls remain usable. | S11 async lifecycle/keyboard tests, desktop and narrow touch browser checks. |
| FONT-05 | Text created with imported fonts survives undo/redo, native project reopen without fonts, and PNG export unchanged. | Production browser pixel comparison using a fresh storage context. |
| FONT-06 | File bytes remain local; existing text/newline/colour/transform, shared dialog and offline host workflows remain green. | Network assertion, regression tests, build and static host test. |

## Mode A amendment / brick order

1. **FONT-LIB SHELL:** `font-library.ts`. Owns browser font registration and device
   font library. IN: document, FontFace constructor, Crypto, optional IndexedDB;
   import(name, Uint8Array). OUT: loaded choice value/label and optional persistence
   notice; choices() restores stored fonts; dispose() releases registered faces.
   SHA-256 family identifiers avoid filename/CSS injection and duplicate registration.
   Only validated sfnt TTF/OTF sources up to 32 MiB enter the library. Stored sources
   are revalidated; a bad record cannot hide good records. Errors are readable.
   Dependencies: browser DOM/font, storage and crypto ports. No pixel decisions.
2. **S11 SHELL:** optional asynchronous choice loading/import on select fields.
   Pending work blocks commit, errors preserve values, cancellation is terminal.
   Imported choices are owned by the dialog, never appended to caller arrays.
   Existing synchronous consumers retain behavior. Unit testbench precedes code.
3. **IMAGE-APP assembly:** composes S07 picker, FONT-LIB and S11; exposes Import font…
   beside Font with local-device copy. Existing raster text/transform path is reused.
   Library lifetime follows the mounted Image workspace. No project format change.

All bricks CONTRACTED before implementation. Fonts are restored only on opening
Text, avoiding font work on app startup. Native FontFace accepts binary sources:
https://developer.mozilla.org/en-US/docs/Web/API/FontFace/FontFace
https://developer.mozilla.org/en-US/docs/Web/API/FontFace/load

Physical iPad/iPhone/Apple Pencil remain UNTESTED unless actually exercised.
Record browser versions and results below; do not promote broader product status.

## Verification report

Implemented: FONT-01 through FONT-06 **PASS**. No failing checks remain in this
increment. Physical iPhone/iPad Safari, Apple Pencil hardware, and the operating
system's native File System Access picker remain **UNTESTED**. Browser file-input
fallback was exercised with real TTF and CFF OTF files in Chromium and WebKit.
The original geometric test fonts and their fontTools generator are in
`dev/fixtures/fonts`; they contain no third-party font outlines and are not shipped
in the static build.

- `npm test`: **1,047 tests, 1,047 pass, 0 fail, 0 skipped**.
- `npm run build`: **PASS**, TypeScript + Vite; existing large-bundle and PlaneGCS
  node:module warnings remain. No new dependency.
- `LD_LIBRARY_PATH=/tmp/paint-webkit-deps/usr/lib/x86_64-linux-gnu node_modules/.bin/playwright test src/image src/shared/dialog.browser.spec.ts src/shared/file-access.browser.spec.ts src/app/app-shell.browser.spec.ts src/app/save-export.browser.spec.ts`:
  **38 passed (1.5m)**. Chrome 154.0.8037.97 and WebKit 27.2 on Linux x64; includes
  the 390×700 phone layout, real font decoding, exact raster save/reopen without
  the font installed, PNG, undo/redo, offline restoration, prior touch fixes,
  text controls, clipboard, transforms, navigator and shared dialog regressions.
- `npm run test:spec`: **PASS**; 402 requirements/procedures and 220 mapped contracts.
  Original product ledger unchanged: **47 PASS, 0 FAIL, 355 UNTESTED**.
- `node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts`:
  **1 passed (10.9s)**; complete static build, isolation headers, exact assets offline.
- Modular checker: **PASS** for `font-library.ts` and `dialog.ts`.
- `WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig`:
  **PASS**, 61 static assets, no bindings; dry-run is not a live deployment.

Test-driven checks caught missing asynchronous dialog handling and name ambiguity
after stored fonts were returned in a different order. Loaded names now persist;
identical sources deduplicate while different same-name fonts get numbered labels.
A corrupt stored font cannot hide healthy ones. Storage failure is visibly
session-only; font imports never modify the project's history. Cancel ignores
late dialog updates. Native text rendering is reused rather than shipping a font
parser. Font bytes stay local and all supplied names use textContent.

The library is loaded on first Text use and released on workspace disposal.
Browser storage can be evicted; the original font file is the durable source.
Text still becomes a raster layer on OK. Editable font-based text layers and font
import for Document/Slides/Video are outside this increment.

Command output is retained in [the check log](evidence/paint-fonts-checks.txt).
