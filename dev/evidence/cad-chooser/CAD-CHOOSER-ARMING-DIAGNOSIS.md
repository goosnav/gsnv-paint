# CAD Save → New → Open: chooser interception diagnosis

Read-only checkpoint review, 2026-11-13. Frozen production candidate `9980ea171176a67ab825a15083838fed0849060cd52c8d6857652d75cf6efaa2`; Linux x64, desktop Chrome 154.0.8037.97, headless Playwright 1.65.0, 1280×720. No repository source, tests, configuration, shared build, or `dist` were changed by this diagnosis. Private tests served the frozen copy on 4209. No human acceptance or other-browser/OS claim is made.

## Finding

**P2 — Browser-test filechooser interception is armed asynchronously and can lose an immediate keyboard-triggered chooser.** This is reachable in the exact authored CAD part's Save → New → Ctrl+O workflow. The application receives the shortcut with focus and transient activation, executes its fallback file-input click, and prevents the shortcut's default action. The missing chooser occurs before Playwright's main CDP session has completed interception setup. No application focus, Save guard, or Open-command repair is warranted by the reproduced failures.

The canonical full suite twice recorded **88 PASS / 1 FAIL**: first the imported-STEP native reopen test, later CAD consumer test18 (`src/cad/cad-consumer.browser.spec.ts:53`). Those failures lacked synchronous/protocol observations, so attribution of each historical occurrence remains an inference from the matching, now-reproduced failure boundary. The originals remain failures until the corrected test harness is rerun; these controls do not replace the full gate.

The original imported-STEP error-context was read but not separately preserved; an earlier report's preservation claim was corrected. The later consumer error-context is preserved at `cad-consumer-original-error-context.md` (13,762 bytes), with parent's durable copies `dev/evidence/modeling-offline-browser-canonical-red.log` and `dev/evidence/cad-consumer-open-error-context.txt`.

## Controlled real-app evidence

Each transition control builds the original consumer acceptance plate through the real UI and retains its two native STEP volume checks. It finishes in the same Cut 1 properties / imperial→metric conversion context, saves a native project, creates New, then uses the original immediate `waitForEvent('filechooser')` → Ctrl+O → setFiles sequence and verifies the exact 68654.425 mm³ reopened volume. Iterations after the first reselect Cut 1 because reopening correctly selects Sketch 1. Controls stop on the first failure and cap at 20 transitions. The diagnostic chooser timeout is 8 seconds; original 90/180-second canonical timeouts are not reclassified or changed.

The primary observers are synchronous, compact, in-memory keydown capture/bubble plus file-input click/cancel/change. They record event target/path, connected active element, focus, activation, prevented default, and Open/input state. They do not add focus, sleeps, an early chooser listener, or per-key Node logging. Evidence is retrieved after the outcome.

| Control | Result | Boundary evidence |
| --- | --- | --- |
| Original immediate sequence, compact observers | First transition failed | Connected CAD stage/root, focus/activation true; input click 7107.300 ms, prevented bubble 7107.500 ms, native input cancel 7108.000 ms; no chooser. |
| Same sequence, protocol log | Four transitions passed; fifth failed | Main interception ACK arrived after KeyO down and up ACKs; app dispatched correctly; input canceled; no chooser event. |
| Await separate diagnostic CDP-session interception | One passed; second failed | Native chooser event arrived only in diagnostic session before main-session interception ACK. No input cancel. This is not a valid positive control for the main session. |
| Await main Page-channel subscription (diagnostic only) | **20/20 passed**, 1 test passed (34.1 s) | Twenty main enable ACKs precede twenty keydowns; twenty chooser events; zero native cancel. |
| Public persistent Playwright listener before navigation | **20/20 passed**, 1 test passed (33.1 s) | One main enable ACK before initial navigation; twenty chooser events; no disabling/rearming and zero native cancel. |

An initial private loop preparation error, after one successful transition, expected Cut 1 details while reopened Sketch 1 was selected. It is retained under `cad-consumer-transition-control/selection-setup-failure/`; it is not a chooser failure. The corrected control selects Cut 1 before repeating the original final unit-conversion context.

## Exact protocol discriminator

Line numbers below are one-based in the respective raw `run.log`. Compact parsed records, including send and ACK ordering and CDP session IDs, are in each folder's `protocol-chooser-summary.json`.

Unarmed failed fifth transition (`cad-consumer-transition-protocol`): main session `6F6C1BA152F20406F47A505A84572322`.

1. Line3819: send interception enabled, id1304.
2. Lines3822–3825: KeyO rawKeyDown id1306 and keyUp id1307 both execute and ACK.
3. Line3828: interception id1304 finally ACKs.
4. No `Page.fileChooserOpened`; in-page buffer records valid root dispatch/click followed by input cancel.

Separate-session failed second transition (`cad-consumer-transition-armed`): diagnostic session `56F97EA47D83874310F18F30C9C8F104`, main session `778CF70C2AA69B8FE0C87D87B471388F`.

1. Lines3081–3082: diagnostic interception id1010 ACKs.
2. Line3083: main interception id1011 sent.
3. Lines3086–3088: main KeyO dispatches.
4. Line3089: diagnostic session alone receives `Page.fileChooserOpened`, backend node106.
5. Line3090: main interception id1011 ACKs; the main session never receives that chooser. The input is not canceled because another session already intercepted it.

Main-channel positive control (`cad-consumer-transition-main-armed`) uses the installed private `_channel.updateSubscription({event:'fileChooser', enabled:true})` solely to establish causality, before the original wait/key pair. It must not be committed as product/test API. All 20 interception ACKs precede their keydowns; all 20 native chooser events reach Playwright.

Public-API positive control (`cad-consumer-transition-public-armed`) adds only `page.on('filechooser', () => {})` before initial navigation and leaves it installed until page close. In its raw log interception sends line75 / ACKs line79; initial navigation sends line81; first KeyO sends line2871. The same main session receives all 20 chooser events, with no disabling command during the test.

## Source corroboration

Installed primary source: `node_modules/playwright-core/lib/coreBundle.js`.

- Lines59222–59226: first client listener calls channel `updateSubscription` fire-and-forget. `page.waitForEvent` registering a listener does not await browser interception readiness.
- Lines55572–55579: server Page subscription awaits `setFileChooserInterceptedBy` before registering its channel event subscription.
- Lines24439–24450: server changes interception ownership, then awaits the browser delegate when the state changes.
- Lines39857–39862: Chromium delegate awaits main-session `Page.setInterceptFileChooserDialog`. The keyboard command can run independently while that acknowledgement is pending.
- Chromium `_onFileChooserOpened` at39735 then adopts the backend node for the main session. A different CDP session's event does not imply Playwright received its own event.

Application inspection remains consistent with the observations: `open()` synchronously reaches fallback input creation/click before any file-selection or recovery work. It sets `opening = true` without immediately rendering, so an Open-enabled error snapshot is not evidence that the shortcut was ignored. The observed native cancel resolves the input normally and explains the final enabled Open/New-document snapshot.

## Smallest proposed repair and verification

Repair only the affected browser-fixture lifecycle: register a persistent public `page.on('filechooser', noop)` listener before initial navigation and keep it for the test/page lifetime. It keeps Playwright's main interception armed instead of toggling it around each immediate keyboard-triggered chooser. Preserve the existing waitForEvent/key order, real selected file, native format/volume/STEP assertions, test timeouts, service-worker coverage, and application source. No focus workaround, extra delay, private channel use, or chooser bypass is proposed for committed fixtures.

Parent owns any test-only contract/documentation changes and rerun. The necessary completion check is the unchanged production candidate's full default browser suite with the bounded fixture change, plus preservation of original failure evidence. The 20-cycle controls verify only this boundary and do not pass additional CAD requirements or performance targets.

## Evidence and reproduction

All directories below are under `/tmp/gsnv-consumer-qa`:

- `cad-consumer-transition-red`: first corrected original-sequence failure, preserved before reruns; `failure.json`, `failure.png`, `outcomes.json`, original private source/config/log.
- `cad-consumer-transition-protocol`: unarmed four-success/fifth-failure run and compact protocol summary.
- `cad-consumer-transition-armed`: separate-CDP-session one-success/second-failure run and compact protocol summary.
- `cad-consumer-transition-main-armed`: private main-channel causal control, 20 transitions pass; source/config/log/outcomes/compact protocol.
- `cad-consumer-transition-public-armed`: public lifecycle candidate, 20 transitions pass; source/config/log/outcomes/compact protocol.

For each protocol variant, repository cwd was `/home/goosnav/Desktop/code/gsnv-paint` and command was:

```sh
DEBUG=pw:protocol node_modules/.bin/playwright test --config /tmp/gsnv-consumer-qa/<variant>/playwright.config.ts > /tmp/gsnv-consumer-qa/<variant>/run.log 2>&1
```

Earlier successful isolated/cumulative diagnostics that installed a Node `page.on('filechooser', observer)` before navigation unintentionally prearmed the same interception; their green result is confounded for the original race. The no-early-listener cumulative prefix1–18 passed once, and a separate minimal no-app control passed40/40; neither disproves this timing-dependent boundary in the real app. Full earlier context and the separately confirmed service-worker bypass of cancellation fault-injection routes are retained in `CAD-REOPEN-DIAGNOSIS.md`.

Compact preservation bundle: `cad-chooser-diagnosis-evidence/` contains this report, exact raw protocol/output excerpts, failed/positive outcomes with synchronous event buffers, source/fixture hashes, and the two successful control sources/configs. Full raw logs remain in the private variant directories. The compact excerpts are labeled with original one-based raw-log lines and are not a substitute for those logs.
