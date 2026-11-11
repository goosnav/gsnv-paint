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

## S02 session — GREEN; provisional rung 1 GREEN

Contract: pure session reducer for three independent workspaces, arbitrary immutable domain snapshots, labeled S01 history, exact saved-revision dirty tracking and no I/O effects. Malformed events raise TypeError; unopened document commands raise RangeError. Callers own content validation and revision uniqueness. No schema or factory is invented for unbuilt domains.

The contract and complete testbench preceded implementation. Focused expected-RED command `node --import tsx --test --test-name-pattern='S02 golden' src/shared/session.test.ts` exited 1: 1 test, 0 pass, 1 fail, 0 skipped, unimplemented entry ([output](evidence/S02-red.txt), trailing whitespace normalized). Full GREEN command `node --import tsx --test src/shared/session.test.ts` exited 0: **35 tests, 35 pass, 0 fail, 0 skipped** ([output](evidence/S02-green.txt)). Includes real S01→S02 seam, 120 edits/100 retained, workspace independence, edit-during-save, replacement-during-save, save failure status, dirty restoration, immutable values and roundtrip properties.

`npm run typecheck` exited 0, no diagnostics. Module checker exited 0: `PASS: src/shared/session.ts`. Full cumulative `npm test` exited 0: **109/109**, no skipped cases ([output](evidence/phase1-through-S02.txt)). Demo `node --import tsx src/shared/session.demo.ts` exited 0: earlier-save completion prints width 120 / dirty true; undo prints width 100 / dirty false / “Undo Change width.” Demo is not test evidence.

D1 stores exact saved identities rather than clearing a boolean, because writes can finish after newer edits; revisit only if saves become synchronous atomic actions. D2 ignores replaced-document completions rather than binding them to a workspace, because late I/O must not change a replacement's baseline. The race tests guard both decisions. No tuning constants; S01 owns history retention. Snapshot content is never serialized here.

GREEN: S01, S03, S02; ACCEPTED: none. Provisional assembly rung 1 passes. S03 independent review found no blocker and independently passed 52/52. Runtime requirement status remains 10 PASS / 0 FAIL / 376 UNTESTED; module evidence alone does not close workspace UI requirements. Next: S04 cursor-centered view transforms.

## S04 view-transform — GREEN

Contract: pure 2D cursor-anchored zoom, pan and screen→document mapping; finite coordinates and positive finite range; Image range 0.01…64. No dependencies. Invalid bounds/coordinates or nonfinite output raise RangeError.

Contract and testbench preceded implementation. Expected RED `node --import tsx --test --test-name-pattern='S04 golden' src/shared/view-transform.test.ts` exited 1: one unimplemented golden test failed ([output](evidence/S04-red.txt), trailing whitespace normalized). Full `node --import tsx --test src/shared/view-transform.test.ts` exited 0: **12 tests, 12 pass, 0 fail, 0 skipped** ([output](evidence/S04-green.txt)). Includes both zoom clamps, negative/fractional coordinates, 100 cursor/inverse property cases, immutable inputs and numeric errors. `npm run typecheck` exited 0; module checker exited 0: `PASS: src/shared/view-transform.ts`. Cumulative `npm test`: **121/121**, zero skipped ([output](evidence/phase1-through-S04.txt)), exit 0.

Demo `node --import tsx src/shared/view-transform.demo.ts` exited 0: zoom 4, pan (-90,-55); document point under cursor remains (50,25). Demo is not evidence. D1 preserves continuous coordinates instead of rounding here to prevent zoom drift; revisit with a distinct snapping contract. Caller-supplied range is the tweak point, guarded by clamp tests. 3D cameras and domain snapping remain outside this brick.

GREEN: S01, S03, S02, S04; ACCEPTED: none. Rung 1 remains GREEN. Independent S02 review found no concrete defect and independently passed 35/35. Requirement totals unchanged; no application/browser smoke yet. Next: S05 keymap.

## S05 keymap — GREEN

Contract: pure focus/workspace keyboard routing, stable command intent, native text editing preserved, dialog Enter/Escape, shared Ctrl/Meta controls, CAD F, Image X/D and focused Video timeline controls. Space pans 2D views and plays only a Video timeline. Unsupported combinations are untouched. No dependencies or browser side effects.

Contract and full testbench preceded implementation. Expected RED `node --import tsx --test --test-name-pattern='S05 golden' src/shared/keymap.test.ts` exited 1: one unimplemented golden test failed ([output](evidence/S05-red.txt), whitespace normalized). Full `node --import tsx --test src/shared/keymap.test.ts` exited 0: **19 tests, 19 pass, 0 fail, 0 skipped** ([output](evidence/S05-green.txt)). Tests enumerate all common Ctrl/Meta commands in all workspaces, text/modal conflicts, Video-only keys, Space roles, invalid input and preventDefault consistency. `npm run typecheck` exited 0; module checker exited 0: `PASS: src/shared/keymap.ts`. Cumulative `npm test` exited 0: **140/140**, none skipped ([output](evidence/phase1-through-S05.txt)).

Demo `node --import tsx src/shared/keymap.demo.ts` exited 0: Space emits video.togglePlayback in timeline, view.panHold in preview, and null/native handling in text. Demo is not test evidence. D1 resolves focus first instead of global shortcuts to protect typing; revisit with a different focus model. D2 treats Ctrl/Meta as intent without OS guessing; revisit only after an observed conflict. COMMON/VIDEO_KEYS tables are the tweak points, guarded by exhaustive shortcut tables. Adapter event capture, repeat and keyup remain outside this CORE.

GREEN: S01, S03, S02, S04, S05; ACCEPTED: none. Rung 1 GREEN. Runtime requirement totals unchanged; browser key interception remains untested until S12. Next: S06 browser capability probe and its first actual Chromium smoke.

## S06 capability-probe — GREEN

Contract: injected browser probes return supported/unavailable/error per capability; exact codec configurations are forwarded unchanged, no UA assumptions or permission prompts. API existence does not establish permission, pen hardware, usable codecs or workspace readiness.

Header and fake/real testbenches preceded implementation. Expected RED `node --import tsx --test --test-name-pattern='S06 golden' src/shared/capability-probe.test.ts` exited 1 with the unimplemented golden failing ([output](evidence/S06-red.txt), whitespace normalized). Full fake suite `node --import tsx --test src/shared/capability-probe.test.ts` exited 0: **6/6**, no failures or skipped cases ([output](evidence/S06-green.txt)). `npm run typecheck` exited 0. Module checker exited 0: `PASS: src/shared/capability-probe.ts`. Cumulative `npm test`: **146/146**, zero skipped, exit 0 ([output](evidence/phase1-through-S06.txt)).

Exactly one real smoke: `npm run test:browser`, exit 0, **1 passed** ([full output](evidence/S06-browser.txt)). Browser **Chrome 154.0.8037.97, Linux x64, headless, 1280×720**, served locally by Vite with isolation headers. This is a module probe, not application or native-launcher acceptance. Actual probe results: native picker API, worker API, WASM compilation, WebGL 2 context creation, window cross-origin isolation, image clipboard API and pressure API all supported. Native picker interaction, clipboard permission, actual pen input, worker isolation and every real codec encode/decode remain UNTESTED. No other browser/OS was tested.

The browser smoke runs the separate demo entry at `/dev/fixtures/capabilities.html`, which prints the seven readable statuses. Run `npm run dev` and visit that path to inspect the demonstration; its output is not a replacement for assertions. D1 probes exact codecs instead of UA inference; revisit for an equivalent browser registry. D2 inspects gated APIs without opening files or clipboard; only explicit actions may invoke those. No tuning constants. The caller's codec list is empty in this phase.

Added pinned Vite 8.3.8 and Playwright 1.65.0 only when the first SHELL browser test needed them. npm audit reports zero vulnerabilities; this is not a release security audit. Independent S04/S05 review found no defects and passed 31 tests plus 10,000 viewport property cases. GREEN: S01, S03, S02, S04, S05, S06; ACCEPTED: none. Rung 1 remains GREEN. Requirement totals remain 10 PASS / 0 FAIL / 376 UNTESTED. Next: S07 file adapter.
