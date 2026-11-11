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
