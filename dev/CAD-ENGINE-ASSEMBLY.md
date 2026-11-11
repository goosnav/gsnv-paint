# CAD-A1 — engine worker assembly contract

Mode C under the owner's provisional GREEN assembly authorization. This is a development integration fixture for the already GREEN C01/C02 ports, not a new geometry/constraint brick or production sketch/feature dispatcher. `src/cad/engine-assembly.worker.ts` is the dedicated worker entry; `engine-assembly.demo.ts` owns its browser lifetime; `dev/fixtures/engine-assembly.html` makes the observations inspectable. The sibling `engine-assembly.browser.spec.ts` is the real seam gate. Existing component and shared-assembly tests remain cumulative.

## Boundary and lifetime

The page starts exactly one dedicated module worker for the pair and passes the same pinned same-origin native URLs used by the C01/C02 fixtures. Its `open` message contains a positive integer request ID, a C01 open config and the two C02 URLs. The worker opens the kernel, then the solver, and reports readiness only after both succeed. A receipt identifies the request and contains only structured-clone data: readiness, native observations, isolation and lifecycle state. Native libraries, sessions, tokens and callable handles never cross postMessage.

Only one request is outstanding. The page correlates the request ID and worker identity; an old worker cannot update its replacement. A 30-second fixture watchdog, worker error, message error, failed initialization, unexpected native error or page disposal terminates the owning worker. Cancellation is worker termination, not a promise to interrupt a native call in place. Starting again creates a fresh worker and fresh ports. No native cleanup calls follow an uncertain native fault; whole-worker termination reclaims both heaps. Repeated start cannot open a second pair in one worker.

`inspect` makes a real 2×3×4 mm B-rep box through C01's public library/ownership port, records validity and mass, and retains that shape across both runtime probes. It drives C02 with point p=(0,0), x=10, y=20; records Success/DOF 0 and the applied (10,20) point; then adds contradictory x=11 in an independent reset fixture and records Failed/DOF -1 and both constraint IDs. Failed output is not applied. Solver contradictions are ordinary diagnostic results; they do not invalidate the kernel or solver. The retained box remains valid and measures 24 mm³ after the contradiction and both probes. These are known fixture commands and independent assertions, not feature-tree interpretation or general solve/commit policy.

`close` normally closes both ports, proves that a retained kernel token and captured solver method reject with DisposedSessionError, and returns both closed states and changed generations. The page then terminates the worker to reclaim module memory. Native disposal diagnostics are visible and never reported as clean disposal. The fixture owner terminates on failed close as on any other failure.

`work` reports a started receipt, then repeatedly invokes both real runtime probes for at least 600 ms, returning elapsed time and pair-probe count. The page records animation frames, a click and navigation while this work is active. A second workload can be cancelled while active; the test asserts termination and successful replacement. The fixed duration provides a repeatable responsiveness/cancellation observation, not the final 50-feature or single-call performance target.

`fault` is explicitly labeled development-only injection: the worker passes zero width to the actual native box constructor during C01 probe, producing a real native error. The owner reports it and terminates the entire paired worker. This is not the failing-fillet acceptance test. A browser resource failure during solver initialization also must terminate the partially loaded pair and leave a readable failure; a subsequent normal start must work.

## Verification

Write the browser test before the worker/demo implementation and observe its expected RED. Then run:

```sh
npm run test:browser -- src/cad/engine-assembly.browser.spec.ts
npm test
npm run test:browser
python3 dev/verify-spec.py
```

The browser gate checks both same-worker results, repeated probes and retained state, clean port disposal plus owner termination, partial initialization failure/recovery, native-fault termination/recovery, busy-worker cancellation/replacement, and main-thread interaction. It checks actual COOP/COEP/CORP responses and `crossOriginIsolated` in window/worker. It must not infer pthread execution from isolation: C01 remains explicitly single mode. Record the actual browser/OS/viewport; other platforms, offline behavior and final release assets stay untested. The assembly has no standalone brick checker; C01/C02 contracts, strict typechecking, build and real seam assertions are its gates.

This rung is GREEN only after those assertions pass together with the cumulative ladder. Human acceptance remains pending. CAD-004/005's long individual production-operation procedures and all full product performance/export/feature goldens remain open after bounded fixture loops.
