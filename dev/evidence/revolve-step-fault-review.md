# C37 STEP fault-boundary correction and adjacent review

Bounded Mode B correction under the C37 worker-lifetime guarantee and the
integration amendment in `dev/CAD-REVOLVE-INCREMENT.md`. This is implementation
evidence for C37, not an independent review of my own C37 implementation.
C01/C72 were reviewed read-only after the parent implemented them.

## Reproduction and repair

The original C37 classified only numeric/WASM throws as fatal. A writer
constructor throwing `undefined`, `null`, an ordinary `Error`, or an error with
a forged recognized name triggered native deletion and filesystem cleanup after
the fault. Unknown exceptions were sometimes replaced with a new STEP error.
The `finally` block also swallowed every unlink exception and continued into
unit restoration.

The header was amended first. The original six-case regression testbench was
run before runtime changes: **2 PASS, 4 FAIL, 0 cancelled/skipped/todo**, exit 1.
Raw evidence: `revolve-step-fault-red.log` and the less implementation-specific
rerun `revolve-step-fault-red-reviewed.log`.

Only the exact deliberate error created by the current C37 call now permits
ordinary rejection cleanup. Every other thrown value propagates unchanged.
Cleanup runs separately from the operation's catch; a cleanup exception cannot
re-enter cleanup. Native deletion, directory listing, unlink, and unit restore
all stop immediately on an exception. Normal STEP status-code/geometry
rejections retain their readable names and messages.

The pinned binding has `FS.readdir`, but no `FS.analyzePath`. A real-kernel
probe confirmed that `readdir('/')` distinguishes a missing, created, then
removed private filename. C37 checks that filename before unlinking it. The
directory read itself is a tested fail-stop boundary; no exception is swallowed
as an existence check. An added namespace assertion preserves unrelated virtual
files after success and deliberate rejection.

## Test changes and checks

Two prior fake-filesystem expectations changed intentionally: an injected
`FS.writeFile` exception is preserved by identity, and an injected writer
exception is preserved by identity without native cleanup or unit restoration.
Those are unknown faults under the clarified contract. Native status failures
and empty output still clean up normally. Fake filesystems now implement the
vendor's supported `readdir` operation. No native geometry or unit oracle was
weakened or changed.

The initial legacy run after the runtime repair failed because its fake lacked
`readdir`; the real C01/OpenCascade test already passed in that run. The raw
intermediate output is `revolve-step-fault-legacy-before-update.log`, not a
passing checkpoint.

```sh
node --import tsx --test src/cad/step-exchange.test.ts src/cad/step-exchange-faults.test.ts
```

Final focused output (`revolve-step-fault-focused-green.log`):

```text
tests 18
pass 18
fail 0
cancelled 0
skipped 0
todo 0
```

The dedicated testbench contains 7 tests. Its matrix injects 12 thrown values
at 106 successful-path boundaries (79 import, 27 export), at 97 cleanup
positions reached by 12 deliberate rejection scenarios, and at the exact
writer-constructor reproduction: **2,448 injections**. Values include undefined,
null, string, number, ordinary Error, five forged recognized error names,
WebAssembly.RuntimeError and WebAssembly.Exception. Each assertion checks exact
identity and that the observed call trace ends at the injected call.

```sh
node --import tsx --test src/cad/kernel-runtime.test.ts src/cad/kernel-plane-transform.test.ts src/cad/kernel-revolve.test.ts src/cad/part-revolve.test.ts src/cad/cad-step-export.test.ts src/cad/step-exchange.test.ts src/cad/step-exchange-faults.test.ts
```

Adjacent/native output (`revolve-step-fault-native-seams.log`): **62 PASS,
0 FAIL/cancelled/skipped/todo**, exit 0, 5.449 s. This includes real-kernel
mm/inch transfer, multiple/curved solids, assembly rejection, rigid plane
mapping and signed revolve STEP oracles. This run preceded only the test-call
fix below; runtime hashes were unchanged.

An optional argument in the new namespace test initially passed explicit
`undefined`, violating `exactOptionalPropertyTypes`. The test now omits that
property. Following that test-only correction:

```sh
node_modules/.bin/tsc --noEmit
```

Exit 0, no diagnostics (`revolve-step-fault-typecheck.log`); focused 18 tests
were rerun and passed. The module checker reports
`PASS: src/cad/step-exchange.ts` (`revolve-step-fault-module-check.log`). The
runtime is 126 physical lines, has 3 public symbols and 1 module collaborator.
`git diff --check -- src/cad/step-exchange.ts src/cad/step-exchange.test.ts`
exited 0.

## Independent C01/C72 review

No introduced contract/ownership defect found in the parent's frozen C01/C72
corrections. C01 no longer calls native exception introspection or decrement
after a fault. Its release/close/probe paths stop on every unknown throw, and
failed live probes invalidate tokens without disposal. Its deliberate local
probe rejection still allows temporary cleanup until the first cleanup fault.
The readable error/diagnostic interface is preserved using JavaScript only.
C72's non-undefined identity guard fixes the original thrown-undefined defect;
unknown construction, result checks, cleanup, retain, and input release follow
the stop-on-fault rule. The existing ordinary ownership and real transformed
geometry/STEP assertions remain intact.

C01's four legacy diagnostic/cleanup expectations were intentionally revised by
the parent under the documented amendment; they are not unchanged old oracles.
These checks do not establish production-browser acceptance, all requirement
coverage, or an OS support claim. No browser, server, production build, commit,
push, or deployment was performed by this subtask.

## Frozen source SHA-256

```text
50a8a8643e1cde24e31948d2913eca5c6d9c0d81f9922ab85a4bbcb6f8b32806  src/cad/step-exchange.ts
25de6b790c61466715c26a63c4e6aa89c3a44e7319833ee27534193021d76d62  src/cad/step-exchange.test.ts
02080a8de8ed02fb003e27caeaa9479dc38925d88da7de53a889008f7de491ec  src/cad/step-exchange-faults.test.ts
cf06b2a8164f8d3c25bad846bd0352a4dd6235ec62de56362dd651e1938f3191  src/cad/step-exchange-fault-fixture.ts
e762a084467fc740047b93856ce6169837c9ef547d416a763f9a609067e95a53  src/cad/kernel-runtime.ts
d2976d3ae8d8c59321a1910c601829e96c8acedeb4afd084322d2a459b3225b7  src/cad/kernel-plane-transform.ts
```
