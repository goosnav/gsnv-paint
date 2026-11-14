# Analytic profile-face checkpoint

2026-11-13. First implementation step of the committed
[production revolve contract](CAD-REVOLVE-INCREMENT.md), under the owner's
standing BATCH authorization. C77 and its C59 integration are GREEN; no brick
is human-ACCEPTED. Production revolve, CAD-071 and the later recipe/executor/
editor gates remain untested. No new requirement receives a pass from this step.

## Scope and decisions

C77 is a worker-local SHELL adapter. It converts the existing validated C64
polygon/circle region, including disjoint holes, into one analytic face. A
successful return transfers one raw face wrapper to the caller after every
other wrapper has been deleted in reverse allocation order. Ordinary builder
rejections return exact tags after cleanup. Any unexpected, numeric, WASM or
cleanup exception propagates without further native calls; the worker owner
must terminate it.

C59 now consumes C77's face and constructs the same signed-depth extrusion.
Its original inputs, six ordinary error messages, analytic geometry and STEP
behavior stay characterized. The explicitly contracted ownership amendment
completes cleanup before retaining the final solid, and permits cleanup only
for the exact deliberate error created by that call. An unset error sentinel
cannot treat `throw undefined` as safe.

The choice to preserve analytic circles avoids the geometric loss of sampled
contours. The existing +Z outer/−Z inner-circle convention remains unchanged.
No native exception is classified as safe merely because of its name. Revisit
these decisions only with a replacement analytic-profile contract or verified
native recovery, respectively. There are no user-adjustable tolerance constants
in C77/C59; validated geometry and finite nonzero depth remain caller inputs.

## Inherited caller defect found during review

Independent review reproduced a C65 cut-path violation of its existing header
guarantee, “Native faults stop further native calls and require whole-worker
termination.” An unexpected error from C77 passed through C59, then C65 deleted
its earlier native volume-properties object. The new regression test observed
that exact forbidden call before repair. The edge-feature branch had the same
denylist weakness.

Forward revolve work paused for contract assessment. The reviewer corrected an
initial suggestion that a public amendment was needed: the minimal fix enforces
the existing promise. C65 now grants cleanup permission only to an exact locally
originated deliberate error. Unknown/nested failures abandon remaining wrappers
to worker termination. Existing diagnostic messages/passthrough, successful
geometry and success ownership timing are preserved. C55 already terminates
failed jobs; worker source inspection found no enclosing catch that performs
native cleanup on the new path.

C65's equivalent four-value edge-set type is now stated at its own boundary,
removing an unnecessary dependency on editable document source. Its existing
contract was missing from the module map and is now inventoried with C01/C64/C59
as collaborators. This repair does not add feature scope or promise native
recovery. C65's earlier retention order on normal success was not refactored.

## Executed tests

Commands run from the repository root on Linux x64 / Node 24.21.0.

| Gate | Observed result |
| --- | --- |
| Existing C59 plus new characterization, before extraction | 6/6 passed, exit 0; [output](evidence/profile-face-characterization.log) |
| C77 testbench before implementation | 7 failed, exit 1 as expected; [RED output](evidence/profile-face-red.log) |
| C77 focused testbench | 7/7 passed, exit 0; [first GREEN](evidence/profile-face-green.log) |
| C59 amended lifetime before repair | 2 failed, 2 passed, exit 1; [RED output](evidence/prism-ownership-red.log) |
| C77/C59 combined tests after extraction | 17/17 passed, exit 0; [output](evidence/profile-prism-green.log) |
| Reviewed C77 area/centroid and complete cleanup matrix | 17/17 passed, exit 0; [output](evidence/profile-prism-reviewed-green.log) |
| Inherited C65 caller-fault regression before repair | 2 failed, exit 1; [RED output](evidence/profile-caller-fault-red.log) |
| C77/C59/C65 plus part, plane, worker and STEP seams | 51/51 passed, exit 0; [output](evidence/profile-face-seams-green.log) |
| `npm test` after caller repair | 923 passed; 0 failed/cancelled/skipped/todo; exit 0; [output](evidence/profile-face-final-unit.log) |
| `npm run build` after caller repair | TypeScript and Vite exit 0; vendor conditional-import/large-chunk and build-timing warnings retained; [output](evidence/profile-face-final-build.log) |
| Method checker on C77, C59, C65 | 3 PASS, exit 0; [output](evidence/profile-face-module-reviewed-green.log) |
| `npm run test:offline-build` | 4/4 passed, exit 0; [output](evidence/profile-face-offline-build.log) |
| `npm run test:launcher` | Smoke succeeded; 1/1 freshness case passed, exit 0; [output](evidence/profile-face-launcher.log); this command rebuilt `dist`, as explained below |
| `node_modules/.bin/playwright test --config dev/static-host.playwright.config.ts` on frozen build | 1/1 passed in 10.7 s, exit 0; Chrome 154.0.8037.97, Linux x64, headless 1280×720; [output](evidence/profile-face-static-host-green.log) |
| `WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig` | Exit 0, static assets recognized, no bindings; [output](evidence/profile-face-deploy-dry-run.log) |
| Production-enabled cumulative browser command below | 89/89 passed in 3.9 minutes, exit 0; same system Chrome/Linux/1280×720; [output](evidence/profile-face-browser-green.log) |
| `python3 dev/verify-spec.py` | 402 requirements, 214 module contracts and 18 design owners validated; exit 0; [output](evidence/profile-face-spec.log) |

Focused commands:

```sh
node --import tsx --test src/cad/kernel-profile-face.test.ts \
  src/cad/kernel-linear-prism.test.ts src/cad/kernel-prism-characterization.test.ts \
  src/cad/kernel-prism-ownership.test.ts
node --import tsx --test src/cad/kernel-feature-faults.test.ts \
  src/cad/kernel-features.test.ts src/cad/kernel-profile-face.test.ts \
  src/cad/kernel-linear-prism.test.ts src/cad/kernel-prism-characterization.test.ts \
  src/cad/kernel-prism-ownership.test.ts src/cad/acceptance-plate-planes.test.ts \
  src/cad/part-builder.test.ts src/cad/part-planes.test.ts \
  src/cad/cad-worker-client.test.ts src/cad/cad-step-export.test.ts
AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 BRIDGE_WORKSPACE_APP=1 \
  node_modules/.bin/playwright test
```

Original geometry expectations were not changed. The complete plate still
measures `56654.424808105 mm³` at 100 mm and `68654.424808105 mm³` at 120 mm,
with exact-volume STEP round trips and mm/inch binding. Native C77 face checks
use independent analytic area and centroid formulas, including a translated
circle and off-center circular hole; area alone would miss a translation.
Fake allocation traces cover every native/cleanup boundary and all ordinary
rejection cleanup positions, including plain errors, misleading error names,
numbers, `undefined`, `null`, strings and both WASM exception forms at the
C59/caller boundaries. These tests do not prove all future kernel operations.

The first C65 method-check invocation rejected its inherited PURPOSE wording
as multiple responsibilities. The header now describes the existing single
operation boundary; no implementation was changed to satisfy that diagnostic.
The [failed checker output](evidence/profile-face-final-modules.log) is retained.
The three final bounded modules stay below 200 physical implementation lines
and three direct brick dependencies. No assembly exemption was introduced.

## Verification sequencing correction

The first post-extraction browser run and the static-host check overlapped a
source-launcher smoke command that rebuilt shared `dist`. This was a parent
orchestration mistake. The launcher saw a newer source-header timestamp; its
rebuild generated a fresh build identity while verification still held the
previous manifest. The static host correctly failed `/index.html` SHA equality.
An inventory comparison shows every other manifest asset stayed byte-identical;
[the before/after manifests](evidence/profile-face-build-collision.json) and
[raw failed host output](evidence/profile-face-static-host.log) are retained.

The overlapping browser run returned 88/89: the Code workflow failed at initial
`page.goto` with `ERR_HTTP_RESPONSE_CODE_FAILURE`, before editor actions. That
failure is consistent with the shared output being rebuilt; exact attribution
of this uninstrumented navigation remains inferred. Its
[raw output](evidence/profile-face-browser-overlap-red.log) and
[page context](evidence/profile-face-browser-overlap-context.txt) remain intact.
Neither overlapping run is counted as a passing candidate gate. No product
code or assertion was changed in response. The affected browser and host gates
are rerun with a frozen build and no parallel launcher/build command.

The frozen static-host rerun passed exact asset hashes, MIME types, isolation
headers, root redirect and offline reload. Its manifest is
`8d6ddc95d851f7e7350cfbc25946cceb4be161e4151a4555b2dbeee0c22814fe`,
with 55 assets totaling 41,155,522 bytes, largest 22,942,327 bytes. The
[source inventory](evidence/profile-face-source-inventory.json) binds the
candidate to its source files. The Wrangler dry-run performs no remote deployment.

The first frozen cumulative browser run returned 88/89: Slides timed out
waiting for a file chooser after New → Ctrl+O. Its
[original output](evidence/profile-face-frozen-browser.log) is retained and
is not a passing gate. Five diagnostic repeats with optional DOM-snapshot
tracing completed the original workflow actions but failed the unchanged
empty-console assertion on two sandbox warnings per run; their
[output](evidence/profile-face-slides-reproduce.log) is also retained. Prior
independent diagnosis isolates those warnings to Playwright's snapshot
instrumentation, not application scripts. No sandbox or console-assertion
change is warranted.

Independent source/protocol review confirmed that Slides has the same
fire-and-forget chooser-subscription boundary already demonstrated in the
[CAD diagnosis](CAD-REOPEN-DIAGNOSIS.md). A repeated Slides control completed
19 reopen cycles, then exhausted its overall 90-second limit while awaiting
another download; it did not reproduce a missing chooser. Attribution of the
original uninstrumented Slides timeout therefore remains inferred.

Test-fixture contract before correction: add one persistent public
`page.on('filechooser', ...)` listener during the affected Slides test's initial
setup, before navigation. Keep all existing one-shot waiters, shortcut actions,
timeouts, native bytes, PDF geometry, history and empty-console assertions.
Do not add sleeps, focus changes, retries or production workarounds. This
establishes the same stable interception invariant as the two CAD goldens.

The independent public-listener control passed ten native reopen transitions
and the original downstream PDF/native/history/console assertions in 4.9 s.
Protocol acknowledged interception before initial navigation, with eleven
chooser events (picture plus ten projects), zero disables and zero input
cancellations. [The full diagnosis and losslessly compressed protocol logs](evidence/slides-chooser/SLIDES-CHOOSER-DIAGNOSIS.md)
retain both the incomplete baseline and successful bounded control.

After that setup-only correction,
`node_modules/.bin/playwright test src/slides/slides-workspace.browser.spec.ts`
passed both original tests in 5.9 s, exit 0;
[raw output](evidence/profile-face-slides-green.log). `npm run typecheck`
also returned exit 0; [output](evidence/profile-face-final-types.log).
No production file changed. The manifest stayed byte-for-byte identical;
the inventory records the single test-file hash change separately.

## Human demos and remaining scope

These are illustrations, not acceptance evidence:

- `node --import tsx src/cad/kernel-profile-face.demo.ts`: area
  `5921.460183660255 mm²`, caller-owned face;
  [output](evidence/profile-face-demo.log).
- `node --import tsx src/cad/kernel-linear-prism.demo.ts`: `60000 mm³`, zero
  retained shapes after release; [output](evidence/profile-prism-demo.log).
- `node --import tsx src/cad/kernel-features.demo.ts`: R5-corner plate
  `59785.39816339743 mm³`, zero retained shapes after release;
  [output](evidence/profile-feature-demo.log).

The cumulative browser and static-host gates for this increment are GREEN.
The 454 recorded source hashes and frozen manifest were checked after the
browser run. No additional requirement receives credit: the ledger remains
46 PASS, 0 FAIL, 356 UNTESTED. These are requirement statuses, not a claim that
every historical diagnostic passed. The earlier nine-case offline restart/
update gate was not rerun here; its evidence belongs to `9496858`.

The prior `9496858` checkpoint was pushed to main and Cloudflare's
Workers Builds check completed successfully; the exact remote check is retained
in [deployment evidence](evidence/modeling-offline-cloudflare-check.json). That
remote result does not certify this later increment or a hosted-browser
smoke test. Full consumer acceptance, broader CAD features and M1a packaging
remain open. No other browser or operating system is claimed.
