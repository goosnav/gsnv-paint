# Authoring and STEP-import checkpoint — 2026-11-13

All nine workspace adapters are connected: CAD, Image, Photo, Video, Document, Slides, Audio, Spreadsheet and Code. This checkpoint delivers the approved authoring subset and consumer STEP import. The original product scope and release gates remain open; it is not CANDIDATE_FOR_ACCEPTANCE or owner acceptance.

Audio edits local mono/stereo recordings using waveform or typed selection, cut/copy/paste/trim, volume, fades and normalization, with playback, editable native recovery and verified PCM16 WAV output. Slides supports editable text, shapes and images, presentation, native projects and PDF. Spreadsheet supports sparse multi-sheet workbooks, everyday formulas, range editing, fill, formats, sort/filter and supported XLSX/CSV interchange. Code supports local files, syntax/search, JavaScript and bundled Python execution, Stop, a bounded console and script-free HTML/CSS preview. Executing code cannot access app projects, origin storage or networking; no code runs on open. These are bounded contracts, not compatibility claims for every desktop office or development feature.

CAD now offers Import STEP through the real worker/kernel. It retains every solid, preserves exact original STEP bytes in its native project, shows a clearly non-parametric source feature and body measurements, and exports real STEP/STL. Units preserve physical dimensions. A damaged later solid rejects the whole import and retains the current project. Escape/New cancels the actual worker. Parametric editing and the specified plate golden remain intact.

File reads can reject oversized sources before reading their payload. Pending Code edits now flush before the common project Rename dialog, preventing a rename from losing typing. If replacing an editor removes its focused control, the shell restores focus to the stable viewport so subsequent keyboard shortcuts still reach the application. The unchanged CAD New → Open browser sequence and a red-to-green shared unit regression cover this repair. Spreadsheet calculation, clipboard and ZIP/output budgets reject excessive work before mutation or large vendor rendering. Failed imports and rejected operations retain editable data.

## Requirement status

**PASS added at this checkpoint:** DOC-001–003, SLD-001–003, AUD-001–003, SHEET-001–003 and CODE-001–003 under the approved bounded authoring contract; CAD-116 for real consumer STEP import. The original CAD-015/017/122–124 and earlier evidence remain recorded. No whole-editor or whole-product completeness is inferred from those IDs.

**FAIL:** none in the completed required checks below. Initial development failures, two stale browser test assumptions and an imported-CAD → New keyboard focus failure were repaired before the final runs. The spreadsheet sequence now waits for observable New completion before Open; Photo is checked through its Import command rather than a nonexistent blank-photo operation.

**UNTESTED / open:** AUTH-001's every-workspace/full-history quantifier; remaining original scope, including broader CAD sketches/features/inspection/drawings, Image pixel golden and performance, Video multi-track/keyframe/codec/sync acceptance, cross-workspace delivery, cold offline installation and M1a packaging. Native OS pickers, physical audio/pen hardware, Windows/macOS, other browsers and maximum-size workloads have not been smoke-tested. Full original status ledger: 402 requirements, 37 PASS, 0 FAIL, 365 UNTESTED.

## Commands and observed output

Environment: Linux x64, Node 24.21.0, headless Chrome 154.0.8037.97 at 1280×720. No skipped or unavailable check is counted as a pass.

| Command | Observed result |
|---|---|
| `npm test` | 713 tests; 713 pass; 0 fail; 0 cancelled; 0 skipped; 0 todo |
| `npm run build` | exit 0; TypeScript and Vite static production build |
| `npx playwright test src/shared src/app src/cad src/document src/image src/photo src/video` | 35 passed (2.2m) |
| `SHEET_PRODUCTION=1 npx playwright test --config src/spreadsheet/spreadsheet.playwright.config.ts --repeat-each 3` | 9 passed: all three production workflows repeated three times |
| `AUDIO_PRODUCTION=1 node_modules/.bin/playwright test -c src/audio/audio-playwright.config.ts` | 3 passed; literal edited WAV sample sequences, native reopen/recovery, playback controls and failure retention |
| `node_modules/.bin/playwright test --config src/slides/playwright.slides.config.ts` | 2 passed; independently parsed two-page PDFs at 720×405 and 720×540 points, native images and editable objects |
| `node node_modules/@playwright/test/cli.js test --config src/code/code-workspace.playwright.config.ts` | 6 isolated editor/workspace checks passed |
| `CODE_WORKSPACE_APP=1 node node_modules/@playwright/test/cli.js test --config src/code/code-workspace.playwright.config.ts src/code/code-workspace.browser.spec.ts` | 4 full-app production checks passed |
| `node node_modules/@playwright/test/cli.js test --config src/code/code-runtime.playwright.config.ts` | 8 passed; real JS/Python execution, errors, infinite-loop Stop/restart, network/storage denial, output bounds and script-free preview |
| `node_modules/.bin/playwright test --config src/cad/playwright.step-import.config.ts` | 3 passed; single/multiple solids, exact native bytes, independent STEP readback, cancellation and invalid import |
| `npm run test:spec` | Metadata audit: 402 requirements/procedures, 8 needs, 196 contracts; link and ownership checks pass. This does not execute product tests. |

The unit total includes Audio 16, Slides 20, Spreadsheet 33, Code document/native 9 and 33 focused STEP-import/native regression cases. All new runtime bricks passed their modular contract checker. The spreadsheet's final checker passed all 11 implementation files.

The imported acceptance plate measured **68,654.42480810556 mm³**; the two-solid fixture measured **6,000 + 210 = 6,210 mm³**. Native success paths release all retained tokens; injected native faults trigger worker disposal without further unsafe native calls. The parametric production-builder golden still measures **56,654.424808105 mm³** and **68,654.424808105 mm³** at widths 100 and 120.

`WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run --no-autoconfig`: exit 0, `Read 58 files`, `Total Upload: 0.31 KiB`, `No bindings found`, `--dry-run: exiting now`. `npm run test:launcher`: exit 0, `launcher smoke: PASS`; real Linux loopback HTTP, isolation headers, foreign-host denial and second-launch reuse. Automatic browser opening is disabled in this test. `git diff --check`: exit 0. The current static inventory has 56 files totaling 41,077,785 bytes. Its largest file is the 22,942,327-byte OCCT WASM, below Cloudflare's current 25 MiB per-file limit. The Python runtime is bundled locally. Vendor conditional-Node-import and main-bundle size warnings remain visible.

Durable raw output and asset inventory are in `dev/evidence/authoring-*.log` and `authoring-build-assets.json`. Workspace workflow documents record detailed contracts, evidence and explicit limitations. Screenshots `AUDIO-APP-production.png`, `CODE-APP-production.png`, `SPREADSHEET-APP-production.png` and `CAD-IMPORT-production.png` were inspected. A Wrangler dry run validates local configuration and assets; it is not evidence of a successful live Cloudflare deployment.
