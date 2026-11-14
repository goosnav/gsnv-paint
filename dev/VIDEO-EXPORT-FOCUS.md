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

## Implementation and evidence — 2026-11-13

The bounded focus repair is implemented and frozen. S10 tests whether a
replacement is disabled before calling `focus()`, then uses its stable viewport
when the command is disabled or removed. The Video inspector captures its own
focused control before rebuilding, restores by clip/field/control type or title
ID, and falls back to the timeline with `preventScroll`. It leaves outside focus
alone and retains pending numeric values. No download, input-routing, native
format or A-SHELL implementation was changed by this repair.

The initial diagnostic reproduced the failure in Chrome 154.0.8037.97 and Chrome
for Testing 158.0.8127.18 on production build
`b81589f26a3f41800b8098725bf97c7fdfbee34ae14f82fd99c026e0f281f8f7`.
[Event observations](evidence/video-focus-diagnosis.json) retain the removed
inspector control, the toolbar's stale disabled active element, BODY focus before
the download anchor, unhandled Ctrl+N, and successful File > New. Repeated DOM
outerHTML is reduced to opening tags; the original diagnostic files and hashes
are recorded in that evidence.

RED was observed before implementation: [two disabled-focus unit
failures](evidence/video-focus-unit-red.log), and [six failing production browser
cases out of seven](evidence/video-focus-browser-red.log). The existing outside
menu case already passed. The browser checks were then verified in an isolated
Video shell fixture and the complete app. The fixture's playable dimensions
oracle was corrected from 160 × 120 to the imported source's actual 128 × 96;
the native media/model was unchanged.

The complete app was copied after the recovery owner froze A-SHELL. Its source
HEAD was `92e90b82371b9930b4dc2eefdc4737426b0fde44` plus the frozen working tree.
The [442-file source inventory](evidence/video-focus-source-inventory.json)
records every hash, the source inventory digest
`5ded4445f5145a9b22af804f36b35e1b8687dec11d275d51706044466c86b77f`, and production
build `a01669123bc418f13181170f607bfc034d57a36acf9537191c4c59150fc52020`.
The isolated source/output is
`/tmp/gsnv-consumer-qa/video-focus-production-source`; the shared `dist/` was not
rebuilt. Full TypeScript validation and the [production
build](evidence/video-focus-production-build.log) exited zero.

Scoped GREEN evidence at 1280 × 720 on Linux system Chrome 154.0.8037.97:

- [108/108 units](evidence/video-focus-unit-green.log): S10, input adapter,
  keymap, pending Video fields, timeline and Video boundaries.
- [7/7 production focus cases](evidence/video-focus-production-green.log):
  inspector/toolbar × mouse/Enter export, immediately followed by Ctrl+S with
  exact native bytes and Ctrl+N without an intervening focus action; real
  exported media decodes and plays. Pending numeric input, a focused outside
  File menu, exact second-title focus and removed-control fallback also pass.
  No page errors were reported.
- [Existing Video production journey](evidence/video-focus-video-cumulative.log)
  passes import, edits, playback, native persistence, reload and real export.
  Its [1280 × 720 screenshot](evidence/VIDEO-focus-cumulative-production.png)
  is saved separately from prior evidence.
- [Mouse Save and File-menu Save after property blur](evidence/video-focus-chrome-cumulative.log)
  pass in the complete Slides workspace.
- [79/79 frozen A-SHELL, direct bridge, Recent and recovery units](evidence/video-focus-shell-green.log)
  pass against the isolated snapshot.

Run the focused production gate from the repository after a coordinated build:

```sh
GSNV_VIDEO_FOCUS_DIST=/absolute/path/to/dist node_modules/.bin/playwright test --config src/video/video-export-focus.playwright.config.ts
```

The S10 module checker [passes with a 210-line soft-limit
warning](evidence/video-focus-chrome-module.log). The generic checker does not
accept the VIDEO-APP assembly header and also reports its missing revisit marker
and 302 implementation lines; [that structural result is retained](evidence/video-focus-video-module.log),
not reported as a pass. No unrelated split or line compression was performed.

## Separate cumulative failure — not accepted

The [unchanged full bridge suite](evidence/video-focus-bridge-cumulative.log)
finished **12/13**, with the immediate Save after Redo timing out. This is not a
focus failure: [read-only capture/bubble observations](evidence/video-focus-save-busy-events.json)
show app-owned DIV focus and consumed Ctrl+Y/Ctrl+S, while Save remains disabled
through the prior save's post-download recovery/Recent work. Five isolated case
repetitions passed, but the [full observed sequence reproduced the
failure](evidence/video-focus-bridge-full-observations.log), again 12/13. Neither
the failure nor its original native-byte assertions was weakened or removed.

The temporary [diagnostic source](evidence/video-focus-bridge-diagnostic-source.txt)
and [configuration](evidence/video-focus-bridge-diagnostic-config.txt) preserve
the reproduction. They add synchronous read-only key observations, print them
after each test, and shorten only the diagnostic download timeout to eight
seconds; they add no action waits. The original case timed out at sixty seconds.
The shell owner is repairing this separately under the committed
[save completion boundary amendment](RECOVERY-CONSISTENCY.md). Focus runtime and
tests are frozen; combined acceptance awaits the parent's final build and
cumulative rerun. These scoped results do not claim original requirement PASS,
offline acceptance, or human sign-off.
