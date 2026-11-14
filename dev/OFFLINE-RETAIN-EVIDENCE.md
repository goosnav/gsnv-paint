# S18/S20 bounded offline repair evidence

2026-11-13. Contract: [OFFLINE-RETAIN-REPAIR.md](OFFLINE-RETAIN-REPAIR.md),
committed before implementation as `92e90b8`. Status: component **GREEN**;
human acceptance and the combined production gate remain separate.

## Behavior and ownership

S18 now stores the exact validated manifest JSON bytes in each unpublished
generation and binds their SHA-256 in both completion and public receipts.
Cleanup freshly audits the current generation, validates historical manifests
and their assets, and selects the newest verified complete fallback. It finishes
all inspection before starting deletion. No missing generation is opened merely
to inspect it. The reserved manifest key is never served.

S20 now separates an unsuccessful update request from the active worker's Retry
result. A verified active copy remains ready; a genuine audit failure remains
visible. Retry with no installed worker still reports initial setup failure.

Only `src/shared/offline-cache.ts` and `src/shared/offline-client.ts` runtime
files were changed for this repair. Tests were added to their testbenches and
`offline-retain.test.ts`; the client browser fixture gained the offline Retry
regression and a new real-cache A/B/C retention fixture was added. The existing
S19 startup-audit expectation changed from two hashes to three: two assets plus
the new bound manifest. Its subsequent ordinary status still adds zero hashes.
No S19 runtime change was made.

Interpretation recorded before implementation: malformed public metadata cannot
safely identify an unpublished cache, so cleanup aborts before deleting anything.
Historical verification failures exclude and protect that candidate; storage or
body-read operation failures abort cleanup. Published legacy generations remain
protected. If no verified fallback exists, no published generation is deleted.
These exceptional cases can retain more than two copies. A future migration that
proves legacy/uncertain contents would need a new contract.

## RED evidence

Before runtime changes:

```sh
node --import tsx --test src/shared/offline-cache.test.ts \
  src/shared/offline-retain.test.ts src/shared/offline-client.test.ts
```

Exit 1: **49 tests, 17 pass, 32 fail, 0 cancelled/skipped/todo**.
[Raw output](evidence/offline-retain-unit-red.log) includes both exact defects:
Retry changes verified A from ready to error after a rejected update; retention
deletes independently auditable A when newer B loses its entire generation or
its lazy WASM entry. Additional failures cover the new publication write,
historical validation, fresh current audit, conservative metadata handling and
storage failures.

Two later boundary tests were also observed failing before their fixes:

- [Initial setup RED](evidence/offline-retain-initial-red.log): without any
  installed worker, Retry left phase `installing` after the update rejection.
- [Storage read RED](evidence/offline-retain-read-red.log): a body read carrying
  `offline.storage` was misclassified as incomplete content and cleanup continued.

## Final component verification

Working directory: `/home/goosnav/Desktop/code/gsnv-paint`.
Environment actually exercised: Linux, Node `v24.21.0`, Google Chrome for Testing
`158.0.8127.18`.

```sh
node --import tsx --test \
  src/shared/offline-manifest.test.ts src/shared/offline-cache.test.ts \
  src/shared/offline-retain.test.ts src/shared/offline-worker.test.ts \
  src/shared/offline-client.test.ts src/shared/offline-status.test.ts \
  dev/offline-build.test.ts
```

Exit 0, [raw output](evidence/offline-retain-cumulative.log):

```text
tests 76
pass 76
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 2135.560261
```

Coverage includes all six publication writes (pending marker, two fixture assets,
manifest, completion receipt, public pointer), with prior pointer and served
content preserved at each injected quota failure. It also covers cancellation
after the new manifest write, missing/corrupt manifests and assets, digest/receipt
binding, MIME/isolation, strict manifest byte limit and cancellation, the valid
limit-minus-one case, metadata bounds, deterministic ties, legacy/no-fallback
preservation, storage/body-read failures, foreign caches, fresh concurrent
candidates, range semantics, canonical root fetching and warm-read digest bounds.

```sh
GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome \
  node_modules/.bin/playwright test --config dev/offline.playwright.config.ts \
  offline-worker.browser.spec.ts offline-client.browser.spec.ts \
  offline-status.browser.spec.ts offline-retain.browser.spec.ts
```

Exit 0: **4 passed (10.7s)**, [raw output](evidence/offline-retain-browser.log).
These build tiny fixtures into temporary directories, without using or changing
the shared production `dist`. They verify real offline Retry with A still usable,
A/B/C retention after B's partial eviction, deferred multi-tab activation, offline
reload, typing preservation, and the status panel's bounds/focus. The only runner
warning concerns conflicting color-output environment variables.

```sh
npx tsc --noEmit
python3 /home/goosnav/.agents/skills/synced/00ab2cd7-2e1c-45ca-814e-5f657fe548ca_724affcc-3df3-47d2-bd47-95d03e739484/goosnav-modular-coding-method/scripts/check_module.py \
  src/shared/offline-cache.ts src/shared/offline-client.ts
git diff --check
```

All exited 0. [Typecheck output](evidence/offline-retain-types.log) is empty.
[Module output](evidence/offline-retain-modules.log) reports PASS for both modules,
with S18's explicit soft-cap warning at **211 implementation lines**; it remains
below the 300-line hard limit. No new public entry point or collaborator was added.

## Demos and limits

The existing `offline-cache.demo.html` and `offline-client.demo.html` were built
as independent temporary fixtures with `offlineWorkerFixture`, served on isolated
port 4196, and opened in the same real Chrome version. [Demo output](evidence/offline-retain-demo.log)
shows a real CacheStorage install/audit/read receipt including `manifestSha256`,
restored HTML, and `Ready offline … update none`. Demos are sanity checks and are
not counted as tests. Their browser contexts and servers were closed.

The tweak surface remains the named timeout/metadata constants at the top of
S18. `MANIFEST_LIMIT` is exclusive and matches the hosting per-file contract;
`METADATA_LIMIT` is the private receipt/marker byte bound. The boundary tests pin
their meanings. Legacy retention and the update-error distinction are behavior
contracts, not tuning options.

No shared production build, deployment, launcher/OS smoke test, commit or push was
performed by this repair owner. The parent independently reran the six offline
unit groups (72/72), reviewed the repair, and owns the final combined build.
The complete offline browser suite now has **nine cases**, including the new
retention fixture; that combined production gate remains pending here. These
component checks do not establish SYS-010 or consumer acceptance. Browser eviction
can still occur externally after an audit; no atomic browser API prevents that.
