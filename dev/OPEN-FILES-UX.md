# Open projects and ordinary files

Owner request: Open must accept a workspace project or an ordinary supported file,
including PNG/JPEG in Paint. Existing BATCH authorization applies to this bounded
contract amendment. Human acceptance remains with the owner.

## Contract and module map (before implementation)

- **OPEN-01 / S07 file-access (SHELL):** add a pick-only operation returning the
  selected File and optional handle, without reading its payload. Existing open
  gains an optional already-selected File; limits still apply before reading,
  and no second picker appears. Cancel and permission failures remain explicit.
- **OPEN-02 / S13 project-files (SHELL):** open may decode an already-selected
  File through the same native-container validation. Native project formats,
  cross-workspace routing and existing project saves remain compatible.
- **OPEN-03 / A-SHELL:** toolbar Open, File > Open and Ctrl+O share one picker
  offering all native projects plus the active editor's existing import types.
  Capture the initiating workspace and revision; reject stale raw-file results.
  A native project still opens its own workspace. Unsupported/corrupt input
  leaves the existing document intact. Recovery/replacement consent still applies.
- **OPEN-04 / workspace assemblies:** publish an optional `{accept, open(file)}`
  seam backed by the existing importer, with the same codec limits and errors.
  Image opens PNG, JPEG, GIF, WebP, BMP; Photo its existing raster/RAW formats;
  CAD STEP/STP; Audio browser-decodable audio; Spreadsheet XLSX/CSV; Document
  TXT/MD/HTML; Code its existing UTF-8 source types; Video its existing video/still
  types. Code and Video retain their existing import/add semantics. Slides can
  use its existing supported raster-image insertion path (new deck if empty).
  No new codecs, execution on import, uploads or unsupported format claims.
- **OPEN-05 / persistence safety:** only successful native project replacement
  retains the selected native handle. A raw-file replacement is an unsaved project
  and Save asks for a native project destination; source media is never overwritten
  by native project serialization. Import into an existing project remains an edit.

## Implementation order and verification

1. Amend S07/S13 with unit tests: pick without reads, supplied-file limits/no second
   picker, cancellation/error handling and native decoding.
2. Wire A-SHELL and existing importers; test native and raw routing, captured
   workspace/revision, unsupported input, replacement and save-handle safety.
3. Real Chromium application tests: Open PNG and JPEG through toolbar/menu/keyboard,
   project round-trip, corrupt file preservation, and representative imports in
   other workspaces. Exercise existing CAD STEP integration and import regressions.
4. Typecheck/build, unit tests and appropriate browser regressions; report actual
   commands/results below. Native OS picker dialogs and other operating systems
   are untested unless separately exercised.

No new geometry/pixel/timeline logic. Assemblies remain composition seams rather
than bricks. Current Video importer still buffers media; this change adds no
extra payload copy in the shared picker and does not claim streaming support.

## Evidence

Implemented and verified for the bounded amendment. See [checkpoint evidence](PAINT-OPEN-NAVIGATION-EVIDENCE.md) for command output, traced checks and platform limits.

## Native picker filter compatibility amendment

OPEN-06: native File System Access filters accept suffixes up to 16 code points.
`.gsnv-spreadsheet` is 17, so the existing all-project filter is rejected by
Chromium. When an advertised suffix cannot be represented, S07 uses the native
All files picker (`types: []`) without changing the actual filename or format.
The HTML fallback retains its full extension filter. Native Save keeps the full
suggested project filename and omits an incompatible filter, including A-SHELL's
early destination acquisition. This is explicit filter adaptation, not fallback
after a permission failure. Test both paths and preserve original formats.
Source: [File System Access specification](https://wicg.github.io/file-system-access/#api-filepickeroptions).
