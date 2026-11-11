# Phase 2 — CAD — in progress

C01–C04, C07–C08, C37, C50–C60, CAD-A1, CAD-APP and STEP-APP are GREEN. C05–C06, C09–C36 and C38–C49 remain PLANNED. No brick is human-ACCEPTED. The shared provisional assembly height remains 4; the CAD provisional assembly height is 3 (CAD-A1, CAD-APP and STEP-APP). C01 was pushed as 3ffb2c3, the C02 prerequisite repair as ebe578a, and C02 as 65a9a5d. CAD-A1 was pushed as 5853b7a and C03 as 04d6b9b. The latest named-variable checkpoint is recorded below. The complete product remains unfinished and is not a release candidate.

## C01 kernel-runtime — GREEN; BATCH halted before C02

Mode B under the owner's phase BATCH authorization. Contract: own a pinned OpenCascade WASM instance within a worker. Open/probe creates and validates a real 2×3×4 mm solid and checks its 24 mm³ volume. The public worker-local library/retain/resolve/release port transfers distinct live shape wrappers, preserves them across a probe, rejects stale/foreign/released tokens and closes its generation. Normal close releases tracked wrappers; fatal WASM exceptions or traps invalidate the session without further geometry cleanup. Its owner terminates the worker to reclaim the whole heap. There is no geometry kernel reimplementation, mesh substitute, UI dependency or serialized native handle.

The same-origin URL and tolerance checks precede loading. Missing worker/SIMD/native exception capability is a readable CapabilityError. Threaded mode is explicitly unavailable: the published pthread build creates a host-count pool without a public shutdown API. The single build runs in a dedicated worker. D10 records this initial mode choice, the 100 MiB initial / 4 GiB maximum compiled memory, fatal-worker replacement and the distinction between releasing wrappers and unloading a heap. The header exposes a typed port and names the ownership rules; the module has no brick dependency and three public symbols. Actual upstream package/runtime/build/license inspection supplied these choices, not guessed declarations.

The module header/signature and full initial sibling testbench preceded implementation. `node --import tsx --test --test-name-pattern='C01 golden' src/cad/kernel-runtime.test.ts` exited 1 with the expected unimplemented entry: **1 failed** ([RED output](evidence/C01-red.txt)). Tests replace only the module-loader resource and worker globals; the runtime adapter is real. Initial implementation passed **11/11** ([output](evidence/C01-first.txt)); added cleanup/configuration contract cases initially passed 15/15.

Independent review found a safety defect: only WebAssembly.Exception was treated as fatal, so a WebAssembly.RuntimeError trap could trigger further native cleanup calls. Added the regression before repair. `node --import tsx --test --test-name-pattern='C01 a WASM trap' src/cad/kernel-runtime.test.ts` exited 1: **1 failed**, observing a delete call after the trap ([output](evidence/C01-trap-red.txt)). The repair uses a broader fatal-native predicate for cleanup/invalidation while restricting exception-message/refcount handling to actual native exceptions. Independent targeted verification passed **6/6**, with no remaining concrete concern in the reviewed ownership/precondition scope. BATCH advancement stopped before C02.

The first focused browser command stopped in its build step, before Chrome ran: four TS2339 diagnostics in new test predicates narrowed structurally unrelated fake-observation/vendor shape types to never ([output](evidence/C01-browser-build-red.txt)). The predicates now use Object.is for the same object-identity assertion. No expectation was weakened and no browser assertion was changed. Strict typechecking then passed. This is retained failed evidence, not a passed browser run.

Final `node --import tsx --test src/cad/kernel-runtime.test.ts` exited 0: **16 tests, 16 pass, 0 fail, 0 skipped** ([output](evidence/C01-green.txt)). Cases cover the complete readiness golden, actual probe call parameters, generation/token ownership, probe preservation, status-copy independence, forged/disposed sessions, URL/tolerance boundaries, main-thread refusal, unsupported pthread lifecycle, missing SIMD/exceptions, init/malformed vendor failures, invalid/nonfinite/inaccurate mass, ordinary/native cleanup failures, native release failure, configuration capture across awaits and fatal-trap invalidation. Native resource behavior is additionally tested by the real worker smoke below.

`npm test` exited 0: **328 tests, 328 pass, 0 fail, 0 skipped** ([cumulative output](evidence/phase2-through-C01.txt)). `npm run typecheck` exited 0 without diagnostics. `python3 /home/goosnav/.agents/skills/synced/00ab2cd7-2e1c-45ca-814e-5f657fe548ca_724affcc-3df3-47d2-bd47-95d03e739484/goosnav-modular-coding-method/scripts/check_module.py src/cad/kernel-runtime.ts` exited 0: `PASS: src/cad/kernel-runtime.ts`. The checker applies to C01; the separate worker/demo files are explicitly development resource fixtures, not production bricks.

Final `python3 dev/verify-spec.py` exited 0: TRACE/MAP/LINK PASS, 386 requirements, 158 contracts and 17 design owners. Its analytical plate values are explicitly not kernel tests. The same [verification output](evidence/phase2-C01-verification.txt) records the final strict typecheck and C01 checker passes. `git diff --check` exited 0 without diagnostics.

## Actual browser resource evidence

`npm run test:browser -- src/cad/kernel-runtime.browser.spec.ts` exited 0: **1 passed**, none skipped, including a fresh strict typecheck and static build ([focused output](evidence/C01-browser.txt)). Final `npm run test:browser` also exited 0: **11 passed**, none skipped, with a fresh build ([cumulative output](evidence/phase2-through-C01-browser.txt)). This repeats all prior shared/app browser cases plus exactly one C01 real-resource smoke.

Actual environment: **Chrome 154.0.8037.97, Linux x64, headless, 1280×720**. Both window and worker were cross-origin isolated. OpenCascade validated the real box, measured **23.999999999999996 mm³**, and returned center of mass **[1, 1.5, 2]**. The public memory buffer measured **104,857,600 bytes**. Probe preserved a retained shape; released/closed token access threw DisposedSessionError. Closing the port changed its generation; terminating and recreating the worker restored a working kernel.

In the final cumulative run, a bounded **400.01 ms** loop created/validated/measured/released **444** native boxes while the main thread delivered **23 animation frames**, one button click and one hash navigation. Another active loop was terminated and a fresh worker opened successfully. These observations verify this resource fixture's responsiveness and cancellation mechanism; they are not a 50-feature rebuild, 60 fps viewport guarantee, arbitrary single-call latency benchmark or full application performance result.

The fixture then deliberately replaces the box constructor with a Proxy that supplies zero width to the actual native constructor. Its C01 probe catches a genuine Standard_DomainError with an empty native message, reports `KernelLoadError: OpenCascade box probe failed: Standard_DomainError. Restart the kernel worker.`, invalidates the session and causes owner termination. This is explicitly labeled fault injection; it is not the required failing-fillet feature acceptance case. No native shape, port or token crosses postMessage; only observations/errors do. Other browsers, operating systems and actual production model workloads remain UNTESTED.

Demo: `npm run dev`, open `/dev/fixtures/kernel-runtime.html`. The browser test exercised the separate demo and its [final screenshot](evidence/C01-worker.png) was visually inspected: the original blue title strip, beveled controls and readable result panels fit 1280×720. It shows the valid box/ownership results, the bounded loop and the intentionally faulted worker's termination. The visible banner says no CAD modeler is connected. Demo appearance/output are illustrative; assertions above are the evidence.

## Dependency and distribution boundary

Pinned dependency: `replicad-opencascadejs@1.2.1`, git head 5e4ad9bb5a35bb9ae0571e91c25fa1897ba0570c, exact package lock/integrity retained. The [artifact manifest](evidence/C01-assets.json) records byte sizes and SHA-256 for the installed package/notice and both single/multi source asset pairs. Selected single loader is **60,483 bytes**; selected single WASM is **22,942,327 bytes**, strictly below **26,214,400**. The browser smoke independently checks those two sizes/hashes. Multi assets were inspected, not executed or enabled.

These are source assets served to the development fixture. The production registry is still empty, so the current root static build does not yet include the CAD worker/kernel. Final emitted-asset sizes, offline behavior, Cloudflare deployment/headers, local payload identity and M1a packaging remain later gates. Neither a package installation nor this size check substitutes for them. Exact inspected LGPL/OCCT exception texts are preserved under dev/licenses; corresponding upstream source/build material, transitive notices and replacement/rebuild instructions remain required before distribution, as recorded in DECISIONS D02/D10.

D1 uses transferred wrapper ownership rather than guessing native refcounts; revisit with typed vendor leases. D2 chooses worker-hosted single mode rather than an uncontrolled pthread pool; revisit with bounded public lifecycle support. D3 replaces a faulted worker rather than resuming a module without shadow-stack restoration; revisit with verified stackSave/stackRestore exports. The main numeric tweak is `PROBE_VOLUME_TOLERANCE = 1e-8` mm³ for the independent 24 mm³ oracle; invalid-mass tests guard it. Changing the engine pin requires rechecking binary/API/license provenance. The 400 ms workload and 30 s watchdog are fixture settings, not production capacity/deadline promises. Production allocation/pattern/job policy remains H-CAD-05/C27 work.

## Requirement status and handover

**PASS 11 / FAIL 0 / UNTESTED 375.** Newly passed **CAD-001**: inspection of the pinned upstream provenance, actual WASM artifact and real solid creation/measurement satisfies V-CAD-001. Existing inspection/process passes remain **SYS-005, CAD-006, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028**. All other IDs in requirements.json remain UNTESTED. CAD-004 has worker/cancellation evidence here, but its long production-operation coverage remains open. CAD-003 remains open until both engines' implementation boundaries exist.

At the C01 checkpoint, the solver was not installed or executed. C02 is next and must prove actual solving, DOF/conflict IDs and a constrained rectangle/contradictory system in a worker; declaration review alone cannot pass it. All sketch/feature/editable-format/output/drawing requirements, the golden plate/rebuild/STEP case, over-constraint and failing-fillet model errors, all Image/Video work, performance targets and release/platform gates remain incomplete. No narrower success condition replaces the full product objective.

GREEN: S01–S15, A-SHELL and C01. Human ACCEPTED: none. Shared provisional ladder: 4; CAD-A1: pending C02. Phase 2 is incomplete. The retained modular rule “halt immediately on any failing test … and any surprise” stops this batch before C02 after the recorded trap/test-typing repairs. Captured console failure logs have trailing whitespace normalized only. The active full-product goal remains unchanged.

## C02 prerequisite checkpoint — declaration repair; no new brick

Mode B preparation for C02 found an unexpected published-package defect before any C02 contract stub, testbench or implementation was written. The original command `node_modules/.bin/tsc --ignoreConfig --noEmit --strict --module NodeNext --moduleResolution NodeNext --types node node_modules/@salusoft89/planegcs/dist/index.d.ts` exited **2**, with **14 TS7016/TS2835 diagnostics** ([original failure](evidence/C02-vendor-types-red.txt)). BATCH advancement halted. The pinned dependency's missing native declaration and extensionless declaration imports were repaired by the version/hash-guarded development prerequisite described in D11. Strict compiler settings remain intact; no handwritten solver types, runtime modifications or product stubs were added.

Reproduction and verification:

| Command / check | Observed result | Evidence |
|---|---|---|
| `npm ci` | Exit 0; 8 declaration files prepared from a clean install; audit reports 0 vulnerabilities | [Install output](evidence/C02-clean-install.txt) |
| `npm run prepare:solver` | Exit 0; 8 repairs verified, 0 files written on repeat | [Declaration output](evidence/C02-declarations-green.txt) |
| `npm run test:solver-types` | Exit 0; strict NodeNext declarations, no diagnostics | [Declaration output](evidence/C02-declarations-green.txt) |
| `npm run typecheck` | Exit 0; no diagnostics | [Declaration output](evidence/C02-declarations-green.txt) |
| Runtime integrity comparison | All 14 package JavaScript/WASM files match their hashes from before preparation | [Declaration output](evidence/C02-declarations-green.txt) |
| `npm test` | Exit 0; 328 pass, 0 fail, 0 skipped | [Cumulative unit output](evidence/C02-prerequisite-unit.txt) |
| `npm run test:browser` | Exit 0; fresh static build and 11 pass, none skipped | [Cumulative browser output](evidence/C02-prerequisite-browser.txt) |
| `python3 dev/verify-spec.py` | Exit 0; TRACE/MAP/LINK PASS, 386 requirements and 158 contracts | [Specification output](evidence/C02-prerequisite-spec.txt) |

Independent review in isolated copies confirmed exactly the eight intended declaration changes, an idempotent second run, and rejection before any write for a wrong version, corrupted first/last source, and unknown copied-target bytes. All nondeclaration files stayed identical. Review also corrected an overly strong comment about interrupted writes: preparation is not atomic; `npm ci` restores unknown or partially written dependency state. No runtime adapter was reviewed or certified at this checkpoint.

The browser run used **Chrome 154.0.8037.97, Linux x64, headless, 1280×720** and reran the existing shell/kernel fixtures. It did not exercise a solver worker or CAD-A1. Original C01 screenshot evidence was retained rather than replacing it with a later capture. The install reports an existing esbuild postinstall allowScripts warning; the recorded install/build/tests completed successfully. Audit output alone is not a security or release certification.

Vendor-only exploration outside the application supplied a candidate rectangle fixture: fixed A=(0,0); initial B=(95,3), C=(98,57), D=(-2,59); four connected horizontal/vertical edges; width100 and height60 distances. The vendor reported Success/DOF 0 and solved corners (0,0), (100,0), (100,60), (0,60). Adding width101 reported Failed/DOF -1 and conflicting IDs width100/width101. These observations are implementation reconnaissance, **not product or acceptance-test passes**. C02 still needs its own contract-first testbench and real browser worker proof. Negative DOF is a valid over-constraint report; C16 owns geometry commit policy. Probe data must not overwrite live session data. Faulted native sessions require owner termination, not further native calls. Root `index.js?url` is not a standalone runtime asset because its relative imports remain; resolve that loading boundary in the C02 implementation.

Requirement status stays **PASS 11 / FAIL 0 / UNTESTED 375**. Passed IDs remain **SYS-005, CAD-001, CAD-006, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028**. Every other ID remains UNTESTED; the tooling failure was repaired and does not pass CAD-002. C02–C49 remain PLANNED, CAD-A1 remains pending, and no brick becomes ACCEPTED. The retained modular halt rule stops this checkpoint before C02 implementation. The active full-product goal remains open.

## C02 solver-runtime — GREEN; CAD-A1 still pending

Mode B resumed from clean ebe578a. The previous turn was progress: the exact dependency repair was committed, pushed and verified. This checkpoint implements the approved worker-local solver port in [solver-runtime.ts](../src/cad/solver-runtime.ts), with three public symbols and no brick dependency. It bundles the pinned upstream wrapper and loads the native glue/WASM by same-origin URLs. Its immutable facade exposes only the approved nine engine methods plus DOF, independent primitive snapshots, generation and lifetime state. Readiness proves a solvable point and contradictory coordinate in a temporary native system. Probe leaves live input/settings intact. Engine statuses and negative DOF are forwarded; C16 remains responsible for geometry acceptance and commit policy.

Normal close invalidates the port before destroying its native system once. A thrown engine call invalidates and propagates the original exception without further adapter native calls. Failed initialization/probe requires worker termination; normal close also needs owner termination to reclaim the module heap. Captured methods reject after invalidation. Close failures produce a readable `solver.dispose` diagnostic without retrying native cleanup. D12 records these choices and their alternatives; no kernel or constraint solver algorithm is implemented here.

The module header/types and unimplemented signature preceded the sibling testbench. `node --import tsx --test src/cad/solver-runtime.test.ts` against that stub exited **1: 29 failed, 0 passed, 0 skipped**, including the full golden result failing with `C02 is not implemented.` ([RED evidence](evidence/C02-red.txt)). First implementation passed all **29/29** ([first output](evidence/C02-first.txt)). The harness was then strengthened to capture every callable before close and verify exact probe inputs; all **29/29** still pass, with **0 skipped** ([final focused output](evidence/C02-green.txt)). Assertions were not weakened. Independent review reran 29/29 and found no concrete ownership, copy-boundary, API or fixture blocker.

The cases cover readiness/close goldens, separate systems, temporary-probe preservation, nested input/snapshot copies, independent diagnostic arrays, all four vendor statuses, negative DOF, every exposed call's exception invalidation, captured methods, session identity, cleanup faults, missing native reporting, invalid probe evidence, same-origin URLs, worker/WASM requirements, missing/malformed initializers, readable initialization errors and configuration capture across asynchronous loading. External vendor resources are faked for these unit cases; the real resource smoke follows.

The required checker initially exited **1** with `DECISIONS has no 'Revisit if:' trigger` ([output](evidence/C02-checker-red.txt)). The decisions already had revisit conditions, but lacked the checker’s literal label. The header was corrected; the same command now exits **0**, `PASS: src/cad/solver-runtime.ts` ([output](evidence/C02-checker-green.txt)):

```sh
python3 /home/goosnav/.agents/skills/synced/00ab2cd7-2e1c-45ca-814e-5f657fe548ca_724affcc-3df3-47d2-bd47-95d03e739484/goosnav-modular-coding-method/scripts/check_module.py src/cad/solver-runtime.ts
```

This unexpected checker failure triggers the retained BATCH halt. The current brick is finished GREEN; the next combined assembly is not started in this checkpoint. No brick becomes human-ACCEPTED.

### Actual solver browser evidence

`npm run test:browser -- src/cad/solver-runtime.browser.spec.ts` exited **0: 1 passed**, none skipped, including strict typechecking and a fresh static build ([focused output](evidence/C02-browser.txt)). The one real-resource smoke uses **Chrome 154.0.8037.97, Linux x64, headless, 1280×720**. Window and dedicated worker were cross-origin isolated. A rectangle begins with fixed A=(0,0), B=(95,3), C=(98,57), D=(-2,59), joined by horizontal/vertical lines. With no dimensions, width only, and width plus height, actual solving returned **Success (0)** and **DOF 2, 1, 0** respectively, with empty conflicting/redundant/partially redundant arrays. Final corners were exactly **(0,0), (100,0), (100,60), (0,60)** within the asserted 1e-8 allowance.

Adding a second width of 101 returned **Failed (2), DOF -1**, and both IDs **width100 / width101**. The worker did not apply the failed solution; its source snapshot remained unchanged and its separately retained previous-success observation still contained the exact rectangle. The page displayed a readable contradictory-width message. This is a solver fixture, not the full sketch editor or failed-feature acceptance case. Probe preserved live data, DOF and reports. Close invalidated a captured solve function and snapshot access; a replacement worker initialized successfully.

The focused run completed **2,124** repeated real rectangle solves in **400.035 ms** while the main thread delivered **23 animation frames and one click**. The cumulative run also asserts the same bounded responsiveness conditions. These are measured fixture observations, not a 50-feature rebuild, guaranteed 60 fps viewport, arbitrary single-call latency, or complete product performance claim. Native-trap handling is fake-resource tested; this C02 browser fixture does not inject a genuine native fault. Other browsers and operating systems remain UNTESTED.

Demo: `npm run dev`, open `/dev/fixtures/solver-runtime.html`. The smoke exercised it and generated the visually inspected [C02 screenshot](evidence/C02-worker.png): the original XP-style controls, readable conflict line, result panels and scope footer fit 1280×720. The screenshot/demo are illustrative, separate from the executable assertions. The banner explicitly says no sketch editor is connected.

### Cumulative verification and current scope

| Command | Final result | Evidence |
|---|---|---|
| `node --import tsx --test src/cad/solver-runtime.test.ts` | Exit 0; 29 pass, 0 fail, 0 skipped | [Focused unit output](evidence/C02-green.txt) |
| `npm test` | Exit 0; 357 pass, 0 fail, 0 skipped | [Cumulative unit output](evidence/phase2-through-C02.txt) |
| `npm run test:browser` | Exit 0; fresh build and 12 pass, none skipped | [Cumulative browser output](evidence/phase2-through-C02-browser.txt) |
| `npm run typecheck` | Exit 0, no diagnostics | [Verification output](evidence/phase2-C02-verification.txt) |
| C02 module checker (command above) | Exit 0, PASS | [Checker output](evidence/C02-checker-green.txt) |
| `python3 dev/verify-spec.py` | Exit 0; TRACE/MAP/LINK PASS | [Verification output](evidence/phase2-C02-verification.txt) |

The first cumulative browser command reported 12 passing cases but its process ended with **143 (SIGTERM)** after the summary ([interrupted output](evidence/phase2-through-C02-browser-interrupted.txt)). It is not counted as a successful command. No surviving test/server process was found; both reviewers confirmed they performed no shared-process termination. The cause of that SIGTERM is not established. A fresh execution of the same npm command, captured by Python `subprocess.run(..., start_new_session=True)`, completed with observed **exit 0**. No production or assertion change was made between these runs. Earlier C01 screenshot evidence was restored after cumulative capture, rather than overwriting its historical checkpoint.

The [source artifact manifest](evidence/C02-assets.json) records the exact package/notice and JavaScript/WASM hashes, plus the inspected native memory declaration. Native loader **26,129 bytes**, WASM **484,003 bytes**; both strictly below 26,214,400. The binary's initial/maximum memory is fixed at **337 pages / 22,085,632 bytes**, unshared. Root production still has an empty workspace-adapter registry, so final emitted CAD assets, complete corresponding-source packaging, offline behavior, Cloudflare and M1a remain open. Source-package byte checks do not pass those release requirements.

Current requirement status: **PASS 13 / FAIL 0 / UNTESTED 373**. Newly passed **CAD-002** through exact provenance/artifact inspection and the actual rectangle/contradiction worker test; **CAD-003** through inspection of the two implemented engine boundaries and their genuine upstream calls. Existing passes: **SYS-005, CAD-001, CAD-006, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028**. Every other ID remains UNTESTED in requirements.json. In particular, the combined worker seam, production sketch/feature tools, full CAD goldens/STEP round-trip, Image/Video, performance and all release gates remain incomplete.

How to tweak: `PROBE_TOLERANCE = 1e-8` belongs only to the known (10,20) point oracle; wrong/nonfinite probe tests catch changes that accept incorrect output. Module/WASM URLs are explicit pinned inputs checked before initialization. The worker demo’s 400 ms loop and 30-second watchdog are fixture settings, not product deadlines. Engine pin changes require renewed declaration, API, binary, license and browser verification. GREEN: S01–S15, A-SHELL, C01–C02. Human ACCEPTED: none. Shared ladder height: 4; **CAD-A1 is next**, before C03. Phase 2 and the full shippable-product objective remain unfinished.


## CAD-A1 paired-engine assembly — GREEN

Mode C joins the already GREEN C01/C02 public ports under the owner's provisional assembly authorization. The [contract](CAD-ENGINE-ASSEMBLY.md) was written before the browser test and implementation. One dedicated worker owns both native engines, a retained real box and the live solver session. Only structured-clone observations cross the boundary. This is a development seam fixture, not the production sketch/model dispatcher, and neither runtime brick was modified.

The test-first command `npm run test:browser -- src/cad/engine-assembly.browser.spec.ts` initially exited **1** because the unimplemented fixture had no “Combined engine spike” heading ([expected RED](evidence/CAD-A1-red.txt)). Before implementation verification, source inspection showed the pinned solver loader retries a failed streaming fetch through an ArrayBuffer path. The test stimulus was corrected to block every solver-WASM request during the failed-open attempt and remove that route before recovery. It asserts at least one blocked request and both observed port states. No assertion was weakened to accommodate an implementation failure.

The focused command then exited **0: 1 passed**, with strict typechecking and a fresh build ([exact output](evidence/CAD-A1-browser.txt)). Actual environment: **Chrome 154.0.8037.97, Linux x64, headless, 1280×720**. The response supplied COOP `same-origin`, COEP `require-corp`, and CORP `same-origin`; both page and worker were cross-origin isolated. The kernel remains in single mode; isolation is not evidence of pthread execution.

Observed native results:

- The retained 2×3×4 box was valid and measured **23.999999999999996 mm³** before and after the solver contradiction and both runtime probes.
- The point fixture solved to **(10,20)** with status **Success (0)**, **DOF 0**, and no conflicts. Adding x=11 returned **Failed (2)**, **DOF -1**, and conflicting IDs **x10/x11**. The failed result was not applied; its source snapshot stayed unchanged. Both probes preserved the retained shape and solver snapshot.
- Clean close changed both generations and invalidated the old shape token and captured solve function with **DisposedSessionError**. Both disposal diagnostic lists were empty, followed by owner termination.
- Blocking solver-WASM initialization reported **SolverLoadError**, with the kernel port still **open** and the solver **absent** before owner termination. Removing the resource block allowed a fresh pair to open.
- The actual zero-width native box injection reported **KernelLoadError / Standard_DomainError**, with kernel **closed** and solver **open** before owner termination. A replacement pair produced the same valid observations and closed cleanly. This does not pass the failing-fillet acceptance case.
- Focused paired work completed **301** real probe pairs in **600.5 ms**, while the page delivered **35 animation frames**, **one click**, and **one hash navigation**. A second active workload was terminated and replaced successfully. These bounded loops are not single-operation or complete-product performance evidence.

The worker acquires its busy/opening guard before awaiting initialization. On disposal diagnostics it stops before sibling cleanup and emits an error receipt; the page terminates the whole worker. The owner correlates request ID and worker identity, uses a 30-second watchdog, and removes handlers on replacement/page disposal. Independent reviews found no concrete ownership, disposal-order, protocol or assertion defect. Those reviews are inspection evidence, not extra automated test passes. The real smoke exercises clean close, partial initialization, native failure, busy cancellation and replacement; it does not wait for a watchdog timeout or inject disposal diagnostics. C01/C02 unit tests remain the cleanup-fault evidence.

Demo: `npm run dev`, then `/dev/fixtures/engine-assembly.html`. The smoke ran that page and produced the [visually inspected screenshot](evidence/CAD-A1.png). Controls, six receipt panels and scope footer fit 1280×720; the long inspection receipt scrolls inside its panel. No other browser or OS was smoke-tested.

### Cumulative gate and requirement status

| Command | Result | Exact output |
|---|---|---|
| `npm run test:browser -- src/cad/engine-assembly.browser.spec.ts` | Exit 0; fresh build, 1 passed, none skipped | [Focused browser](evidence/CAD-A1-browser.txt) |
| `npm test` | Exit 0; 357 passed, 0 failed, 0 skipped | [Unit suite](evidence/phase2-through-CAD-A1.txt) |
| `npm run test:browser` | Exit 0; fresh build, 13 passed, none skipped | [Cumulative browser](evidence/phase2-through-CAD-A1-browser.txt) |
| `python3 dev/verify-spec.py` | Exit 0; TRACE/MAP/LINK PASS | [Specification gate](evidence/phase2-CAD-A1-verification.txt) |

The first specification-check command exited **1** because this report linked its output file before the capture script created that file ([original failure](evidence/phase2-CAD-A1-verification-red.txt)). The capture order now opens the output file before invoking the checker; no requirement or assertion changed. The repeated command exits **0**. This unexpected failed gate triggers the retained modular BATCH halt: finish this verified checkpoint, then stop before C03.

The complete browser ladder includes all previous shared assembly and C01/C02 real-resource checks. The focused screenshot is retained; cumulative captures do not overwrite historical C01/C02/S10 screenshot evidence. CAD-A1 is an assembly rather than a new brick, so it has no standalone module checker. Strict build/typechecking and the real seam test are its implementation gates.

Requirements remain **PASS 13 / FAIL 0 / UNTESTED 373**. Passed IDs: **SYS-005, CAD-001, CAD-002, CAD-003, CAD-006, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028**. Every other ID in requirements.json is UNTESTED. No additional requirement is passed merely by joining the engines. CAD-004/005 still require their long individual production-operation procedures. The full plate/rebuild/STEP golden, sketch/feature editors, Image/Video, offline deployment, final asset sizes and M1a package remain unfinished.

How to tweak: worker `WORK_MS = 600` defines only the responsiveness fixture; the browser assertion deliberately requires at least 600 ms. Demo `WATCHDOG_MS = 30_000` bounds fixture requests, not production job policy. Engine URLs and tolerances remain explicit pinned inputs. Switching vendor builds requires renewed API, license, resource and real-browser evidence. The ports' single-worker lifetime and termination after uncertainty are invariants, not tuning values.

GREEN: S01–S15, A-SHELL, C01–C02, CAD-A1. Human ACCEPTED: none. Shared provisional ladder height: **4**; CAD provisional ladder height: **1**. C03 is next after this halted checkpoint. Phase 2 and the full product objective remain active and incomplete; this checkpoint is not CANDIDATE_FOR_ACCEPTANCE.


## C03 dimension-expressions — GREEN

Mode B resumed from clean, pushed 5853b7a. The previous turn made progress through the real paired-engine seam. [dimension-expressions.ts](../src/cad/dimension-expressions.ts) now implements the map's UI-free arithmetic boundary with one entry point, two public boundary types, and no dependencies. Its header/types/stub preceded the sibling testbench; the implementation followed the observed RED.

Inputs contain a typed dimension source, document length units and canonical variable values. Output is a finite canonical value, its field kind and unique sorted dependency names. The grammar supports decimal/scientific literals, documented unit suffixes, identifiers, parentheses, unary signs and the requested arithmetic operators, including their Unicode glyphs. It has no functions, host evaluation or implicit multiplication. Bare arithmetic adopts millimetres/inches or degrees only where dimensional context requires it. Explicit scalar variables and dimensional ratios remain scalar. Compound dimensions and incompatible kinds fail visibly. D13 records the unit semantics and the still-open document-unit switching integration.

The operator/value stacks are iterative. The committed testbench exercises **20,000 nested parentheses**, **20,001 unary signs**, a **5,001-term sum**, precedence/associativity, canonical conversions, scalar propagation through zero, sorted dependencies, own-property variable lookup, immutable inputs, independent output arrays, finite underflow, overflow, signed-zero division, and exact original UTF-16 error offsets/tokens. Deterministic bounded properties check distributivity, grouping, repeated calls and document-unit independence for explicit units/canonical variables. The testbench imports only the public evaluator; no kernel, solver or browser fake is involved.

Test-first evidence: `node --import tsx --test src/cad/dimension-expressions.test.ts` against the stub exited **1: 26 failed, 0 passed, 0 skipped**, all against the unimplemented entry ([original RED](evidence/C03-red.txt)). Before implementation, the test author added scalar-zero assertions and one large finite angle test, bringing the suite to 27 cases. The first implementation passed **27/27**, exit **0**, none skipped ([focused output](evidence/C03-first.txt)). No production fix or test weakening was needed after that first run.

Independent review reran the focused suite successfully and found no concrete parser, unit, purity, token-position or stack defect. A separate ad hoc review assertion initially used **−14** as the expected value of `(-(+2))*-(3--4)`. Correct arithmetic is **+14**: the factors are −2 and −7. That review script exited **1**; correcting only its mistaken expected value produced **16 passing review assertions**, exit **0**, with no production or committed-test change. Both commands and outputs are retained in [review evidence](evidence/C03-review.txt). Those 16 observations are not added to the committed suite's test count. The retained method's “halt immediately on any failing test” rule stops this batch before C04 after completing the current GREEN checkpoint.

### Verification and demo

| Command | Result | Evidence |
|---|---|---|
| `node --import tsx --test src/cad/dimension-expressions.test.ts` | Exit 0; 27 passed, 0 failed, 0 skipped | [Focused output](evidence/C03-first.txt) |
| `npm test` | Exit 0; 384 passed, 0 failed, 0 skipped | [Cumulative units](evidence/phase2-through-C03.txt) |
| `npm run typecheck` | Exit 0; no diagnostics | [Verification output](evidence/C03-verification.txt) |
| C03 module checker, exact command in linked output | Exit 0; `PASS: src/cad/dimension-expressions.ts` | [Verification output](evidence/C03-verification.txt) |
| `npm run test:browser` | Exit 0; fresh build and 13 passed, none skipped | [Cumulative browser output](evidence/phase2-through-C03-browser.txt) |
| `python3 dev/verify-spec.py` | Exit 0; TRACE/MAP/LINK PASS | [Verification output](evidence/C03-verification.txt) |

The browser run repeats the existing cumulative shared/CAD-A1 ladder in **Chrome 154.0.8037.97, headless Linux x64, 1280×720**. C03 is not connected to a workspace UI yet, so this run does not verify editable dimension fields. All nine previously tracked evidence PNGs were preserved byte-for-byte. No other browser or OS was smoke-tested.

The separate demo command `node --import tsx src/cad/dimension-expressions.demo.ts` exits **0** and prints `Expression: (width - 20mm) / 2`, followed by `Canonical result: { value: 40, kind: 'length', dependencies: [ 'width' ] }`. It supplies a canonical 100 mm width. This is a human-readable usage example, separate from test evidence.

How to tweak: source expression, requested kind, document units and variable values are explicit request fields. `INCH_TO_MM = 25.4` and `DEG_TO_RAD = Math.PI / 180` encode fixed definitions, not adjustable tolerances. The header is the authority for grammar and implicit/explicit unit rules; changing them requires a contract change and corresponding golden/error/property updates. Source offsets let the eventual editor identify the offending token. C04 will resolve definitions and cycles; downstream feature recipes enforce positive sizes and feature-specific ranges.

Requirements remain **PASS 13 / FAIL 0 / UNTESTED 373**. Passed IDs: **SYS-005, CAD-001, CAD-002, CAD-003, CAD-006, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028**. Every other ID remains UNTESTED in requirements.json. In particular, CAD-017/018/019 require real document switching, bound dimensions and downstream rebuilds, so a standalone evaluator does not pass them. Bare expression migration across a document-unit change, named-variable resolution, editors, full CAD goldens/exports, Image/Video and release gates remain unfinished.

GREEN: S01–S15, A-SHELL, C01–C03, CAD-A1. Human ACCEPTED: none. Shared provisional ladder height **4**, CAD provisional ladder height **1**. **C04 is next** after this checkpoint. The full shippable-product objective remains active; no release or acceptance candidate is claimed.


## C04 named-variables — GREEN

Mode B resumed after the pushed C03 checkpoint 04d6b9b. [named-variables.ts](../src/cad/named-variables.ts) implements the map's definition-resolution boundary with one entry point, two public boundary types and C03 as its sole brick dependency. Its header/types/stub preceded the sibling testbench; implementation followed the expected RED.

Ordered definitions may refer to later definitions. The result contains canonical values, each name once in resolution order, and unique sorted direct consumers for every name, including empty lists and zero-weight references. Duplicate and reserved names fail in input-order preflight. Reached cycles identify the closing definition, only the cyclic path segment, and the offending reference. Other C03 errors retain their name, location and original cause while identifying the actual failing definition. Inputs remain unchanged and failures return no partial result.

The iterative stack uses C03's located unknown-variable result to resolve declared prerequisites before retrying with real values. This avoids another expression parser and placeholder arithmetic. Successful C03 dependency lists supply reverse edges even when a prerequisite was already resolved. Own-property-safe records support valid prototype-looking names. First-error reporting is deliberate: an arithmetic or syntax failure can precede discovery of a cycle. Wide expressions may be evaluated repeatedly; there is no incremental cache or resource cutoff. Identifier syntax remains a caller precondition.

Test-first evidence: `node --import tsx --test src/cad/named-variables.test.ts` against the stub exited **1: 23 failed, 0 passed, 0 skipped** ([expected RED](evidence/C04-red.txt)). The first implementation passed **23/23**, exit **0**, none skipped ([focused output](evidence/C04-first.txt)). No production repair or assertion weakening followed that run. The suite covers reversed chains, diamonds, deterministic traversal, complete direct consumers, every declared error family, error provenance, immutable inputs, independent outputs and the actual C03 evaluation seam. A **12,000-definition reversed chain** resolves without recursive stack growth. Independent review reran the existing suite with **23/23 passing**, exit **0**, and found no concrete dependency, error, purity or stack defect; no extra ad hoc script was used.

### Verification and demo

| Command | Result | Evidence |
|---|---|---|
| `node --import tsx --test src/cad/named-variables.test.ts` | Exit 0; 23 passed, 0 failed, 0 skipped | [Focused output](evidence/C04-first.txt) |
| `npm test` | Exit 0; 407 passed, 0 failed, 0 skipped | [Cumulative units](evidence/phase2-through-C04.txt) |
| `npm run typecheck` | Exit 0; no diagnostics | [Verification output](evidence/C04-verification.txt) |
| C04 module checker, exact command in linked output | Exit 0; `PASS: src/cad/named-variables.ts` | [Verification output](evidence/C04-verification.txt) |
| `node --import tsx src/cad/named-variables.demo.ts` | Exit 0; canonical width 40 mm, half 20 mm, order width then half, direct consumer half for width | [Verification output](evidence/C04-verification.txt) |
| `npm run test:browser` | Exit 0; fresh typecheck/build and 13 passed, 0 failed, 0 skipped, in 18.1 s | [Cumulative browser output](evidence/phase2-through-C04-browser.txt) |

The cumulative browser gate ran once in **Chrome 154.0.8037.97, headless Linux x64, 1280×720**. All nine previously tracked evidence PNGs were preserved byte-for-byte. C04 has no workspace UI; its real collaborator seam is exercised directly with C03. Editable variables and dimension fields, document-unit migration and downstream feature rebuilding remain unconnected. No other browser or OS was smoke-tested. `python3 dev/verify-spec.py` exited 0: TRACE/MAP/LINK PASS, 386 requirements, 158 contracts and 17 conceptual owners; its exact output is in [verification evidence](evidence/C04-verification.txt). This audits specification closure, not product behavior.

The standalone demo prints canonical width **40 mm** and half **20 mm**, resolution order `['width', 'half']`, and direct dependents `{half: [], width: ['half']}`. It is a usage example, separate from automated assertions.

The final staged `git diff --cached --check` initially exited 2 because Node's expected-RED diagnostic output contained trailing spaces on blank lines. Only trailing whitespace in captured evidence was normalized; implementation and test assertions were unchanged. The original diagnostics and final exit-0 whitespace/specification checks are preserved in [verification evidence](evidence/C04-verification.txt). BATCH was already halted before C05 for the contract proposal below.

How to tweak: definitions, their order, expressions and document units are explicit request fields. `RESERVED_NAMES` must remain aligned with C03's fixed unit vocabulary. Changes to grammar or unit semantics belong to C03's contract; changes to traversal, cycle reporting or direct-consumer semantics require matching C04 golden/error/property updates. The resolver does not own feature graphs, variable editors, persistence or physical-unit migration.

Requirements remain **PASS 13 / FAIL 0 / UNTESTED 373**; no requirement status changed. CAD-017/018/019 still require the complete document/editing/rebuild procedures. Full CAD goldens and exports, Image/Video, offline deployment and release packaging remain unfinished. GREEN: S01–S15, A-SHELL, C01–C04, CAD-A1. Human ACCEPTED: none. Shared provisional ladder height **4**, CAD provisional ladder height **1**. **C05 is next, but BATCH is halted before its implementation for the contract amendment proposed below**. This component checkpoint is not a release or acceptance candidate.


### C05 pending contract amendment — revision exhaustion

Pre-implementation review found an actual boundary gap: the shared `Revision` type permits `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991), while a content-changing C05 edit must increase the revision and keep the output a safe integer. The existing C05 error list has no exhaustion error. Silently restricting the input range, wrapping the revision or mislabeling this as a dependency error would violate that contract.

**Proposed amendment, awaiting owner approval:** add `RevisionOverflowError` to C05's RAISES list. After ordinary edit validation, a valid no-op retains its revision and returns no invalidations, including at the maximum revision. A content-changing edit at the maximum throws a readable `RevisionOverflowError`, with no input mutation or partial result. Other successful content changes increase revision by exactly one. The currently approved map contract remains unchanged; no C05 header, tests or implementation have been written.

C05's downstream contracts are C27, C36, C46, C48 and C49, all still PLANNED. No GREEN brick or existing assembly rung is invalidated by this proposal. The `goosnav-modular-coding-method` skill, section 10, says BATCH must “halt immediately on any failing test, any needed contract change, any brick that exceeds a hard limit, and any surprise.” The owner explicitly retained these halt conditions. C04 is GREEN; progression stops before C05 pending this specific amendment. The full product goal remains incomplete.

## C07 sketch-linear-primitives — GREEN

The owner resumed functionality work after the UI refresh at `62ca744`. C05's contract approval is still pending; no change to its error list or implementation was inferred. C07 is an independent, zero-dependency leaf in the authorized CAD phase, so work advanced there while that question remained open. No dependent feature-history implementation was started.

[C07](../src/cad/sketch-linear-primitives.ts) creates points, line segments, corner rectangles, center rectangles and regular polygons. Geometry is canonical mm; polygon anchors are the center and first vertex, with counterclockwise ordering. Composites emit the documented primitive segments with exactly matching joins. Each output owns its coordinate arrays and preserves ID order and the construction flag. Collapsed edges and unrepresentable computed geometry fail visibly using the declared error family and the caller's document tolerance. Constraints, snapping, expressions and drawing interaction remain separate responsibilities.

The contract header and types preceded the testbench; the unimplemented module failed all 14 tests ([expected RED](evidence/C07-red.txt)). The first implementation had a missing array-closing bracket, producing a compilation failure before any case ran ([output](evidence/C07-compile-failure.txt)); the bracket was corrected without changing assertions. The checker subsequently rejected the PURPOSE sentence's conjunction as multiple responsibilities. The purpose was clarified to “Construct primitive linear sketch geometry”; the single-responsibility contract and implementation were unchanged. This run stops at the repaired GREEN checkpoint under the retained BATCH halt rules.

| Command | Result | Evidence |
|---|---|---|
| `node --import tsx --test src/cad/sketch-linear-primitives.test.ts` | Exit 0; 14 passed, 0 failed/skipped | [Focused output](evidence/C07-green.txt) |
| `npm test` | Exit 0; 421 passed, 0 failed/skipped | [Cumulative output](evidence/phase2-through-C07.txt) |
| `npm run build` | Exit 0; strict TypeScript and static build pass | [Verification output](evidence/C07-verification.txt) |
| C07 module checker, exact command in linked output | Exit 0; PASS | [Verification output](evidence/C07-verification.txt) |
| `node --import tsx src/cad/sketch-linear-primitives.demo.ts` | Exit 0; plate outline spans (0,0)–(100,60), pocket outline spans (40,20)–(60,40) | [Demo output](evidence/C07-verification.txt) |

Cases cover literal geometry goldens, every declared error, tolerance boundaries, 234 translated/rotated regular polygon fixtures, construction propagation, frozen-input independence and the real C03→C07 seam using an inch document with canonical mm expressions. The demo is a usage example, not acceptance evidence. No browser suite or OS launcher smoke was run for this pure, currently unconnected component. No visible sketch tool, solid creation, solve or full CAD golden is claimed.

How to tweak: anchors, side count, IDs, construction and the document's linear tolerance are explicit request fields. C07 adds no hidden epsilon. Array-copy changes are guarded by the isolation test; vertex/orientation changes by the literal hexagon and regularity cases; count/range changes by named-error boundary tests. Composite entity semantics or extra modes would require a contract change.

Requirement statuses remain **13 PASS / 0 FAIL / 373 UNTESTED**. Existing PASS IDs remain SYS-005, CAD-001, CAD-002, CAD-003, CAD-006, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023 and REL-028. In particular CAD-023/024/025/030/032/033 remain UNTESTED because their procedures require interactive sketching, constraints/profile behavior and/or save/reopen. All other IDs retain their recorded status. GREEN: S01–S15, A-SHELL, C01–C04, C07, CAD-A1. Human ACCEPTED: none. Shared provisional ladder height 4 and CAD ladder height 1 are unchanged. C05 remains the blocked feature-history path pending the specific amendment above; this is not a release candidate.

## Production CAD workflow checkpoint

C50–C58 and CAD-APP now provide the first working sketch → constraint solve → B-rep extrusion → editable save/reopen path in the production entry. The [workflow report](CAD-WORKFLOW.md) records commands, final evidence, discovered integration defects, supported format subset and remaining requirements. C01–C04/C07 remain GREEN; C05's pending amendment is unchanged. CAD-043/044/059 now pass their full stated procedures; the complete Phase 2 acceptance gate remains open.

## STEP output checkpoint

C37, C59/C60 and STEP-APP connect native STEP export to the production CAD editor. Export rebuilds the selected source in a worker, preserves the editable project history, and supports cancel and file fallback. [CAD-STEP-EXPORT.md](CAD-STEP-EXPORT.md) contains the commands, evidence, unit defect found by the real-kernel test, and remaining requirements. Requirement status remains 16 PASS / 0 FAIL / 370 UNTESTED; full native import and exchange acceptance remain open.

## C08 circular sketch primitives — GREEN

C08 constructs circles, three-point/center-point/tangent arcs and slots as pure analytic geometry. [CAD-CIRCULAR-PRIMITIVES.md](CAD-CIRCULAR-PRIMITIVES.md) records its 23 focused tests, review regressions, 493 cumulative unit tests, 18 Chromium tests and remaining integration work. The repaired review findings halt this batch before another brick under the retained method. This leaf is not connected to the canvas or saved document yet; requirement status remains 16 PASS / 0 FAIL / 370 UNTESTED. No brick becomes human-ACCEPTED, and CAD provisional assembly height stays 3. C05's separate revision-overflow amendment remains pending.
