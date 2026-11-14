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

1. **S22 save-choices — CORE — CONTRACTED.** `saveChoices({workspace,
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
