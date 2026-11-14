# Slides chooser interception diagnosis

Read-only specialist diagnosis on frozen build `8d6ddc95d851f7e7350cfbc25946cceb4be161e4151a4555b2dbeee0c22814fe`; private Vite preview on 127.0.0.1:4209 with `configFile:false`. Installed Playwright 1.65.0, desktop Chrome channel, headless, viewport 1280×720. No repository, production, shared build, launcher or Git changes were made by this diagnosis. Parent owns any fixture correction and canonical revalidation.

## Conclusion and confidence

The existing public persistent-listener fixture contract applies to Slides. Its one-shot picture import and native-open waiters use the exact installed Playwright subscription machinery previously observed racing the keyboard command in CAD. A persistent `page.on('filechooser', () => {})` during setup, before navigation, keeps interception active after each one-shot waiter is removed. Keep the per-action waiters, Ctrl+N/Ctrl+O sequence, all native bytes/PDF/history assertions and console checks unchanged. No product, sandbox, focus, delay, retry or console-filter change is warranted by this evidence.

The specific historical Slides failure in `dev/evidence/profile-face-frozen-browser.log` was not reproduced with boundary instrumentation. Its attribution to the shared interception race is **inferred**, not established. The known separate tracing/sandbox snapshot artifact remains separate; no tracing was used here.

## Installed source boundary

`node_modules/playwright-core/lib/coreBundle.js:59222–59255`: the first `on`/`addListener` starts `channel.updateSubscription(...).catch(...)` without awaiting it; removing the last listener likewise disables the subscription. The server's `updateSubscription` at 55572–55578 awaits `setFileChooserInterceptedBy`, whose delegate update at 24439–24449 awaits Chromium's `Page.setInterceptFileChooserDialog` at 39857–39862. Thus starting a one-shot event wait is not an awaited protocol-arming barrier before the next keyboard call. This source applies to all workspaces, including the original Slides test.

The direct CAD late-ACK/missed-chooser reproduction and public-listener control are preserved separately in `dev/CAD-REOPEN-DIAGNOSIS.md` and `dev/evidence/cad-chooser/`; they demonstrate the general mechanism, not the cause of this uninstrumented Slides occurrence.

## Private observations

1. Baseline diagnostic retained the original complete Slides setup/editing/PDF/native validation, then repeated Save → New → immediate Ctrl+O → native reopen. It had **19 successful native reopen transitions**, plus the initial picture import: protocol has 20 interception enables, 20 disables and 20 chooser events. Every captured native-open enable ACK preceded its Ctrl+O key-down ACK. There was no missed chooser and no late-arming failure in this run.

   The proposed twentieth transition did not begin: after the nineteenth recorded reopen, the loop sent another Ctrl+S and waited for a further download until the global 90-second timeout. Its last Save dispatch was acknowledged without another download event in the retained protocol. The timeout closed the page, so the diagnostic error handler's later `page.evaluate` also failed and no final event buffer could be obtained. This is an incomplete loop diagnostic, **not a passing full test and not a reproduction of the original chooser miss**. The cause of this separate repeated-download wait was not investigated or attributed. Raw log and 19 success records are retained rather than discarded.

2. Candidate retained the same complete setup and downstream independent PDF/native/history/console/network assertions, and used the public persistent listener before navigation. Ten bounded repeated native reopen transitions completed: **1 test passed in 4.9 seconds, exit 0; 10/10 transitions**. The repeat-only download waiter and native chooser waiter were bounded at 8 seconds to prevent another long diagnostic hang; the product actions and content assertions were unchanged.

   Main-session protocol: enable sent at raw line 76; ACK at line 79; initial `Page.navigate` at line 81. Exactly one enable, zero disables, eleven chooser events (picture import plus ten native opens). The in-page observer recorded ten Ctrl+O capture/bubble pairs, all within #app with document focus and transient activation, every bubble consumed; eleven file-input clicks and changes; zero file-input cancellations. All downstream PDF dimensions, native bytes, independent Document history, zero page/console errors and zero external-request assertions passed. This validates the fixture setup in this bounded control; it does not establish OS picker coverage or replace the parent's canonical full gate.

The observer only buffered synchronous DOM events and did not add a Node filechooser subscription in the baseline. No private Playwright channel or separate CDP interception session was used. DEBUG protocol logging and repetition can perturb timing, which further limits historical attribution.

## Reproduction commands

From `/home/goosnav/Desktop/code/gsnv-paint`:

```sh
SLIDES_CHOOSER_ARMED=1 DEBUG=pw:protocol node_modules/.bin/playwright test --config /tmp/gsnv-consumer-audit-20261113/security-scratch/slides-chooser-diagnosis/playwright.config.mjs
```

The current private spec is the bounded ten-transition candidate and toggles the listener with the environment variable. Exact baseline and candidate source copies are retained under `baseline/diagnostic-source.browser.spec.ts.txt` and `persistent/diagnostic-source.browser.spec.ts.txt`. Baseline ran without SLIDES_CHOOSER_ARMED and with its original 20-transition diagnostic source; avoid repeating that longer incomplete loop without a separate reason.

Evidence: each subdirectory contains `run.log`, `protocol-excerpt.log`, `protocol-summary.json`, `outcomes.json` and its exact source. `observations-summary.json` records the frozen manifest identity and event checks. `SHA256SUMS` inventories these artifacts and the inspected local source. Port 4209 was closed after cleanup. No further browser sessions are running from this diagnosis.

## Parent durable copy

Full baseline/persistent protocol logs are retained losslessly as `run.log.gz`
in each subdirectory. Their excerpts, summaries, exact diagnostic sources and
outcomes remain plain text. The original temporary paths above identify the
executed runs; the copied diagnostic config is `diagnostic-config.mjs.txt`.
This evidence does not change any application file.
