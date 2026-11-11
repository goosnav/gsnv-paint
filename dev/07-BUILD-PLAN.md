# Build plan

The existing `main` history is preserved. Work is committed and pushed without force at each completed phase. No unrelated Goosnav repository code may be read, copied or ported. Development documents are tracked by explicit owner request.

| Phase | Ordered work and gate |
|---|---|
| 0 | Reconnaissance → current dependency/license/platform evidence → lean V-model suite → Mode A map → independent spec review → trace closure inspection → commit/push. No application code before this commit. |
| 1 | Shared immutable commands/history → project envelopes → view/input contracts → actual file/recovery adapters → original XP chrome/dialogs → workspace assembly → browser smoke and seam checks → commit/push. |
| 2 | Real WASM kernel/solver spikes first; prove worker calls, valid solids, conflicts and asset/license constraints. Then expressions/feature graph, sketch primitives and constraints, editing tools, solid features, reference geometry, selection/inspection, exchange and drawing. Golden CAD and performance gates → commit/push. |
| 3 | Pixel/alpha/color primitives → tiled layers/masks/selections → paint/shapes/text → transforms/filters → image I/O and viewport → complete image golden/performance → commit/push. |
| 4 | Rational timeline and keyframes → read-in-place sources/native codecs/WASM containers → timeline editing and clips → preview/audio clock → export formats and golden sync/performance → commit/push. |
| 5 | Cross-workspace transfer → offline static manifest/headers/asset checks → Cloudflare Pages configuration → M1a launcher/build matrix → candidate verification → commit/push. |

At each brick: read the committed map, write contract header/signature, write failing testbench, record expected RED, implement within limits, run all contract cases and demo and the Goosnav checker, then cumulative seams. Update status to GREEN only. Do not create stubs/directories for future bricks. The explicit BATCH authorization governs continuation within the phase; human acceptance remains pending.

Independent research and reviews may run concurrently. Implementations that share state or depend on each other stay sequential. A suspected invalid contract or new unplanned dependency is a stop, not an invitation to silently rewrite the map.

Technical choices: strict TypeScript, a small static build, Node testbench tooling/Chromium integration, Web Workers, vetted OpenCascade and PlaneGCS packages, native codecs plus WASM containers. Exact versions are locked when a brick first needs them. CI reproduces only tests available in its stated environment; platform and GUI tests remain explicitly separate.

No deadline or artificial scope reduction is inferred. CAD remains first. A blocked later phase does not erase completed evidence or permit false completion claims.

## Phase evidence boundary

The requirements `phase` is introduction ownership; `verificationPhase` is the planned full-procedure closure phase. A phase gate requires every contracted brick and cumulative seam implemented in that phase to pass its complete testbench, checker and smoke procedure. A shared requirement whose full test spans later workspaces stays UNTESTED until that entire procedure runs; a passing foundation test is recorded as component evidence, never a partial requirement PASS. This permits the ordered Phase 1 shell to be verified without inventing unbuilt CAD/Image/Video behavior. All tests actually run must be green before a phase push; unexpected failures still halt BATCH.

## Current execution order (D16)

After the verified Phase 2 engine spikes, build C50–C58 in dependency order and mount the CAD-APP production assembly. This additive vertical increment precedes the remaining feature families so the deployed app supports real editing. The full Phase 2 gate and Phase 3–5 scope remain unchanged. The pending C05 contract is not silently amended.
