# Read-only CAD Save → New → Open diagnosis

Candidate: `9980ea171176a67ab825a15083838fed0849060cd52c8d6857652d75cf6efaa2`. Linux x64, installed desktop Chrome 154.0.8037.97, 1280×720, headless Playwright. This report does not establish human acceptance or production-browser coverage beyond the recorded checks.

## Original unresolved failure

Parent default suite returned **88 PASS / 1 FAIL**. `src/cad/cad-step-import.browser.spec.ts:42` timed out waiting for the filechooser after Save → Ctrl+N → assertion that the new parametric properties are visible → Ctrl+O. The Ctrl+O press itself returned. I read the original error-context at `test-results/cad-cad-step-import.browse-a6353-TL-export-and-native-reopen/error-context.md` during diagnosis, but did not preserve a separate copy. The intended conditional copy ran after that source artifact was unavailable and silently skipped it; the earlier preservation claim was incorrect. Parent independently retained the original 88/1 raw output in `/tmp/gsnv-consumer-qa/checkpoint-browser.log`.

The original snapshot I read had the new dirty Untitled part and `Draw a closed sketch, then extrude it.`, with Open enabled and no visible dialog. It does not record keyboard target, activation, asynchronous guard state or hidden file-input existence. Therefore the original evidence cannot distinguish dropped/outside-root keyboard delivery from blocked command dispatch or browser chooser denial. **No root cause for this failure has been established. No product repair is justified by these observations alone.**

## Source boundary inspection

The inspected runtime hashes matched the frozen candidate inventory for app-shell.ts, chrome.ts, input-adapter.ts and the three CAD facade/view modules before testing.

- `src/app/app-shell.ts` Open availability depends on initialization, adapter existence and `!opening`; Save and its recovery/Recent promises do not disable Open. `operate` can reject a command for disposed/modal state or a disabled menu entry. `open()` sets the opening guard, then immediately calls projectFiles → fileAccess; `mayReplace` runs after file selection/read, so it cannot delay the initial chooser.
- `src/shared/project-files.ts` and `src/shared/file-access.ts` contain no recovery/store await before the fallback file input is appended and clicked.
- Imported→parametric CAD replacement disposes the old child view and mounts a new stage. Parametric refresh and the outer shell both restore focus when the previously owned focus falls back to body. Successful observations demonstrate this path; the original timeout does not prove it failed.
- No global newing guard was found. There is no demonstrated Save guard leak.

## Reproductions with unchanged golden actions

1. One initial custom sequence succeeded, but it had extra observational evaluations and omitted some independent export validation; it is only preliminary evidence.
2. Original golden body with only absolute fixture/import paths, isolated copied dist/server on4204, and event observers: **5 PASS / 0 FAIL (36.6s)**. `--repeat-each=5` creates fresh workers and therefore does not establish cumulative warm-process behavior. Raw `/tmp/gsnv-consumer-qa/cad-open-isolated/run.log`; observation-0.json … observation-4.json.
3. Full original preceding sequence1–25 in a private /tmp copy of source/dependencies/dist, same env overrides and original ports, one worker, retained failure tracing: test24 failed for the independently confirmed service-worker/request-hold issue below; test25 then passed after worker restart. **This run is not a successful warm-process reproduction.** Raw `cad-open-cumulative/run-with-sw.log` and `results-with-sw/…/trace.zip`.
4. Same preceding sequence1–25 with only test24's context using serviceWorkers:block to restore its declared network-hold precondition, golden body unchanged and service workers still enabled for25: **25 PASS / 0 FAIL (1.4m)**, no worker restart. Raw `cad-open-cumulative/run-controlled-cancel.log`; synchronous `observations.jsonl`. No build or runtime changes.

5. One bounded renderer timing probe on isolated4204, CPU throttle6× before navigation, original90s timeout/action order and no action sleeps/focus workaround: **1 PASS / 0 FAIL (12.2s; test11.2s)**. Raw `cad-open-stress/run.log`; observation-0.json. This is a stress diagnostic, not a performance acceptance claim.

For case25 in run4, Ctrl+O window capture at4815.025ms targeted the connected new `.cad-stage`, composed path included `#app`, Open was enabled, `document.hasFocus()` true, visibility visible and transient user activation true. The fallback input click occurred4816.915ms. Bubble observed defaultPrevented true and one file input. Playwright emitted `filechooser`; source reopened and round-tripped. These observations disprove a persistent guard/focus defect in this run, **not** the original failure.

## Confirmed validation defect: service worker bypasses cancellation fixture hold

**P2 — `src/cad/cad-step-export.browser.spec.ts:51–62`: a worker constructor count was treated as proof that the module request was held.** The production offline worker can serve the module from CacheStorage before page.route sees it. Then a real export may complete before the test edits source; the assertion that no download occurred is not a controlled cancellation test.

Exact direct reproduction, original assertions retained:
- route-enter at1794633458342 for the first export worker;
- second export worker response at1794633459301 reports `response.fromServiceWorker() === true`, HTTP200;
- no second route-enter;
- `Untitled part.step` download at1794633459690;
- line62 expected[] but received['Untitled part.step'].

Raw `cad-open-cumulative/route-observation.jsonl`, `route-run.log`, retained trace under `results-route-proof/`. Trace also shows SW prefetch of the exact module followed by zero network-transfer script response.

Smallest boundary repair: block service workers only for tests whose fault injection explicitly holds worker-network requests; assert the intended request entered the held route before cancelling/editing. Keep production golden/roundtrip and dedicated offline tests service-worker enabled. Keep all cancellation/no-download/invalid-solid assertions. Parent has taken ownership of that test-only repair; no runtime cancellation flaw was demonstrated here.

## Limits and next discriminating evidence

The original Ctrl+O timeout remains a recorded unresolved result. Do not erase it, call it fixed, or substitute subset passes for a full gate. If it recurs, synchronous capture/bubble, root path, input click, activation and Playwright chooser event should locate the failing boundary. Product changes should follow that evidence, not a guessed focus or wait workaround. All diagnostic copies/output are under /tmp; original runtime/tests/shared dist were not edited by this diagnosis.

## Durable parent evidence

The parent retained the original full-gate failure in
[modeling-offline-browser-red.log](evidence/modeling-offline-browser-red.log),
[successful isolated runs](evidence/cad-reopen-isolated.log),
[controlled cumulative prefix](evidence/cad-reopen-diagnostic-prefix.log),
[synchronous events](evidence/cad-reopen-events.jsonl),
and [CPU timing probe](evidence/cad-reopen-stress.log). The cancellation
[route failure](evidence/cad-cancellation-route-red.log) and
[direct service-worker observations](evidence/cad-cancellation-route-observation.jsonl)
are separate from the unresolved Open timeout. The
[current checkpoint](MODELING-OFFLINE-CHECKPOINT.md) owns the final full gate.

## Follow-up: file chooser interception boundary

The subsequent default run also returned 88/89, this time at the consumer
plate's Save → New → Ctrl+O transition. Its original
[output](evidence/modeling-offline-browser-canonical-red.log) and
[page snapshot](evidence/cad-consumer-open-error-context.txt) are preserved.
Unlike the first import failure, a low-overhead repeated real-application
control reproduced this failure with capture/bubble and native-input events.
Ctrl+O reached the connected CAD stage inside the application root, Open was
enabled, and the page had focus and transient activation. The application
created and clicked the file input and prevented the shortcut's default
action; headless Chrome immediately cancelled the native input.

Protocol logging reproduced the same failure on transition 5. Playwright sent
`Page.setInterceptFileChooserDialog(enabled:true)` but did not receive its
acknowledgement until **after** the Ctrl+O key-down and key-up acknowledgements.
No `Page.fileChooserOpened` event followed. An isolated diagnostic which awaited
Playwright's own main-session subscription passed 20 consecutive transitions.
The product's keyboard/focus/Save guards do not account for the captured
failure; asynchronous test interception does.

A separate-CDP-session attempt is retained as a failed diagnostic: it prevented
native cancellation, but the chooser event went only to that separate session
while Playwright's main session was still arming. That is not a valid positive
control for Playwright's waiter. Private Playwright channels and this separate
session are excluded from committed fixtures.

### Test-fixture contract before correction

For the two affected production golden tests, subscribe to `filechooser` with
the public `page.on` API during initial test setup, before navigation, and keep
that subscription until page cleanup. This establishes persistent interception
before user actions and prevents a one-shot waiter's removal from toggling it
off between file operations. The existing per-action `waitForEvent`, Ctrl+O,
native file contents, independent kernel checks, history assertions, original
timeouts and action order remain unchanged. Do not add sleeps, focus changes,
automatic retries, console filtering or runtime workarounds.

Validate the public-API candidate in the bounded 20-transition control, then
run the original consumer/import files and the full default suite. This
test-only correction does not establish native OS picker coverage or erase
the original failures. Final outcomes and durable diagnostic artifacts will
be recorded below and in the checkpoint.

### Corrected fixture results

The [independent diagnostic report](evidence/cad-chooser/CAD-CHOOSER-ARMING-DIAGNOSIS.md)
preserves failed and successful controls, raw protocol excerpts, event buffers,
fixture sources and frozen source hashes. Both the awaited main-session
diagnostic and the public persistent-listener candidate passed 20/20
transitions. The parent then applied only the public listener during setup to
the two golden tests, retaining their original action order and assertions.

`node_modules/.bin/playwright test src/cad/cad-consumer.browser.spec.ts src/cad/cad-step-import.browser.spec.ts`
returned **4 passed (20.4s), exit 0**; [raw output](evidence/cad-chooser-focused-green.log).
`npm run typecheck` returned **exit 0**;
[output](evidence/cad-chooser-types-green.log). These fixtures changed no
production bytes. The root cause of the captured repeated consumer failure is
observed; attribution of the earlier uninstrumented canonical occurrences,
especially imported STEP, remains inferred. The full default gate is recorded
separately in the checkpoint, not substituted by these controls.

The parent canonical command
`AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 BRIDGE_WORKSPACE_APP=1 node_modules/.bin/playwright test`
then returned **89 passed (4.0m), exit 0** on the unchanged production build;
[complete output](evidence/modeling-offline-browser-green.log). This closes the
current combined test gate while retaining the historical failure and platform
limits above.
