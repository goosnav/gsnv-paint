# Exact-revision browser recovery

Mode A, 2026-11-13. This repairs the current A-SHELL persistence orchestration
under the owner's pre-authorized BATCH. S08, S14, native project formats and the
Recent database schema stay unchanged. Human acceptance remains pending.

The final combined candidate passes all 89 default browser checks and all nine
dedicated offline checks, including immediate Save after Redo and the exact
denial → Stay → Save → close/reopen recovery procedure. The
[parent checkpoint](MODELING-OFFLINE-CHECKPOINT.md) records the combined results
and their bounded requirement credit.

## Original observed failure (repaired)

The real offline update test on Chrome for Testing 158 reproduced a storage
failure followed by Stay, restored storage permissions, successful native Save,
and actual beforeunload closes. The downloaded Document contained the final text
`pending document 7391 during update before close`. Recent contained those same
300 bytes, but recovery still contained the older 287-byte version without
` before close`. Startup opened the older recovery and overwrote Recent with it.
The file itself was correct. The complete source snapshots and failed assertion
are in [the offline ledger](OFFLINE-WORKFLOW.md).

## Amended assembly contract

1. A recovery write acknowledges only its captured document epoch and identity,
   after the authoritative transaction completes and its returned generation
   **and native payload bytes** match the attempted write. A metadata hint,
   successful request, or returned different/newer record cannot acknowledge
   those bytes. A queued obsolete snapshot must not replace current recovery.
   Already initiated valid writes can finish on disposal; disposal must not
   publish late UI. Clear invalid acknowledgments on queued changes, replacement
   and explicit recovery discard. Preserve the existing increasing generation
   and serialized discard/write rules.
2. Recent writes wait for that exact recovery acknowledgment, then recheck the
   captured epoch/identity before writing. A failed recovery must not publish a
   newer Recent version which startup could later overwrite. A Recent failure
   leaves the successfully written recovery intact and remains visible. No
   global schema, generic transaction framework or cross-tab synchronization is
   added. Native payload comparison is ordinary assembly boundary checking.
3. Successful file Save retries and awaits recovery of the **current** committed
   revision before its operation settles, then updates Recent through the same
   ordering. The file's saved marker remains bound to the revision actually
   written; an intervening edit stays dirty. A replacement epoch cannot inherit
   the old save handle, acknowledgment or backup. File success remains success
   when browser backup is unavailable, with a visible backup warning. Failed or
   canceled file saves do not acquire a saved marker.
4. Startup reads do not write either store. If a same-ID stored project and
   recovery differ, or the stored alternative cannot be safely read/validated,
   preserve both and expose an unresolved recovery conflict. Do not guess order
   from Recent timestamps and workspace generations: these are different clocks.
   Do not silently auto-open the recovery and overwrite Recent from a later
   unload/dispose callback. The conflict can use the existing pending-recovery
   path: File > Recent opens the retained stored version; **Recover as copy**
   restores the recovery under a fresh document ID, preserving its editable
   contents. Its label must state that it creates a copy. Explicit discard
   removes only recovery through the existing guarded command. New/Open, normal
   replacement safeguards and unresolved-recovery protections remain usable.
   An identical existing copy can auto-reopen without a write; absence of a
   stored alternative does not itself constitute a conflict.

The implementation owner is restricted to `src/app/app-shell.ts`, its focused
tests, and evidence for this repair. A helper requiring a new public boundary,
schema change or modified storage-brick semantics halts for a map amendment.
Do not rewrite editor code or relax the offline acceptance assertions.

## Required RED → GREEN evidence

- Exact reported denial → Stay → restored storage → Save → immediate close →
  reopen; independently check file, recovery, Recent and restored content.
- Recovery fails while Recent is available: no unsafe Recent write, dirty unload
  still warns; a later retry establishes recovery before Recent.
- Recent fails after successful recovery: prior Recent retained, current recovery
  available and truthful warning; normal editing and explicit file save work.
- Delayed file save, newer edits, same-ID replacement and overlapping queued
  writes/Undo/discard/disposal retain exact revision and epoch ownership.
- Different/newer returned recovery records and mismatched payloads never count
  as the requested revision's acknowledgment.
- Seed both directions of existing same-ID divergence. Startup followed by
  no-edit unload/disposal leaves both payloads unchanged. Open the stored version
  and recover the other as a fresh-ID editable copy without overwriting either.
- Existing unavailable-storage, source flush, same-ID replacement, history,
  browser files, bridge and all nine cold-offline workflows stay cumulative.

Run `node --import tsx --test src/app/app-shell.test.ts` before and after the
repair; preserve raw results. Then run the exact production update test and the
complete candidate gate. No skipped/unavailable check is a pass.

Alternative rejected: retry only on file Save. That fixes the observed saved
file case but leaves Recent-only recovery divergence reachable. Alternative
rejected: choose the newest timestamp at startup. Neither existing store carries
a shared revision clock. Revisit conflict policy only with a separately reviewed
versioned persistence contract.

## File-write availability amendment

Mode A, 2026-11-13. Before this repair, the cumulative production bridge workflow
timed out on Save immediately after Redo. Read-only inspection found a reachable
gap: `saving[workspace]` disabled Save through the recovery/Recent awaits even
after the native file write or download handoff finished. That made an otherwise
valid second Save disappear during browser storage latency. Focus repair is
separate; this amendment changes only A-SHELL file-operation ownership.

- Disable Save while the native picker, permission request or actual file write
  is in flight. After that file operation settles, release that invocation's
  file-operation guard before awaiting recovery/Recent. Do not wait for storage
  merely to make the next user-initiated Save available.
- Keep the original Save promise pending through its required exact-revision
  backup work. This preserves step 3, close/reopen evidence and file success
  reporting. Browser backups remain serialized through the existing queues.
- Releasing or settling an older Save must never clear a newer Save's active
  file guard. Duplicate Save during a pending native write remains guarded.
  No deferred synthetic click, queued picker, replayed shortcut, timing delay,
  new public boundary or storage-schema change is introduced.
- Preserve captured revision/epoch ownership, disposal, cancellation, failure,
  dirty markers, source flush and the exact acknowledgment rules above.

Required RED → GREEN: hold recovery/Recent after the first successful file write,
edit/Undo/Redo and invoke another Save immediately; its bytes must reflect the
new revision. Hold that second native write, let the first backup finish, and
prove a third Save cannot bypass its guard. The original bridge production
case must pass without added waits, focus changes or weakened byte assertions.
Run all shell/persistence tests and the final full-browser gates cumulatively.

## Parent browser reproduction

The parent independently ran all 84 shell/bridge/persistence cases: 84 pass,
0 fail/cancelled/skipped/todo. It then built an isolated production candidate
with the frozen recovery and focus repairs, before the separate S18/S20 cleanup
repair. Build A was
`6325bde3ba12a7d5974d3dd36ede8934f0cf9a6ebd551665f1d52c85180c479d`.

```sh
GSNV_OFFLINE_CANDIDATES=/tmp/gsnv-consumer-qa/recovery-fixed-candidates \
GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome \
node_modules/.bin/playwright test --config dev/offline.playwright.config.ts \
  --grep 'failed full-build updates'
# 1 passed (30.8s); exit 0
```

Linux x64, Chrome for Testing 158.0.8127.18. The unchanged real denial → Stay →
restored storage → native Save → actual tab closes → B startup case passes.
Recovery and Recent each retain the same 300-byte final project at all four
read-only snapshot points, including before and after B startup. Recovery stays
at generation 5; startup does not rewrite it. Recovered native bytes equal the
saved A file, and the reopened B document remains editable. No close warning
was recorded after the explicit saves. Durable [browser output](evidence/recovery-consistency-browser-green.log)
and [store snapshots](evidence/recovery-consistency-stores-green.json) preserve
the exact result. The final combined candidate results appear below and in the
[parent checkpoint](MODELING-OFFLINE-CHECKPOINT.md).

## Original focused repair evidence

The focused RED run was captured before changing the shell: **45 tests, 33
passed, 12 failed**, all failures in the new recovery consistency cases. The
final focused run passes **50/50**, with no skipped tests and no changes to the
original test expectations. Five additional checks cover a newer returned
generation with identical bytes, an unreadable Recent list, obsolete queued
snapshots, a native Save finishing during disposal, and an editor import trying
to bypass an unresolved recovery conflict.

The assembly now acknowledges the actual returned S08 generation and native
payload, rejects stale queued revisions before encoding, and waits for recovery
before writing Recent. Native Save retries the current committed revision while
its saved marker still identifies only the file's written revision. In-flight
valid persistence can finish after disposal without rebuilding the UI. Startup
performs no writes; identical or unopposed recovery reopens without writing, and
divergence/read uncertainty exposes **Recover as copy** under a fresh project ID.
File > Recent can still open the retained original. Explicit recovery discard
does not get undone by a no-edit Recent flush; a later edit resumes backups.

Reproduce the focused gates from the repository root:

```sh
node --import tsx --test src/app/app-shell.test.ts
node --import tsx --test src/app/app-shell-bridge.test.ts src/bridge/workspace-bridge.test.ts src/shared/recovery-store.test.ts src/shared/recovery-session.test.ts src/shared/recent-projects.test.ts
npx tsc --noEmit
```

The second command passes **34/34**. Its direct shell bridge test still proves
hidden target input is flushed, failed retention keeps the target, successful
replacement uses a fresh target identity, and source document/history stay
unchanged. The coordinator and storage tests retain their existing stale-state,
generation, corrupted-record, queue and retention coverage. TypeScript exits 0.

Raw evidence:

- [Initial RED: 45 tests, 12 failures](evidence/recovery-consistency-unit-red.log)
- [Final shell GREEN: 50/50](evidence/recovery-consistency-unit-green.log)
- [Persistence and bridge boundaries GREEN: 34/34](evidence/recovery-consistency-boundaries-green.log)
- [Whole TypeScript check](evidence/recovery-consistency-types-green.log)
- [Generic brick-check result](evidence/recovery-consistency-module-check.log)

The generic brick checker rejects the assembly's existing KIND annotation,
decision-header wording, and its 574 implementation lines. This is **not a
brick-check pass**: [the module map](MODULE_MAP.md#a-shell--assembly-not-a-brick--green)
classifies A-SHELL as an assembly, not a brick. No new public boundary, schema,
storage-brick behavior or domain algorithm was introduced.

Only `src/app/app-shell.ts`, its focused testbench, and this repair evidence were
changed for this increment. The parent subsequently built and verified the
combined candidate. These focused unit results alone do not
substitute for browser gates or claim multi-tab conflict resolution. The
parent reproduction above and current offline evidence below record those
separate executed results.

## File-write availability repair evidence

The deterministic testbench first ran against the preceding GREEN recovery
implementation: **54 shell tests, 52 passed, 2 failed**. The native-file and
download cases each found Save disabled after file handoff while Recent was
deliberately held pending. The existing 50 cases and the new picker-cancellation
and native-write-failure cases still passed. [Raw RED output](evidence/file-write-availability-unit-red.log)
retains the two exact disabled-state failures.

The runtime change gives each Save invocation a one-shot release for its
existing file-operation guard. It releases after successful file handoff and
before browser backup awaits; cancellation/failure releases through the same
finalizer. A prior invocation's later backup completion cannot release a newer
invocation's guard. The Save promise still awaits its exact current recovery and
Recent work. Revision markers, captured epochs, backup queues, storage schemas
and public boundaries are unchanged.

The native overlap test holds the first Recent write, performs edit → Undo →
Redo, and starts Save again immediately. It checks both native files' decoded
bytes, holds the second native close, completes the first backup, and verifies
that a third Save is ignored while the second file operation still owns its
guard. The download test checks both handoff payloads under the same held-backup
condition. These tests use explicit promise barriers, without sleeps, replayed
commands, production focus changes or weakened browser assertions.

Final focused commands:

```sh
node --import tsx --test src/app/app-shell.test.ts src/app/app-shell-bridge.test.ts src/bridge/workspace-bridge.test.ts src/shared/recovery-store.test.ts src/shared/recovery-session.test.ts src/shared/recent-projects.test.ts
npx tsc --noEmit
git diff --check -- src/app/app-shell.ts src/app/app-shell.test.ts dev/RECOVERY-CONSISTENCY.md
```

Results: **88/88 tests pass** (54 shell plus 34 bridge/persistence), with zero
failures, cancellations, skips or todos; TypeScript and focused whitespace
checks exit 0. [Raw GREEN output](evidence/file-write-availability-unit-green.log)
and [TypeScript result with frozen source hashes](evidence/file-write-availability-types-green.log)
record this gate. No original expectation was changed. Runtime/test sources are
frozen; only this evidence was written afterward. No build, dist mutation,
commit or push was performed by this repair owner.

The parent's preceding real denial → Stay → Save → close/reopen browser result
above remains valid for the recovery repair. The final frozen candidate passes
all **89 default browser checks in 4.0 minutes**, including the production bridge
Save-after-Redo case, and all **nine dedicated offline checks**, including the
unchanged denial → Stay → Save → close/reopen workflow. The
[default browser output](evidence/modeling-offline-browser-green.log) and
[parent checkpoint](MODELING-OFFLINE-CHECKPOINT.md) record these combined results;
the 88 focused tests do not replace that evidence. The historical CAD Open
failures and the test chooser-listener correction are documented separately in
[the diagnosis](CAD-REOPEN-DIAGNOSIS.md); no application patch was needed for that
correction, and attribution of the earlier uninstrumented failures remains
inferred.
