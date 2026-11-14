# Production revolve — Mode A contract

Reviewed by the parent, 2026-11-13. **Bounded connected workflow GREEN; not accepted.**
Steps 1–6 now have implementation and connected verification evidence: C77/C59,
C79, C78, editable source, worker/export and production UI. The
[connected checkpoint](CAD-REVOLVE-EVIDENCE.md) records 978 unit tests, 91 browser
checks, nine offline checks, local hosting, launcher and deployment dry-run.
The earlier component checkpoints below are historical. The original contract
follows; GREEN does not mean human ACCEPTED.
This document closes the proposed gate 4 of [CAD-NEXT-INCREMENT.md](CAD-NEXT-INCREMENT.md)
using the actual gate-3 fixtures in `revolve-proof-fixture.ts` and
`revolve-proof.test.ts`. The parent reviewed the persisted source, analytic
oracles, ownership rules, dependency boundaries and cumulative gates. The owner's
current-phase BATCH authorizes implementation after this map is committed and
the current persistence/checkpoint repairs finish. This does not change any
requirement status or mark a brick human ACCEPTED. No production revolve code
was implemented by the original contract review.

## Deliverable and limits

The connected workflow is **one root sketch → one editable revolve boss →
native save/reopen/recovery → STEP**, with real worker rebuild, readable failed
features, source expression editing, default-plane placement and undo/redo.
Its independent analytic oracles are below. The graph is `[Sketch, Revolve]`;
the existing `[Sketch, Extrude, ...]` route continues to work unchanged.

The supported section is one simple, closed polygon wholly in local `U >= 0`,
or one circle whose minimum U is greater than the document linear tolerance.
Polygon boundaries may touch the axis; polygons may not cross into negative U.
There are no holes or multiple section regions. Construction geometry is
excluded by the existing profile compiler. The only axis is **local +V through
the sketch origin**. Angles satisfy
`angularRad < abs(angleRad) <= 2 * Math.PI`; positive and negative angles follow
the right-hand rule. Zero, below-resolution, nonfinite and multi-turn sweeps
are errors. Do not normalize a multi-turn input modulo one turn or change its
sign. A valid section can still fail the native single-solid check and must
then be flagged, not silently repaired.

U/negative/arbitrary/offset/reference axes, profiles with holes, arbitrary face
planes, revolve cuts, cuts/fillets/chamfers after a revolve, patterns, general
feature reordering and rollback are not established by gate 3 and are excluded
from this increment. This amends the earlier *proposed* `axis:'u'|'v'` to the
actually proved `axis:'v'` only. The native proof fixture stays test-only; no
production module imports it.

## Inspected integration seams

| Existing source | Actual current shape | Required bounded change |
| --- | --- | --- |
| C59 `kernel-linear-prism.ts` | 53 physical lines; duplicates polygon/circle wire and face construction; retains one final solid. Supports holes supplied by C64. | Carve the existing face construction into C77; retain polygon, circular-hole, negative-depth and STEP goldens. Do not remove C59's hole support because revolve excludes holes. |
| C50 `editable-cad-content.ts` | 193 lines; exact key validation; slot 1 is an extrusion; `bossOf` returns **only** an extrusion; `laterOf` assumes slots 2+. | Add exact revolve source/graph validation. Keep `bossOf` extrusion-only so existing downstream-operation guards remain safe. |
| C76 `cad-model-edit.ts` | 103 lines; complete expression inventory; plane/variable/unit/model actions, unchanged revision. | Add revolve angle to the same inventory and C79 range check; add explicit create/edit/remove and bounded replacement semantics. |
| C51 `edit-cad-content.ts` | Declared CORE assembly/router; one revision increment. | Route the new model actions; preserve atomic edits, history and revision exhaustion behavior. |
| `part-builder.ts` | Declared worker assembly; solves root, calls C59, applies local extrusion-specific downstream operations, then C72 once. | Branch explicitly on base-solid kind. C79 → C78 for revolve; no extrusion cut/edge routing or derived extrusion depth for that branch. |
| Editor/STEP workers and C54 preview | Editor consumes retained solid into measurements/triangles; STEP worker currently rejects when `bossOf` is absent. | Accept either supported base-solid kind explicitly; use the same `buildPart` result for display and STEP; preserve token consumption and fresh-worker/stale-result rules. |
| CAD workspace/properties | Extrude-specific menus, dialog, tree, failure naming, export enablement and help text. Workspace is a declared assembly (245 lines at inspection). | Wire a complete revolve action, source dialog and tree row; keep downstream commands disabled for revolve. Do not broaden `bossOf` as a shortcut. |

Existing source schema and general map already reserve revolve as a feature
kind; they do not implement it. The proposed source below is concrete enough
to review and test before changing those consumers.

## Persistent source, units and edits

The S03/S15 envelope remains `{format:'gsnv-cad', version:1, id, title, content}`.
Parametric assets remain empty. Existing source meanings are unchanged; the
supported feature union gains this exact member. Old builds must reject the
new member rather than discard it. Document the new source member alongside
the existing native format when implementation lands.

```ts
type RevolveFeature = {
  id: string; name: string; kind: 'revolve';
  dependsOn: [string]; suppressed: false;
  definition: {
    kind: 'revolve'; operation: 'boss'; sketchId: string;
    profileLoopIds: [];
    axis: { kind: 'sketch-axis'; sketchId: string; axis: 'v' };
    angle: { source: string; kind: 'angle' };
    targetBodyIds: [];
  };
};
```

Both sketch IDs and the single dependency must equal the root sketch feature
ID. Only slot 1 may contain this feature, and its graph must have exactly two
features. IDs remain globally unique, names nonempty, `rollback === 2`, and
revision a nonnegative safe integer. Unknown keys, alternate axis kinds, axis
`u`, nonempty profile/target selections, cuts and later features reject with a
field-specific `CADContentError`. No world-axis vector, evaluated angle, native
handle, cached mesh, or second schema version is persisted.

C50 performs exact structural validation, as it already does for extrusion
depth; geometric/evaluated validity remains a rebuild concern. It need not
import C79 or add a fourth brick dependency. Its local source type must match
the concrete C79 boundary through seam tests. C79 independently validates its
own public request. C76 may depend on C79 as its third direct dependency.

Proposed C76 actions:

```ts
{ kind: 'revolve'; id: string; axis: 'v'; angle: string }
{ kind: 'remove-revolve'; id: string }
```

- With only the root sketch, create one revolve using a new unique ID. With an
  existing revolve, the ID must match and editing retains the ID/name/source
  references. The UI offers only +V; it must not display unimplemented choices.
- An explicit **Replace extrusion with revolve…** transaction may replace a
  lone extrusion while retaining that feature's ID. Its name becomes
  `Revolve 1`; Undo restores the entire previous source. Reject replacement if
  any downstream feature exists. Do not splice away, migrate or reinterpret
  cuts/edge treatments. The ordinary Revolve dialog must identify replacement
  in its title before the user confirms.
- Remove-revolve checks ID/kind and removes exactly that feature, leaving the
  root sketch and its source intact. Reject remove-extrude on a revolve. The
  existing extrude action must reject a revolve instead of inserting an
  extrusion in front of it; the user can explicitly delete the revolve first.
- Adding cut/fillet/chamfer while a revolve exists rejects in CORE even if a
  stale/forged UI command reaches it. Never rely on disabled controls alone.
- C76 returns an owned source with unchanged revision; C51 increments exactly
  once. Invalid IDs, source kinds, axis, expression or angular range reject
  atomically. Valid source whose solved geometry/native result fails remains
  editable and undoable, with a failed feature and no current solid.

Every angle source joins C76's existing inventory of variables, sketch
dimensions/positions/profile parameters and feature dimensions. Variable
edits/removals re-evaluate it and apply C79's angular range rule; do not use
C74's **linear** nonzero threshold for angles. Unit switching binds all length
expressions as today and preserves angular meaning: bare angle arithmetic is
degrees in C03; `deg`, `°`, `rad`, references and sign retain their meaning.
Angle expressions must not be multiplied by 25.4. Save/reopen preserves exact
source text; explicit mm↔inch binding may rewrite text only according to C03's
documented binding behavior. Plane changes preserve the sketch-relative axis
record and local source; C72 places the completed result once.

## New leaf contracts

All were **CONTRACTED** at approval. Each implementation needs a full method header, sibling
testbench with observed RED, demo, then focused GREEN and seam evidence. The
limits are at most 300 physical lines, three direct brick dependencies, three
public symbols and one public entry point. Target below 200 lines; do not pack
statements to evade a limit. Names below are proposed production paths, not
permission to scaffold files ahead of their gate.

### C77 — `kernel-profile-face.ts` — SHELL

Purpose: Construct one worker-local analytic planar face from a validated C64
region. Entry: `buildKernelProfileFace({session, region})`.

IN: live C01 `KernelSession`; C64 `ProfileRegion` in canonical mm, one simple
CCW polygon or circle outer loop, zero or more already validated/disjoint CW
polygon or circular holes. No source expressions or policy decisions here.

OUT: `{ok:true, face:TopoDS_Face}` with **one caller-owned raw wrapper**, or
`{ok:false, reason:'outline-wire'|'hole-wire'|'outer-face'|'hole-face'}` after a
known ordinary builder rejection and completed cleanup. The closed finite
region is a caller precondition; C77 does not infer regions, repair endpoints,
validate the revolve half-plane, mesh geometry or retain a session token.

Ownership: every native allocation is immediately registered. On success,
exclude only the output face from the reverse-order cleanup set, delete all
other wrappers, then return it. Caller registers the returned face immediately
and deletes it exactly once after its solid builder finishes. Inner circular
wires use the existing -Z convention; outer circles use +Z. Preserve C59's
numeric behavior. The tagged ordinary rejection prevents callers from
mistaking an arbitrary native exception with a matching error name for safe
cleanup permission.

RAISES: `DisposedSessionError` before native access for a closed session.
Unknown/native/cleanup exceptions propagate unchanged and require worker
termination with no later native calls. A cleanup exception cannot produce a
success or ordinary-rejection return. DEPS: C01 session type and C64 region
type (2). Public symbols: entry and optional named request/result types (≤3).

Tests/demo: `kernel-profile-face.test.ts` / `.demo.ts`. Pin C59 characterization
before extraction. Fake allocation traces cover every ordinary rejection,
success ownership, closed session, thrown number, WASM exception/runtime error,
plain unexpected Error and cleanup failure. One real-kernel test matrix builds
polygon, circle and mixed-hole faces, consumes them through C59, and verifies
unchanged analytic volume/STEP results. Do not add an unused general wire API.

### C79 — `revolve-recipe.ts` — CORE

Purpose: Compile the bounded revolve source into canonical evaluated parameters
or a native-ready profile recipe. One entry: `revolveRecipe(request)`.

IN common fields: `{source: RevolveFeature['definition'], sketchId:string,
context:C03.DimensionRequest['context'], tolerance:{linearMm,angularRad,relative}}`.
The exact discriminated requests are `operation:'parameters'` or
`operation:'profile'` with `entities: readonly SolvedSketchEntity[]` additionally
required. The latter uses the existing C64 entity boundary (derive its type
from C64 rather than importing C50 and introducing a dependency cycle).

OUT parameters: owned `{axis:{origin:[0,0,0],direction:[0,1,0]}, angleRad:number}`.
OUT profile: the same parameters plus `profile:ProfileLoop`, owned and
canonical, with no inner loops. Source IDs/keys/kind and the +V axis contract
are checked in both modes; C03 evaluates the angle and C79 applies the exact
angular interval. The parameters mode allows C76 to validate angle/variable
edits without pretending to have solved geometry. It does not certify a solid.

The profile mode calls C64 on the **actual solved** entities, rejects every
nonempty holes list, then checks the complete outer boundary: polygon points
must have finite coordinates and `U >= 0`; circle radius/center must be finite
and `centerU - radius > linearMm`. No absolute-value reflection, tolerance
snap, crossing repair, hole drop or first-loop selection. Any negative U,
however small, is rejected rather than silently moved onto the axis. Exact
zero (including signed zero) and axis-touching polygons remain supported.
Inspect actual nonconstruction solved endpoints as well as the compiled boundary:
C53 tolerance clustering must not hide a negative endpoint in one entity order.
This clarifies the existing nonnegative domain without changing C53 or C64.
Source and entities
are never mutated; no native/session/DOM/clock/file access occurs.

RAISES: `RevolveRecipeError` with field/reason for malformed definition,
unsupported axis/operation/selection, wrong reference, invalid tolerance,
angular range, holes or half-plane violation. C03 expression errors and C64
profile errors propagate as readable causes; the worker prefixes the feature
name without claiming extrusion. DEPS: C03 and C64 (2). Public symbols: entry,
request, result types (≤3). No dependency on C78 or on an unbuilt helper.

Tests/demo: `revolve-recipe.test.ts` / `.demo.ts`. Literal source/angle recipe,
degrees/radians/angle variables, edited angle variable and removal, negative
angle/full turn, each tolerance boundary, unknown keys/nulls/wrong source kind,
axis mismatch, negative/crossing/touching polygons, self-intersection, open or
multiple loops, circle tangent/crossing/clearing axis, construction exclusion,
immutable inputs and owned outputs. Test equivalent loop orderings against
physical geometry rather than assuming arbitrary vertex-order equality.

### C78 — `kernel-revolve.ts` — SHELL

Purpose: Execute one validated revolve recipe with the pinned OpenCascade
kernel. Entry: `buildRevolvedSolid({session, recipe})`.

IN: live C01 session and **C79 profile-mode result**, canonical local XY section
and radians. OUT: one C01-owned solid token; caller must consume/release it.
No target body is consumed or fused. No source compilation, axis choice or
half-plane policy is duplicated here. DEPS: C01 session type, C77 face builder,
C79 recipe type (3). Public symbols: entry and optional request type (≤2).

Call C77 with `{outer:recipe.profile, holes:[]}`, construct `gp_Ax1` at local
origin in +V, and call the proved `BRepPrimAPI_MakeRevol(face,axis,angle,true)`.
Require completed operation, non-null result whose topological type is exactly
`SOLID`, a passing `BRepCheck_Analyzer`, and finite positive native volume.
Reject a compound even if it contains one apparently useful solid. Do not
publish mesh-derived volume or choose a first body from multiple results.

RAISES: `RevolveError` for C77's tagged rejection, unfinished operation, null/
non-solid/invalid shape, or nonfinite/nonpositive volume; `DisposedSessionError`
for a closed session. Other exceptions propagate unchanged. On known ordinary
rejection, delete every owned temporary/result in reverse order. On success,
remove only the output wrapper from the temporary set, complete cleanup, then
transfer it once to `session.retain`. No token may be published before cleanup
succeeds. If retain itself fails, stop; let the worker reclaim the unretained
wrapper. No attempt to recover a damaged native session is made.

Tests/demo: `kernel-revolve.test.ts` / `.demo.ts`. Use native validity, mass
properties, analytic B-rep extrema and independent STEP re-import for the
fixtures below. Fake traces assert exact retain/release/temporary ownership,
all ordinary failure branches, and no native calls after an injected unknown,
numeric, WASM or cleanup failure. Repeat successful builds and consume each
token; the retained set must return to zero. The demo shows measured values,
but is not a substitute for tests.

## Fault boundary and existing-brick amendments

Only conditions deliberately recognized by the owning brick are ordinary
failures. C77 communicates them by its tagged result; C78 tracks the exact
ordinary error object it originates. A thrown number, `WebAssembly.Exception`,
`WebAssembly.RuntimeError`, unexpected Error, or any cleanup failure means
**stop native calls immediately**. No broad catch/finally may keep deleting,
resolve/release tokens, query mass properties, probe, inspect native exceptions
or close the native session after that point. The worker owner terminates it.
JS-only readable feature naming and the error reply may still happen.

C59 is an explicit contract amendment as well as a C77 consumer. Its public
input, successful geometry, ordinary error names/messages and hole behavior
remain characterized. Its temporary cleanup must obey the same fail-stop
policy, and final retain must follow successful temporary cleanup. Add RED
ownership/fault tests for this tightening; do not hide it as an extraction-only
change. C59's direct dependencies become C01, C64 and C77 (3). Existing
ordinary error messages map C77's stable rejection reasons to the same
Extrude messages, so the carve-out does not change user diagnostics.

The worker assembly must not release/close a faulted session in a catch or
finally. C55 already terminates a failed job's worker; verify the new route
uses that path. A successful local revolve is transformed exactly once by
C72, whose ownership contract consumes a non-XY input only after a valid
output. C54 consumes the final token into a preview; C37 borrows the final
token for STEP and its export worker releases it after success. Any shared
preview error text still saying Extrude must be named for the actual feature
at the assembly boundary, without widening C54's numerical responsibility.

## Independent analytic oracles

Use millimeters/radians internally, fixed test allowances from the existing
gate-3 tests (`1e-6` for native volume/area/COM/bounds unless an independently
justified fixture needs more), and literal expected coordinates. Never obtain
expected results by running the new recipe/builder twice. Native surface/volume
and analytic extrema are primary; display triangles are not the oracle.

| Section / sweep | Independent expected result |
| --- | --- |
| Rectangle `U=10…20`, `V=0…12`, +360° | Volume `3600π`; area `1320π`; COM `(0,6,0)`; bounds `(-20,0,-20)…(20,12,20)`; one solid, four faces. |
| Same section, ±90° | Volume `900π`; area `330π + 240`; COM `(c,6,-sign(angle)c)`, `c=4(20³−10³)/(3π(20²−10²))`; six faces, including two radial caps. Positive bounds `(0,0,-20)…(20,12,0)`; negative `(0,0,0)…(20,12,20)`. |
| Outer radius variable 20→25, full turn | Volume `6300π`, area `1890π`, radial extent 25, COM V=6, unchanged inner radius/height; original formula remains source. |
| Axis-touching rectangle `U=0…10`, `V=0…12`, full turn | Cylinder volume `1200π`, area `440π`, COM `(0,6,0)`, bounds `(-10,0,-10)…(10,12,10)`. |
| Circle center `(20,6)`, radius 3, full turn | Torus volume `360π²`, area `240π²`, COM `(0,6,0)`, bounds `(-23,3,-23)…(23,9,23)`. |
| Same circle, ±90° | Volume `90π²`, area `60π²+18π`; two circular caps. This is a required new production-executor fixture, not claimed as already proved by gate 3's full-torus test. |

Test local/world placement independently. +V maps to world +Y on XY and world
+Z on both XZ and YZ, but the U and normal directions differ. The local positive
quarter-sweep endpoint `(0,12,-20)` must become `(0,12,-20)` on XY,
`(0,20,12)` on XZ, and `(-20,0,12)` on YZ. The source point `(20,12,0)` maps to
`(20,12,0)`, `(20,0,12)`, and `(0,20,12)` respectively. Volume alone cannot catch
a mirrored/double-transformed axis. Signed sweeps, literals, COM and actual cap
positions must detect that error.

## Build order and cumulative assembly ladder

1. **Characterize then C77:** pin current C59 behavior; write C77 tests RED;
   implement its face adapter and demo; integrate C59 with unchanged geometry
   goldens and explicit new ownership-fault tests. Halt on altered geometry or
   cleanup uncertainty before adding revolve.
2. **C79:** source/angle/profile recipe tests RED → implementation → GREEN/demo.
   Its two modes are tested independently and joined to real C03/C64 outputs.
3. **C78:** fake lifecycle tests and native analytic/STEP cases RED → executor →
   GREEN/demo. It depends only on completed prior bricks. Re-run C59's goldens
   to prove the common face builder has not broken extrusion.
4. **Source/edit seam:** widen C50/C76/C51 after their contract amendments and
   source tests are RED. Exact native roundtrip, variable inventory, angular
   range, unit binding, replacement guards, one revision and history tests
   must pass before exposing a command.
5. **Worker/STEP seam:** real solver → C79 → C78 → C72 → C54/C37, current source
   only; invalid features clear current output, and stale/failed jobs cannot
   publish/export an old solid. Native and original acceptance-plate tests run
   cumulatively, including STEP-imported multi-body projects.
6. **Connected UI:** enable Revolve only when the complete path exists. Run the
   real production browser journey, reopen/recovery/undo/failure paths, full
   suite and candidate packaging/deployment gates under parent coordination.

Existing bounded C50/C76/property modules have room for narrow changes but no
license to exceed limits. A boundary needing a fourth direct collaborator,
more than three public symbols or 300 lines halts for a committed split first.
C51, `part-builder` and workspace orchestration remain declared assemblies;
they must route, not absorb the new leaf policy. Do not create a generic
utility or reclassify an oversized policy leaf as an assembly to bypass limits.

## Required integration tests and planned commands

### Integration correction: C01/C37/C72 fault boundaries

Independent review found inherited seams inconsistent with the fail-stop rule
above. C72 compared a thrown `undefined` to an unset ordinary-error marker;
C37 treated unknown throws as safe for cleanup and swallowed unlink exceptions;
C01 queried native exception messages/refcounts after a cleanup fault and could
continue deleting after an unknown exception. These are corrections to existing
worker-lifetime contracts, with no new public symbols or collaborators.

Only a locally created, identity-tagged ordinary validation rejection permits
further temporary cleanup. Any unknown native/FS/session or cleanup throw,
including `undefined`, `null`, ordinary `Error` or a forged error name, stops all
later native calls. C01 retains its readable `KernelLoadError`/close-diagnostic
interface with JavaScript-only messages and original `cause` where applicable;
it must not inspect/decrement native exception handles. A failed live probe
invalidates retained tokens without attempting more disposal. Whole-worker
termination reclaims remaining wrappers and exception storage. C37 still returns
normal STEP validation errors for ordinary native result-code rejections, but
unknown throws propagate unchanged. Regression tests must establish RED first,
then verify no calls after faults and unchanged geometry/unit oracles. Previous
tests that required native exception inspection or continuing after unknown
deletion errors are superseded by this stricter lifecycle contract; record that
change explicitly, never characterize them as unchanged passing oracles.

New paths listed here are planned, not files created by this draft.

- `cad-revolve-source.test.ts`: exact five-key native envelope/source after
  reopen; sketch-relative axis; unknown/unsupported fields rejected; legacy
  sketch/extrusion/imported STEP migration unchanged; angle references retained;
  units mm→inch→mm physically unchanged; angle-variable edit/removal and wrong
  dimension kind; global ID collisions; revision exhaustion; no downstream
  conversion or unsupported modifier command can change input/history.
- `part-revolve.test.ts`: real PlaneGCS materialization and native build for the
  tube/cylinder/torus fixtures; edited profile/angle variable rebuilds; signed
  sweeps and all default planes; STEP export/import, exact single-solid count,
  physical dimensions and zero retained wrappers; failed source produces no
  success token. Keep the original plate golden expectations unchanged.
- C55/C60 worker tests: old result after angle/plane/unit/profile change,
  same-ID reopen, cancel/dispose, worker/native/cleanup error, watchdog and
  replacement; never publish stale preview or download stale STEP. Faulted
  worker termination must precede another job; source/history remain intact.
- `cad-revolve.browser.spec.ts`: at 1280×720, create the positioned driven
  rectangle, Revolve… with +V and default `360 deg`, preview ±90°, cancel then
  confirm; inspect volume and feature tree; edit radius and angle expressions;
  double-click tree feature to reopen its parameters; Ctrl+Z/Y; native
  save/open and crash recovery; choose XZ/YZ and verify physical placement;
  export STEP and independently re-import it. Feature invalidity is readable,
  current solid/export/capture readiness clears, and Undo restores a valid
  result. No native work on the main thread. Menus/tools expose original app
  icon, tooltip and next-action status text; Enter/Esc and focus behavior follow
  existing transactional dialogs. Disable unsupported choices and label +V
  plainly as “Sketch vertical axis (+V)”.

Planned focused commands once those files exist:

```sh
node --import tsx --test src/cad/kernel-profile-face.test.ts src/cad/kernel-linear-prism.test.ts
node --import tsx --test src/cad/revolve-recipe.test.ts src/cad/kernel-revolve.test.ts
node --import tsx --test src/cad/cad-revolve-source.test.ts src/cad/part-revolve.test.ts \
  src/cad/editable-cad-content.test.ts src/cad/edit-cad-content.test.ts \
  src/cad/cad-model-edit.test.ts src/cad/cad-project-source.test.ts \
  src/cad/cad-worker-client.test.ts src/cad/cad-step-export.test.ts \
  src/cad/part-builder.test.ts src/cad/acceptance-plate-planes.test.ts
node --import tsx src/cad/kernel-profile-face.demo.ts
node --import tsx src/cad/revolve-recipe.demo.ts
node --import tsx src/cad/kernel-revolve.demo.ts
node_modules/.bin/playwright test --config src/cad/cad-revolve.playwright.config.ts
npm run typecheck
npm test
```

The parent coordinates the build consumed by the production browser config;
no simultaneous build/preview ownership is assumed. Run the method checker on
each new/changed bounded brick and retain its exact output. Record observed
RED, test command/exit/count/skips, real browser/version/OS and independently
inspected production screenshot. Demos are illustrations only. A missing test,
unsupported browser or unavailable check is untested, never a pass.

`CAD-071 / V-CAD-071` can be proposed for parent review only after the complete
rectangular revolve/edit-dependent-rebuild procedure and connected persistence/
worker/UI seams pass on the final candidate. This does not complete general
C19/C23/C24, `CAD-072` revolve cut, broad history requirements or full CAD. Human
acceptance remains the owner's decision. Gates without subsequent checkpoint
evidence remain **UNTESTED / PLANNED**.

## Decisions for contract review

- Share C77's analytic face builder, including the existing extrusion-hole
  behavior. Alternative: copy the proof's wire code into production. Rejected
  because display/exchange/extrusion would drift. Revisit with full C23 analytic
  arc/profile support, not before.
- Persist a +V sketch-axis reference. Alternative: baked world axis or U/line
  selection. Rejected because plane edits would detach the axis and the native
  proof does not establish those choices. Revisit after dedicated fixtures and
  an approved reference-axis contract.
- Compile angle parameters separately from solved profile mode through C79's
  one entry. Alternative: solve or call WASM from source edits. Rejected because
  C76 must stay pure and invalid variable edits must reject synchronously.

## C79 recipe checkpoint — GREEN, not accepted

`revolve-recipe.ts` implements the approved pure parameters/profile boundary.
Its 114 physical lines expose three public symbols and depend directly on C03
and C64. It preserves signed angular sources, compiles analytic polygon/circle
sections, and checks original solved endpoints as well as clustered vertices.
No worker, solid builder, persisted source union or UI command is connected yet.

Observed checks (Linux x64, Node 24.21.0):

| Command | Observed output / exit | Evidence |
| --- | --- | --- |
| `node --import tsx --test src/cad/revolve-recipe.test.ts` against the contract stub | 17 failed, 0 passed; exit 1 (expected RED) | [RED](evidence/revolve-recipe-red.log) |
| Same command after implementation | 17 passed; 0 failed, cancelled, skipped or todo; exit 0 | [GREEN](evidence/revolve-recipe-green.log) |
| `npm test` | 940 passed; 0 failed, cancelled, skipped or todo; exit 0 | [full unit run](evidence/revolve-recipe-unit.log) |
| `npm run typecheck` | TypeScript completed; exit 0 | [types](evidence/revolve-recipe-types.log) |
| `npm run test:spec` | 402 requirements and procedures, 214 acyclic contracts; exit 0 | [trace audit](evidence/revolve-recipe-spec.log) |
| Method checker on `src/cad/revolve-recipe.ts` | `PASS: src/cad/revolve-recipe.ts`; exit 0 | [module check](evidence/revolve-recipe-module.log) |
| `node --import tsx src/cad/revolve-recipe.demo.ts` | Signed −π/2 circle recipe; exit 0, no solid claimed | [demo](evidence/revolve-recipe-demo.log) |

Independent read-only review ran C79/C03/C64/C53 together: 50 passed and zero
failed/cancelled/skipped/todo. The reviewer also reported 53 in-memory assertions
covering exact-record descriptors/prototypes/symbols without getter invocation,
concave axis contact under cyclic/reversed order, negative `Number.MIN_VALUE`
endpoints, and unchanged C03/C64 diagnostic names/messages/locations. Those
additional assertions are reviewer evidence, not a committed regression suite.
No concrete defect or public widening was found. Reviewed runtime SHA-256:
`a1183b453cf0859fc72673e8182fa6e40b121a52d42ca647ce4368a1135fafa9`.

No new browser/build run is claimed for this unconnected leaf. The previous
`44d2ee05c4dd8bca698c6925fd82ccb26739aadd` production checkpoint has 89 browser
passes and a [successful Cloudflare build check](evidence/profile-face-cloudflare-check.json).
No requirement status changes: 46 PASS, 0 FAIL, 356 UNTESTED. In particular
`CAD-071 / V-CAD-071` remains UNTESTED until the connected workflow is verified.

## C78 native executor checkpoint — GREEN, not accepted

The executor uses C77's analytic face and C79's canonical recipe. It requires a
completed operation, a non-null exact SOLID, native validity and finite positive
volume. All temporary wrappers are deleted in reverse order before retention;
an unknown, native, cleanup or retain exception stops every further native call.
Runtime size is 79 physical lines, two public symbols, three direct collaborators.
No source union, worker or UI is connected by this leaf.

| Command | Observed output / exit | Evidence |
| --- | --- | --- |
| `node --import tsx --test src/cad/kernel-revolve.test.ts` against the stub | 8 failed, 0 passed; exit 1 (expected RED) | [RED](evidence/kernel-revolve-red.log) |
| Same command after implementation | 8 passed; 0 failed, cancelled, skipped or todo; exit 0 | [first implementation](evidence/kernel-revolve-first-run.log) |
| `node --import tsx --test src/cad/kernel-revolve.test.ts src/cad/revolve-recipe.test.ts src/cad/kernel-profile-face.test.ts src/cad/kernel-linear-prism.test.ts src/cad/kernel-prism-characterization.test.ts src/cad/kernel-prism-ownership.test.ts` | 42 passed; 0 failed, cancelled, skipped or todo; exit 0 | [cumulative seams](evidence/kernel-revolve-seams.log) |
| `npm test` | 948 passed; 0 failed, cancelled, skipped or todo; exit 0 | [full unit run](evidence/kernel-revolve-unit.log) |
| `npm run typecheck` | TypeScript completed; exit 0 | [types](evidence/kernel-revolve-types.log) |
| Method checker on `src/cad/kernel-revolve.ts` | `PASS: src/cad/kernel-revolve.ts`; exit 0 | [module check](evidence/kernel-revolve-module.log) |
| `node --import tsx src/cad/kernel-revolve.demo.ts` | −90° torus: 888.264396098042 mm³, 648.7249318299778 mm², COM `(12.804015171742984,6,12.804015171742984)`; zero retained tokens after release; exit 0 | [demo](evidence/kernel-revolve-demo.log) |
| Cumulative seams above, with additional negative-full-turn, circular-cap and circle-rejection assertions | 42 passed; 0 failed, cancelled, skipped or todo; exit 0 | [final seams](evidence/kernel-revolve-final-seams.log) |
| `npm run typecheck` after those additional assertions | TypeScript completed; exit 0 | [final types](evidence/kernel-revolve-final-types.log) |
| `npm test` after those additional assertions | 948 passed; 0 failed, cancelled, skipped or todo; exit 0 | [final unit run](evidence/kernel-revolve-final-unit.log) |
| `npm run test:spec` | 402 requirements/procedures, 214 acyclic contracts; 46 PASS, 0 FAIL, 356 UNTESTED; exit 0 | [trace audit](evidence/kernel-revolve-spec.log) |

Real native fixtures check volume, surface area, center of mass, analytic curve
extrema, exact single-solid type, face counts and radial cap vertices. Twenty-eight
geometry/unit cases include ±360° and signed quarter tubes at outer radii 20/25,
an axis-touching cylinder at ±360°, and full/signed quarter tori. Every case is exported
to STEP and independently re-imported in mm and inch with the same analytic
oracles; all retained tokens are released between cases. The previous extrusion
and plate oracles are unchanged. Fake traces inject eight fault values at every
call boundary in both polygon and circle construction, and inject cleanup faults
on each ordinary-rejection path for both section types. Each native quarter-torus
inspection also requires exactly two planar caps, each with area `9π`, one
circular boundary of radius 3 and centers `(20,6,0)` / `(0,6,∓20)`, before and
after STEP in both units. The fake is an ownership oracle only.

Independent read-only review found no concrete defect. Its focused C78/C77/C59
run passed 23 tests, with zero failed/cancelled/skipped/todo. Additional in-memory
probes passed 468 circle-path rejection/cleanup injections, eight quarter-torus
cap inspections and six negative-full-turn cases with twelve native measurements
before/after STEP. The parent retained those boundary checks in the regression
suite above; no tolerance was widened. Reviewed runtime SHA-256:
`7ba589b5d7d3c5d831a415f2ef4ee64ff7edd68bc603c780ab6be599df7906da`.

The `ce02b36435a2087045f26427960b84e2f96c5dd0` recipe checkpoint also has a
[successful Cloudflare build check](evidence/revolve-recipe-cloudflare-check.json).
These are component tests, not production browser evidence or full CAD acceptance.
  Revisit if the general C19 recipe layer replaces this bounded path.
- Use a tagged ordinary C77 rejection and fail-stop unknown faults. Alternative:
  caller cleanup based only on exception name. Rejected because an unknown
  native fault could be mistaken for permission to keep calling WASM. Revisit
  only with verified native recovery/stack restoration support.
- Permit only explicit replacement of a lone extrusion. Alternative: convert
  its downstream features or silently discard them. Rejected because their
  current local-Z semantics are not defined for revolve. Revisit after native
  downstream revolve fixtures and a feature-target contract.

Review must resolve these precise source/ownership/replace semantics before
implementation. No additional unresolved axis or multibody default is delegated
to an implementer.
