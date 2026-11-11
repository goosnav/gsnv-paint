# Sketch geometry mapping — C61 provisional GREEN

C61 translates the analytic point, segment, circle and arc entities into the pinned PlaneGCS geometry primitives. It is CORE: no worker, rendering, file access or solver execution. The result owns its arrays and records, retains native source IDs, allocates collision-free point/rule IDs, and maps every solver primitive back to its source. Points precede curves and mandatory arc rules. Equal coordinates remain independent so a future coincidence relationship can be deleted. Construction geometry still participates in solving.

The D19 decomposition was committed as `17a0c41` before implementation. C09 retains its public interface and will combine geometry mapping, declared relationships/dimensions and inference. C61 is implemented; C62/C63 and their integration remain planned. C50's line-only persisted document and production canvas are unchanged.

The header/types preceded the testbench. All 13 initial tests failed against the unimplemented entry ([RED](evidence/C61-red.txt)); the first implementation passed 13/13 ([first run](evidence/C61-first.txt)). Initial strict typechecking exposed two test-harness typing problems: the arc fixture needed an explicit discriminated entity type, and the package declaration exposes `locateFile` rather than `wasmBinary` for initialization. The fixture now uses the declared API with the actual installed WASM path. No assertion was weakened. [Initial diagnostics](evidence/C61-types-red.txt), [final typecheck](evidence/C61-types.txt).

Independent review found two contract violations, each reproduced by a new regression before repair:

- Sparse arrays bypassed `Array.every` and could yield undefined coordinates or reserved IDs. Required coordinate slots are now checked directly; reserved IDs are iterated. [RED](evidence/C61-sparse-red.txt), [repair](evidence/C61-sparse-green.txt).
- Modulo reduction of large arc starts could miss an overflowing interior extremum even with finite endpoints and an exactly representable sweep. Membership now uses the start's trigonometric direction while native start/end values remain unchanged. The regression also retains a valid inward arc at a large angle. [RED](evidence/C61-phase-red.txt), [final suite](evidence/C61-green.txt).

The follow-up review reran all 15 focused cases and checked both arc directions; no remaining concrete defect was found within C61. [Review record](evidence/C61-review.txt). Source construction accuracy belongs to C07/C08; relationship translation, solver-result acceptance and UI integration were outside this review.

## Verification

Local environment: Linux x64, Node 24.21.0. The existing browser suite ran Chrome 154.0.8037.97 headless at 1280×720. No other browser, OS, pen hardware or native file-picker interaction was tested.

| Command | Result | Output |
|---|---|---|
| `node --import tsx --test src/cad/sketch-geometry-program.test.ts` | Exit 0; 15 pass, 0 fail, 0 skipped | [Focused log](evidence/C61-green.txt) |
| `npm test` | Exit 0; 508 pass, 0 fail, 0 skipped | [Cumulative unit log](evidence/phase2-through-C61-unit.txt) |
| `npm run typecheck` | Exit 0; no diagnostics | [Typecheck log](evidence/C61-types.txt) |
| `npm run test:browser` | Exit 0; production build and 18 browser cases pass, 0 skipped | [Browser log](evidence/phase2-through-C61-browser.txt) |
| `npm run test:spec` | Exit 0; 386 requirements, 172 contracts, trace/map/link checks pass | [Spec log](evidence/C61-spec.txt) |
| Module checker, exact command below | Exit 0; PASS | [Checker log](evidence/C61-checker.txt) |
| Clean copy: `npm clean-install --progress=false --no-audit --no-fund`, `npm run build`, `npx wrangler deploy --dry-run` | All exit 0 with Node 24.22.1 / npm 10.9.2; no auto-configuration/plugin injection | [Cloudflare reproduction](evidence/C61-cloudflare-clean.txt) |

```sh
python3 /home/goosnav/.agents/skills/synced/00ab2cd7-2e1c-45ca-814e-5f657fe548ca_724affcc-3df3-47d2-bd47-95d03e739484/goosnav-modular-coding-method/scripts/check_module.py src/cad/sketch-geometry-program.ts
```

The focused suite includes literal complete program/identity goldens, malformed input, tolerance boundaries, owned outputs, special JavaScript property names, generated-ID collisions and real C07/C08 geometry seams. Actual PlaneGCS consumes circles, clockwise/counterclockwise quarter and major arcs, and a slot. It reports circle DOF 3, arc DOF 5 and independently represented slot DOF 18. A center/radius/angle-constrained arc solves to DOF 0; changing its radius to 12 moves its endpoints to (12,0) and (0,12). No homemade solver or fake native result is used in this smoke.

`node --import tsx src/cad/sketch-geometry-program.demo.ts` exited 0 and printed four solver points, a radius-10 circle, a clockwise quarter arc, one arc rule and complete source/role maps. [Demo output](evidence/C61-demo.txt) illustrates usage; it is not acceptance evidence.

The Cloudflare clean run repeats the owner's original install/build/deploy preparation using the same Node/npm versions. The existing explicit static-asset configuration bypasses the failing automatic Vite modification. The largest asset is 22,942,327 bytes, below the current [25 MiB Pages per-file limit](https://developers.cloudflare.com/pages/platform/limits/); [inventory](evidence/C61-assets.json). Existing Vite warnings about the vendor's conditional `node:module` import and main chunk size remain warnings; native browser worker checks pass. No Cloudflare authentication/upload or hosted URL was tested. GitHub returned no deployment statuses for the previously pushed commit, which is not a live-deployment pass.

## Status and limits

Requirements remain **16 PASS / 0 FAIL / 370 UNTESTED**. PASS IDs: SYS-005, CAD-001, CAD-002, CAD-003, CAD-006, CAD-043, CAD-044, CAD-059, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028. Every other ID remains UNTESTED in [requirements.json](requirements.json). Full interactive circular sketching, all relationship families, complete feature history, CAD golden outputs, Image, Video, performance and release gates remain open. C61 alone passes no additional end-user requirement.

C01–C04, C07–C08, C37 and C50–C61 are GREEN. Human ACCEPTED remains empty. Shared provisional assembly height is 4; CAD height is 3. This mapper adds no production assembly rung. The retained modular method's unexpected-failure halt ends this batch after the repaired GREEN checkpoint. C62 is next on the constraint path after its relationship contract details are closed; C05's separate revision-overflow amendment still awaits the owner. This is not an acceptance or release candidate.

## How to tune

Document `linearMm` and `angularRad` govern geometry collapse and angle representability. `relative` is validated as part of the shared tolerance object; source reconstruction accuracy remains C07/C08's responsibility. There are no hidden epsilon constants or solver settings. Dedicated boundary tests guard tolerance changes. The literal golden and collision tests guard primitive ordering and identity allocation; signed-arc/native tests guard angle direction; sparse and extreme-phase regressions guard finite outputs. Changing point ownership, source geometry types or public error semantics requires a contract amendment. D19 and the file header record alternatives and revisit conditions.
