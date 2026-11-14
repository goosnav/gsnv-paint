# Preserve command activation across editor commits

Mode A repair contract for S10, 2026-11-13. The cold offline production journey
found that Slides property editing commits on blur. Pointer-down on the shared
Save button moves focus, triggering that commit and a chrome update. S10 replaced
the pressed button before the browser delivered its click, so no file was saved.
The failure is independent of offline storage; keyboard Save is a separate path.

S10 shall preserve existing menu trigger, menu command, toolbar command and tool
button DOM identities when their workspace, surface and IDs persist through an
update. Ordinary title/dirty/history/status/availability changes must not detach
unchanged controls or replace their unchanged decorative children. Order and
labels still reflect the latest model. Native pointer and keyboard activation
continue through the existing delegated callbacks, exactly once.

Removing a command or making it disabled takes effect immediately: a press must
not dispatch a stale command. Workspace changes do not preserve old workspace
command nodes. Existing menu openness/focus restoration, viewport/panel/offline
slot identities, literal text rendering and idempotent disposal remain intact.
No synthetic click, forced save, event replay or deferred model publication is
introduced. S10 remains one bounded DOM adapter with no document decisions.

Alternative: delay all chrome updates until pointer-up. Rejected because it would
leave availability and document/workspace changes stale during interaction, and
needs another queued lifecycle. Alternative: invoke Save on pointer-down. Rejected
because it bypasses ordinary click cancellation and keyboard/button conventions.
Revisit stable-node reconciliation only if chrome ownership or rendering changes.

Before implementation, extend the S10 testbench to fail on lost node identities
and dispatch after a blur-triggered update. Include disabled/removed commands,
reorder, changed label/icon, duplicate occurrences and workspace changes so no
stale node can masquerade as a current control. Add a real production Slides
test: edit a text property, click shared Save without a prior blur or keyboard
workaround, parse the downloaded native file and assert the last typed text.
Repeat with File-menu activation. Run S10/S12/A-SHELL and full browser regressions.
Only those observed results establish GREEN; human acceptance remains pending.
