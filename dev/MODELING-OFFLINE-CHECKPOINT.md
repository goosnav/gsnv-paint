# Modeling and offline checkpoint

2026-11-13. Parent integration of the committed CAD/profile, persistent Image
selection, cross-workspace, offline, focus and recovery contracts. This is a
development checkpoint, not full consumer acceptance or M1a release approval.
The owner's BATCH authorization is retained; only the owner can accept bricks.

## Frozen candidate

Build ID: `9980ea171176a67ab825a15083838fed0849060cd52c8d6857652d75cf6efaa2`.
The manifest contains 55 required assets totaling 41,154,578 bytes. Largest:
OpenCascade WASM, 22,942,327 bytes, below the enforced 26,214,400-byte limit.
The production build includes every lazy CAD, RAW and Python runtime. Both
browser and source launcher consume this static output.

Test environment: Linux x64, Node 24.21.0, Chrome 154.0.8037.97. The dedicated
offline restart gate uses Chrome for Testing 158.0.8127.18. System Chrome 154
has an independently reproduced download-after-restart crash even without this
app, service workers or storage; its failed run is retained in
[offline evidence](OFFLINE-WORKFLOW.md). No pass is inferred for that browser
path, other browsers, Windows, macOS or physical input/audio hardware.

## Changes and bounded proof

- CAD: XY/XZ/YZ placement, editable centered rectangles and regular polygons,
  construction geometry, expressions and physical unit binding. Native solids
  and STEP use the same plane transform. Original 100/120-mm plate volumes stay
  `56654.424808105` and `68654.424808105 mm³`. See
  [modeling evidence](CAD-MODELING-EVIDENCE.md).
- Image: persistent gray8 selections and versioned native layer/selection
  content, exact scripted RGBA golden and editable native roundtrip. See
  [Image acceptance](IMAGE-ACCEPTANCE.md).
- Transfer: Image composite → Video bin, Video frame → Image, transparent CAD
  viewport → Image; source ownership, pending edits and replacement safeguards
  are tested. Video endpoint capture stays inside the last included frame.
  Full corrected-Video-frame acceptance remains untested. See
  [cross-workspace evidence](CROSS-WORKSPACE.md).
- Offline: complete hashed installation, natural update activation after tabs
  close, visible retry/errors, verified fallback retention and safe behavior
  under eviction, denial and corrupt updates. See
  [workflow](OFFLINE-WORKFLOW.md) and [fallback repair](OFFLINE-RETAIN-EVIDENCE.md).
- Recovery: exact generation/bytes acknowledged before Recent, divergence kept
  as an explicit recoverable copy, read-only startup and native Save retry after
  storage denial. File-write availability is separate from backup completion;
  old completions cannot unlock a newer write. See
  [recovery evidence](RECOVERY-CONSISTENCY.md).
- Focus: stable chrome controls preserve Save clicks across blur commits;
  disabled Video export controls hand keyboard focus to the application. See
  [chrome](CHROME-COMMIT-ACTIVATION.md) and [Video focus](VIDEO-EXPORT-FOCUS.md).

## Parent verification

Commands run from the repository root against the frozen sources. The combined
browser gate passes after correcting two test-fixture boundaries: network-held
STEP cancellation requests and asynchronous file-chooser interception. Runtime
bytes are unchanged by those corrections; original failures remain recorded.

| Command / gate | Observed result |
|---|---|
| `npm test` | 908 passed, 0 failed/cancelled/skipped/todo; exit 0; [output](evidence/modeling-offline-unit.log) |
| `npm run build` | TypeScript and Vite exit 0; vendor conditional-import and large-chunk warnings remain; [output](evidence/modeling-offline-build.log) |
| `npm run test:launcher` | Real source-launcher smoke PASS; freshness case 1/1; exit 0; [output](evidence/modeling-offline-launcher.log) |
| `npm run test:offline-build` | 4 passed, 0 failed/cancelled/skipped/todo; exit 0; [output](evidence/modeling-offline-offline-build.log) |
| Full production-enabled browser suite | **89 passed in 4.0m; exit 0**; [output](evidence/modeling-offline-browser-green.log) |
| Corrected CAD chooser fixture / TypeScript | 4 browser cases passed in 20.4s, exit 0; full TypeScript exit 0; [browser output](evidence/cad-chooser-focused-green.log), [type output](evidence/cad-chooser-types-green.log) |
| Dedicated offline restart/update suite | 9 passed in 1.6m; exit 0, explicit Chrome for Testing 158.0.8127.18; [raw output](evidence/modeling-offline-browser-offline-green.log) |
| Real local Cloudflare static host | 1 passed in 11.4s; exit 0. All 55 assets exact; isolation headers, root canonicalization and network-disabled reload; [raw output](evidence/modeling-offline-static-host.log) |
| `WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --no-autoconfig` | Exit 0; 60 output files read, no bindings, no upload; [output](evidence/modeling-offline-deploy-dry-run.log) |
| 34 bounded module checks | 34 PASS; exit 0; S18 211 and S10 210 implementation-line soft warnings; [output](evidence/modeling-offline-modules-corrected.log) |

The browser command was
`AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 BRIDGE_WORKSPACE_APP=1 node_modules/.bin/playwright test`.
It combines production workflows and component fixtures; it is not 89 separate
end-to-end production journeys. Earlier default runs returned 88/89 with
[an imported-CAD Open timeout](evidence/modeling-offline-browser-red.log) and
[a consumer-plate Open timeout](evidence/modeling-offline-browser-canonical-red.log).
The latter's [page snapshot](evidence/cad-consumer-open-error-context.txt) is retained.
The [read-only diagnosis](CAD-REOPEN-DIAGNOSIS.md) reproduced a chooser interception
race: the app dispatched correctly before Playwright finished arming Chrome's
file-dialog interception. Persistent public listeners installed before navigation
passed 20 consecutive controls and the complete suite. Attribution of the
uninstrumented historical occurrences remains inferred; no runtime focus or
keyboard workaround was added. A separate traced run's Slides warnings were
isolated to optional DOM-snapshot instrumentation; see
[the controlled tracing diagnosis](SLIDES-TRACE-DIAGNOSIS.md).

The first parent module-check invocation used two nonexistent adapter filenames
and exited 1. The corrected invocation used the actual declared paths and
passed. This was an invocation error, not omitted coverage. Generic checks for
the declared A-SHELL and Video assemblies, and inherited V-TIMELINE header/export
warnings, are not counted as brick-check passes; their scoped results remain in
the linked repair evidence. No new policy leaf is exempted from the hard cap.

Final source/config/document whitespace checking excludes `dev/evidence` and
passes. An unfiltered staged `git diff --check` reports 128 trailing-space or
blank-EOF diagnostics, all inside preserved raw test logs/error snapshots.
Those diagnostic bytes are retained unchanged; the unfiltered check is not
reported as a pass. The 446-entry source inventory matches the tested candidate,
with only the explicitly recorded browser-fixture hash amendments.

The production dependency advisory lookup reported zero current advisories;
this does not prove security. Earlier unavailable analyzers and unsupported
hardware/platform tests remain unverified in [readiness](CONSUMER-READINESS.md).

## Requirement disposition and remaining work

The full procedure in `requirements.json` controls each status. New verified
credits are **CAD-020, CAD-025, CAD-030, CAD-033, XWS-001, XWS-003 and SYS-010**.
The recorded ledger is **46 PASS, 0 FAIL, 356 UNTESTED**; the
[complete ID-by-ID matrix](06-TRACEABILITY.md) keeps every untested requirement
visible. Zero recorded requirement failures does not erase historical test
failures or turn unfinished requirements into passes. IMG-103/104 already have exact
golden/native proof. XWS-002 remains untested because correction composition is
not implemented; CAD-071 remains untested because production revolve is not
connected. The next CAD increment is
[the committed revolve contract](CAD-REVOLVE-INCREMENT.md).

The planned waveform Audio editor, Spreadsheet and browser JS/Python plus
HTML/CSS Code workspace are covered by [authoring evidence](AUTHORING-CHECKPOINT.md)
and rerun in this candidate. They do not imply music composition, full Excel
compatibility or a system terminal. General CAD history/tools, remaining Image
and Video scope, performance targets, drawing/exchange formats and M1a universal
ZIP packaging remain open. No phase completion, CANDIDATE_FOR_ACCEPTANCE or
live hosted deployment is asserted by local verification.
