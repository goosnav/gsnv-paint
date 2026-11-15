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
3. **I59 / S10 SHELL / shared presentation:** Phone map initial state is collapsed,
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


## Verification report

GREEN for this repair; the original full-product readiness ledger is unchanged.
No requirement in this increment failed or was skipped in the final runs.

| ID | Result | Evidence |
|---|---|---|
| TOUCH-01 | PASS in tested engines | Native touch/select/drag guards; editable/control exceptions and cleanup; computed selection policy; real Text newlines/select-all and Document typing in Chromium and Linux WebKit. Key-only root preserves native touch-action; actual touch scrolling works. |
| TOUCH-02 | PASS | Exact unit event transcript excludes extra contacts/hover; trusted Chromium two-contact loop equals the single-contact pixel hash; emulated pen plus moving/lifting finger keeps one undoable stroke. Fresh strokes work after endings. |
| TOUCH-03 | PASS | pointercancel, capture loss, blur and focus preserve the rendered pixels and exactly one history edit; undo/redo restores exact hashes. Escape restores the original pixels. Unfinished rectangle cancels. WebKit loop/blur/undo also passes. |
| MOBILE-01 | PASS in Chromium touch emulation | 390x700, 320x568 and 844x390 bounds; Pencil/Brush/Eraser hit targets; rightmost menu contained; collapsed/expanded map, zoom taps, swipeable panels, closed-loop drawing. 1024x768 tablet screenshot and existing navigator/transform touch journeys. |
| Physical iPad/iPhone and Apple Pencil, Safari on iOS | UNTESTED | No physical devices available. Linux WebKit 27.2 is an engine smoke test, not an iOS/Safari/device claim. |

Browsers: Chrome 154.0.8037.97 and Linux WebKit 27.2, Linux x64. Desktop
regressions use 1280x720. Reviewed [phone](evidence/PAINT-touch-phone.png) and
[tablet](evidence/PAINT-touch-tablet.png) screenshots. All new browser cases collect
uncaught page errors; none were reported. CSS selection overrides are limited to
chrome/drawing; native fields and contenteditable explicitly retain selection.

Commands and final output (exit 0):

```text
npm test
1036 tests; 1036 pass; 0 fail; 0 cancelled; 0 skipped

npm run build
tsc --noEmit && vite build; built in 1.30s

npm run typecheck
tsc --noEmit

node_modules/.bin/playwright test src/image/image-touch.browser.spec.ts src/image/image-navigation.browser.spec.ts src/image/image-pixel-drawing.browser.spec.ts src/image/image-clipboard.browser.spec.ts src/image/image-text.browser.spec.ts src/image/image-workspace.browser.spec.ts src/document/document-workspace.browser.spec.ts src/shared/chrome.browser.spec.ts src/shared/chrome-commit.browser.spec.ts src/shared/input-adapter.browser.spec.ts src/app/app-shell.browser.spec.ts src/cad/cad-workspace.browser.spec.ts
45 passed (1.7m)

node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts
1 passed (10.9s); complete static assets, isolation, exact bytes, offline reload

WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig
Read 61 files; No bindings found; --dry-run: exiting now

npm run test:spec
TRACE PASS: 402 requirements and verification procedures
MAP PASS: 220 original contracts; LINK PASS
Original ledger: 47 PASS; 0 FAIL; 355 UNTESTED

check_module.py src/shared/input-adapter.ts src/shared/chrome.ts src/image/image-navigator.ts
PASS all three; chrome soft-cap warning (245 implementation lines, below hard cap)
```

Full logs: [unit](evidence/paint-touch-unit.log),
[browser](evidence/paint-touch-regression.log), [build](evidence/paint-touch-build.log),
[types](evidence/paint-touch-types.log), [spec](evidence/paint-touch-spec.log),
[static](evidence/paint-touch-static.log), [deployment dry-run](evidence/paint-touch-deploy.log),
[modules](evidence/paint-touch-modules.log).
Build retains existing large-chunk and PlaneGCS node:module warnings; no new runtime
dependency, project-format change or service-side code was added.

Retained diagnosis: six new S12 assertions failed before implementation (30 pass,
6 fail), and the two production reproduction cases failed. An existing exact
focus-cancellation transcript was updated to include the new interruption reason.
The touch test initially used CDP touchEnd with the remaining finger instead of
lifted finger; event tracing caught that mistake and the test now lifts the extra
contact. Its complete loop must match the reference pixel-for-pixel. The initial
one-column phone toolbox put Eraser offscreen; a failing reachability assertion
led to the two-column, 40px palette. WebKit first lacked its runtime/dependencies;
WebKit 2388 and Ubuntu libavif16/libgav1-1/libyuv0 were installed in the local test
runtime cache, outside this repository. The runner's inherited Chrome channel was
explicitly cleared for WebKit. These setup failures are not reported as passes.

Decisions: retain the first contact until release rather than guessing palm intent
from delay/size. Unexpected interruption commits only existing freehand pixels;
shapes/transforms do not silently apply previews. Escape/disposal stay deliberate
cancellations. Native panel/toolbar scrolling remains available; canvas panning is
via Hand or the navigator, zoom via its controls. No new multi-touch gesture language.
Tuning lives in chrome.css/image-workspace.css; phone map threshold in I59. Preserve
the explicit cancellation distinction and native-control exceptions when modifying
input handling. Re-run the shared input, native editing, touch and transform gates.
