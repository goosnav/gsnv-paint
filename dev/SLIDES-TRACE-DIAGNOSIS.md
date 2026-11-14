# Slides print sandbox and optional tracing

2026-11-13, frozen production build
`9980ea171176a67ab825a15083838fed0849060cd52c8d6857652d75cf6efaa2`.
Linux x64, Chrome 154.0.8037.97, Playwright 1.65.0, 1280 × 720.

The optional traced full-suite run returned 88 passes and one failure. Slides
completed its editing, PDF geometry, native reopen and history assertions, but
the final empty-console assertion saw two Chrome sandbox warnings from its two
script-free print frames. This run remains a failure, with
[its full output preserved](evidence/modeling-offline-browser-traced-red.log).

A read-only isolated copy retained every original workflow action and assertion:

| Configuration | Observed result |
|---|---|
| No tracing | [1 passed in 4.0s](evidence/slides-untraced-workflow.log) |
| Tracing with DOM snapshots | [1 failed, same two warnings](evidence/slides-traced-workflow-red.log) |
| Tracing with `snapshots:false`, screenshots enabled | [1 passed in 5.2s](evidence/slides-traced-no-snapshots-workflow.log) |

The [minimal reproduction](evidence/slides-trace-minimal.mjs.txt) creates a
script-free iframe without loading any application code. Its sandbox is always
`allow-same-origin allow-modals`. The
[four-case raw result](evidence/slides-trace-minimal-results.json) shows zero
errors without tracing and one blocked-script warning with DOM-snapshot tracing,
both with and without the file-picker init script. Each case verifies zero script
elements and identical frame content. This isolates optional snapshot tracing
as sufficient to cause the warning; the warning contains no callback stack.

No product, sandbox or console assertion was changed. The canonical gate runs
without optional tracing. When diagnosing this print path with traces, disabling
DOM snapshots is the tested configuration. The ordinary workflow pass does not
smoke-test the native OS print dialog. Final combined results belong to
[the current checkpoint](MODELING-OFFLINE-CHECKPOINT.md).
