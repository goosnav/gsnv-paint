# Default planes, editable profiles and revolve proof — approved CAD increment

Parent review (2026-11-13): this map is approved for the owner-authorized BATCH after commit. Every implementation and acceptance gate remains unverified until its named tests run. No acceptance is delegated.

Status: **Gates 1–2 implemented and focused production verification GREEN; gate 3 native proof GREEN; gate 4 production revolve CONTRACTED, 2026-11-13**. Gates 1–3 are frozen for the parent’s candidate regression/checkpoint. The [reviewed revolve contract](CAD-REVOLVE-INCREMENT.md), committed as `a1aaeb8`, supersedes the gate-4 proposals below, including their earlier U-axis option. Production implementation follows the current recovery/checkpoint repairs. This extends [MODULE_MAP-CAD.md](MODULE_MAP-CAD.md), [CAD-FEATURES.md](CAD-FEATURES.md) and [CAD-STEP-IMPORT.md](CAD-STEP-IMPORT.md); it does not replace their remaining scope. The parent committed this map as `df945ee` and its bounded split as `1fc368f`, after the authoring/STEP checkpoint `450d58b`. Exact executed commands, oracles, limits and proposed requirement credit are in [CAD-MODELING-EVIDENCE.md](CAD-MODELING-EVIDENCE.md). No full-CAD completion or human acceptance is claimed.

The next deliverable should let someone create an editable polygonal part on XY, XZ or YZ, change its center and size through expressions, add the existing cuts/edge treatments, and reopen/export it in the correct physical position. A following, separately proved rung should add an editable revolve boss for turned parts. Plate and STEP goldens demonstrate those workflows only; they do not establish complete CAD.

## Baseline inspected before this increment

| Boundary inspected | Existing evidence/capability | Consumer gap |
|---|---|---|
| C07 `sketch-linear-primitives.ts` | Tested line, point, corner/center rectangle and regular polygon constructors; exact shared composite endpoints; construction flag. | Only line/corner rectangle are wired through C50/C51/C57. A constructor does not persist the parameters which generated its segments. |
| C08/C61 circular primitives/geometry program | Tests include real PlaneGCS circles, clockwise/major arcs, slots and an edited arc radius. | Production C52 remains segment/circle-only. Arc/slot source validation, relationship constraints, solution acceptance and analytic profile wires are not connected. |
| C50/C51/C52 current source/edit/solver path | Editable expressions, variables and fixed group positions; real solver; immutable edits and unit binding. | `Sketch.plane` is exactly `XY`. No center-rectangle/polygon source descriptor. The Line coordinates dialog evaluates strings before its numeric action, so it does not retain coordinate formulas. |
| C64/C59 profile/prism | Real polygon/circle outer boundaries with disjoint interior holes; signed extrusion and STEP tests. | One outer region, no analytic arc boundaries or disconnected bosses. The base rectangle action deliberately replaces existing base segments; it must not silently become the implementation of an additive profile tool. |
| `part-builder.ts`/C65 | Ordered base extrusion, cuts, fillet/chamfer; valid single-solid output and stale-result rejection. | Cut start/depth and edge classifications are local XY/Z rules. No arbitrary feature graph, revolve, pattern operands, suppression, rollback or reorder. |
| Pinned OpenCascade declaration | `BRepPrimAPI_MakeRevol(shape, axis, angle?, copy?)`, `gp_Ax1`, rigid transforms are declared locally. | A declaration is not runtime proof. No existing native revolve test was found. |
| C66–C69/imported view | Embedded STEP, every imported solid, physical measurements, native persistence and roundtrip exchange. | Imported geometry remains explicitly non-parametric; this proposal does not infer sketches/history or drop bodies. |

## Sequential delivery and proof gates

1. **Plane foundation:** test C70 and C72 first, then route the existing extrusion/cut/edge chain through one final plane transform. Demonstrate the unchanged acceptance plate in every default plane, including asymmetric positions and negative depth. Ship a usable plane selector with save/reopen, undo and STEP evidence before adding more source types.
2. **Editable profiles:** test C71 source materialization and migration, then connect center rectangle, regular polygon, profile property editing, construction mode and explicit detach. New profiles append; they do not erase existing geometry. Closed free line sketches remain available. Test actual polygon-with-hole extrusion and parameter edits on the default planes.
3. **Revolve proof:** write and execute the native testbench described below before production revolve code. A missing overload, invalid solid, ownership failure or unexplained result halts this rung. Plane/profile delivery does not depend on an assumed successful spike.
4. **Revolve workflow:** only after gate 3, close and commit the narrow source/executor contract, then implement sketch → revolve → edit → native reopen → STEP. Do not expose a command before its complete route exists. Full C19/C23/C24 and general history are still planned.

Every rung retains the existing parametric plate and imported multi-body STEP regressions. Expected RED precedes implementation; focused tests precede coordinated production build/browser verification. Parent owns shared build, full suite, checkpoint and acceptance decisions.

## New leaf contracts for gates 1–2

| ID/file/public entry | Contract and dependencies | Errors and focused testbench |
|---|---|---|
| **C70**, CORE, `default-plane-frame.ts`, `defaultPlaneFrame(plane)` | Exact `plane: 'XY'\|'XZ'\|'YZ'` → owned right-handed `Frame` and column-major rigid `localToWorld: Matrix4`. No I/O/dependencies. These default frames can later be consumed by C18; C18's broader reference geometry stays PLANNED. | `DefaultPlaneError` for any unsupported runtime value. Literal basis/matrix/origin, determinant +1, inverse/roundtrip and ownership tests. |
| **C71**, CORE, `sketch-profile-source.ts`, `materializeSketchProfile({profile, context, tolerance})` | Exact profile union below → owned `{entities: Segment[], fixedEntityIds: string[]}` in stable supplied ID order. Evaluate source parameters with C03; construct with C07. No solver, document mutation, implicit IDs or native calls. Dependencies C03/C07. | `SketchProfileSourceError` for malformed records, wrong kinds, IDs/count, count limit, nonfinite or below-resolution geometry; propagate expression errors. Literal geometry, variable edit, center invariance, unit binding, precision/overflow and immutable input tests. |
| **C72**, SHELL, `kernel-plane-transform.ts`, `transformPartPlane({session, token, plane})` | Live retained single-solid token and C70 plane → one retained valid solid in world coordinates. XY returns the same owned token; a successful nonidentity transform returns a new token and consumes the input exactly once. Dependencies C01/C70. Do not accept arbitrary scale/shear/mirror matrices. | `PlaneTransformError` for ordinary invalid/result failures, which preserve input ownership. Invalid/stale/closed token errors propagate. Native faults make no further native calls and require worker termination. Real B-rep validity, vertex positions, volume/area/COM, STEP, repeated ownership and injected fault tests. |

Each leaf follows the existing method header, independent demo and testbench conventions. Keep leaves under 300 physical lines and within three direct brick dependencies/public symbols. C50 remains near the soft 200-line target; C51 is now a bounded assembly/router. Split narrowly named source validation/edit helpers, with their own committed contracts/tests, before an extension breaches a hard limit. Do not solve the limit by compressing lines or declaring general policy an assembly. `part-builder` and workspace routing remain declared assemblies.

### Plane persistence and routing

The existing `Sketch.plane` string widens to `XY | XZ | YZ`; old XY files retain exactly their meaning. This bounded part has **one root sketch plane**. Every cut sketch inherits it, and mixed plane strings in this subset are rejected. An edit changes the root and inherited cut plane atomically; local numeric seeds and source formulas remain unchanged. Independent face/offset/angled sketches are later work, not simulated by rotating their screen coordinates.

| Plane | Local U basis | Local V basis | Normal U × V |
|---|---|---|---|
| XY | `(1,0,0)` | `(0,1,0)` | `(0,0,1)` |
| XZ | `(1,0,0)` | `(0,0,1)` | `(0,-1,0)` |
| YZ | `(0,1,0)` | `(0,0,1)` | `(1,0,0)` |

All origins are `(0,0,0)` mm. Solver points, profiles, signed extrusion depth, cut start/depth and edge sets execute in this local frame. Transform the **final B-rep once**, before either display tessellation or STEP export. Rotating only a preview mesh would corrupt export; rotating only the boss would corrupt cuts and edge sets. Imported STEP is already world geometry and never passes through this transform.

Sketch input and snapping stay in local U/V millimeters. Show the selected plane and its physical axes; describe edge sets relative to the sketch/extrusion normal, rather than claiming global vertical on XZ/YZ. The current local SVG sketch projection does not by itself pass the full CAD-022 camera procedure, which also requires an angled planar face.

### Persistent profile source

Add optional `Sketch.profiles: ProfileSource[]`. Absence means the legacy empty list; reject unknown keys and malformed present values. Primitive segment entities remain the geometric schema. Descriptors retain generation intent, while evaluated segments are solver inputs, not a replacement for source expressions.

```ts
type Length = { source: string; kind: 'length' };
type Angle = { source: string; kind: 'angle' };
type ProfileSource = {
  id: string; entityIds: string[]; center: [Length, Length]; construction: boolean;
} & (
  { kind: 'center-rectangle'; width: Length; height: Length }
  | { kind: 'regular-polygon'; sides: number; radius: Length; rotation: Angle }
);
```

Rectangle IDs number exactly four. Polygon IDs number exactly `sides`, which is an integer 3–128; 128 is the bounded editor allocation policy, not a measured kernel maximum. `radius` is the circumradius; `rotation` locates the first vertex relative to +U; order is counterclockwise in local coordinates. Center/size/radius/rotation are editable expressions. Side count is chosen at creation and remains fixed for this rung, preserving member identities; changing count is explicitly deferred rather than orphaning references on a variable edit.

Profile IDs and member IDs are globally unique. Members must exist in that sketch, be segments, have matching construction flags and belong to exactly one profile. Profiles may not overlap existing position-controlled groups. Direct persisted constraints/dimensions targeting controlled members are rejected in this subset; the UI offers profile parameters or explicit detach. This prevents two conflicting sources of authority.

Materialize each descriptor before endpoint sharing in C52 and mark its controlled solver points fixed. This is a fully specified parametric primitive, not a substitute solver. Free geometry still uses the real solver. Source changes produce new local geometry without moving the specified rectangle center or losing polygon regularity. No generated solver IDs enter persistence. Validation checks finite resulting extents and edge lengths, not only finite expression values.

Detach evaluates the current profile, writes those canonical-mm segment seeds with the same IDs, and removes only its descriptor. It is an explicit undoable conversion to freely constrained segments; it does not silently occur on ordinary edits. Deleting one controlled member is rejected with a readable explanation; delete-profile removes the entire group atomically. Undo restores both source and geometry.

Proposed C51 action additions (the existing `CADEdit.sketch` selects the sketch):

```ts
{ kind: 'plane'; plane: 'XY' | 'XZ' | 'YZ' } // root and inherited cuts
{ kind: 'add-profile'; profile: ProfileSource } // caller supplies unique IDs
{ kind: 'edit-profile'; profile: ProfileSource } // same id/member IDs/kind/sides
{ kind: 'detach-profile'; id: string }
{ kind: 'remove-profile'; id: string }
{ kind: 'construction'; ids: string[]; enabled: boolean }
```

`construction` changes free entities individually or a complete controlled group; partial group selections are rejected. Construction geometry remains selectable/snappable and participates in appropriate solver behavior, but never creates profile boundaries or changes material volume. Creation supports pointer and numeric input; pointer numbers are stored as explicit mm sources. All typed source strings survive save/reopen. Unit changes bind every new length source alongside existing expressions; angles retain angle semantics. Variable edit/removal validates every descriptor dependency. Errors, ID collisions, invalid dimensions, revision exhaustion and deleted targets produce no partial content/history mutation.

## Revolve native proof and proposed narrow workflow

Use a test-only fixture with the installed pinned kernel, real profile faces and retained-token accounting. No download, dependency change, fallback mesh revolution or fake solver. C59's wire/face construction is currently private; prove the native operation first, then specify a shared narrow face-building helper before production code duplication or an assumed complete C23 implementation.

| Native proof | Independent expected result |
|---|---|
| Rectangle `U ∈ [10,20]`, `V ∈ [0,12]`, axis +V through the origin, 360° | One closed valid solid, volume `3600π mm³`, COM `(0,6,0)`, bounds U/Z ±20 and V 0…12. |
| Same rectangle, 90° and −90° | Volume `900π mm³`; independently assert the opposite quarter-sector locations and cap faces. With positive right-handed rotation about +V, +U sweeps toward −local Z. Volume alone cannot detect reversed rotation. |
| Edit outer radius 20→25 via a stored variable | Volume `6300π mm³` at 360°, radial extent 25, unchanged inner radius 10/height 12; source formulas preserved. |
| Rectangle touching the axis; offset circle profile | Prove a solid cylinder and torus against analytic volume; otherwise restrict the subsequently approved supported profile domain explicitly. Do not extrapolate from the rectangular tube. |
| Invalid angle/zero axis/cross-axis or self-intersecting profile/invalid or multiple result | Readable atomic rejection; no empty success, retained old display solid, or dropped geometry. Zero/tiny angles and sweeps beyond one turn are rejected. |
| Lifecycle and export | Repeat real rebuild/release and STEP mm/inch roundtrip; expect zero retained tokens at normal completion. Inject native numeric/RuntimeError/cleanup faults and assert no subsequent native calls, then terminate/reset the worker generation. |

After this succeeds, the proposed source is the existing mapped `revolve` definition with boss operation, first-sketch dependency, preserved angle expression and explicit empty target bodies. Add a proposed `AxisSource` variant `{kind:'sketch-axis', sketchId: Id, axis:'u'|'v'}` so changing a sketch plane cannot leave a baked world axis behind. This is a contract amendment, not an already supported kind. The recipe resolves it in the sketch frame; bounded angle range is `angularTolerance < abs(angle) <= 2π`, with signed right-handed direction.

The first connected history path is `[Sketch, Revolve]`, offered as an alternative to `[Sketch, Extrude, ...]`; it retains in-place axis/angle and upstream profile editing, undo and native persistence. It must reject converting an existing extrusion with downstream cuts/modifiers until their semantics are deliberately supported. Existing extrusion-specific cut-depth routing must never run against a revolve result by accident. Later cuts/fillets on a revolve and revolve-cut require their own native fixtures before enabling those commands. This useful turned-part workflow is narrower than general history or the full C24 operand/topology contract.

Candidate UI action after proof: `{kind:'revolve'; id:string; axis:'u'|'v'; angle:string}`, with an explicit remove operation. Compile the angle into the global expression inventory and preserve its source. An invalid edit clears the disposable result, names the failed feature and keeps undo/native source available. It may not export the previous solid as if current. New action/source/executor tests and module IDs are committed before production implementation of this rung.

Feature patterns follow later: C22/C24/C26 require the actual added/removed regions and source revision of each seed. Copying the finished body would turn hole/cut patterns into the wrong operation. No current native proof establishes that full replay contract.

## Regression and acceptance test plan

| Layer | Required independent checks |
|---|---|
| C70/C72 | An asymmetric local 20×10×6 prism maps to XY bounds `(20,10,6)`, XZ `(20,6,10)` with Y −6…0, and YZ `(6,20,10)`. Check actual B-rep vertices/COM/normals, negative depth, volume/area and STEP-imported world position. No cumulative transform over repeat rebuilds. |
| Existing plate | Keep `part-builder.test.ts`'s current 100/120-width source expressions, four 10-mm edge offsets, centered pocket and mm→inch→mm expectations. Add separate rotated fixtures which assert transformed hole centers/pocket position and edge treatment, not only unchanged total volume. Imported multi-body fixture remains unaffected. |
| C71 source/edit | Center rectangle at `(10,10)`, corner `(25,20)` → bounds `[-5,0]…[25,20]`; change width 30→40 → `[-10,0]…[30,20]`. Regular hexagon R=10 has area `150√3`; depth 5 has volume `750√3`, and R=12 scales area by 1.44. Circle holes subtract analytically. Test real solver output, unchanged center, formulas, sources/native reopen, undo, invalid groups, detach and allocation bounds. |
| UI | Plane selector before drawing; pointer and typed center rectangle/polygon; append without erasing; edit source fields; construction toggle; keyboard selection and focus return after dialogs; F fit; native reopen; unit-switch display and physical shape; STEP export. Capture an independently inspected production screenshot. |
| Race/failure | Late preview/edit/cancel, failed native build, same-ID reopen, plane switch during build, disposal and export must not publish stale geometry or lose source history. No new network requests or main-thread native work. |

Executed cumulative checks: **76/76 CAD/native tests, 0 skipped; 4/4 production browser tests; 13 bounded brick checks; strict targeted TypeScript exit 0**. All seven new leaf demos also exit 0. The exact commands and saved logs are recorded in [CAD-MODELING-EVIDENCE.md](CAD-MODELING-EVIDENCE.md). `revolve-proof.test.ts` is the actual gate-3 test file; its fixture is test-only and no production module imports it.

`cad-modeling.browser.spec.ts` exercises the connected editor against built production assets at 1280×720. The independently inspected screenshot is [CAD-modeling-production.png](evidence/CAD-modeling-production.png). Proposed new requirement credit is limited to CAD-020/025/030/033 after the parent’s candidate regression. CAD-071 remains unverified as a production workflow; CAD-022, arbitrary CAD-019 fields and full CAD/history acceptance remain open.

## C35 capture coordination

Use the exact approved `CaptureStamp`/`CadCapturePort` in [CROSS-WORKSPACE.md](CROSS-WORKSPACE.md), coordinated with its owner. No second API is introduced here. C35 receives the committed world-space preview, live camera and document/view identity from the local C56 handle in either CAD assembly. Plane/unit/source changes invalidate the stamp even if geometry happens to match. Pending transforms, uncommitted dialog previews or failed builds are not ready committed capture sources. Every imported body's triangles remain included. The model-local frame is entirely behind the worker boundary and cannot cause a second transform during capture.

## Prioritized remaining CAD gaps

1. **Production revolve contract and connected workflow:** gates 1–2 now provide default planes and editable profiles; gate 3 proves the pinned native API only. Share the native profile-face builder with C59 under a reviewed contract, then connect source/edits/execution/persistence/UI before enabling revolve. Preserve the proved profile domain and native-fault ownership rules.
2. **General sketch editing:** C61 → C62/C63/C09/C16 acceptance, source points/arcs/slots, analytic C15/C23 profiles, trim/extend/offset, more driving dimensions and constrained dragging. Existing arc constructor/solver smoke tests do not pass these UI/persistence requirements. Fix typed line coordinate source retention as part of that source-field contract.
3. **Real history and stable selection:** C05 dependency edits/rollback/suppression/reorder, C06 topology references, actual face/edge/vertex selection, planar-face sketches and individual modifiers. C05's historical revision-exhaustion proposal in PHASE-2.md remains unresolved; explicitly approve its error/no-op semantics before implementing it. A single previous plate cannot prove general dependency behavior.
4. **More solid operations:** mid-plane/up-to-face extents, revolve cut, shell and holes, then feature patterns/mirror with exact subtractive replay and explicit body/merge intent. Close H-CAD-04/H-CAD-05 resource/target rules with representative tests, not inferred defaults.
5. **Inspection and delivery:** real selectable geometry measurements/section views/material density, orthographic drawing/DXF/SVG/PDF and 3MF, C35 transparent capture, supported performance/cancellation matrix and complete original acceptance procedures. STEP import/preview is only one completed exchange path.

The approved gate 1–3 implementation is frozen. The parent owns the shared candidate build, full regression, requirement ledger, checkpoint and acceptance decisions. A separately reviewed and committed gate-4 source/executor decomposition is required before any production revolve implementation. No shared dist build or requirement-status edit was performed by the CAD owner during this increment.

## Gate implementation record

Each new leaf passed its expected missing-module RED before implementation, followed by focused GREEN, a standalone demo and strict targeted TypeScript. The final cumulative results are linked above.

| Gate / boundaries | Recorded result and independent evidence |
|---|---|
| **1: C70/C72, C50/C51/part builder/UI** | Literal right-handed default frames; real native asymmetric prism at both signed depths; repeated mm/inch STEP position/volume/area/COM; ordinary/native/cleanup fault ownership. Real solver/kernel integration checks an asymmetric filleted part and off-center cut in every plane. Plane selector, typed/pointer profiles, native reopen and exported XZ world position pass in production Chrome. |
| **2: C71/C73–C76, C50/C51/C52/UI** | Immutable center-preserving source descriptors; exact membership/ID/reference rejection; atomic revisions and edits; unit binding of every new field; real PlaneGCS materialization; polygon-with-circle-hole and construction exclusion in all planes. Production tests cover source editing after reopen, numeric polygon edits, exact center rectangle/hexagon fixtures, group selection, detach/undo and persisted construction lines. |
| **3: test-only native revolve proof** | Full and signed quarter tubes, outer radius 20→25 from an unchanged source formula, analytic volumes/COM/bounds/caps, mm/inch STEP roundtrips and zero retained tokens. Axis-touching cylinder and offset-circle torus satisfy volume/area/COM/bounds. Invalid preflight/empty/multiple/native/cleanup failures are rejected; no further native calls follow injected faults. Production worker replacement behavior remains covered by existing C55 tests, not by a new revolve feature route. |
| **Preserved regressions** | Original 100/120-mm acceptance plate remains unchanged and GREEN through mm→inch→mm. An additional 120-mm plate fixture verifies all three planes, source hole positions, actual pocket corners, bounds/COM and STEP. Existing legacy native-source and every-body STEP import tests remain GREEN. |
| **4: production revolve** | Not implemented or exposed. Needs approved shared face-builder, source/executor and UI contracts; its requirement remains unverified. |

### C73–C76 bounded integration split (approved in `1fc368f`, implemented)

No hard-limit exception is proposed. C51 becomes a declared assembly/router which dispatches to tested policies, updates the revision once, and validates the resulting C50 document. It owns no geometry construction, parameter evaluation, profile membership or model-edit policy. C50 owns its structurally identical persisted Segment type instead of importing the tool-intent type. New leaves stay below 300 physical lines, three direct brick dependencies and three public symbols; split further only under a recorded contract.

| ID / file / entry | Exact boundary and failures | Dependencies / proof |
|---|---|---|
| **C73 CORE**, `sketch-profile-edit.ts`, `manageSketchProfiles(request)` | IN `{sketch:T, action?:ProfileAction, usedIds:readonly string[], context:ExpressionContext, tolerance:Tolerance}`. `T` is a structurally validated sketch with entities `{id,kind,construction}`, constraints `{entityIds,position?:{entityIds}}`, dimensions `{entityIds}` and optional `profiles`. OUT independently owned `T` preserving all unrelated fields; absent action validates collection only. RAISES `SketchProfileEditError` for invalid collection/target/action, propagates C71/expression errors. No mutation on failure. | C71 and C03 type contract only. Test all source membership, references and actions below, including foreign/overlapping groups and detach after a variable change. |
| **C74 CORE**, `cad-expression-policy.ts`, `cadExpressionPolicy(request)` | IN `{units:'mm'|'inch',variables:Variable[],linearMm:number,parameters?:readonly {expression:DimensionValue,range?:'positive'|'nonzero'}[],bindUnits?:boolean}`. OUT `{context:ExpressionContext,values:number[],boundSources:string[]|null}` in parameter order. Evaluate the variable graph once; evaluate every requested expression with C03; optional range compares length magnitude/value to linearMm; binding returns physically equivalent source strings without mutating input. RAISES `CADEditError` for invalid range; C03/C04 errors propagate. Caller supplies structurally valid source kinds and positive tolerance. | C03/C04. Golden variable graph/context, positive/nonzero versus zero/negative, dimension-kind mismatch, cycle/unknown variable, bound source evaluation after mm/inch switch, immutable inputs and empty parameter list. |
| **C75 CORE**, `cad-legacy-sketch-edit.ts`, `editLegacySketch(request)` | IN `{content:CADContent,action:LegacySketchAction,sketch?:Id}`. OUT owned C50-valid content with unchanged revision; only target sketch changes. Actions are the existing line, rectangle, circle, edit-position, dimension, clear, remove, constraint, relation and remove-constraint variants with their current field meanings. Preserve legacy dimensions/positions, canonical-mm numeric points and string formulas. Rectangle replacement keeps controlled profiles; remove cannot delete their individual members; clear explicitly removes all sketch content. RAISES `CADEditError` for target/ID/size/conflict errors; C07/C74/C50 errors propagate. | C50/C74/C07. Existing C51 sketch tests remain cumulative; direct leaf tests assert revision unchanged, owned input, target isolation and every legacy action. |
| **C76 CORE**, `cad-model-edit.ts`, `editCADModel(request)` | IN `{content:CADContent,action:ModelAction}`. OUT owned C50-valid content with unchanged revision. Actions are plane, variable, remove-variable, extrude, remove-extrude, add-cut, cut-extent, edge-feature, remove-feature and units with the current mapped fields. Root plane propagates to all cuts; new cuts inherit it. This leaf inventories all variable/dimension/position/profile/feature expressions for variable validation and unit binding. Referenced variable removal fails atomically. RAISES `CADEditError` for invalid target/ID/range/name/units/plane; C50/C74 errors propagate. | C50/C74. Existing model/unit tests remain cumulative; direct leaf tests assert unchanged revision and native-source geometry invariants. |

`ProfileAction` is exactly:

```ts
{kind:'add-profile';profile:ProfileSource}
{kind:'edit-profile';profile:ProfileSource}
{kind:'detach-profile';id:string}
{kind:'remove-profile';id:string}
{kind:'construction';ids:string[];enabled:boolean}
```

C73 validates a descriptor through C71 before publication. IDs/members are disjoint; all member IDs name existing segments in this sketch with matching construction flags. Constraints/dimensions referencing any controlled member, including a fixed position's complete group, are rejected. `usedIds` is the caller's complete current document inventory of feature/entity/constraint/dimension/profile IDs; add rejects any new profile/member ID in that inventory or another new ID. Edit requires an existing profile and unchanged kind, member order and polygon side count; no new IDs are allocated. Detach evaluates current canonical-mm coordinates, keeps member IDs, removes its descriptor and preserves other content. Remove deletes exactly that profile and its members. Construction requires existing unique IDs and a boolean; every touched controlled group must be selected in full, and its descriptor and member flags change together. Partial selections, foreign IDs and malformed actions fail before returning any modified result. Invalid original collections are rejected rather than repaired by the edit.

C50 uses C74 for its evaluated position context and C73 for optional profile membership (plus C71's type contract). C75/C76 validate against C50 at their return boundary. C51's assembly calls these leaves, builds the complete ID inventory for C73, installs the returned target sketch, then performs the one graph revision increment and final C50 validation. Source errors remain readable and input/history stay unchanged. Scope/semantics of the approved gate 1–2 workflow do not change; only the policy decomposition changes. No production revolve source/executor code is authorized by this split.
