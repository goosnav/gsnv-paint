# Offline installation verification ledger

The authorized contract is [MODULE_MAP-OFFLINE.md](MODULE_MAP-OFFLINE.md), committed before implementation as `df945ee`; the static-host correction is [OFFLINE-ROOT-ROUTE.md](OFFLINE-ROOT-ROUTE.md), committed as `d1ba0be`. The shared [module map](MODULE_MAP.md) contains S16–S21's exact public contracts. Component GREEN is separate from full production acceptance and from live deployment/native distribution evidence.

## Original component evidence, 2026-11-13

| Brick | Recorded RED | GREEN evidence |
| --- | --- | --- |
| S16 manifest | `offline-s16-red.log`: missing implementation | 4 unit tests; literal demo; strict types/module checker |
| S18 cache | `offline-s18-red.log`; `offline-s18-browser-red.log` exposed an unbound browser fetch port in the demo | 10 unit tests; real Chrome CacheStorage install/audit/serve; bounded warm-path digest work, range semantics and all pointer-publication quota boundaries |
| S19 worker | `offline-s19-red.log`; `offline-s19-audit-claim-red.log` pinned duplicate audit and changing-client claim races | 8 unit tests; real install/control, offline reload, unvisited lazy fetch, and A→B waiting across two tabs |
| S17 build | `offline-s17-red.log`: missing implementation | 4 real Vite build tests; complete isolated production inventory; missing lazy family/source/symlink/25 MiB rejection |
| S20 client | `offline-s20-red.log`; `offline-s20-retry-red.log` pinned unsupported retry and starting-promise race | 6 unit tests; actual Chrome failed B retains A, offline reload, repair and waiting B with typing retained |
| S21 status | `offline-s21-red.log`; `offline-s21-action-red.log` pinned a hidden failed-action message | 5 unit tests; actual XP footer at 1280×720, panel bounds, Escape focus and typing focus retained |
| Launcher seam | `offline-launcher-red.log`: missing worker silently reused | Real temporary Vite/launcher processes rebuild missing worker/manifest, changed public asset or generator, and reuse a complete fresh output |
| Root route correction | `offline-s18-root-red.log`: 307 index response rejected | The one index download uses `/`; exact index cache key, bytes/hash/MIME/headers and redirect rejection remain; full 33 unit + 4 builder + 1 launcher cases pass |

Logs and temporary screenshots above are under `/tmp/gsnv-consumer-qa/`. `offline-brick-browsers.log` records three Chrome component browser cases passing after the root-route correction. `offline-status-demo.png` was visually inspected. Implementation files pass the modular checker and focused strict TypeScript. No new dependency, backend, upload or telemetry was added.

The test-process server is `dev/offline-test-server.ts` rather than the plan's `.mjs`: it has the same read-only loopback HTTP contract, with typed process-local A/B and one-response-fault controls. No mutation route is exposed to the browser. Tiny fixtures set `publicDir:false` so production routing metadata is not mistaken for a fixture asset.

## Historical production candidate and gate

Parent froze build `861d2ade73ed17b72efeac925f4800c7a9ce27a1ec52636d6f7723b23ddafafd`: 55 precached files / 41,149,294 bytes; 58 total output files / 41,178,942 bytes; largest file 22,942,327 bytes. Every file is below the exclusive 25 MiB bound. Files were copied to `/tmp/gsnv-consumer-qa/offline-production/a` and independently rehashed before browser tests.

The B fixture retains the frozen app/runtime asset bytes, changes only the HTML build identity, recalculates its hash, and bundles the actual worker with the new manifest. This isolates version-lifecycle behavior from unrelated editor changes. Its ID is `7fb9c3bdabe51c996292d2cf34fdffab9b583f5b1a05141f9fd08d424bd61d01`.

The fresh-checkout command builds production output and generates its own isolated A/B copies; it does not depend on an earlier `/tmp` fixture:

```sh
npm run test:offline
```

The default uses installed system Chrome and does not silently change browsers. To select the already installed Playwright Chrome for Testing explicitly, discover and inspect its executable/version, then pass it to the entire nine-case suite:

```sh
offline_chrome_path="$(node -e "process.stdout.write(require('playwright').chromium.executablePath())")"
"$offline_chrome_path" --version
GSNV_OFFLINE_CHROME_PATH="$offline_chrome_path" npm run test:offline
```

This environment's verified executable is `/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`, version `158.0.8127.18`. The override affects both persistent production profiles and the four small component fixtures. Commands against a separately copied, frozen production build are:

```sh
node --import tsx dev/offline-production-fixture.ts dist /tmp/gsnv-consumer-qa/offline-production
GSNV_OFFLINE_CHROME_PATH="$offline_chrome_path" node_modules/.bin/playwright test --config dev/offline.playwright.config.ts
node --test launcher/offline-freshness.test.mjs
```

`src/shared/offline.browser.spec.ts` owns port4217, separate from the tiny fixtures'4197 and parent's actual static-host check. It uses disposable persistent Chrome profiles, first installs without creating CAD geometry, importing RAW or opening Code, then closes the entire browser and stops the server. The app initially displays its empty CAD tab; the test immediately selects Document and asserts zero dedicated workers before shutdown. A new browser process with network offline performs first engine loads and all nine workspace native/edit/export paths. No user profile or existing project is used.

The original production gate covered these paths; its initial failure and later repair evidence follow:

- Cold process restart, root navigation with server stopped, first CAD solver/B-rep/STEP, RAW decode, Python stdlib and JS/HTML/CSS/Stop, nine native save/reopen/export journeys, fonts/icons and isolated worker responses.
- Failed B status/digest/header variants retain A through cold restarts; complete B waits for two dirty tabs, native beforeunload cancellation, explicit saves and closing all tabs.
- Evicted lazy asset and denied CacheStorage cause visible failure while editing continues; retry repairs; malformed/opaque messages cannot mutate the installer; unknown JS returns no cached HTML.

The cold all-nine case passed on system Chrome `154.0.8037.97` in 36.8 seconds (`offline-cold-final-browser.log`), and the real local-launcher shutdown/offline-restart case passed in 4.9 seconds (`offline-local-launcher-browser.log`). Eviction/repair and unresponsive-tab refusal also passed. These initial individual results did not establish an update-gate pass; the final combined result appears below.

## Browser and recovery failures retained separately

System Chrome `154.0.8037.97` crashes with SIGSEGV during a later download after persistent-profile restarts. The standalone [browser-only reproducer](offline-browser-download-repro.mjs) contains no app, service worker, CacheStorage or IndexedDB. It retains the initial download, restarts the browser twice, exercises native beforeunload Stay, then verifies the second download. The crash also reproduced headed and with standard named retained browser downloads. No app storage or browser history was cleared to work around it.

```sh
DEBUG=pw:browser node dev/offline-browser-download-repro.mjs
GSNV_CHROMIUM=1 DEBUG=pw:browser node dev/offline-browser-download-repro.mjs
```

The first command is recorded RED on Chrome 154 in [the raw failure log](evidence/offline-chrome154-download-restart.log). The explicit full Chrome for Testing 158 command is GREEN in [the raw success log](evidence/offline-chrome158-download-restart.log). This is evidence about those browser builds, not an application fix or a claim that Chrome 154 passed the update case.

The initial Chrome for Testing 158 update run passed the three failed-download variants, old A's cold CAD/Python/native-file journeys, native beforeunload Stay, explicit file saves and natural B activation. The subsequent exact restored-Document assertion exposed a separate stale-recovery defect after the synthetic readwrite denial was removed. The test preserves the latest A native file as an independent oracle, uses real `runBeforeUnload` closes with explicit native-dialog handling, and records both stores read-only before and after B startup. It retains the exact latest-text expectation; no data rewrite, fixed delay or skipped assertion substitutes for recovery.

The [34.5-second RED run](evidence/offline-recovery-browser-red.log) confirms this application defect. Its [read-only store snapshots](evidence/offline-recovery-stores-red.json) show the 300-byte latest Document in Recent immediately before B startup, while Recovery generation 3 has the older 287-byte Document. After startup, both stores contain that older 287-byte package. The [saved A native file](evidence/offline-recovery-saved-A.gsnv-document) independently contains the exact latest text, `pending document 7391 during update before close`. The initial denied-write close prompted Stay; final closes after explicit saves had no warning. The repair belongs to the shared application persistence contract, not the offline cache. That failed candidate did not satisfy the recovery gate; the later repaired results follow.

The recovery defect above is now repaired and independently reproduced GREEN on
an isolated production candidate: [exact recovery evidence](RECOVERY-CONSISTENCY.md#parent-browser-reproduction),
1 passed in 30.8 seconds on Chrome for Testing 158. The original RED evidence is
retained. The [fallback-retention and Retry repairs](OFFLINE-RETAIN-REPAIR.md)
were then implemented before the parent ran the current combined offline gate.

After reviewing the full procedure and final combined results, the parent credited SYS-010 PASS in the requirements ledger. The [parent checkpoint](MODELING-OFFLINE-CHECKPOINT.md) records that bounded disposition. Actual hosted Pages responses, M1a packaging, other operating systems and untested browsers remain separate UNTESTED gates.

## Current combined offline gate

Frozen build `9980ea171176a67ab825a15083838fed0849060cd52c8d6857652d75cf6efaa2`
contains 55 required assets totaling 41,154,578 bytes. The parent independently
ran the complete suite with the current recovery, Save guard, retention and
Retry repairs:

```sh
GSNV_OFFLINE_CHROME_PATH=/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome node --import tsx dev/run-offline-tests.ts
# 9 passed (1.6m); exit 0
node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts
# 1 passed (11.4s); exit 0
```

The first command prepares fresh temporary A/B candidates from the frozen
production output and uses disposable profiles on Chrome for Testing
158.0.8127.18. It
proves full process restart with the server stopped, first-use CAD/RAW/Python
loads and editable/native/export journeys in all nine workspaces; failed
updates, dirty-tab Stay, restored-storage Save and natural activation preserve
the final project bytes. Eviction, denied storage, an unresponsive existing
tab and source-launcher shutdown cases also pass. The second command uses system
Chrome 154.0.8037.97 and verifies
every asset's exact bytes/hash/MIME/isolation, physical-index canonicalization,
bootstrap cache policy and network-disabled reload through real local Wrangler.

[Offline output](evidence/modeling-offline-browser-offline-green.log) and
[static-host output](evidence/modeling-offline-static-host.log) preserve the raw
results. The same candidate also passes all **89 default browser checks in
4.0 minutes**, recorded in the [default browser output](evidence/modeling-offline-browser-green.log).
The [parent checkpoint](MODELING-OFFLINE-CHECKPOINT.md) owns the combined results
and final requirement disposition. These results do not overwrite the Chrome
154 restart failure or establish live hosting, M1a distribution or acceptance on
other platforms.
