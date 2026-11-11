# gsnv-paint — development baseline

Baseline: owner brief, 2026-11-10. Phase 0, Mode A. No application implementation exists at this baseline.

Read [ConOps](01-CONOPS.md), [requirements](02-REQUIREMENTS.md), [architecture](03-ARCHITECTURE.md), [module map](MODULE_MAP.md), [verification](05-VERIFICATION.md), [traceability](06-TRACEABILITY.md), [build plan](07-BUILD-PLAN.md), [decisions](DECISIONS.md), and [risks](09-RISKS.md).

## Authority and lifecycle

The owner's request is the scope baseline. CAD has priority; any scope change needs the owner. Nothing omitted from the brief is an implied feature. The repository's initial commit is preserved. Only this product's code is inspected or used; the named skills and Goosnav Brain supply process and brand guidance, not product code.

The owner explicitly requires these development documents committed under `dev/`; this overrides the productization skill's default private/ignored development directory. XP chrome and Tahoma override the branding skill's normal chrome, colors and type stack. Original interface glyphs are functional software graphics, not generated canonical comic art. No mascot or Microsoft assets.

The module map is the contract baseline. Committing it activates the owner's BATCH authorization for bricks of the active phase. The normal contract → expected RED → implementation → GREEN sequence remains mandatory. The deliberately failing, unimplemented testbench is RED evidence, not an unexpected regression. An unexpected test failure, surprise, required contract change, dependency cycle, or hard limit halts the batch. A required re-split is proposed to the owner, never made silently.

Bricks finish GREEN, never self-ACCEPTED. GREEN bricks may be composed provisionally under the owner's phase BATCH authorization; that does not confer human acceptance. Cumulative seam evidence is reported separately from the human acceptance ladder. No accepted brick changes without an owner contract change. M1a ends only at CANDIDATE_FOR_ACCEPTANCE when its complete matrix actually passes; no later milestone is authorized.

## Evidence conventions

Requirements have stable domain IDs; needs are N-001 through N-007. Each requirement has a corresponding verification ID and an explicit procedure in `requirements.json`. PASS means the recorded procedure ran successfully on the stated revision/environment. FAIL means it ran and failed. UNTESTED includes unavailable, skipped and blocked checks, with reasons. A planned test is never evidence of a capability.

Each phase report records commands, exit codes, raw output, requirement coverage and exclusions. Tests must link requirement IDs and test case IDs. Composite feature families pass only when every listed case passes. Performance results record CPU, GPU, RAM, OS, browser version, viewport, fixture, warm/cold state and sample distribution. They do not imply support on other machines.

The owner accepts the product against ConOps scenarios and golden tests. The agent implements and verifies. No fabricated acceptance, platform support or deployment result is permitted.

## Phase evidence boundary

The requirements `phase` is introduction ownership; `verificationPhase` is the planned full-procedure closure phase. A phase gate requires every contracted brick and cumulative seam implemented in that phase to pass its complete testbench, checker and smoke procedure. A shared requirement whose full test spans later workspaces stays UNTESTED until that entire procedure runs; a passing foundation test is recorded as component evidence, never a partial requirement PASS. This permits the ordered Phase 1 shell to be verified without inventing unbuilt CAD/Image/Video behavior. All tests actually run must be green before a phase push; unexpected failures still halt BATCH.
