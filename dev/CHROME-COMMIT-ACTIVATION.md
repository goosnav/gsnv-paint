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

## Executed repair evidence

The new unit cases first failed because the old pressed Save node was detached;
the production Slides test first timed out waiting for its download. S10 now
reconciles ordered controls in place. Its presentation signature replaces glyphs
only when icon/label/shortcut changes. Duplicate occurrences are consumed once
from their own surface; changing workspace starts fresh controls. No synthetic
activation or queued model update was introduced.

Run from the repository root on Linux x64, Node 24.21.0 and Chrome 154.0.8037.97:

```sh
node --import tsx --test src/shared/chrome.test.ts src/shared/input-adapter.test.ts src/app/app-shell.test.ts
# tests 79; pass 79; fail 0; cancelled 0; skipped 0; todo 0
npx tsc --noEmit
# exit 0
npx vite build --outDir /tmp/gsnv-chrome-fix-dist
# exit 0
GSNV_TEST_DIST=/tmp/gsnv-chrome-fix-dist npx playwright test --config src/shared/chrome-commit.playwright.config.ts
# 1 passed (1.9s)
```

The real browser test clicks Save directly after typing a Slides property,
without a preliminary blur or keyboard workaround. It parses the actual native
download and checks the last typed string. It repeats through the File menu.
The method checker reports PASS (210 implementation lines; above its 200-line
soft cap, below the 300 hard cap). Independent read-only review also ran all
19 S10 cases and found no additional blocker; it did not independently rerun the
production browser test. Saved output: [unit](evidence/chrome-commit-unit.log),
[production browser](evidence/chrome-commit-browser.log). The cumulative final
candidate gate remains separate. The existing interactive demo is
`/dev/fixtures/chrome.html`, exercised by `chrome.browser.spec.ts`.

Tweak surface: labels/icons/shortcuts remain caller view-model data; dimensions
and colors remain `chrome.css`. Control-reconciliation behavior is guarded by the
blur, reorder, duplicate, disabled/removal, focus and workspace tests. No OS or
browser beyond the recorded Linux Chrome environment is certified here.
