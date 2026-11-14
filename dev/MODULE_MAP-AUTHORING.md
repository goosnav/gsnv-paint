# Authoring workspaces — consumer completion map

Authority: the owner's 2026-11-12 additions and 2026-11-13 continuation. Code runs JavaScript, HTML/CSS and Python in the browser; Audio is the planned waveform editor, without composition or a piano roll. These additions retain CAD priority and do not replace any original Image/Video acceptance requirement. Follow the existing XP web-application design, shared history/files/recovery and static-only distribution. Acceptance remains the owner's.

## ConOps and verification contract

A creator can edit local documents, slides, audio, workbooks and code alongside the visual workspaces, save a fully editable project and export the result. Opening a project never executes code or fetches embedded remote content. Failures retain the current document and explain how to proceed. Missing browser capabilities are visible. The following requirement IDs are additional scope and are not evidence of implemented behavior.

| Requirement | Required outcome | Verification command / procedure | Initial status |
|---|---|---|---|
| DOC-001 | The Document workspace shall edit headings, paragraphs, lists, alignment and styled text with images and page setup. | `node --import tsx --test src/document/document-content.test.ts`; browser edit and keyboard workflow | UNTESTED |
| DOC-002 | The Document workspace shall reopen editable native content and export HTML/text and a correctly sized PDF via printing. | Document browser suite; parse saved container and printed PDF | UNTESTED |
| DOC-003 | Invalid images or unsafe pasted markup shall not damage the current document or silently report success. | Document core and browser negative cases | UNTESTED |
| SLD-001 | Slides shall support add, duplicate, delete and reorder of slides with editable text, image and rectangle/ellipse elements. | Slides core literal fixture and browser editing workflow | UNTESTED |
| SLD-002 | Every slide element position and size shall be draggable and numerically editable with shared undo and native reopen. | Core transforms and browser drag/typed/save/reopen regression | UNTESTED |
| SLD-003 | Slides shall present with keyboard navigation and print one PDF page per slide at the selected aspect ratio. | Browser present/escape and parsed two-page PDF | UNTESTED |
| AUD-001 | Audio shall import locally decoded audio, show a waveform and allow pointer or numeric range selection and playback. | Real WAV browser fixture; cursor/selection and Web Audio state checks | UNTESTED |
| AUD-002 | Audio shall cut, copy, paste, delete, trim, fade, normalize and change volume without mutating earlier history. | Audio core sample-exact golden; undo and reopened project | UNTESTED |
| AUD-003 | Audio shall export PCM WAV with the expected sample rate, channel count, duration and samples. | Parse RIFF header/data and compare golden PCM, browser download | UNTESTED |
| SHEET-001 | Spreadsheet shall edit multiple named sheets with cell/range selection, copy/paste/fill and relative/absolute formula references. | Formula and workbook literal goldens; browser keyboard/pointer edit | UNTESTED |
| SHEET-002 | Spreadsheet shall recalculate arithmetic, ranges, aggregation and conditional formulas with readable errors and cycle detection. | Formula engine valid, invalid, cycle, reference and fill tests | UNTESTED |
| SHEET-003 | Spreadsheet shall format cells, resize/insert/delete rows and columns, sort/filter and reopen supported workbook data. | Core edits; native/CSV/XLSX round trips plus browser workflow | UNTESTED |
| CODE-001 | Code shall provide a local file tree, editor tabs, syntax highlighting, search, and native/source-file open/save. | Code document tests and browser multi-file save/reopen workflow | UNTESTED |
| CODE-002 | Code shall explicitly run/stop JavaScript and Python and show bounded output/errors, plus HTML/CSS preview. | Real browser JavaScript/Python success, error, infinite-loop stop and web preview | UNTESTED |
| CODE-003 | User code shall run outside the editor origin, without access to saved projects, network uploads or automatic execution on open. | Adversarial browser origin/storage/network/auto-run tests; runtime policy inspection | UNTESTED |
| AUTH-001 | All added workspaces shall retain at least 100 undo steps, immediate save, recovery and independent project context. | Shared shell suite plus each workspace native reopen and pending-input save | UNTESTED |

Daily-use spreadsheet formula scope for this increment: arithmetic/comparison/concatenation; A1 and sheet references; ranges; SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR, NOT, ROUND, ABS, SUMIF and COUNTIF. Unsupported formulas remain visible with an error, never replaced by a misleading cached answer. XLSX interoperability must preserve supported formulas, values, names and basic formats, report unsupported content, and never execute macros or external links. These concrete choices are implementation defaults for the requested Excel-style editor.

## Boundaries and bricks

All new implementations keep pure document/math logic separate from DOM, Canvas, audio, runtime and file adapters. One brick per implementation file, at most three public symbols, soft 200/hard 300 implementation lines; split before exceeding the hard limit. Assemblies wire verified bricks and shared ports. Each brick has a sibling `.test.ts`; browser-only shells add `.browser.spec.ts`. No placeholder command may claim success.

### A01 audio-document — CORE — PLANNED
Purpose: validate and serialize editable PCM sources and a non-destructive piece sequence.
IN: new, validated import, encode or untrusted native decode; finite equal-length Float32 channels, sample rate, explicit source IDs and pieces.
OUT: owned document metadata and immutable source buffers; native metadata plus little-endian Float32 assets; reopened equivalent samples.
RAISES: AudioContentError for malformed buffers, references, nonfinite samples, rates, channel counts or size limits.
DEPS: none. Native framing is shared S15 at assembly.
Contract: pieces refer to source-frame ranges and carry gain/fade envelopes. History shares immutable source audio instead of copying the entire recording per edit. One rate/channel layout per document; cross-document paste must reject incompatible layouts or explicitly resample in the shell.

### A02 audio-edits — CORE — PLANNED
Purpose: immutable selection editing, clipboard splices and gain envelopes.
IN: A01 document and sample-index edit; valid half-open selection [start,end), caller-issued IDs for imports.
OUT: new piece sequence, selection and clipboard value as appropriate; no mutation of document or source audio.
RAISES: AudioEditError for invalid range, empty operation or incompatible paste.
DEPS: A01, A03.
Contract: trim retains the selection; delete/ripple closes its gap; paste replaces the selection or inserts at cursor; fade spans exactly the selection; normalize targets a supplied peak without changing silence. All changes are one shared-history transaction.

### A03 audio-samples — CORE — PLANNED
Purpose: read the piece sequence deterministically, compute waveform min/max and serialize WAV.
IN: A01 document; waveform bucket count, render range or PCM16-WAV request.
OUT: sample arrays, per-channel min/max buckets or WAV bytes with explicit clipping/rounding.
RAISES: AudioSampleError for out-of-range requests and RIFF size overflow.
DEPS: A01. No Web Audio or Canvas.

### A04 audio-workspace — SHELL assembly — PLANNED
Purpose: waveform view, native decoding/playback, numeric controls, menus and shared-project adapter.
IN: shared host/FilePorts, Web Audio capability and A01–A03 values.
OUT: usable waveform editor, export downloads and visible decode/playback errors.
RAISES: construction errors for invalid ports; operational failures stay visible and preserve the document.
DEPS: A01, A02, A03; shared host and file adapters are assembly wiring. Split waveform and playback into shells if needed before 300 lines.

### P01 slides-document — CORE — PLANNED
Purpose: validate and edit ordered slides and positioned text/image/shape elements.
IN: document, IDs and typed edits; native metadata/assets on decode.
OUT: immutable deck with stable IDs, explicit aspect ratio, theme colors, element geometry/style and image asset references.
RAISES: SlidesContentError/SlidesEditError for malformed data, missing references, invalid geometry and unavailable targets.
DEPS: none.

### P02 slides-view — SHELL — PLANNED
Purpose: render deck/element controls, pointer selection and drag previews without changing document policy.
IN: P01 deck, selected IDs and intent callbacks.
OUT: DOM view with keyboard controls, tooltips and pointer intents; stable focus on refresh.
RAISES: TypeError for invalid host; invalid images are reported before a commit.
DEPS: P01.

### P03 slides-workspace — SHELL assembly — PLANNED
Purpose: wire shared files/history, typed properties, image import, presentation and print-to-PDF.
IN: host, files and P01/P02.
OUT: fully editable native deck; presentation navigation; printable pages matching aspect ratio.
RAISES: operational failures remain visible; cancelled dialogs preserve the deck.
DEPS: P01, P02; shared ports at assembly. Split print/present shell if size requires.

### E01 workbook-document — CORE — PLANNED
Purpose: validate sparse sheets/cells, immutable workbook edits and native persistence.
IN: typed cell/range/sheet/row/column/format/sort/filter edits or native metadata.
OUT: workbook with source values/formulas preserved; independent edit results and predictable selection changes.
RAISES: WorkbookError for invalid names, coordinates, sizes, unknown format fields or missing targets.
DEPS: E02.

### E02 sheet-formulas — CORE — PLANNED
Purpose: safely parse/evaluate the declared formula subset and translate relative references for fill.
IN: formula source, current cell and read-only cell lookup across sheets.
OUT: finite number, text, boolean or explicit spreadsheet error; dependencies/cycle result.
RAISES: invalid API contract only; user formula failures are cell errors.
DEPS: none; no host eval/new Function, networking or DOM. Split parser, evaluator and reference translation before the size cap.

### E03 workbook-files — SHELL — PLANNED
Purpose: CSV/XLSX import/export using pinned SheetJS CE and explicit supported-value mapping.
IN: local bytes or E01 workbook.
OUT: validated workbook or downloadable bytes, with unsupported-content diagnostics.
RAISES: readable import/export errors; current workbook remains untouched.
DEPS: E01, E02; vendor SheetJS CE license/asset review required before installation.

### E04 spreadsheet-workspace — SHELL assembly — PLANNED
Purpose: virtual grid, formula bar, sheet tabs, range selection and numeric formatting controls.
IN: shared host/files and E01–E03.
OUT: keyboard/pointer spreadsheet, native/export files and honest error feedback.
RAISES: operational errors visible; selection-only actions do not pollute document history.
DEPS: E01, E02, E03. Grid interaction is split into a view shell before the cap.

### K01 code-document — CORE — PLANNED
Purpose: validate/edit a project of UTF-8 source files and encode native content.
IN: new/read/edit with safe relative paths, contents, language and entry-file selection.
OUT: immutable project with source preserved and unique paths; no executable side effects.
RAISES: CodeContentError for invalid paths, duplicates, unsupported encodings or size limits.
DEPS: none.

### K02 code-runtime — SHELL — PLANNED
Purpose: isolate and control browser JavaScript/Python execution and HTML preview.
IN: explicit run request, project files, locally bundled engine assets; stop/dispose.
OUT: validated bounded console/error/status messages; sandboxed preview; reliable cancellation.
RAISES: visible capability/load/runtime errors. No automatic execution on file open.
DEPS: K01; Pyodide pending license, offline payload and isolation spike. Never run untrusted code in an editor-origin worker. Use opaque-origin execution and a minimal validated message boundary; block outbound network and editor storage access. Infinite-loop stop must be demonstrated in a real browser before GREEN.

### K03 code-editor — SHELL — PLANNED
Purpose: syntax-aware source editing/search using a pinned locally bundled CodeMirror dependency.
IN: host, source file and change/command callbacks.
OUT: keyboard-accessible editor with tabs/indentation, search and preserved cursor/focus.
RAISES: invalid-host error; no code execution.
DEPS: K01; CodeMirror license review before installation.

### K04 code-workspace — SHELL assembly — PLANNED
Purpose: file tree/tabs, Run/Stop, console and web preview, source/native file handling.
IN: shared host/files and K01–K03.
OUT: usable browser coding workspace; explicit runtime status and saved editable projects.
RAISES: visible import/run/save errors; no hidden downloads or installs of runtime packages.
DEPS: K01, K02, K03.

## Integration and exit gate

Add Spreadsheet/Code to the shared workspace and format registries once adapters can mount; existing Audio/Slides registry entries already exist. Register actual adapters in `src/app/main.ts` only after focused tests. Do not present placeholder workspaces as completed editors. Browser tests use the production build at 1280×720, inspect console/network, reopen native files and parse outputs. All assets stay local and below Cloudflare's current per-file limit, with cross-origin isolation retained. Offline/service-worker and M1a verification remain separate required gates.

The initial plan order is CAD correctness → Document → Slides/Audio → Spreadsheet/Code → integrated performance/offline/distribution. Independent Audio or Slides implementation may run beside CAD without delaying CAD verification. Every checkpoint reports PASS/FAIL/UNTESTED with exact command output; unavailable checks are never PASS.
