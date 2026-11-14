# Preserve keyboard access after Video export

Mode A, 2026-11-13. This bounded S10 / VIDEO-APP repair is authorized by the
owner's current-phase BATCH. It changes focus ownership only; A-SHELL remains
owned by the separate [recovery repair](RECOVERY-CONSISTENCY.md).

## Observed failure

An independent production-browser review on Linux Chrome for Testing 158 found
that successful inspector and toolbar exports leave `document.activeElement`
at BODY. Ctrl+N then reaches window/document but never the app root, does not
prevent the browser action, and leaves the current clip in place. File > New
works; explicitly focusing the timeline makes the same shortcut work.

Inspector `renderPanel().replaceChildren()` removes its focused Export button
at export start. The toolbar has a separate timing issue: Chrome can still
report a just-disabled button as active during S10 update. Calling its `focus()`
and checking immediate identity falsely appears successful; Chrome subsequently
blurs it. A file-download workaround or document-global shortcut listener would
hide those ownership failures instead of repairing them.

## Amended assembly contracts

- S10 must explicitly reject disabled focus replacements before attempting to
  focus them. A toolbar/tool control which becomes disabled or disappears hands
  focus to the stable viewport. An unavailable menu command returns focus to its
  visible menu trigger as today. A temporarily unchanged `activeElement` is not
  proof that a disabled button can retain focus. Preserve current stable-node,
  workspace, menu, literal-text, inert-command and no-focus-stealing guarantees.
- VIDEO-APP captures whether its inspector owns focus before rebuilding it. If
  so, restore an equivalent enabled control when its semantic identity still
  exists, including the selected clip/field and control type or title ID where
  needed. If it no longer exists or is disabled, focus the stable timeline with
  scroll preserved. Keep pending-field values and the existing flush/cancel
  semantics. If the inspector did not own focus, do not steal it from another
  control, open dialog, or workspace. Disposal must not restore focus.
- No synthetic click/keypress, timeout-based focus retry, download interception,
  document-global shortcut handler, schema change or editor-model change is
  introduced. Async export continues through the existing real browser codec and
  file paths. Missing codec support remains a visible capability error.

Allowed implementation paths: `src/shared/chrome.ts`, its sibling tests,
`src/video/video-workspace.ts`, a focused Video browser regression and its
isolated test configuration if needed. The existing owner of endpoint/native
validation has frozen those Video paths; the focus repair is the next serial
owner. No shared production `dist/` rebuild without parent coordination.

## Required RED to GREEN evidence

1. Pin the disabled-toolbar and disabled-tool cases in S10 before the repair,
   including a stale active-element observation. Retain enabled-control/menu
   identity, removed-command, workspace-switch and outside-focus regressions.
2. Reproduce inspector mouse, inspector keyboard, toolbar mouse and toolbar
   keyboard export through the real production app. Download a playable artifact
   and immediately issue Ctrl+S and/or Ctrl+N without focusing/clicking anything
   first. Assert the app receives the shortcut, Save retains native content, New
   follows ordinary safeguards and creates the expected empty project. No skip
   or manually focused workaround counts as a pass.
3. Cover an inspector update while another control owns focus and a pending clip
   field edit; neither may steal focus or lose the typed value. Rerun the
   existing Video, bridge, S10, Save-on-blur and A-SHELL checks cumulatively after
   both repairs freeze.

Alternative rejected: focus the timeline after every export finishes. It leaves
keyboard access broken during export and can steal focus from a user who moved
elsewhere while waiting. Revisit only if export becomes a separately contracted
modal workflow. This contract is not a completed verification or human acceptance.
