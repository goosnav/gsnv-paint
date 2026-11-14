# Preserve verified offline availability and fallback generations

Mode A, 2026-11-13. This amends S18/S20 under the owner's current-phase BATCH.
It follows independent read-only reproductions against the current source.
No implementation or completed acceptance is implied by this contract.

## Observed failures

1. S20 Check correctly keeps active A ready when `registration.update()` fails.
   Retry receives a successful ready reply from A, but the subsequent update
   failure calls `fault(active)`, changes phase to error and removes `readyBuild`.
   The current installed copy has not failed; the update check has.
2. S18 installs A/B, then B's generation (or just its lazy WASM entry) is evicted.
   A still audits successfully. After installing C, cleanup trusts B's published
   metadata, retains incomplete B and deletes usable A. Cache existence and a
   completion receipt alone cannot prove historical completeness.

## S20 amendment

An update-request rejection during Retry is an update error, independent of the
result of the active worker's retry/audit. Preserve that verified phase and
`readyBuild`; keep an actual active-worker failure visible when one occurred.
Do not manufacture readiness from a network error or a stale previously ready
state. Initial installation without a usable active copy must still report its
failure. Check/Retry/disposal/mismatch and no-reload semantics remain intact.

## S18 amendment

- Each new generation stores its validated S16 manifest at the private internal
  `/.gsnv-offline/manifest` key before its completion receipt and atomic public
  pointer. The exact UTF-8 JSON bytes are SHA-256 bound by a new optional
  `manifestSha256` receipt field. New publications always include it; absence
  identifies the existing legacy receipt format. Public S16 manifest schema,
  worker messages, served assets and document storage are unchanged. The new
  private key is never eligible for `match()` or asset serving.
- Bound the historical-manifest response read strictly below 26,214,400 bytes,
  consistent with the existing per-file limit. Verify its digest before parsing,
  run S16 validation, and match its build, asset count and aggregate byte count
  to the receipt. Verify the generation's completion receipt against its public
  pointer, and every listed response through the existing length/hash/MIME and
  isolation-header checks. Missing, partial, malformed or corrupt generations
  cannot displace a verified fallback.
- Cleanup freshly audits the current generation before deleting anything. It
  selects the newest **verified complete** other generation, preserving the
  existing receipt-time and generation-name tie-break. Inspect candidates in
  newest-first order and stop once that fallback is proven; do not rehash old
  builds during normal asset requests.
- Preserve every published legacy generation whose historical completeness
  cannot be proved from a stored manifest. If no verified fallback exists,
  delete no published generations. This conservative legacy exception may retain
  more than two generations; it is explicit rather than silently discarding a
  possibly usable copy. Normal new-format generations retain the current and
  verified fallback, with older owned generations eligible for cleanup.
- A storage/read/verification failure during cleanup must not become permission
  to delete a possibly valid build. Actual storage-operation failures abort
  cleanup; S19 already treats cleanup failure as diagnostic, never activation
  failure. Current/legacy/protected generations and fresh concurrent candidates
  remain untouched. Owned abandoned-candidate cleanup and foreign namespaces
  retain their existing protections. Do not create a missing generation while
  inspecting it: enumerate existence before opening.
- The extra manifest write is inside the unpublished install transaction. Any
  failure, quota rejection or abort before pointer publication preserves the
  prior pointer and all prior served bytes. No quota cleanup deletes a usable
  build to make an installation succeed. This adds no backend or dependency.

Allowed owner paths: `src/shared/offline-cache.ts`,
`src/shared/offline-client.ts`, their sibling testbenches/demos, and focused
regression/evidence for these two repairs. Any helper/public boundary needed to
remain below the method's hard size/dependency limits requires a map amendment
before implementation. No shared `dist` build, A-SHELL or Video edits.

## Required RED to GREEN evidence

- Reproduce both exact failures before editing. S20 covers ready-A retry plus
  rejected update, actual active audit failure, waiting B, initial failure and
  disposal; successful retry never hides a valid ready copy.
- S18 covers missing B generation and missing B lazy asset, corrupt bytes/hash,
  missing/invalid/mismatched/oversized manifest, bad receipt binding, wrong
  MIME/isolation, deterministic ties, legacy receipts and absent valid fallback.
  A remains independently auditable after every failed B candidate selection.
  Inject storage read failures and verify no destructive cleanup follows.
- Inject quota at **every** publication write, including the new manifest write;
  prior published pointer and response bytes remain identical. A rejected
  candidate is not exposed. Retain range behavior, canonical-root fetch, aborted
  attempts, foreign caches, fresh candidates and warm-fetch digest bounds.
- Run all offline unit/builder cases, real tiny worker/update/status browser
  cases and module checks. Parent reruns complete production eight-case offline,
  local Cloudflare and launcher gates after all owners freeze.

Alternative rejected: keep every published generation forever. It avoids the
immediate loss but turns repeated ordinary updates into unbounded storage growth.
Alternative rejected: test only cache existence or receipt presence; the partial
eviction reproduction already disproves it. Revisit legacy retention only with
a separately reviewed migration that can prove the old generation's contents.
