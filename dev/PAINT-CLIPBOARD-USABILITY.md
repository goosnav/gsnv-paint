# Paint clipboard workflow

Owner request (2026-11-14), covered by the existing BATCH authorization.

## Contract before implementation

- **CLIP-01 / IMAGE-APP:** add a labelled Copy canvas toolbar/menu action. Encode
  the visible layer composite, with transparency and current transformed pixels,
  as a PNG in the system clipboard. Selection boundaries, handles and chrome
  are excluded. Start clipboard write during activation using a Blob promise.
  Report success only after write resolves; denial/unavailability explains how
  to use Export PNG and preserves the in-app copy. Ordinary selection Copy/Cut
  semantics remain unchanged.
- **CLIP-02 / IMAGE-APP:** Paste is available with no current Image document.
  A clipboard image creates a native Image document at its original dimensions,
  through the existing replacement/recovery protections. With an existing
  canvas, paste adds its own layer and enters graphical Free transform. Center
  the image; fit oversized images within 80% of the canvas so handles can be
  reached. Keep the full original source for the active transform, rather than
  clipping it before the user can scale it. Escape cancels sizing and retains
  the inserted image; Apply makes a separate undoable transform, as for text.
- **CLIP-03 / IMAGE-APP:** toolbar Paste uses the clipboard API; native Ctrl/Cmd+V
  can consume an image from a paste event without requiring clipboard-read
  permission. Do not intercept text inputs, editable text or dialogs. Inactive
  workspace handlers do nothing. Disposal removes listeners. Reject stale async
  reads after document/workspace changes, concurrent imports, undecodable data
  or oversized rasters without modifying the document. No uploads.

No new pixel algorithm or native format. Existing PNG codec, raster scaling,
layer assembly, transform adapter and clipboard-copy seam are reused. Tests:
actual Chromium system clipboard PNG read/write, blank-document native paste,
existing-canvas toolbar paste and transforms, oversized fitting with full-source
resize, cancel/undo, copy composite pixel checks, denial and stale completion.
Native platform permission prompts and physical iPad remain untested.
