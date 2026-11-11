# Phase 1 execution ledger

Active: Phase 1, Mode B, owner-authorized BATCH. Baseline spec/map push: ea1e22c. No human ACCEPTED bricks. The phase is incomplete; no application/browser/OS claim is made.

## S01 history — GREEN

Contract: immutable arbitrary domain values, 100+ bounded labeled transactions, undo/redo/jump, redo branch reset, no I/O or mutation. Dependencies: none.

Contract header/signature and testbench preceded implementation. Expected RED: `node --import tsx --test src/shared/history.test.ts`, exit 1; unimplemented function caused the assertions to fail. Exact output: [S01-red.txt](evidence/S01-red.txt).

GREEN: same command, exit 0; 22 tests, 22 pass, 0 fail, 0 skipped. Exact output: [S01-green.txt](evidence/S01-green.txt). Full suite `npm test` independently passed 22/22. `npm run typecheck` exited 0 with no diagnostics. Goosnav checker command:

```text
python3 /home/goosnav/.agents/skills/synced/00ab2cd7-2e1c-45ca-814e-5f657fe548ca_724affcc-3df3-47d2-bd47-95d03e739484/goosnav-modular-coding-method/scripts/check_module.py src/shared/history.ts
PASS: src/shared/history.ts
```

Exit 0. Demo: `node --import tsx src/shared/history.demo.ts`, exit 0; prints width 120 after “Change width”, then width 100 with the 120 state in redo. Demo is not test evidence.

Decision D1: share immutable roots instead of deep-copying tiled images and bigint timeline state. Revisit if callers cannot maintain immutable ownership. Tweak `DEFAULT_LIMIT` in history.ts to retain more transactions (integer ≥100); the 120-edit eviction and 0…150 transaction roundtrip tests catch mistakes. Labels are preserved exactly but cannot be blank. Callers supply valid histories and immutable reachable values.

Evidence contributes to CTL-021 but does not pass the complete UI/workspace requirement yet. Provisional assembly height: 0 (standalone brick only). GREEN set: S01. Next: S03 metadata codec.

## BATCH halt — evidence whitespace check

Phase 1 is HALTED before S03, under the owner's retained method halt conditions. S01 remains a GREEN standalone brick: 22 functional tests, strict typecheck, demo and module checker passed. Independent read-only review found no implementation defect; its additional frozen nonempty-history exercise also passed.

The supplemental commit gate `git diff --cached --check` reported trailing spaces in the captured expected-RED console output. The shell command group did not use fail-fast behavior, so the already-queued commit still ran. That was an execution error; no subsequent brick was started and no Phase 1 push occurred. Local commit `a99e56d` is one commit ahead of the verified remote Phase 0 commit `ea1e22c594e9e9264c2b1fe6033f5ec726ec3e61`.

Read-only confirmation command: `git diff --check ea1e22c HEAD` — exit **2**. Exact diagnostic locations:

```text
dev/evidence/S01-red.txt:107: trailing whitespace.
dev/evidence/S01-red.txt:109: trailing whitespace.
dev/evidence/S01-red.txt:138: trailing whitespace.
dev/evidence/S01-red.txt:140: trailing whitespace.
dev/evidence/S01-red.txt:169: trailing whitespace.
dev/evidence/S01-red.txt:171: trailing whitespace.
dev/evidence/S01-red.txt:200: trailing whitespace.
dev/evidence/S01-red.txt:202: trailing whitespace.
dev/evidence/S01-red.txt:231: trailing whitespace.
dev/evidence/S01-red.txt:233: trailing whitespace.
dev/evidence/S01-red.txt:262: trailing whitespace.
dev/evidence/S01-red.txt:264: trailing whitespace.
dev/evidence/S01-red.txt:401: trailing whitespace.
dev/evidence/S01-red.txt:403: trailing whitespace.
```

Each diagnostic was followed by `+` and two spaces in the raw command output. The affected file is test evidence only; no source file was flagged. Proposed correction upon continuation: remove trailing spaces from the stored presentation of this log, label that whitespace normalization in its receipt, verify with a fail-fast command group, and resume S03. Do not alter any test assertion, expected output value or production behavior. Preserve the existing commit history; no amend/force-push is needed.

Requirement status remains the Phase 0 matrix: 10 inspection PASS, no observed functional requirement FAIL, 376 UNTESTED. Phase 1's additional formatting gate is FAIL; this is not a passing phase and not a candidate release. No browser or OS application smoke test has run. The application is not built.

## BATCH resumed — evidence presentation repaired

The owner's continuation authorizes the proposed log cleanup and resumption. Only trailing whitespace in S01-red.txt was normalized; its test failures and assertions are unchanged. The earlier halt remains above as history. All command groups now fail fast before mutations that depend on a check. Fresh checks and their results are recorded below before resuming S03.

Resume verification (all exit 0): `npm test` — 22 tests, 22 pass, 0 fail, 0 skipped; `npm run typecheck` — no diagnostics; `python3 dev/verify-spec.py` — TRACE/MAP/LINK PASS (386 requirements, 158 contracts); module checker — `PASS: src/shared/history.ts`; `git diff --check ea1e22c` — no diagnostics. Formatting gate is now PASS. No runtime requirement or platform status changed.

## S03 project-format — GREEN

Contract: exact five-key, version-1 project metadata; three workspace tags; deterministic canonical JSON; finite Json content, no unsafe keys or cycles; UTF-8 text ≤64 MiB. No collaborators. Common metadata validation does not validate a workspace's content schema.

Contract and testbench preceded implementation. `node --import tsx --test src/shared/project-format.test.ts` produced expected RED (exit 1, unimplemented entry), then GREEN (exit 0, **52 tests, 52 pass, 0 fail, 0 skipped**). Captured outputs: [RED](evidence/S03-red.txt), [GREEN](evidence/S03-green.txt); trailing console whitespace normalized only. `npm run typecheck` exited 0 without diagnostics. Initial module checker returned exit 1, “5 public entry points exceeds the maximum of 3”: it counted TypeScript overload declarations separately. Batch advancement stopped while those declarations were replaced with a single generic signature, without changing inputs, outputs or assertions. Recheck exited 0, `PASS: src/shared/project-format.ts`. Full `npm test` exited 0: **74/74**, zero skipped ([output](evidence/phase1-through-S03.txt)); `git diff --check` exited 0.

Demo `node --import tsx src/shared/project-format.demo.ts` exited 0 and printed canonical plate metadata with units mm, width 100 and depth 10, then its decoded envelope. Demo is not test evidence. D1 uses UTF-16 sorted keys and preserves -0 rather than lossy native serialization; revisit with a format migration. D2 uses an explicit traversal stack instead of recursion so valid deep JSON works; revisit if a future contract specifies a depth limit. The 15,000-level fixture and ordering/roundtrip properties catch those changes. `MAX_BYTES` is the tweak point for a future authorized transport change; exact-boundary and multibyte tests enforce today's limit.

GREEN: S01, S03; ACCEPTED: none. Provisional assembly height remains 0. No full runtime requirement has closed, and no browser/application smoke has run. Next: S02 session and the S01→S02 seam.
