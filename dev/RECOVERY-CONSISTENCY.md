# Exact-revision browser recovery

Mode A, 2026-11-13. This repairs the current A-SHELL persistence orchestration
under the owner's pre-authorized BATCH. S08, S14, native project formats and the
Recent database schema stay unchanged. Human acceptance remains pending.

## Observed failure

The real offline update test on Chrome for Testing 158 reproduced a storage
failure followed by Stay, restored storage permissions, successful native Save,
and actual beforeunload closes. The downloaded Document contains the final text
`pending document 7391 during update before close`. Recent contains those same
300 bytes, but recovery still contains the older 287-byte version without
` before close`. Startup opens the older recovery and overwrites Recent with it.
The file itself is correct. The complete source snapshots and failed assertion
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
