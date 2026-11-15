# Paint touch and Pencil reliability

2026-11-14. Owner-requested repair, existing BATCH authorization. Mode A
amendment before code. Acceptance remains with the owner.

## Findings and intended behavior

The UI permits native text selection. S12 forwards multiple pointers into Paint's
single-drag tool engine; a second down cancels the first stroke. Unowned pointer
moves can also enter that stroke. Native pointer cancellation/capture loss is
indistinguishable from Escape and restores the pre-stroke pixels. Additionally,
the key-only global input binding sets touch-action:none on an ancestor of panels,
preventing native scrolling. These are reproducible code paths, not a claim that
the exact iOS gesture in the screenshot has been reproduced on physical hardware.

## Requirements and tests

- **TOUCH-01:** App chrome and the drawing surface suppress native text selection
  and touch callouts. Drawing owns touch gestures only inside the drawing view;
  inputs, textareas, contenteditable, buttons, panel/palette scrolling remain native.
  Verify native-event unit tests, computed styles, trusted touch drawing/scrolling,
  and text selection/editing in the Text dialog and Document workspace.
- **TOUCH-02:** Paint latches one pointer until release. Additional touch/pen contacts
  cannot cancel, add segments to, or end that stroke. A fresh stroke works afterwards.
  Verify exact S12 event transcripts and production loop drawing with a second
  contact. Existing multi-pointer consumers keep their previous default behavior.
- **TOUCH-03:** Browser pointercancel, capture loss, focus departure or window blur
  preserves already drawn freehand pixels as one undoable edit, exactly once.
  Escape still cancels deliberately; unfinished shapes/selections still cancel.
  Verify pixel hashes, history, undo/redo, duplicate endings and subsequent strokes.
- **MOBILE-01:** Phone and tablet retain an accessible drawing area, tools, zoom
  controls, editable colours and scrolling panels. No page overflow at 390x700,
  320x568 or 844x390. Compact phone navigator starts with its map collapsed; +/- /
  slider / percent / Fit stay visible and the map can be expanded. Touch targets
  and menus fit the small screen. Verify production layouts and screenshots.

## Module contracts and order

1. **S12 SHELL, input-adapter:** CommandContext gains optional `singlePointer`;
   default false retains independent pointers. True ignores extra contacts until
   they end, suppresses drawing-view touch defaults, and ignores foreign hover
   while a pointer owns the stroke. Pointer cancellation gains optional `reason`
   (`interrupted` for browser interruption; absent for Escape/disposal). Consumers
   decide how to preserve edits. Key-only roots preserve their native touch-action.
   No pixels, tool decisions, timing heuristics or browser sniffing in S12.
2. **IMAGE-APP assembly:** Opt into S12 ownership. On interrupted cancellation,
   finish the existing freehand stroke before clearing tool drag; no extra final
   segment and no commit for non-stroke previews. Existing explicit cancel remains.
3. **I59 SHELL / shared presentation:** Phone map initial state is collapsed,
   desktop/tablet behavior unchanged. CSS prevents selection outside editable
   content, fits short/narrow viewports, and enlarges touch targets without OS chrome.
   No document/project changes or new gesture language.

All three are CONTRACTED. Add failing tests first, implement, run targeted and full
checks, then record evidence and push main. Physical iPad/iPhone/Apple Pencil and
Safari verification remain UNTESTED unless actually exercised; Linux WebKit or
Chromium touch emulation must be named accurately. Broader product ledger unchanged.

References: MDN pointercancel and touch-action document native gesture cancellation:
https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event
https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action
