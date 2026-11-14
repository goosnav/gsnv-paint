# Consumer repair checkpoint — 2026-11-13

This checkpoint completes inherited Document integration and repairs concrete CAD, recovery and launcher failures. It is not full product acceptance. The owner retains acceptance; no M1a release is claimed.

CAD uses the actual production builder, PlaneGCS and OpenCascade. The automated browser constructs the specified plate with four R5 vertical corner fillets, four diameter-6 through holes and a centered 20 × 20 × 5 pocket. It changes only `width`, verifies hole centers stay 10 mm from the corresponding edges and the pocket stays centered, saves/reopens the editable project, and exports actual STEP files whose independently loaded native solids match the measured volumes. The production-builder test also round-trips mm → inch → mm and releases retained native shapes. A failed fillet is flagged by name and reason; failed results do not show a successful stale solid.

Measured volumes: **56,654.424808105 mm³ at width 100**, **68,654.424808105 mm³ at width 120**. Both are within the requested 0.01%. Formulas and fixed-position sources survive editable native round trips. Unit binding preserves scalar factors and variable dependencies; displayed dimensions use the selected units.

Document now validates images before committing, preserves pending typing through save/reload handling, restores keyboard focus, and prints pages at the configured size. Browser tests parse the printed PDF and native project; malformed images retain the document with a readable error.

Shared storage now waits for confirmation of the exact backed-up revision before replacing dirty work. Failed or unavailable storage retains the current project. Recent-menu limits no longer delete older projects; Open stored project exposes them. Deleting stored projects requires explicit confirmation. Opening a different version with the same ID requires saving the dirty current version first. Browser storage can still be evicted; exported files remain the durable copy.

## Requirement status

- **PASS:** CAD-015 (failed feature flag/reason), CAD-017 (physical unit preservation and display), CAD-122, CAD-123, CAD-124 (native acceptance volumes, dependent positions and STEP round trip). DOC-001–003 pass the bounded Document contract in `MODULE_MAP-AUTHORING.md`.
- **Partial evidence, not whole-requirement PASS:** CAD-009, CAD-018/019, CAD-062/073/113 and CTL-014–030 have tested working paths, but their full enumerated procedures or every-workspace quantifiers are not all closed. In particular, STEP re-import is exercised through the actual native exchange adapter; the consumer STEP import command is still absent.
- **UNTESTED / open:** all remaining original scope retains its recorded status. Missing CAD features, full Image/Video goldens, performance targets, offline installation, M1a packaging, native picker UI, Windows and other browser/OS smoke remain open. New Audio/Slides/Spreadsheet/Code adapters are separate work; their core tests in the working tree do not imply completed editors.
- **Observed failures repaired:** unit switching resized parts; holes/pocket used fixed coordinates; native compound results broke STEP export; disjoint cuts silently succeeded; storage failures could discard edits; recent-project pruning could remove the only stored copy; second launcher invocation no longer recognized the descriptive page title. All corresponding checks below are green. No skipped/unavailable checks are counted as passes.

## Commands and output

Environment: Linux x64, Node 24.21.0, headless desktop Chrome **154.0.8037.97**, **1280 × 720**. This is browser/process smoke, not a physical tablet, OS dialog or full performance certification.

`node --import tsx --test 'src/app/*.test.ts' 'src/cad/*.test.ts' 'src/document/*.test.ts' 'src/image/*.test.ts' 'src/photo/*.test.ts' 'src/shared/*.test.ts' 'src/video/*.test.ts'`

```text
tests 610; pass 610; fail 0; cancelled 0; skipped 0; todo 0
```

`npx playwright test src/shared src/app src/cad src/document src/image src/photo src/video`

```text
32 passed (1.9m)
```

`npm run build`: exit 0. Vendor conditional Node import and main-bundle size warnings remain; neither is suppressed. Largest emitted asset is the existing 22,942,327-byte OCCT WASM.

`WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run --no-autoconfig`: exit 0.

```text
Read 27 files from the assets directory
Total Upload: 0.31 KiB / gzip: 0.22 KiB
No bindings found.
--dry-run: exiting now.
```

This validates configuration locally; it does not claim Cloudflare credentials or live deployment success.

`npm run test:launcher`: real loopback HTTP, isolation headers, foreign-host denial, build-only serving and second-launch reuse; exit 0, `launcher smoke: PASS`. Automatic browser opening is disabled in this test.

`npm run test:spec`: 386 requirements, 181 contracts, 21 PASS / 0 FAIL / 365 UNTESTED; this command checks traceability, not product behavior. `git diff --check`: exit 0.

Durable logs (trailing whitespace trimmed) are under `dev/evidence/consumer-repair-*.log`; visual evidence is `CAD-consumer-golden.png` and `DOCUMENT-APP-production.png`. The first browser run found a stale test expecting an `mm` text suffix after the physical-value display fix; that expectation was updated and the entire 32-test suite passed. The first launcher test exposed the old title sentinel and passed only after repairing it.
