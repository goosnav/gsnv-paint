# Module map: CAD, phase 2

Mode A baseline, maintained during Mode B. **C01–C04, C07–C08, C37–C38, C50–C61, C64, CAD-A1, CAD-APP and STEP-APP are GREEN; C05–C06, C09–C36, C39–C49 and C62–C63 remain PLANNED**. The owner alone grants ACCEPTED. The committed phase map and explicit BATCH authorization govern progression; an unresolved contract, failed gate, unexpected dependency, or size-cap breach halts the affected batch.

For a desktop user, CAD turns constrained sketches and ordered feature definitions into editable, validated B-rep solids, measurements, exchange files, and dimensioned drawings. Completion requires the CAD golden cases, error cases, complete feature-family coverage, and measured performance from `05-VERIFICATION.md`.

## File and test rules

Each C-number names exactly one prospective implementation file, with one public entry point and at most three public symbols total. The soft implementation limit is 200 lines; 300 is the hard limit. Re-split before exceeding it. Each lists at most three direct brick dependencies; assembly wiring is separate and must not be hidden behind a callback to evade this cap. Published libraries are recorded beside the brick and in DECISIONS.

For a prospective file `src/cad/<stem>.ts`, the sibling testbench is `src/cad/<stem>.test.ts`, invoked as `node --import tsx --test src/cad/<stem>.test.ts`; its sibling demo is `src/cad/<stem>.demo.ts`, invoked as `node --import tsx src/cad/<stem>.demo.ts`. Browser-only real smoke cases are additionally exercised by the Chromium seam harness. These commands describe future gates, not checks that have run. Contract tests, every RAISES branch, a literal golden case, and a real adapter smoke are required before GREEN. A package/tooling prerequisite is created only when the first brick needs it.

S01 supplies shared immutable history transactions; S03 supplies versioned JSON project envelopes; S04 supplies shared 2D view transforms; S15 supplies the native binary container with checked named assets. Geometry decisions, model policy and all numerical recipes are CORE. Loading/calling WASM, worker messaging, DOM, Canvas/WebGL and external serialization engines are SHELL. Typed kernel/solver runtime ports are public within their owning worker only; neither port nor raw kernel handles cross its boundary.

## Shared boundary types

These are value-contract definitions, not a request to scaffold a central runtime module. Implementations may import type-only declarations; runtime collaboration must remain in DEPS. All records are immutable at public boundaries. Arrays preserve declared order; maps use explicit string IDs. Every number is finite unless a field expressly permits infinity.

| Type | Concrete shape and invariants |
|---|---|
| `Id`, `Revision` | Nonempty document-local string; nonnegative safe integer. IDs are never reused within a document history. |
| `Vec2`, `Vec3`, `RGBA` | Two or three finite coordinates; four numbers in [0,1]. Geometry is canonical millimetres and radians. |
| `Frame` | `{origin:Vec3,x:Vec3,y:Vec3,normal:Vec3}` with right-handed orthonormal axes. |
| `Tolerance` | `{linearMm:number,angularRad:number,relative:number}` with positive values, explicitly versioned in the document. No module invents another tolerance. |
| `Diagnostic` | `{code:string,message:string,subjectIds:Id[],severity:'warning'|'error'}`; message explains the user's geometry or action, not just a vendor error number. |
| `DimensionValue` | `{source:string,kind:'length'|'angle'|'scalar'}`. Source is a numeric literal with optional unit or an arithmetic expression over named variables. |
| `ExpressionContext` | `{units:'mm'|'inch',variables:Record<string,{value:number,kind:DimensionValue.kind}>}`; arithmetic operators +, −, ×, ÷, unary signs, parentheses only. No evaluation of JavaScript or function calls. |
| `EvaluatedValue` | `{value:number,kind:DimensionValue.kind,dependencies:string[]}`; lengths are mm, angles radians, dependencies unique and sorted. |
| `VariableSet` | Ordered `{name:string,expression:DimensionValue}` records with unique identifier names and no reserved unit names. |
| `Entity` | Discriminated `{id,construction:boolean}` plus point `{p}`, segment `{a,b}`, circle `{center,radius}`, or arc `{center,radius,startRad,sweepRad}`. Radius > 0; arc sweep is nonzero and has magnitude < 2π. Composite drawing tools yield these entities, never hidden splines. |
| `Sketch` | `{id,name,plane:PlaneRef,entities:Entity[],constraints:Constraint[],dimensions:Dimension[],projected:ProjectedRef[]}`. Every referenced entity exists; projected geometry retains provenance. |
| `PlaneRef`, `TopologyRef` | PlaneRef is default XY/XZ/YZ, a reference-plane feature ID, or a planar `TopologyRef`. TopologyRef is `{producer:Id,kind:'face'|'edge'|'vertex',semantic:string,signature:TopologySignature}`. |
| `TopologySignature` | `{geometry:'plane'|'cylinder'|'cone'|'sphere'|'line'|'circle'|'other',centroid:Vec3,measure:number,adjacency:string[],orientation:Vec3|null}`; comparison uses explicit tolerance and unique-match policy. |
| `Constraint` | Relationship `{id,kind,entityIds:Id[],pointRoles:string[],inferred:boolean}`, where kind is horizontal, vertical, coincident, parallel, perpendicular, tangent, concentric, equal, collinear, midpoint, symmetric, or fix; or dimension binding `{id,kind:'dimension',dimensionId:Id,inferred:false}`. Binding refers to the stored `Dimension`; arity and permissible entity combinations are validated. |
| `Dimension` | `{id,kind:'linear'|'aligned'|'radius'|'diameter'|'angle',entityIds:Id[],anchors:Vec2[],value:DimensionValue,label:Vec2}`. One selection inference tool chooses the type; double-click edits the same value. |
| `SketchDelta` | `{removeEntityIds:Id[],upsertEntities:Entity[],removeConstraintIds:Id[],upsertConstraints:Constraint[],upsertDimensions:Dimension[],diagnostics:Diagnostic[]}`. No dangling reference survives application. |
| `SolveRequest`, `SolveResult` | Request `{sketch,context,tolerance,drag?:{point:Vec2,entityId:Id,role:string}}`; result `{sketch,dof:number,state:'under'|'fully'|'over'|'failed',conflictingIds:Id[],redundantIds:Id[],diagnostics:Diagnostic[]}`. Unsuccessful solves retain editable input; they do not commit a fabricated solution. |
| `Feature` | `{id,name,kind,dependsOn:Id[],definition:FeatureDefinition,suppressed:boolean}`. Kind is sketch, import, extrude, revolve, fillet, chamfer, shell, hole, linear-pattern, circular-pattern, mirror, plane, axis, or point. |
| `FeatureGraph` | `{features:Feature[],rollback:number,revision:Revision}`; rollback is an index in [0,features.length], dependencies point to earlier features, IDs are unique. Features beyond rollback remain editable but do not execute. |
| `FeatureDefinition` | Exact persisted union in the source-definition table below. These source values precede recipe evaluation; C18–C22 consume this union and cannot redefine it. Unknown tags/fields are rejected at document decode. |
| `FeatureResult` | `{id,state:'valid'|'suppressed'|'rolled-back'|'failed'|'blocked',bodyIds:Id[],diagnostics:Diagnostic[],sourceRevision:Revision}`. A dependent of a failed feature is blocked, not silently evaluated against an old body. |
| `CADDocument` | Runtime `{id:Id,title:string,units:'mm'|'inch',tolerance:Tolerance,variables:VariableSet,graph:FeatureGraph,assets:BinaryAsset[],appearance:Appearance,drawing:DrawingSheet|null}`. Stored form is exactly S03's five-key `{format:'gsnv-cad',version:1,id,title,content:CADContent}` envelope. No second format tag/version is nested in content. |
| `CADContent` | JSON-only `{units,tolerance,variables,graph,assets:STEPAssetRef[],appearance,drawing}` with corresponding CADDocument field types; all members contain only finite JSON values. Unknown keys are rejected. Cached meshes, worker ports and tokens are excluded. |
| `BinaryAsset`, `STEPAssetRef` | Runtime BinaryAsset `{id:Id,mime:'model/step',name:string,bytes:Uint8Array}`; JSON STEPAssetRef `{id:Id,mime:'model/step',name:string,byteLength:number}` references a same-ID S15.NativeAsset. C36 validates names, MIME, exact decoded length, duplicate/unused/missing IDs and import-feature references; S15 alone owns container framing/CRC32. There is no SHA field or assumed checksum in S03. STEP bytes are embedded in NativePackage.assets, not base64 JSON. |
| `CADNativePackage` | S15.NativePackage with project exactly `{format:'gsnv-cad',version:1,id,title,content:CADContent}` and assets `readonly {id:Id,mime:'model/step',bytes:Uint8Array}[]`. Metadata is ≤64 MiB; ≤20,000 assets and total encoded package ≤2 GiB. C36 reconstructs BinaryAsset names from metadata only after S15 container integrity passes. |
| `KernelSession`, `ShapeToken` | Worker-local public port `{generation:number,library:OpenCascadeInstance,retain:(shape:TopoDS_Shape)=>ShapeToken,resolve:(token:ShapeToken)=>TopoDS_Shape,release:(token:ShapeToken)=>void,isClosed:()=>boolean}`; the two vendor aliases come from pinned `replicad-opencascadejs@1.2.1`. ShapeToken is `{id:number,generation:number}`. Executors use this documented port, never private fields or independently loaded instances. None crosses postMessage; serialized replies contain document IDs/buffers only. |
| `SolverSession` | Worker-local public port `{generation:number,engine:SolverEngine,dof:()=>number,snapshot:()=>VendorSketchPrimitive[],isClosed:()=>boolean}`. SolverEngine is the pinned GcsWrapper public-method subset listed below. C02 owns destruction; callers cannot close the module through the port. |
| `KernelConfig` | `{moduleUrl:string,wasmUrl:string,mode:'single'|'threads',tolerance: Tolerance}`; same-origin URLs and exact pinned assets. |
| `KernelStatus` | `{ready:boolean,mode:'single'|'threads',version:string,capabilities:string[],diagnostics:Diagnostic[]}`. Missing capability is visible and is not passed as success. |
| `WorkerJob<T>`, `WorkerReply<T>` | `{jobId:Id,revision:Revision,generation:number,payload:T}`; reply adds `{outcome:'ok'|'error'|'cancelled',value:T|null,diagnostics:Diagnostic[]}`. Wrong revision/generation is stale and cannot commit. |
| `ProfileSet` | `{frame:Frame,loops:{id:Id,edges:Entity[],role:'outer'|'hole'}[],sourceIds:Id[]}`; closed, non-self-intersecting boundaries, explicit nesting/orientation. Open construction geometry is excluded. |
| `SolidRecipe` | Extrude/revolve `{featureId,operation:'boss'|'cut',profiles:ProfileSet,extent,axis?:{origin:Vec3,direction:Vec3},angleRad?:number,targetBodyIds:Id[]}`. Extent is `{kind:'blind',distanceMm}`, `{kind:'mid-plane',distanceMm}`, `{kind:'up-to-face',face:TopologyRef,direction:'forward'|'reverse'}`, or `{kind:'through-all',direction:'forward'|'reverse'|'both'}`. The last two require bounded target bodies; revolving uses explicit angle and axis. |
| `ModifierRecipe` | `{featureId,kind:'fillet'|'chamfer'|'shell',bodyId:Id,references:TopologyRef[],sizeMm:number,direction?:'inward'|'outward'}`; fillet/chamfer select edges, shell selects removable faces; positive size. Shell requires direction copied from its source definition; other modifier kinds omit it. |
| `HoleRecipe` | `{featureId,bodyId:Id,frame:Frame,centers:Vec2[],kind:'simple'|'counterbore'|'countersink',diameterMm:number,depth:{kind:'blind',mm:number}|{kind:'through-all'},counterbore?:{diameterMm,depthMm},countersink?:{diameterMm,angleRad}}`. Only fields matching kind are allowed. |
| `FeatureSeed`, `TransformRecipe` | FeatureSeed `{featureId:Id,sourceRevision:Revision,definition:FeatureDefinition,operation:'additive'|'subtractive'|'mixed',targetBodyIds:Id[]}`. TransformRecipe `{featureId,kind:'linear-pattern'|'circular-pattern'|'mirror',scope:'features'|'bodies',seeds:FeatureSeed[],sourceBodyIds:Id[],targetBodyIds:Id[],transforms:Matrix4[],merge:boolean}`. Feature scope has nonempty seeds; body scope has nonempty sourceBodyIds. Matrices are nondegenerate, ordered, exclude original identity, and use 16 finite row-major entries with column-vector multiplication. |
| `FeatureOperand` | Worker-local `{seed:FeatureSeed,added:ShapeToken[],removed:ShapeToken[]}`. Producing executors retain the actual additive/subtractive tool regions against the feature's pre-result, including hole/cut tools; modifiers retain exact before/after boolean differences. Patterns transform these regions and apply add/subtract booleans against the declared current target body. A completed body is never substituted for a cut/hole seed. |
| `KernelShapeResult` | `{shapes:{bodyId:Id,token:ShapeToken}[],topology:{producer:Id,id:Id,kind:'face'|'edge'|'vertex',semantic:string,signature:TopologySignature,token:ShapeToken}[],operands:FeatureOperand[],diagnostics:Diagnostic[]}`; every returned solid is checked with the kernel's validator. Operand provenance and source revision are mandatory for replayable features; obsolete operands are disposed with their generation. |
| `MeshPacket` | `{bodyId:Id,positions:Float32Array,normals:Float32Array,indices:Uint32Array,faceIds:Id[],edgeLines:Float32Array,edgeIds:Id[],vertices:Vec3[],vertexIds:Id[],bounds:{min:Vec3,max:Vec3}}`; finite positions, valid indices, stable topology correspondence. |
| `CameraState` | `{projection:'orthographic'|'perspective',target:Vec3,orientation:[number,number,number,number],distanceMm:number,scaleMmPerPixel:number,viewport:{width:number,height:number}}`; normalized quaternion and positive scales. |
| `SelectionState`, `Hit` | `{selected:TopologyRef[],hover:TopologyRef|null,filter:('face'|'edge'|'vertex')[]}`; Hit `{ref:TopologyRef,screen:Vec2,depth:number,world:Vec3}`. An empty hit is explicit null. |
| `Appearance` | `{mode:'shaded-edges'|'shaded'|'wireframe'|'hidden-line',bodyColors:Record<Id,RGBA>,faceColors:{ref:TopologyRef,color:RGBA}[],section:{enabled:boolean,frame:Frame,offsetMm:number}}`. |
| `Inspection` | `{kind:'distance'|'angle'|'radius'|'mass',references:TopologyRef[],value:number,units:'mm'|'rad'|'mm2'|'mm3'|'g',secondary:{label:string,value:number,units:string}[],centerOfMass:Vec3|null,diagnostics:Diagnostic[]}`; references identify associative drawing measurements; mass request supplies density in g/mm³. |
| `ViewAction` | Tagged zoom-at-cursor, orbit, pan, standard-view, isometric, fit, normal-to, or set-numeric-view; includes screen positions/deltas and optional selected frame/bounds. |
| `ToolInput` | `{kind:'pointer'|'typed'|'enter'|'escape'|'double-click',point:Vec2|null,values:Record<string,DimensionValue>,modifiers:{shift:boolean,ctrl:boolean},hit:Id|null}`. |
| `ToolState`, `ToolIntent` | State `{tool:string,step:number,anchors:Vec2[],selectedIds:Id[],preview:SketchDelta|null}`; intent tagged `preview`, `commit`, `cancel`, or `select`, with bounded typed request for the selected sketch/feature tool. No mutation or I/O. |
| `PanelModel` | `{title:string,rows:{id:Id,label:string,value:string,status:string}[],fields:{name:string,type:'length'|'angle'|'scalar'|'choice'|'text',value:string,choices:string[]}[],diagnostics:Diagnostic[]}`. UI adapters render this declared content; they do not invent model policy. |
| `CADAction` | Tagged document-new/open/save, undo/redo, select-all/none, copy/cut/paste/delete, feature/sketch edit, or inspection request, with typed feature/entity IDs and values. |
| `ClipboardFragment` | `{version:1,sourceDocument:Id,entities:Entity[],constraints:Constraint[],dimensions:Dimension[],features:Feature[],externalRefs:TopologyRef[]}`. Paste remaps IDs; unresolved external references fail visibly. |
| `ExchangeBytes` | `{name:string,mime:string,bytes:Uint8Array,diagnostics:Diagnostic[]}`; downloadable bytes only, never a network destination. |
| `DrawingSheet` | `{sizeMm:{width,height},marginMm:number,scale:number,views:{id,kind:'front'|'top'|'right'|'isometric',originMm:Vec2}[],dimensions:DrawingDimension[]}`; every view fits inside margins. |
| `DrawingCurve` | Drawing-only union: segment `{id,kind:'segment',a:Vec2,b:Vec2}`, circle/arc `{id,kind:'arc',center:Vec2,radius:number,startRad:number,sweepRad:number}`, ellipse/elliptical arc `{id,kind:'ellipse',center:Vec2,axisU:Vec2,axisV:Vec2,startRad:number,sweepRad:number}`, or bounded polyline `{id,kind:'polyline',points:Vec2[],closed:boolean,chordErrorMm:number}`. Full circles/ellipses use sweep 2π. Polyline error is measured against the projected curve and ≤ declared drawing tolerance. These are output representations, not new sketch entities/tools. |
| `ProjectedDrawing` | `{viewId:Id,visible:DrawingCurve[],hidden:DrawingCurve[],bounds:{min:Vec2,max:Vec2},references:{entityId:Id,source:TopologyRef}[]}` in canonical mm. Isometric circular edges retain elliptical projection; other kernel curves may use the bounded polyline representation. |
| `DrawingDimension` | `{id,kind:Dimension.kind,viewId:Id,sourceRefs:TopologyRef[],anchors:Vec2[],offsetMm:number,text:string}`; displayed value is derived from model measurements, never manually falsified. |
| `DrawingPrimitives` | Ordered `{curve:DrawingCurve,strokeMm:number,dashMm:number[],sourceIds:Id[]}` or `{kind:'text',at:Vec2,text:string,sizeMm:number,rotationRad:number,sourceIds:Id[]}` records; no DOM/Canvas objects. Ellipses remain analytic until PDF rendering; any renderer approximation has an explicit sheet-space tolerance. |
| `ViewportCapture` | `{width:number,height:number,rgba:Uint8ClampedArray,colorSpace:'srgb',alpha:'straight',source:'cad',revision:Revision}`; exactly width×height×4 bytes, transparent background. |

### Exact persisted feature source definitions

`Feature.kind` equals `Feature.definition.kind`. `Length3` is `[DimensionValue,DimensionValue,DimensionValue]` with length kinds; `Direction3` is three scalar DimensionValues normalized after evaluation. `AxisSource` is `{kind:'reference',featureId:Id}` or `{kind:'line',origin:Length3,direction:Direction3}`. `PointSource` is `{kind:'coordinates',xyz:Length3}` or `{kind:'vertex',ref:TopologyRef}`. `ExtentSource` is `{kind:'blind'|'mid-plane',distance:DimensionValue}` or `{kind:'up-to-face',face:TopologyRef,direction:'forward'|'reverse'}` or `{kind:'through-all',direction:'forward'|'reverse'|'both'}`. A signed blind/mid-plane distance supplies direction. These are JSON source expressions, not evaluated kernel recipes.

| Definition kind | Exact stored fields besides kind |
|---|---|
| sketch | `{sketch:Sketch}` |
| import | `{assetId:Id,placement:Matrix4}`; referenced embedded STEP source is mandatory. |
| extrude | `{operation:'boss'|'cut',sketchId:Id,profileLoopIds:Id[],extent:ExtentSource,targetBodyIds:Id[]}` |
| revolve | `{operation:'boss'|'cut',sketchId:Id,profileLoopIds:Id[],axis:AxisSource,angle:DimensionValue,targetBodyIds:Id[]}` |
| fillet | `{bodyId:Id,edges:TopologyRef[],radius:DimensionValue}` |
| chamfer | `{bodyId:Id,edges:TopologyRef[],distance:DimensionValue}`; symmetric distance chamfer. |
| shell | `{bodyId:Id,removeFaces:TopologyRef[],thickness:DimensionValue,direction:'inward'|'outward'}` |
| hole | `{bodyId:Id,plane:PlaneRef,centers:[DimensionValue,DimensionValue][],style:'simple'|'counterbore'|'countersink',diameter:DimensionValue,depth:{kind:'blind',distance:DimensionValue}|{kind:'through-all'},counterbore:{diameter:DimensionValue,depth:DimensionValue}|null,countersink:{diameter:DimensionValue,angle:DimensionValue}|null}`; exactly the field matching style is non-null. |
| linear-pattern | `{scope:'features'|'bodies',seedFeatureIds:Id[],sourceBodyIds:Id[],targetBodyIds:Id[],axis:AxisSource,spacing:DimensionValue,count:DimensionValue,merge:boolean}` |
| circular-pattern | `{scope:'features'|'bodies',seedFeatureIds:Id[],sourceBodyIds:Id[],targetBodyIds:Id[],axis:AxisSource,stepAngle:DimensionValue,count:DimensionValue,merge:boolean}` |
| mirror | `{scope:'features'|'bodies',seedFeatureIds:Id[],sourceBodyIds:Id[],targetBodyIds:Id[],plane:PlaneRef,merge:boolean}` |
| plane | `{mode:'offset',base:PlaneRef,distance:DimensionValue}` or `{mode:'angled',base:PlaneRef,axis:AxisSource,angle:DimensionValue}` |
| axis | `{origin:PointSource,direction:Direction3}` or `{edge:TopologyRef}`; edge must be straight. |
| point | `{source:PointSource}` |

Feature-scope seeds reference earlier replayable features, preserve their source definitions and evaluation revision, and regenerate their operands when any upstream expression changes. Sketch/reference features cannot act as volumetric seeds. Pattern seed order follows feature-tree order. Body scope copies solids; feature scope replays added/removed regions. Merge behavior and targets are explicit stored choices, never inferred from whatever is selected at rebuild time.

### Pinned solver schema and public runtime methods

Read-only declaration audit: `@salusoft89/planegcs@1.3.0`, git head `9d26baef0b240fe0eef4186d4e5e5e66ec3620b7`, [published tarball](https://registry.npmjs.org/@salusoft89/planegcs/-/planegcs-1.3.0.tgz), files `dist/index.d.ts`, `dist/sketch/sketch_primitive.d.ts`, `dist/planegcs_dist/constraints.d.ts`, `dist/planegcs_dist/gcs_system.d.ts`, and `dist/sketch/gcs_wrapper.d.ts`. This closes type availability, not runtime behavior.

`VendorSketchPrimitive`, `VendorSketchParam`, `VendorConstraint`, `VendorSolveStatus`, `VendorGcsWrapper`, and `VendorGcsSystem` are exact type aliases to `SketchPrimitive`, `SketchParam`, `Constraint`, `SolveStatus`, `GcsWrapper`, and `GcsSystem` exported by that pinned package. `SolverPrimitive` narrows `VendorSketchPrimitive` to its `SketchPoint | SketchLine | SketchCircle | SketchArc` geometry members plus the following explicitly allowed vendor constraint interfaces; no ellipse/spline primitives may be emitted.

Allowed interfaces are `Equal`, `P2PDistance`, `P2PAngle`, `P2LDistance`, `PointOnLine_PL`, `Parallel`, `Perpendicular_LL`, `L2LAngle_LL`, `P2PCoincident`, `Horizontal_L`, `Horizontal_PP`, `Vertical_L`, `Vertical_PP`, `CoordinateX`, `CoordinateY`, `ArcRules`, `Tangent_LC`, `Tangent_LA`, `Tangent_CC`, `Tangent_AA`, `Tangent_CA`, `CircleRadius`, `ArcRadius`, `CircleDiameter`, `ArcDiameter`, `EqualLength`, `EqualRadius_CC`, `EqualRadius_CA`, `EqualRadius_AA`, `P2PSymmetric_PPL`, `P2PSymmetric_PPP`. These interfaces are exported from the package root; their exact published fields, not loose object records, define the wire schema.

`SolverProgram={primitives:(SolverPrimitive|VendorSketchParam)[],sourceBySolverId:Record<string,Id>,fixedSourceIds:Id[]}`. Geometry dependency order is point→line/circle/arc→constraints; generated solver IDs map back to document IDs. Concentric uses coincident centers; collinear uses parallel plus point-on-line; midpoint uses point symmetry about the selected midpoint; symmetric uses the appropriate point/line symmetry constraint; fix uses fixed points plus radius constraints where required. Every arc includes `ArcRules`. Dimensions compile to the matching distance, coordinate, radius/diameter or angle interface; all values are evaluated canonical numbers, all persistent constraints driving. Measurements are computed from solved geometry, bypassing documented non-driving limitations.

`SolverEngine` is `Pick<VendorGcsWrapper,'clear_data'|'push_primitives_and_params'|'solve'|'apply_solution'|'get_gcs_conflicting_constraints'|'get_gcs_redundant_constraints'|'get_gcs_partially_redundant_constraints'|'set_convergence_threshold'|'set_max_iterations'>`. C02's `dof()` forwards the published `VendorGcsSystem.dof()`; `snapshot()` returns the public sketch index's primitive snapshot. Published statuses are Success=0, Converged=1, Failed=2, SuccessfulSolutionInvalid=3. Only success with finite geometry and no conflicting constraints commits; other statuses retain input and expose readable diagnostics. The worker spike must verify DOF/conflict mapping and this conservative success rule before sketch assembly is GREEN.

## Brick contracts, in dependency order

### C01 kernel-runtime — SHELL — GREEN
File `src/cad/kernel-runtime.ts`; public `kernelRuntime(request)`.
Purpose: Own a real OpenCascade WASM instance and its worker-local lifetime.
IN: `{action:'open'|'close'|'probe',config?:KernelConfig,session?:KernelSession}`; open supplies same-origin pinned URLs, close/probe supplies a live typed worker-local port.
OUT: `{status:KernelStatus,session:KernelSession|null}`; open returns the public library/retain/resolve/release port and runs a real box/volume probe; close releases tracked handles and invalidates generation. Downstream executors exclusively use this port; temporary vendor objects are disposed in their owning executor before return.
RAISES: `KernelLoadError` on fetch/compile/init failure; `CapabilityError` for unsupported SIMD/exceptions/thread requirements; `DisposedSessionError` for invalid token.
DEPS: none.
Vendor: `replicad-opencascadejs@1.2.1`; commercial-distribution and byte-size evidence recorded in DECISIONS. Spike gate is real worker execution, readable exception conversion, disposal, and asset-size verification. C01 passes the single-runtime gate with evidence in [PHASE-2.md](PHASE-2.md). D10 records fatal-worker replacement, actual heap bounds and explicit unsupported pthread lifecycle; source asset size is verified, final distribution remains open.

### C02 solver-runtime — SHELL — GREEN
File `src/cad/solver-runtime.ts`; public `solverRuntime(request)`.
Purpose: Own a real PlaneGCS instance within a worker.
IN: `{action:'open'|'close'|'probe',moduleUrl?:string,wasmUrl?:string,session?:SolverSession}`; URLs are same-origin pinned assets, session is this adapter's typed live worker-local port.
OUT: `{ready:boolean,session:SolverSession|null,diagnostics:Diagnostic[]}`; public engine/dof/snapshot methods permit C16 execution without private-field access or reinitialization; probe executes one solvable and one contradictory system using the actual solver.
RAISES: `SolverLoadError` on load/init; `DisposedSessionError` on reuse; `SolverCapabilityError` if conflict/DOF reporting is absent.
DEPS: none.
Vendor: `@salusoft89/planegcs@1.3.0`; the public port is readable only inside the owning worker. Spike precedes sketch UI and cannot pass using a fake. D11 records the repaired declaration packaging; D12 records the guarded facade, temporary probes and worker-owned cleanup. Actual constrained-rectangle and contradictory-set worker evidence is in [PHASE-2.md](PHASE-2.md). Module URLs identify the native glue default initializer; the published wrapper is bundled normally. Exceptions from engine methods propagate after port invalidation; owner termination reclaims failed native state. CAD-A1 integration is GREEN with the paired-worker seam evidence in PHASE-2.md; production sketch/model integration remains pending.

### C03 dimension-expressions — CORE — GREEN
File `src/cad/dimension-expressions.ts`; public `evaluateDimension(request)`.
Purpose: Evaluate dimension arithmetic with unit checking. The [file header](../src/cad/dimension-expressions.ts) specifies literal promotion, unit suffixes, precedence and error locations. Bare numeric arithmetic uses document length units or degrees at a dimension boundary; explicit scalar variables and dimensional ratios remain scalar. Variables carry canonical values. Unit switching must preserve existing physical geometry at the document/editing boundary; C03 alone does not perform that migration.
IN: `{expression:DimensionValue,context:ExpressionContext,bindUnits?:boolean}`; grammar and operators are those above.
OUT: `EvaluatedValue`; deterministic canonical units, no host evaluation. D27 adds optional `boundSource` when binding is requested: the same grammar with implicit dimensional arithmetic bound explicitly, variable references and scalar factors preserved. Ordinary output is unchanged. C51 applies this before changing document units; C56/C58 display physical values in the selected units while source expressions remain editable.
RAISES: `ExpressionSyntaxError`, `UnknownVariableError`, `UnitMismatchError`, `DivisionByZeroError`, or `NonFiniteValueError` at the offending token.
DEPS: none.

### C04 named-variables — CORE — GREEN
File `src/cad/named-variables.ts`; public `evaluateVariables(request)`.
Purpose: Resolve named dimensions in dependency order. The [file header](../src/cad/named-variables.ts) specifies input-order preflight, deterministic prerequisite traversal, cycle paths and C03 error provenance. Resolution uses C03 with real canonical prerequisite values; no duplicate expression parser or placeholder values.
IN: `{variables:VariableSet,units:'mm'|'inch'}`; user order may differ from reference order.
OUT: `{context:ExpressionContext,order:string[],dependents:Record<string,string[]>}`; all values resolved without mutating input. Every name appears once in resolution order and maps to its unique sorted direct consumers, including zero-weight references; empty input succeeds.
RAISES: `DuplicateNameError`, `ReservedNameError`, `VariableCycleError`; propagates C03 expression errors with the actual failing variable, original cause and source location. The first reached failure wins; no partial result is returned.
DEPS: C03.

### C05 feature-graph — CORE — PLANNED
File `src/cad/feature-graph.ts`; public `editFeatureGraph(request)`.
Purpose: Apply dependency-safe feature-tree edits.
IN: `{graph:FeatureGraph,edit:{kind:'insert'|'rename'|'delete'|'suppress'|'reorder'|'rollback',id?:Id,index?:number,name?:string,feature?:Feature,suppressed?:boolean}}` with fields required by kind.
OUT: `{graph:FeatureGraph,invalidated:Id[]}`; preserves ordered dependencies and explicitly rejects deletion with surviving dependents; revision increases only on content change.
RAISES: `MissingFeatureError`, `DuplicateIdError`, `DependencyOrderError`, `DependentFeatureError`, `InvalidRollbackError`, `EmptyNameError`.
DEPS: none.

### C06 topology-references — CORE — PLANNED
File `src/cad/topology-references.ts`; public `resolveTopology(request)`.
Purpose: Resolve semantic references against regenerated topology without arbitrary fallback.
IN: `{references:TopologyRef[],candidates:{producer:Id,id:Id,kind:TopologyRef.kind,semantic:string,signature:TopologySignature}[],tolerance:Tolerance}`.
OUT: `{resolved:{reference:TopologyRef,id:Id}[],diagnostics:Diagnostic[]}`; a reference resolves only to one valid candidate.
RAISES: `LostReferenceError` when no match; `AmbiguousReferenceError` when multiple matches; `InvalidSignatureError` for malformed data.
DEPS: none.

### C07 sketch-linear-primitives — CORE — GREEN
File `src/cad/sketch-linear-primitives.ts`; public `makeLinearEntities(request)`.
Purpose: Construct points, lines, corner/center rectangles, and regular polygons.
IN: `{tool:'point'|'line'|'corner-rectangle'|'center-rectangle'|'polygon',anchors:Vec2[],sides?:number,construction:boolean,ids:Id[],tolerance:Tolerance}`; exact ID count and tool-specific anchor count.
OUT: `Entity[]`; closed composites share exact endpoints; polygon sides integer ≥3; construction applies to every result. The [file header](../src/cad/sketch-linear-primitives.ts) fixes center/first-vertex polygon anchors, counterclockwise polygon order and document-tolerance edge validation. Results own their coordinate arrays.
RAISES: `AnchorCountError`, `IdCountError`, `DegenerateGeometryError`, `InvalidPolygonError`.
DEPS: none.

### C08 sketch-circular-primitives — CORE — GREEN
File `src/cad/sketch-circular-primitives.ts`; public `makeCircularEntities(request)`.
Purpose: Construct circles, 3-point arcs, center-point arcs, tangent arcs, and slots.
IN: `{tool:'circle'|'arc-three-point'|'arc-center-point'|'arc-tangent'|'slot',anchors:Vec2[],tangent?:Vec2,widthMm?:number,construction:boolean,ids:Id[],tolerance:Tolerance}`; tangent arc supplies tangent direction; slot supplies positive width.
OUT: `Entity[]`; arcs preserve declared drawing direction; slot yields two arcs and two segments with connected endpoints.
RAISES: `AnchorCountError`, `IdCountError`, `CollinearArcError`, `InvalidRadiusError`, `ImpossibleTangentError`, `DegenerateGeometryError`.
DEPS: none.
Anchor conventions: circle = center/radius point; three-point arc = start/through/end; tangent arc = start/end with the forward tangent at start; slot = two end-cap centers plus overall width. Center-point arc accepts center/start/end for the shortest signed sweep (the antipodal tie is counterclockwise), or center/start/through/end to declare a major or clockwise sweep from the pointer path. Center-arc through/end anchors specify rays; radius comes from start. Every tool needs one ID except a slot's four, emitted segment/arc/segment/arc around a counterclockwise outline. The construction flag and ID order are preserved. Radius, distinct anchors and slot-center distance must exceed document linear tolerance; collapsed angular sweeps and repeated through directions are rejected. Reconstruction residuals use max(linearMm, relative × local extent): the maximum anchor-pair span for three-point arcs, chord length for tangent arcs, explicit radius for center arcs, and width for slot caps. World-coordinate magnitude, distant circumcenters and center-arc ray lengths never enlarge this bound. Radius/separation/collinearity collapse remains governed by linearMm; sweep and tangent-direction resolution use angularRad. Unrepresentable results raise DegenerateGeometryError. C08 remains UI-free; C50's current line-only project subset is not widened by this brick. The focused and cumulative evidence, review repairs and integration limits are in [CAD-CIRCULAR-PRIMITIVES.md](CAD-CIRCULAR-PRIMITIVES.md).

### C09 sketch-constraint-policy — CORE — PLANNED
File `src/cad/sketch-constraint-policy.ts`; public `constraintPolicy(request)`.
Purpose: Validate, infer, add, and delete the listed sketch constraints.
IN: `{sketch:Sketch,action:'validate'|'infer'|'add'|'delete'|'compile',candidate?:Constraint,pointer?:Vec2,removeId?:Id,tolerance:Tolerance,context:ExpressionContext}`; action supplies its required field, compile resolves stored dimension bindings.
OUT: `{delta:SketchDelta,suggestions:Constraint[],program:SolverProgram}`; exact pinned vendor aliases above define primitive fields; compile emits only allowed line/circle/arc/point and constraint types. Inferred suggestions require user-visible glyphs and remain individually deletable.
RAISES: `ConstraintArityError`, `UnsupportedConstraintPairError`, `MissingEntityError`, `MissingConstraintError`, `ConflictingFixRequestError`.
DEPS: C61, C62, C63.
D19 separates geometry mapping, relationship/dimension mapping and inference behind this existing entry point. C09 owns action validation, immutable deltas and assembly of the declared SolverProgram; it does not duplicate those translations. C03 is reached through C62. H-CAD-02 still requires real solver behavior; published types alone do not prove it.

### C10 sketch-dimensions — CORE — PLANNED
File `src/cad/sketch-dimensions.ts`; public `dimensionPolicy(request)`.
Purpose: Infer the appropriate dimension from one/two entities and evaluate edits.
IN: `{sketch:Sketch,selectedIds:Id[],placement:Vec2,edit?:{id:Id,value:DimensionValue},context:ExpressionContext}`; one or two entities for creation, existing ID for edit.
OUT: `{dimension:Dimension,constraints:Constraint[],label:string}`; linear/aligned/radius/diameter/angle is deterministic from entity types and placement; edits retain identity.
RAISES: `DimensionSelectionError`, `AmbiguousDimensionError`, `MissingDimensionError`, `InvalidDimensionRangeError`; propagates C03 errors.
DEPS: C03, C09.

### C11 sketch-trim-extend — CORE — PLANNED
File `src/cad/sketch-trim-extend.ts`; public `trimExtendSketch(request)`.
Purpose: Trim or extend a selected segment/arc at the chosen intersection.
IN: `{sketch:Sketch,tool:'trim'|'extend',entityId:Id,pick:Vec2,boundaryIds:Id[],ids:Id[],tolerance:Tolerance}`.
OUT: `SketchDelta`; modified entity ancestry is explicit and affected constraints are removed with diagnostics rather than silently retargeted.
RAISES: `MissingEntityError`, `UnsupportedTrimEntityError`, `NoIntersectionError`, `AmbiguousIntersectionError`, `DegenerateGeometryError`.
DEPS: none.

### C12 sketch-offset — CORE — PLANNED
File `src/cad/sketch-offset.ts`; public `offsetSketch(request)`.
Purpose: Produce a signed planar offset of selected segment/arc chains.
IN: `{sketch:Sketch,entityIds:Id[],distance:DimensionValue,context:ExpressionContext,ids:Id[],tolerance:Tolerance}`; selected edges form ordered connected chains.
OUT: `SketchDelta`; side follows chain direction; invalid self-intersections do not commit.
RAISES: `DisconnectedChainError`, `OffsetCollapseError`, `SelfIntersectionError`, `IdCountError`; propagates C03 errors.
DEPS: C03.

### C13 sketch-corners — CORE — PLANNED
File `src/cad/sketch-corners.ts`; public `editSketchCorner(request)`.
Purpose: Replace a selected two-segment corner with a fillet or chamfer.
IN: `{sketch:Sketch,kind:'fillet'|'chamfer',entityIds:[Id,Id],size:DimensionValue,context:ExpressionContext,ids:Id[],tolerance:Tolerance}`; connected noncollinear segments.
OUT: `SketchDelta`; tangent arc or chamfer segment and trimmed source segments with exact joins.
RAISES: `InvalidCornerError`, `CornerSizeError`, `IdCountError`; propagates C03 errors.
DEPS: C03.

### C14 sketch-transforms-patterns — CORE — PLANNED
File `src/cad/sketch-transforms-patterns.ts`; public `transformSketch(request)`.
Purpose: Mirror or pattern selected sketch geometry and its internal constraints.
IN: `{sketch:Sketch,entityIds:Id[],kind:'mirror'|'linear-pattern'|'circular-pattern',axis?:{a:Vec2,b:Vec2},center?:Vec2,step?:Vec2,angleRad?:number,count:number,ids:Id[],tolerance:Tolerance}`; count includes original and is integer ≥2.
OUT: `SketchDelta`; originals stay; each generated set has unique IDs and transformed internal references; external constraints are excluded with diagnostics.
RAISES: `InvalidPatternError`, `DegenerateAxisError`, `MissingEntityError`, `IdCountError`.
DEPS: C09.

### C15 sketch-profiles — CORE — PLANNED
File `src/cad/sketch-profiles.ts`; public `classifyProfiles(request)`.
Purpose: Classify solved non-construction geometry into valid profile loops.
IN: `{sketch:Sketch,frame:Frame,tolerance:Tolerance}`; solver result accepted by the command policy.
OUT: `ProfileSet`; explicit outer/hole nesting, preserved source IDs, deterministic loop order.
RAISES: `OpenProfileError`, `SelfIntersectionError`, `OverlappingLoopError`, `ZeroAreaProfileError`, `NonPlanarProfileError`.
DEPS: none.

### C16 sketch-solver-adapter — SHELL — PLANNED
File `src/cad/sketch-solver-adapter.ts`; public `solveSketch(request)`.
Purpose: Translate a validated sketch to PlaneGCS and return actual solver diagnostics.
IN: `{session:SolverSession,request:SolveRequest}`; typed port originates from C02, C09 supplies exact SolverProgram primitives and source-ID mapping.
OUT: `SolveResult`; uses public clear/push/solve/apply, dof and snapshot port methods; only a successful finite nonconflicting solve updates geometry, temporary dragging preserves persistent constraints, DOF controls color state and vendor IDs map back to document IDs.
RAISES: `DisposedSessionError`, `SolverExecutionError`, `SolverResultError` when vendor output is nonfinite or lacks valid diagnostics; over-constraint is a readable result state, not an uncaught exception.
DEPS: C02, C09.
No rendering, UI timing, or homemade solver.

### C17 sketch-edge-projection — SHELL — PLANNED
File `src/cad/sketch-edge-projection.ts`; public `projectModelEdges(request)`.
Purpose: Read selected existing B-rep edges and project supported curves onto a sketch plane.
IN: `{session:KernelSession,shapes:KernelShapeResult,references:TopologyRef[],plane:Frame,tolerance:Tolerance}`; references uniquely resolve.
OUT: `{entities:Entity[],provenance:ProjectedRef[],diagnostics:Diagnostic[]}`; `ProjectedRef={entityId:Id,source:TopologyRef,plane:Frame}`; circular/linear analytic geometry retains exact type.
RAISES: `LostReferenceError`, `AmbiguousReferenceError`, `UnsupportedProjectedCurveError`, `ProjectionDegenerateError`, `KernelExecutionError`.
DEPS: C01, C06.

### C18 reference-geometry — CORE — PLANNED
File `src/cad/reference-geometry.ts`; public `referenceGeometry(request)`.
Purpose: Define offset/angled planes, reference axes/points, and validated planar sketch frames.
IN: `{kind:'default-plane'|'face-plane'|'offset-plane'|'angled-plane'|'axis'|'point',base:Frame|null,axis?:{origin:Vec3,direction:Vec3},point?:Vec3,values:DimensionValue[],context:ExpressionContext}`; face-plane requires a kernel-verified planar base.
OUT: `{frame:Frame|null,axis:{origin:Vec3,direction:Vec3}|null,point:Vec3|null}` with exactly the result appropriate to kind.
RAISES: `ReferenceInputError`, `NonPlanarFaceError`, `DegenerateAxisError`; propagates C03 errors.
DEPS: C03.

### C19 additive-cut-recipes — CORE — PLANNED
File `src/cad/additive-cut-recipes.ts`; public `makeSolidRecipe(request)`.
Purpose: Validate extrusion/revolution parameters independently of the kernel.
IN: `{feature:Feature,profiles:ProfileSet,context:ExpressionContext,targets:{bodyId:Id,bounds:{min:Vec3,max:Vec3}}[],references:TopologyRef[],sourceRevision:Revision}`; kind extrude/revolve, specified blind/mid-plane/up-to-face/through-all extrusion or explicit axis/angle revolution.
OUT: `{recipe:SolidRecipe,seed:FeatureSeed}`; evaluates expressions, retains extent direction and sets seed from the original Feature.definition/sourceRevision, with boss additive and cut subtractive. Target intent remains explicit.
RAISES: `EmptyProfileError`, `InvalidExtentError`, `MissingTargetBodyError`, `MissingLimitFaceError`, `InvalidRevolveAxisError`, `InvalidAngleError`; propagates C03 errors.
DEPS: C03, C15.

### C20 modifier-recipes — CORE — PLANNED
File `src/cad/modifier-recipes.ts`; public `makeModifierRecipe(request)`.
Purpose: Validate constant-radius fillet, chamfer and shell requests.
IN: `{feature:Feature,bodyId:Id,references:TopologyRef[],context:ExpressionContext,sourceRevision:Revision}`; correct feature kind and selected topology types.
OUT: `{recipe:ModifierRecipe,seed:FeatureSeed}`; positive canonical size, preserved shell direction and stable references; seed retains original definition/sourceRevision with mixed added/removed semantics. Geometric feasibility is left to the kernel.
RAISES: `ModifierSelectionError`, `InvalidModifierSizeError`, `MixedBodySelectionError`; propagates C03 errors.
DEPS: C03.

### C21 hole-recipes — CORE — PLANNED
File `src/cad/hole-recipes.ts`; public `makeHoleRecipe(request)`.
Purpose: Validate simple, counterbore and countersink hole dimensions.
IN: `{feature:Feature,bodyId:Id,frame:Frame,centers:Vec2[],context:ExpressionContext,sourceRevision:Revision}`; hole kind and all required diameters/depths/angles supplied.
OUT: `{recipe:HoleRecipe,seed:FeatureSeed}`; seed retains original definition/sourceRevision with subtractive semantics; bore diameter is positive, counter diameter exceeds bore, blind depth positive, countersink angle in (0,π).
RAISES: `HoleParameterError`, `MissingHoleCenterError`, `CounterboreDepthError`, `CounterDiameterError`; propagates C03 errors.
DEPS: C03.

### C22 solid-pattern-recipes — CORE — PLANNED
File `src/cad/solid-pattern-recipes.ts`; public `makeTransformRecipe(request)`.
Purpose: Define linear/circular patterns and mirrors of bodies or additive/subtractive feature seeds.
IN: `{feature:Feature,seeds:FeatureSeed[],sourceBodyIds:Id[],context:ExpressionContext,frame:Frame,sourceRevision:Revision}`; source definition explicitly declares feature/body scope and target IDs; count includes original and is integer ≥2 for patterns; mirror supplies a plane.
OUT: `{recipe:TransformRecipe,seed:FeatureSeed}`; executing seed retains original definition/sourceRevision and inherited additive/subtractive/mixed operation; ordered rigid/reflection matrices, seed recipes/provenance, target bodies and explicit merge decision. A cut/hole seed remains subtractive; it does not become a copy of the finished body.
RAISES: `PatternCountError`, `PatternSpacingError`, `PatternAngleError`, `EmptyPatternSourceError`, `InvalidMirrorPlaneError`, `UnsupportedFeatureSeedError`, `StaleSeedRevisionError`; propagates C03 errors.
DEPS: C03.

### C23 kernel-profile-wires — SHELL — PLANNED
File `src/cad/kernel-profile-wires.ts`; public `buildProfileFaces(request)`.
Purpose: Convert validated analytic profiles into real B-rep wires/faces.
IN: `{session:KernelSession,profiles:ProfileSet}`.
OUT: `{faces:ShapeToken[],sourceIds:Id[],diagnostics:Diagnostic[]}`; valid planar faces with correct holes, all handles owned by session.
RAISES: `KernelProfileError`, `InvalidKernelFaceError`, `DisposedSessionError`; rejects rather than repairing away intended holes.
DEPS: C01, C15.

### C24 kernel-solid-operations — SHELL — PLANNED
File `src/cad/kernel-solid-operations.ts`; public `executeSolidRecipe(request)`.
Purpose: Execute a prism/revolve boss or cut with the real kernel.
IN: `{session:KernelSession,recipe:SolidRecipe,seed:FeatureSeed,faces:ShapeToken[],targets:KernelShapeResult,limitFace:ShapeToken|null}`; recipe prepared by C19, seed carries matching source definition/revision, tokens session-valid.
OUT: `KernelShapeResult`; kernel validates result and exposes generated/modified topology plus exact added/removed FeatureOperand tools for later feature replay; additive and subtractive provenance remain distinct.
RAISES: `KernelOperationError`, `InvalidResultSolidError`, `NoIntersectionError`, `LimitFaceError`, `DisposedSessionError`; failed builder output is never committed.
DEPS: C01, C19, C23.

### C25 kernel-modifiers — SHELL — PLANNED
File `src/cad/kernel-modifiers.ts`; public `executeModifierRecipe(request)`.
Purpose: Execute fillet, chamfer and shell operations while retaining readable failure detail.
IN: `{session:KernelSession,recipe:ModifierRecipe,seed:FeatureSeed,source:ShapeToken,selected:ShapeToken[]}`; seed carries matching source definition/revision, selection matches recipe and owning body.
OUT: `KernelShapeResult`; checks completion, validity and kernel failure status, and records exact before/after added/removed regions for modifier seeds before returning.
RAISES: `FilletFailureError`, `ChamferFailureError`, `ShellFailureError`, `InvalidResultSolidError`, `DisposedSessionError` with feature/edge IDs and vendor message where available.
DEPS: C01, C20.

### C26 kernel-holes-transforms — SHELL — PLANNED
File `src/cad/kernel-holes-transforms.ts`; public `executeDerivedRecipe(request)`.
Purpose: Execute holes or prepared body/feature patterns and mirrors using real B-rep booleans.
IN: `{session:KernelSession,recipe:HoleRecipe|TransformRecipe,seed:FeatureSeed,sources:KernelShapeResult}`; seed carries the executing feature's source definition/revision, validated recipe selects current target bodies, and feature scope supplies matching revision-tagged FeatureOperands from seed executors.
OUT: `KernelShapeResult`; holes retain subtractive tool operands. Feature pattern/mirror transforms seed added/removed regions and replays fuse/cut against targets in stored seed order; body scope transforms complete solids. Every replay is validated and preserves provenance; a four-hole pattern must contain four real voids in the same plate.
RAISES: `HoleCutFailureError`, `TransformFailureError`, `PatternFuseFailureError`, `PatternCutFailureError`, `MissingFeatureOperandError`, `StaleSeedRevisionError`, `InvalidResultSolidError`, `DisposedSessionError`.
DEPS: C01, C21, C22.
Split before CONTRACTED if both thin vendor operations cannot fit 300 lines; do not move recipe policy here.

### C27 rebuild-policy — CORE — PLANNED
File `src/cad/rebuild-policy.ts`; public `advanceRebuild(request)`.
Purpose: Plan incremental feature rebuilding and accept only current valid results.
IN: `{document:CADDocument,results:FeatureResult[],event:{kind:'edit'|'result'|'cancel',changedIds?:Id[],reply?:WorkerReply<FeatureResult>},generation:number}`; reply identity includes source revision.
OUT: `{results:FeatureResult[],nextFeatureIds:Id[],invalidated:Id[],retainVisibleBodyIds:Id[],diagnostics:Diagnostic[]}`; respects rollback/suppression and dependencies, marks failures and blocked dependents, discards stale replies.
RAISES: `InvalidFeatureGraphError`, `UnknownFeatureReplyError`, `InvalidGenerationError`; failure results are ordinary states and do not erase the last valid body.
DEPS: C04, C05, C06.

### C28 kernel-tessellation — SHELL — PLANNED
File `src/cad/kernel-tessellation.ts`; public `tessellateBodies(request)`.
Purpose: Extract display triangles, selectable topology and analytic edge polylines.
IN: `{session:KernelSession,bodies:KernelShapeResult,linearDeflectionMm:number,angularDeflectionRad:number}`; positive deflections.
OUT: `MeshPacket[]`; correct face orientation/normals and transfer-ready buffers; meshes never replace B-rep source.
RAISES: `TessellationError`, `InvalidMeshError`, `DisposedSessionError`.
DEPS: C01.

### C29 camera-policy — CORE — PLANNED
File `src/cad/camera-policy.ts`; public `updateCamera(request)`.
Purpose: Calculate CAD orbit, pan, cursor zoom, standard/normal views and fit.
IN: `{camera:CameraState,action:ViewAction,bounds:{min:Vec3,max:Vec3}|null}`; selected face normal supplies a verified frame.
OUT: `CameraState`; wheel cursor anchor remains invariant, fit includes bounds, normal-to is orthographic and plane-aligned.
RAISES: `InvalidCameraError`, `EmptyFitBoundsError`, `MissingFaceFrameError`, `DegenerateViewError`.
DEPS: S04.

### C30 selection-policy — CORE — PLANNED
File `src/cad/selection-policy.ts`; public `updateSelection(request)`.
Purpose: Apply hover, Ctrl multi-selection, box selection and topology filters.
IN: `{state:SelectionState,action:{kind:'hover'|'click'|'box'|'all'|'none'|'filter',ctrl:boolean,hits:Hit[],filter?:SelectionState.filter},available:TopologyRef[]}`; hits are depth-ordered actual renderer results.
OUT: `SelectionState`; unique references, active filters honored, empty clicks clear unless Ctrl, deterministic visible box inclusion.
RAISES: `UnknownSelectionReferenceError`, `InvalidSelectionFilterError`, `InvalidHitError`.
DEPS: C06.

### C31 cad-webgl-viewport — SHELL — PLANNED
File `src/cad/cad-webgl-viewport.ts`; public `viewport(request)`.
Purpose: Render supplied CAD meshes and perform actual screen hit readback.
IN: tagged create/update/hit/dispose request carrying canvas/renderer handle, `MeshPacket[]`, `CameraState`, `Appearance`, `SelectionState`, and screen region as appropriate.
OUT: `{handle:object|null,hits:Hit[],renderedRevision:Revision,diagnostics:Diagnostic[]}`; shading/edges/wire/hidden-line, clipping, colors and highlight match supplied view state.
RAISES: `WebGLUnavailableError`, `ContextLostError`, `InvalidRenderInputError`, `DisposedViewportError`.
DEPS: C28, C29, C30.
Vendor renderer may handle GPU plumbing; display policy is C32. The prospective request union must list exact DOM handle types at CONTRACTED.

### C32 display-policy — CORE — PLANNED
File `src/cad/display-policy.ts`; public `editAppearance(request)`.
Purpose: Apply display mode, section plane and per-body/per-face color changes.
IN: `{appearance:Appearance,edit:{kind:'mode'|'section'|'body-color'|'face-color',mode?:Appearance.mode,section?:Appearance.section,bodyId?:Id,face?:TopologyRef,color?:RGBA},knownBodies:Id[]}`.
OUT: `Appearance`; untouched fields preserved; section numeric offset and drag offset use the same values.
RAISES: `InvalidDisplayModeError`, `InvalidSectionPlaneError`, `UnknownBodyError`, `InvalidColorError`, `InvalidFaceReferenceError`.
DEPS: C06.

### C33 kernel-inspection — SHELL — PLANNED
File `src/cad/kernel-inspection.ts`; public `inspectGeometry(request)`.
Purpose: Obtain accurate distance, angle, radius and mass properties from B-rep geometry.
IN: `{session:KernelSession,kind:Inspection.kind,selected:ShapeToken[],references:TopologyRef[],densityGPerMm3?:number}`; appropriate one/two objects, positive density for mass.
OUT: `Inspection`; volume, area, mass and center of mass derive from kernel geometry rather than tessellation; unsupported measurements are readable diagnostics.
RAISES: `InspectionSelectionError`, `InvalidDensityError`, `UnsupportedRadiusError`, `KernelInspectionError`, `DisposedSessionError`.
DEPS: C01, C06.

### C34 cad-viewport-controls — SHELL — PLANNED
File `src/cad/cad-viewport-controls.ts`; public `bindViewportControls(request)`.
Purpose: Bind pointer, keyboard, view cube and trackpad buttons to declared view/selection actions.
IN: `{element:HTMLElement,camera:CameraState,selection:SelectionState,emit:(event:ViewAction|ToolInput)=>void}`; one active binding per element.
OUT: `{dispose:()=>void,update:(state:{camera:CameraState,selection:SelectionState})=>void}`; middle-drag orbit, Shift+middle-drag pan, wheel cursor zoom, F fit, face normal-to and numeric action controls emit identical intents.
RAISES: `InvalidControlTargetError`, `DuplicateBindingError`; pointer cancellation releases capture and cancels preview.
DEPS: C29, C30, C31.
Binding does not itself commit feature edits.

### C35 cad-viewport-capture — SHELL — GREEN
File `src/cad/cad-viewport-capture.ts`; public `captureCADViewport(request)`.
Purpose: Capture the current CAD view with transparent background for Image.
IN: `{viewport:CadCapturePort,width:number,height:number,expected:CaptureStamp,signal?}`; explicit committed scene/camera/current-stamp port; positive integer dimensions, at most 4,194,304 pixels and viewport aspect ratio within integer rounding tolerance.
OUT: `Promise<ViewportCapture>`; straight-alpha sRGB pixels from a cloned scene/camera and temporary transparent renderer; no background or editing overlays; all imported bodies retained, requested committed revision only.
RAISES: `CaptureSizeError`, `StaleCaptureError`, `ContextLostError`, `CaptureReadbackError`, abort and native renderer errors.
DEPS: none (pinned Three.js; C56 supplies the structural port, without a reverse runtime dependency).
The approved [transfer refinement](CROSS-WORKSPACE.md) supersedes the earlier future-C31 handle. Exact alpha/orientation/black-white fringe, context loss, stale/cancel and multiple-body tests are GREEN on Linux Chrome/SwiftShader; other GPUs remain unverified. Phase 5 D04 consumes this boundary; broad C31 selection/rendering remains PLANNED.

### C36 cad-project-format — CORE — PLANNED
File `src/cad/cad-project-format.ts`; public `cadProject(request)`.
Purpose: Map an editable CAD document to JSON metadata plus named embedded STEP assets and reconstruct it.
IN: tagged `{action:'encode',document:CADDocument}` or `{action:'decode',package:CADNativePackage}`; decoded package has passed S15 framing/CRC checks. Shared limits are 64 MiB metadata, 20,000 assets and 2 GiB total container.
OUT: encode `CADNativePackage`, decode `CADDocument`; exactly the five S03 envelope keys are produced, all Uint8Array STEP bytes live in named NativeAsset entries, and all source feature definitions/expressions/references/rollback/colors survive. No kernel token is serialized.
RAISES: `CADFormatError`, `UnsupportedCADVersionError`, `InvalidGraphError`, `MissingEmbeddedAssetError`, `UnexpectedEmbeddedAssetError`, `AssetReferenceError`, `AssetLengthError`; validates exact per-kind source fields, format, references, names/MIME and lengths. S15 owns CRC integrity, S03 owns common JSON validation; C36 owns CAD semantic validation and never replaces a live session itself.
DEPS: S03, S15, C05.

### C37 step-exchange — SHELL — GREEN
File `src/cad/step-exchange.ts`; public `stepExchange(request)`.
Purpose: Import/export STEP using real kernel translators.
IN: `{session:KernelSession,action:'import'|'export',bytes?:Uint8Array,bodies?:KernelShapeResult,units:'mm'|'inch'}`; action supplies bytes or valid solids.
OUT: `{bodies:KernelShapeResult|null,file:ExchangeBytes|null}`; imports become non-parametric source solids with source bytes retained by the document; export includes declared units.
RAISES: `STEPReadError`, `STEPTransferError`, `STEPWriteError`, `InvalidImportedSolidError`, `DisposedSessionError`.
DEPS: C01.
Real acceptance disposes original B-rep before importing exported STEP and remeasuring.
The current brick returns one token per valid imported solid with empty topology/operand metadata; the document assembly retains source bytes and assigns document-local feature IDs. Native import UI and full CAD-A7 remain pending. Canonical kernel geometry is mm regardless of document display units. The pinned writer needs both model units and a temporarily set/restored `write.step.unit` to label inch output correctly (D17).

### C38 stl-serialization — CORE — GREEN
File `src/cad/stl-serialization.ts`; public `writeSTL(request)`.
Purpose: Serialize validated display-independent export meshes to binary STL.
IN: `{name:string,meshes:MeshPacket[],unitScaleToMm:number}`; positive scale and closed export triangulation.
OUT: `ExchangeBytes`; deterministic triangle count, outward normals and millimetre coordinates.
RAISES: `InvalidExportMeshError`, `STLSizeOverflowError`, `InvalidUnitScaleError`.
DEPS: none.
Export tessellation is requested explicitly; current low-resolution viewport mesh is not silently reused. Working-editor amendment (D21): `writeSTL` is GREEN as a pure serializer; the production CAD adapter currently passes the displayed B-rep triangulation (C54, 0.1 mm linear / 0.5 rad deflection) as the export mesh and documents that limit. A dedicated export tessellation request remains part of C28. Degenerate triangles are written with a zero normal and reported as a diagnostic.

### C39 threemf-serialization — CORE — PLANNED
File `src/cad/threemf-serialization.ts`; public `write3MF(request)`.
Purpose: Serialize solid meshes and body colors into a valid 3MF package.
IN: `{name:string,meshes:MeshPacket[],colors:Record<Id,RGBA>,units:'mm'|'inch'}`; closed manifold mesh and unique body IDs.
OUT: `ExchangeBytes`; deterministic ZIP members, model units, valid relationships and indexed triangles.
RAISES: `InvalidExportMeshError`, `ThreeMFPackageError`, `UnsupportedColorError`, `ThreeMFSizeOverflowError`.
DEPS: none.
Pure ZIP library selection/license is a prerequisite decision before CONTRACTED, not hand-written compression.

### C40 dxf-serialization — CORE — PLANNED
File `src/cad/dxf-serialization.ts`; public `writeDXF(request)`.
Purpose: Serialize sketch or planar-face boundaries as analytic DXF entities.
IN: `{name:string,entities:Entity[],units:'mm'|'inch',includeConstruction:boolean}`; already in a validated planar frame.
OUT: `ExchangeBytes`; lines, arcs, circles and points retain analytic coordinates, layer distinguishes construction geometry.
RAISES: `UnsupportedDXFEntityError`, `InvalidDXFGeometryError`, `DXFSizeOverflowError`.
DEPS: none.
Planar face extraction is C17; nonplanar faces are rejected before serialization.

### C41 drawing-layout — CORE — PLANNED
File `src/cad/drawing-layout.ts`; public `layoutDrawing(request)`.
Purpose: Arrange front/top/right/isometric projections and associative dimensions on a sheet.
IN: `{sheet:DrawingSheet,projections:ProjectedDrawing[],measurements:Inspection[],units:'mm'|'inch'}`; all required view IDs present, measurements match dimension source IDs.
OUT: `DrawingPrimitives`; visible/hidden curves including ellipse/elliptical arcs or tolerance-bounded polylines, scale and dimensions fit sheet bounds; model edits update values from measurements. Layout preserves analytic projection type and source references.
RAISES: `MissingDrawingViewError`, `DrawingOverflowError`, `InvalidDrawingScaleError`, `MissingDimensionMeasurementError`, `LostDrawingReferenceError`.
DEPS: C10, C06.

### C42 kernel-drawing-projection — SHELL — PLANNED
File `src/cad/kernel-drawing-projection.ts`; public `projectDrawingViews(request)`.
Purpose: Generate analytic visible/hidden projected edges using the kernel's HLR facilities.
IN: `{session:KernelSession,bodies:KernelShapeResult,views:{id:Id,kind:'front'|'top'|'right'|'isometric',frame:Frame}[],tolerance:Tolerance}`.
OUT: `ProjectedDrawing[]`; orthographic/isometric projected geometry keeps source references for dimensions; projected circles may be ellipse/elliptical arcs, and other curves use kernel-derived polylines with measured chord error ≤ document tolerance. This extends drawing representation only.
RAISES: `ProjectionKernelError`, `DrawingApproximationError` if the stated bound cannot be achieved, `InvalidProjectionFrameError`, `DisposedSessionError`.
DEPS: C01.
No raster screenshot is substituted for drawing vectors.

### C43 drawing-pdf — SHELL — PLANNED
File `src/cad/drawing-pdf.ts`; public `renderDrawingPDF(request)`.
Purpose: Render approved drawing primitives into portable PDF bytes.
IN: `{name:string,sheet:DrawingSheet,primitives:DrawingPrimitives,fontBytes:Uint8Array,toleranceMm:number}`; positive sheet-space tolerance, locally bundled licensed font, no remote resources.
OUT: `ExchangeBytes`; page dimensions match mm values, text/lines/elliptical projections remain vector, fonts embedded when permitted. PDF cubic approximation of an ellipse/arc must meet the supplied sheet-space tolerance (model linear tolerance × sheet scale); tested bounds are part of rendering, not a new sketch tool.
RAISES: `PDFFontError`, `PDFRenderError`, `PDFSizeError`.
DEPS: C41.
Vendor PDF engine and font license are explicit prerequisites; renderer performs serialization only, no layout policy or file writes.

### C44 sketch-tool-state — CORE — PLANNED
File `src/cad/sketch-tool-state.ts`; public `advanceSketchTool(request)`.
Purpose: Track pointer/typed-input stages for sketch tools with preview, Enter and Esc.
IN: `{state:ToolState,input:ToolInput,sketch:Sketch,toolSchema:{name:string,steps:number,requiredValues:string[]}}`; selected tool is within the owner's list.
OUT: `{state:ToolState,intent:ToolIntent,statusText:string}`; each next click is stated, typed and drag values use the same request, Escape clears transient preview and Enter confirms only complete input.
RAISES: `UnknownSketchToolError`, `InvalidToolStageError`, `IncompleteTypedInputError`; incomplete pointer input stays pending rather than becoming invalid geometry.
DEPS: none.
Tool-specific geometry executes in C07–C14 via assembly; this brick cannot call an opaque geometry callback.

### C45 sketch-canvas — SHELL — PLANNED
File `src/cad/sketch-canvas.ts`; public `sketchCanvas(request)`.
Purpose: Render solved sketch geometry, dimensions, constraint glyphs and transient tool previews.
IN: tagged create/update/dispose request carrying canvas, sketch frame, `SolveResult`, `ToolState`, selected IDs, 2D view transform, and under/fully/over state colors.
OUT: `{handle:object|null,hitRegions:{id:Id,kind:'entity'|'constraint'|'dimension',bounds:{min:Vec2,max:Vec2}}[]}`; dimensions support double-click routing, glyphs have deletable IDs, under-defined point handles are visible.
RAISES: `CanvasUnavailableError`, `InvalidSketchRenderError`, `DisposedSketchCanvasError`.
DEPS: C16, C29, C44.
Does not solve or commit; exact DOM/transform types close at CONTRACTED.

### C46 cad-tree-panels — SHELL — PLANNED
File `src/cad/cad-tree-panels.ts`; public `renderCADTreePanels(request)`.
Purpose: Bind the feature tree, rollback bar, named variables and errors to declared actions.
IN: `{host:HTMLElement,model:PanelModel,graph:FeatureGraph,results:FeatureResult[],emit:(action:CADAction)=>void}`.
OUT: `{dispose:()=>void,focusId:Id|null}`; rename/suppress/delete/reorder/rollback and double-click edit emit commands; failed/blocked features display readable reasons.
RAISES: `InvalidPanelHostError`, `PanelModelError`; blocked reorder remains unchanged and displays C05 diagnostics.
DEPS: C04, C05, C27.

### C47 sketch-tool-panels — SHELL — PLANNED
File `src/cad/sketch-tool-panels.ts`; public `renderSketchToolPanels(request)`.
Purpose: Bind sketch tools, constraints and dimension editing to the shared chrome.
IN: `{host:HTMLElement,model:PanelModel,tool:ToolState,emit:(input:ToolInput)=>void,iconRegistry:Record<string,string>}`; all tool icons are original local SVG paths, labels include shortcut tooltips.
OUT: `{dispose:()=>void,activeTool:string}`; palette and context menu cover listed tools, plane selection, dimension edits, constraint deletion and typed values; status prompt comes from C44.
RAISES: `MissingToolIconError`, `InvalidPanelHostError`, `PanelModelError`.
DEPS: C09, C10, C44.

### C48 feature-inspection-panels — SHELL — PLANNED
File `src/cad/feature-inspection-panels.ts`; public `renderFeaturePanels(request)`.
Purpose: Bind typed feature/reference/pattern values, viewport arrows, live previews and inspection panels.
IN: `{host:HTMLElement,model:PanelModel,featureId:Id|null,preview:{revision:Revision,pending:boolean,diagnostics:Diagnostic[]},emit:(action:CADAction)=>void}`; model fields originate from recipe contracts.
OUT: `{dispose:()=>void,dialogState:'open'|'closed'}`; input changes request transient rebuild, OK/Enter commits one history entry, Cancel/Escape restores pre-dialog state; double-click feature reveals dimensions.
RAISES: `InvalidPanelHostError`, `PanelModelError`, `StalePreviewError`.
DEPS: S01, C27, C33.
C18–C22 recipes feed this panel through assembly, which explicitly performs the validation and preview calls.

### C49 cad-clipboard — CORE — PLANNED
File `src/cad/cad-clipboard.ts`; public `cadClipboard(request)`.
Purpose: Produce or apply an editable CAD clipboard fragment with safe ID/reference remapping.
IN: `{action:'copy'|'cut'|'paste',document:CADDocument,selectedIds:Id[],fragment?:ClipboardFragment,newIds:Id[],offset:Vec3}`; paste supplies fragment and sufficient unique IDs.
OUT: `{fragment:ClipboardFragment,document:CADDocument,changedIds:Id[],diagnostics:Diagnostic[]}`; copy leaves document unchanged, cut enforces C05 deletion policy, paste preserves internal references and rejects unresolved external geometry.
RAISES: `EmptyClipboardSelectionError`, `UnsupportedClipboardVersionError`, `InsufficientPasteIdsError`, `UnresolvedClipboardReferenceError`, `DependentFeatureError`.
DEPS: C05, C09, C06.
Browser clipboard I/O and keyboard dispatch belong to shared shell adapters, never this CORE.

## Conceptual component mapping

| Architecture component | Brick IDs |
|---|---|
| CADModel | C03–C06, C18–C22, C27, C36, C46, C48, C49 |
| CADSketch | C07–C17, C23, C44, C45, C47 |
| CADKernel | C01, C02, C16, C17, C23–C28, C33, C37, C42 |
| CADViewport | C28–C35, C45 |
| CADExchange | C35–C43 |

Overlap identifies a seam, not duplicate ownership. Every ID has only one file. C35 is the stable CAD-to-Image boundary.

## Build order and assembly ladder

The current GREEN foundation is C01–C04/C07–C08; C37 provides native STEP exchange, C50–C60 provide the working CAD path, and C61 supplies the full sketch geometry mapper awaiting constraint integration. CAD-A1, CAD-APP and STEP-APP are three provisional CAD assembly rungs. Human ACCEPTED remains empty. C05's separate revision-exhaustion amendment remains pending in [PHASE-2.md](PHASE-2.md#c05-pending-contract-amendment--revision-exhaustion); its approved contract has not changed. D16/D17 record the working-editor execution order. Remaining independent leaves and their consumers continue in dependency order; C38–C40 supply further export formats, and the complete C05–C49 scope remains required. C41 consumes dimension policy and resolved model measurements; C42 supplies projections through assembly, so neither calls the other.

Assemblies are wiring/test entry points, **not bricks**, and contain no geometry or application policy. They may import more than three already-eligible bricks because their only role is explicit connection. If wiring starts interpreting feature definitions, calculating dimensions, or resolving failures, extract that decision into a contracted CORE brick and halt before proceeding.

| Rung | Explicit wiring and real seam evidence |
|---|---|
| CAD-A1 — GREEN | [Contract and real browser gate](CAD-ENGINE-ASSEMBLY.md). A dedicated worker entry loads C01/C02; tests readiness, real box mass and contradictory solver data, then disposes. Main-thread responsiveness and thread header capability are measured. No mesh surrogate. |
| CAD-A2 | C03→C04→C27 with C05/C06: expression edits invalidate the correct suffix; rollback/suppression/reorder and ambiguous topology fail visibly. |
| CAD-A3 | C07/C08/C09/C10→C16→C15→C23: draw, constrain, dimension, solve and make a face; over-constraint has actual conflict IDs; C11–C14 edits rebuild through the same path. |
| CAD-A4 | C18–C22→C24/C25/C26→C27→C28: explicit typed routing returns current-revision results; executors use C01's public worker-local port. Golden plate, width change and failing fillet run here. Additional real-kernel fixtures pattern/mirror a hole and cut, verify expected void count/volume, and change the seed dimension to prove operand regeneration; whole-body duplication cannot satisfy them. |
| CAD-A5 | C28/C29/C30/C32→C31, C34/C44→domain recipes, C45–C48→shared chrome/history: test plane-normal sketch entry, under-defined dragging, full tool prompts, typed/drag parity, live Cancel/OK, context menus and selection. |
| CAD-A6 | C36↔S03/S15 plus S01 and shared persistence/clipboard shell: full editable project round-trip including literal STEP bytes, 100+ undo steps, recovery and real save/open. Assert five envelope keys, JSON-only content, named asset references and CRC-corruption rejection before document replacement. C49 fragments paste with remapped references; rejected cuts preserve state. |
| CAD-A7 | C37→C33, C28→C38/C39, C17→C40, C42/C33→C41→C43: STEP volume round-trip; independent STL/3MF/DXF/PDF readback and drawing inspection. Golden front/top/right/isometric views of a circular hole verify ellipse projection, dimensions and bounded curve error. |
| CAD-A8 | C31→C35: alpha/size/color/revision verified; then complete CAD browser golden and 50-feature performance suite. The phase 5 transfer assembly later sends this exact `ViewportCapture` to Image. |

Cumulative seams remain rerunnable. Expected RED before implementation is recorded as testbench evidence; it is never represented as passing product verification. A GREEN rung remains provisional until owner acceptance.

## Required contract closures and halt issues

These are real prerequisites, not silent guesses or excuses to omit functionality. Affected bricks cannot move from PLANNED to CONTRACTED until closure is recorded in DECISIONS and the map; accepted-contract changes require owner direction under the method.

| Issue | Required closure and affected boundary |
|---|---|
| H-CAD-01 | C01/C02 spike must verify pinned binary API, public runtime ports, worker loading, native exceptions, disposal and numeric output. Declaration audits alone are insufficient. Every distributed kernel/solver asset must stay strictly below 26,214,400 bytes under the owner's asset rule and currently verified Pages limit; retain exact source/build/license notices and replacement instructions. |
| H-CAD-02 | Type closure completed from the pinned 1.3.0 published declarations: SolverProgram and public session methods above replace the loose schema. Runtime gate remains UNTESTED: every required constraint mapping, arc rules, actual DOF/conflict IDs, finite output and conservative success handling must pass real PlaneGCS tests before GREEN. Non-driving measurements stay independent. |
| H-CAD-03 | Set and document numerical tolerance/version, identity matching and which semantic signatures are stable under the plate width change. Unique matching is mandatory; a match failure flags the feature. C06 must be proven before arbitrary face-attached sketches or edge-dependent modifiers are claimed. |
| H-CAD-04 | Close multi-body boss/cut, mirror/pattern merge semantics and through-all/up-to-face direction rules with representative fixtures. The map carries explicit target IDs and merge intent, but the UI default is not specified by the brief. C19/C22 cannot quietly choose destructive multi-body behavior. |
| H-CAD-05 | Declare allocation bounds, maximum pattern count and worker timeout/cancel policy from measured capability. Cancelling synchronous kernel work may require worker termination and generation reset; retain last valid committed source and reconstruct tokens. Do not promise interruptibility that the vendor call lacks. C01/C27/C35 depend on this closure. |
| H-CAD-06 | Shared schema closure completed against the current root map: S01 generic immutable domain snapshots, S03 exact five-key gsnv-cad JSON envelope, S15 named binary assets/CRC32, and C36 domain reconstruction. Runtime round-trip/save/recovery seams remain UNTESTED; no SHA or typed array is invented inside Json content. |
| H-CAD-07 | HLR drawing representation is closed with analytic ellipse/elliptical arcs plus bounded polylines, separate from sketch entities. Still close drawing dimension associativity, sheet defaults, projection convention (first/third angle), and PDF font license before implementation. Projection/rendering must prove approximation bounds; no raster substitution, guessed labels, or new sketch tools. |
| H-CAD-08 | Verify 3MF/PDF library licenses and independent output readers before C39/C43 contract promotion. Domain layout remains CORE; external serialization remains bounded and cannot fetch assets. |
| H-CAD-09 | Record benchmark hardware, browser build, display size and fixture composition before claiming 60 fps or <2 s on a 50-feature part. These are UNTESTED until observed; APIs being present is not performance evidence. |
| H-CAD-10 | The full tool roster may exceed 300 lines in C08/C09/C26/C31/C49. Inspect each contract/testbench before implementation; if the cap cannot hold, halt and split the brick with explicit new IDs and revised dependencies before proceeding. Do not evade the cap with uncontracted helpers. |

## Coverage notes

The map covers default/planar-face sketches, all named sketch entities and editing tools, all listed constraints and dimension types, parametric rebuilding/tree controls/variables/units, every requested solid/reference feature, direct and typed manipulation, the complete viewing/selection/display/inspection list, all CAD output formats and drawing sheets. Generic shortcuts, menus/dialog chrome, original icons, project file access and autosave are phase-1 shared services connected explicitly in CAD-A5/A6. CAD workspace events use those services rather than duplicating them.

Out of scope remains exactly the owner's list: assemblies/mates, sweep, loft, draft, surfacing, sheet metal, weldments, simulation, rendering and configurations. Their incidental presence in a vendor binary grants no permission to add them to this app.

## Working CAD increment (D16)

C50–C58 are additive, dependency-ordered contracts for the production path. These do not pass their broader conceptual owners' complete requirements. Existing C05's amendment remains unresolved. The owner's standing phase BATCH authorization applies after this map commit; all new bricks remain provisional until human acceptance.

### C50 editable-cad-content — CORE — GREEN
Purpose: Validate the supported editable CAD document subset.
IN: `{operation:'new'}` or `{operation:'read',value:unknown}`. Read is untrusted JSON.
OUT: Owned `CADContent` using the existing persisted envelope content: mm/inch, positive tolerance, variable definitions, one XY segment sketch followed by at most one blind boss extrude, rollback at end, nonsuppressed features, empty assets, default appearance, no drawing. Sketch supports H/V and fixed endpoint constraints, linear/aligned single-segment dimensions. Reject unknown keys, unsupported features, duplicate IDs, dangling references, nonfinite/collapsed geometry and invalid revisions. Expressions remain source strings and may fail visibly during rebuild.
RAISES: `CADContentError` with field/reason for malformed or unsupported content. New supplies an empty XY sketch, explicit tolerance and defaults. Revision is a safe nonnegative integer; this validator does not edit graph revisions.
DEPS: none.

### C51 edit-cad-content — CORE — GREEN
Purpose: Apply source edits to the supported CAD document.
IN: `{content:C50 output, action}`. Actions: append line from two finite anchors and supplied unique ID; replace sketch with a dimensioned rectangle (positive source width/height, optional finite anchor origin defaulting to [0,0]); change a dimension; set signed nonzero blind extrusion depth; delete extrusion; remove selected entities with their constraints/dimensions; add H/V constraint for one segment; remove constraint; clear sketch. New IDs are caller-owned and never reused by the caller.
OUT: New C50-valid content; immutable original; graph revision increments on edit. Rectangle stores H/V, fixed first corner and two driving dimensions. Length expressions use C03 canonical units. Maximum revision cannot edit and fails without mutation.
RAISES: `CADEditError` for invalid action target, collision, unsupported/degenerate size or exhausted revision; C03/C04/C07 errors propagate.
DEPS: C03, C04, C07.
Type-only input comes from C50; the testbench feeds every edit result back through the real C50 validator.

### C52 linear-sketch-program — CORE — GREEN
Purpose: Compile the supported sketch into PlaneGCS primitives.
IN: C50 sketch, resolved C03 expression context, positive linear tolerance.
OUT: Vendor point/line/constraint primitives plus a pure accept(snapshot) function restoring segment IDs from solved points. Exact shared endpoints use one solver point; fix anchors its selected endpoint; dimensions compile to point distance; H/V map directly to vendor types. Finite solved coordinates and noncollapsed solved segments required. Input remains untouched.
RAISES: `SketchProgramError` for bad targets or missing/nonfinite solved points or collapsed edges; C03 expression errors propagate.
DEPS: C03.

### C53 linear-profile — CORE — GREEN
Purpose: Order one closed sketch boundary for extrusion.
IN: Solved finite segments and positive linear tolerance. Construction segments are excluded.
OUT: Ordered counterclockwise polygon vertices in mm; every source segment used once. Single simple nonzero-area loop only.
RAISES: `ProfileError` with readable reason for empty, open, branched, duplicate, disconnected, self-intersecting or collapsed boundary. Multiple profiles/holes remain for C17.
DEPS: none.

### C54 extrude-preview — SHELL — GREEN
Purpose: Execute a validated linear extrusion with OpenCascade.
IN: C01 live worker-local session; C53 polygon; finite signed nonzero depth.
OUT: Actual B-rep volume, surface area, center of mass, triangulated positions and triangle indices; no native handles cross boundary. Kernel validates the solid before publishing. Owned native wrappers disposed on normal completion; unexpected native faults require worker termination.
RAISES: `ExtrusionError` for failed construction, invalid solid or unavailable triangulation; vendor faults propagate to worker owner.
DEPS: C59.

### C55 cad-worker-client — SHELL — GREEN
Purpose: Own one cancellable CAD worker request stream.
IN: Worker factory, engine asset URLs and result/error callbacks; requests carry C50 content and caller identity.
OUT: submit/cancel/dispose handle; at most one running and one latest pending request; stale replies never publish; cancel/timeout/error terminate native work; next request gets a fresh worker. 30-second watchdog reports a readable failure, never a successful fallback. Disposal is idempotent.
RAISES: TypeError for invalid ports; worker errors reported through callback.
DEPS: none.

### C56 cad-viewport — SHELL — GREEN
Purpose: Render the current CAD view.
IN: Live DOM host, finite sketch segments/constraints, S04 2D transform, optional C54 triangle mesh; sketch/solid mode, selected entity IDs and preview geometry.
OUT: update/fit/dispose handle plus local point conversion and hit testing. SVG XY sketch, constraint glyphs, dimensions; Three.js solid with orbit/pan/cursor zoom. No document mutation; stale/failed meshes clear. WebGL capability failure is visible and does not disable sketch editing.
RAISES: TypeError for invalid host; rendering failures display a readable message.
DEPS: none (Three.js is the pinned third-party rendering library).

### C57 cad-tool-input — CORE — GREEN
Purpose: Interpret CAD sketch pointer input.
IN: Tool/anchor/selection state, pointer event in canonical mm, hit entity ID, snap tolerance, available endpoints.
OUT: New state plus none/select/append-line/replace-rectangle intent; two clicks commit geometry, pointer move previews, Escape cancels. Endpoint snapping has explicit tolerance. No IDs or side effects generated here.
RAISES: TypeError for malformed finite coordinates/tolerance.
DEPS: none.

### C58 cad-properties — SHELL — GREEN
Purpose: Render editable CAD properties.
IN: DOM host, C50 content, solver/build status and selection; edit-intent callback. The assembly owns dialog callbacks.
OUT: update/dispose; feature tree, selection constraints, dimension/depth edit controls and model measurements. User strings stay text; edit buttons request typed source dialogs; no model calculations. Failed sketch/extrusion is visibly flagged. Supported actions are exposed without inactive feature buttons.
RAISES: TypeError for invalid host; validation remains in C51/dialog caller.
DEPS: none.

CAD-APP assembly: C50/C51 + S01/S03/S15/shared shell; C52 + C02 + C53 + C54 + C01 in one worker; C55/C56/C57/C58 in workspace adapter. Assembly contains only lifecycle/routing. C04 resolves variables before C52 and depth evaluation. Test the real production entry: new → draw/typed rectangle → solve → extrude → edit → undo/redo → save/open → recovery; malformed/open sketches produce readable errors, canceled/stale jobs cannot commit. No shell fixture substitutes for production entry. Full requirement status remains conservative until each entire verification procedure passes.

The CAD-APP increment is provisionally GREEN on Linux/Chrome. Its exact evidence, schema subset and remaining gates are in [CAD-WORKFLOW.md](CAD-WORKFLOW.md). No brick has been marked human-ACCEPTED.

## Output from the working CAD path

C37 is now a GREEN independent exchange leaf. Build C59, then C60, then connect the production STEP export assembly. This continues D16: make each feature available through the working editor without changing the full CAD gate or C05's pending contract. The owner's standing phase BATCH applies after this map commit.

### C59 kernel-linear-prism — SHELL — GREEN
Purpose: Construct one validated B-rep prism from a polygon or a region with holes.
IN: `{session:KernelSession,depth:number} & ({polygon:readonly Vec2[]} | {region:ProfileRegion})`; polygon is C53's simple CCW boundary in canonical mm; region is C64's outer loop plus CW/clockwise-circle holes (D21); depth is finite and nonzero; session is live and worker-local.
OUT: `ShapeToken` owned by C01, representing a valid solid. Caller releases the token. Temporary cleanup completes before retention; only the output wrapper survives. No source mutation.
RAISES: `ExtrusionError` for unsuccessful wire/face/prism construction or invalid solid; `DisposedSessionError` for a closed session. Unexpected/native/cleanup faults propagate without further native calls and require worker termination.
DEPS: C01, C64, C77.
File `src/cad/kernel-linear-prism.ts`; public `buildLinearPrism(request)`. Extract the already-characterized construction from C54 without changing C54's public contract or numerical test expectations. C54's direct dependency becomes C59, with C01's type-only port retained. The output also feeds C37 so export never reconstructs geometry from a display mesh.

### C60 cad-step-export — SHELL — GREEN
Purpose: Deliver a cancellable STEP export through browser file access.
IN: `{files:S07.FilePorts,assets:C55.CADProtocol.assets,createWorker:()=>WorkerPort,onStatus:(state:'busy'|'ready'|'error',message:string)=>void}`. `run({content:C50.CADContent,name:string})` is invoked with user activation. The worker protocol is `{content,assets}` → `{ok:true,file:ExchangeBytes}` or `{ok:false,message:string}`. One fresh worker per job, snapshot-owned source, exactly one job at a time.
OUT: `{run:()=>Promise<void>,cancel:()=>void,dispose:()=>void}`. Start a native save picker before asynchronous computation when available, then S07 writes and closes the handle; download fallback otherwise. Cancel/dispose terminate native work; late replies and picker resolutions cannot save. Starting a new job cancels prior preparation/writes. Once native close starts, cancellation/replacement is refused and reports that saving is finishing; the original job reports the actual outcome. Disposal suppresses late UI but cannot revoke the in-flight commit. A 30 s watchdog gives a visible failure. Filename is provided by the caller, with `.step`; the worker's returned bytes must be a nonempty Uint8Array with model/step MIME.
RAISES: TypeError for invalid ports; picker/worker/file failures become readable status callbacks. Abort/cancel is explicit, not a successful save. Native faults require termination; disposal is idempotent.
DEPS: S07.
File `src/cad/cad-step-export.ts`; public `cadSTEPExport(ports)`. Tests cover native handle order/close, fallback handoff, cancellation during picker/work, stale replies, timeout, failures and cleanup. Production browser download with the actual worker is the real resource smoke.

STEP-APP assembly: C50→C04/C52→C02→C53→C03→C59→C37 runs in a dedicated worker. C60 owns export lifetime and S07 file handoff. The adapter exposes Export STEP for the current source, cancels exports on document changes/disposal before close begins, and displays progress/cancel/errors. Export does not mutate history, mark a native project saved, or replace editable source. Browser verification downloads an extruded part, independently checks STEP entities/units, re-imports with real C37 and verifies volume, then edits a dimension and exports the new geometry. Do not pass CAD-113/116/124 until their entire procedures and UI coverage exist.

The STEP-APP increment is provisionally GREEN. [CAD-STEP-EXPORT.md](CAD-STEP-EXPORT.md) records real file readback, cancellation, errors, source ownership and verification limits. No additional whole-product requirement has been closed by this component increment.


## Full sketch constraint implementation (D19)

C61–C63 split the internal work of planned C09 before implementation. C09 retains its public request/result, action set and responsibility; no GREEN implementation or persisted format changes here. C61 is independent, C62 consumes its typed result, and C09 joins the three leaves. C09/C16 and the production document integration remain PLANNED until their complete tests pass. No circle/arc editing is exposed by this mapping alone.

### C61 sketch-geometry-program — CORE — GREEN
File `src/cad/sketch-geometry-program.ts`; public `sketchGeometryProgram(request)`.
Purpose: Translate analytic sketch geometry into PlaneGCS geometry.
IN: `{entities:readonly (LinearEntity|CircularEntity)[],reservedIds:readonly string[],tolerance:Tolerance}`; canonical mm/radians, explicit construction flags, positive finite tolerance. Entity IDs are unique nonempty strings; reserved IDs include the remaining sketch IDs and may overlap entity IDs. Empty geometry is valid.
OUT: `{primitives:SolverGeometryPrimitive[],sourceBySolverId:Record<Id,Id>,roles:Record<Id,{geometryId:Id,points:Partial<Record<'p'|'a'|'b'|'center'|'start'|'end',Id>>}>}`. SolverGeometryPrimitive is the pinned vendor union SketchPoint|SketchLine|SketchCircle|SketchArc|ArcRules. All solver points precede curves, and mandatory ArcRules follow curves. Native geometry IDs retain source entity IDs. Generated point/rule IDs deterministically avoid all supplied/generated IDs. Source mappings cover every primitive; each output owns its records and arrays.
RAISES: `SketchGeometryError` for malformed IDs/tolerance, unsupported/nonfinite/collapsed geometry, or unrepresentable arc endpoints/angles.
DEPS: none.
Point roles are p for a point, a/b for a segment, center for a circle, and center/start/end for an arc. Exact coordinate coincidence does not merge independent source points: relationships must remain explicit and deletable. All points start unfixed; C62 supplies explicit fix policy. Construction geometry is retained for solving. Arc angles preserve signed source order, with end=start+sweep and one ArcRules record per arc; no angle wrapping or implicit full circle. Arc radius, endpoint separation and segment length exceed linearMm; sweep and its gap to a full turn exceed angularRad. The actual representable end-start must match sweep within angularRad. Derived coordinates/extrema must stay finite. Valid construction of the source geometry remains C07/C08's responsibility; this mapper does not snap, solve, mutate or infer constraints. [CAD-SKETCH-GEOMETRY-PROGRAM.md](CAD-SKETCH-GEOMETRY-PROGRAM.md) records the focused/native and cumulative evidence, numerical repairs and integration limits.

### C62 sketch-relationship-program — CORE — PLANNED
File `src/cad/sketch-relationship-program.ts`; public `sketchRelationshipProgram(request)`.
Purpose: Translate declared sketch relationships into PlaneGCS constraints.
IN: `{sketch:Sketch,geometry:C61 output,context:ExpressionContext,tolerance:Tolerance}`; geometry comes from the same entities and reserves all sketch IDs.
OUT: `{primitives:SolverConstraintPrimitive[],sourceBySolverId:Record<Id,Id>,fixedPointIds:Id[],fixedSourceIds:Id[]}`. Uses only the pinned allowed constraint interfaces; dimensions are evaluated by C03. Generated IDs avoid the geometry and all source IDs. Fixed points are identified for C09 to mark in its owned program; source entities are not mutated.
RAISES: `ConstraintArityError`, `UnsupportedConstraintPairError`, `MissingEntityError`, `MissingConstraintError`, `ConflictingFixRequestError`; C03 errors propagate.
DEPS: C03.
Point-role combinations, dimension associations and complete relationship fixtures must close at CONTRACTED before this leaf is built. No coordinate-nearest retargeting, non-driving substitute or implicit relationship may silently replace the stored intent. This decomposition does not remove any of C09's listed constraints or dimension types.

### C63 sketch-constraint-inference — CORE — PLANNED
File `src/cad/sketch-constraint-inference.ts`; public `inferSketchConstraints(request)`.
Purpose: Suggest declared sketch relationships from drawing geometry.
IN: `{sketch:Sketch,pointer:Vec2,tolerance:Tolerance}`; all coordinates are canonical mm and geometry IDs exist.
OUT: `Constraint[]` with deterministic proposal IDs, source IDs/point roles and inferred=true; equivalent existing constraints are excluded. Proposals are transient until the tool controller assigns persistent IDs and commits them with visible, removable glyphs. No automatic document mutation or solver call.
RAISES: `MissingEntityError`, `UnsupportedConstraintPairError` for invalid proposal sources.
DEPS: none.
The exact suggestion ordering/proximity policy closes at CONTRACTED with representative drawing fixtures. C09 remains responsible for action dispatch; C49/C44 remain responsible for applying only explicit user-visible intent. This leaf does not decide mathematical consistency; C16 reports the real solver result.

## Circles, holes and STL from the working editor (D21)

D21 widens the working CAD path so the classic first part, a plate with holes, is buildable and printable: C50 accepts circle entities (`{id,kind:'circle',center,radius,construction}`), center-fix constraints and `diameter` dimensions; C51 gains a `circle` action and the rectangle action now replaces only the outline segments, keeping circles and their relations; C52 maps circles to PlaneGCS circles with `circle_diameter`; C56 draws circles and diameter labels; C57 adds a two-click center/radius circle tool. C64 replaces C53 at the worker seams; C53 remains its per-loop validator. Arcs, slots, trims and multi-region sketches remain C08/C09/C11/C15 work.

### C64 sketch-regions — CORE — GREEN
File `src/cad/sketch-regions.ts`; public `sketchRegions(request)`.
Purpose: Turn a solved sketch into one extrudable region: an outer boundary plus holes.
IN: `{entities:readonly SketchEntity[],tolerance:number}`; finite solved segments/circles in canonical mm and positive linear tolerance. Construction geometry is ignored.
OUT: `ProfileRegion = {outer:ProfileLoop,holes:ProfileLoop[]}` with `ProfileLoop = {kind:'polygon',points:Vec2[]} | {kind:'circle',center:Vec2,radius:number}`. The outer loop strictly contains every other loop; the outer polygon is CCW and polygon holes are CW. Independent of entity order.
RAISES: `ProfileError` for no closed loop, open/branched outlines (via C53), more than one outer boundary, holes touching or crossing the outline or each other, and holes nested in holes.
DEPS: C53.
Separation uses the document linear tolerance. Loops are grouped by shared endpoints within tolerance and each group is validated by C53. Testbench `src/cad/sketch-regions.test.ts`; the real-kernel seam is exercised by C59's testbench (exact plate-with-holes volume and STEP round trip). [CAD-HOLES-STL.md](CAD-HOLES-STL.md) records evidence and limits.

### C65 kernel-features — SHELL — GREEN
Purpose: Apply one bounded machining feature to a retained B-rep solid.
IN: live C01 session, retained single solid token, and `FeatureOp`: cut with C64 closed loops/top/bottom/depth or fillet/chamfer with vertical/top/bottom/all edge set and positive size.
OUT: New retained valid single positive-volume solid; successful operation consumes input. Ordinary locally detected rejection preserves input. No compound topology is silently discarded.
RAISES: `FeatureError` with the existing readable diagnostics; unknown/native/nested/cleanup failures forbid further native calls and require whole-worker termination. Only exact locally originated deliberate rejection permits cleanup.
DEPS: C01, C64, C59.
File `src/cad/kernel-features.ts`; this inventories the existing implemented cut/edge adapter, previously omitted from the map. Its public behavior and geometric subset are unchanged. The caller fault repair enforces its existing native fail-stop guarantee. Current evidence: [profile-face increment](CAD-PROFILE-FACE-EVIDENCE.md).

## Default planes and editable source profiles

The committed [CAD increment](CAD-NEXT-INCREMENT.md) refines the working editor,
without marking the broader C05/C09/C18/C24 contracts complete. C50 now accepts
XY/XZ/YZ and optional persisted profile descriptors. C51 is a pure routing
assembly over C73/C75/C76, with one revision increment and final C50 validation.
C52 materializes controlled profiles before real solving; C56–C58 expose default
planes, center rectangles, regular polygons, group editing and construction flags.
World placement occurs once after local feature evaluation. Imported STEP keeps
its original coordinates. [CAD-MODELING-EVIDENCE.md](CAD-MODELING-EVIDENCE.md)
records the focused/native/browser gates and the remaining limitations.

### C70 default-plane-frame — CORE — GREEN
Purpose: Resolve a default plane into an owned right-handed world frame.
IN: `DefaultPlane = 'XY'|'XZ'|'YZ'`.
OUT: `{frame:{origin,x,y,normal},localToWorld:number[]}`; literal origin bases and a column-major rigid matrix; XZ normal is −Y.
RAISES: `DefaultPlaneError` for any other tag.
DEPS: none.
File `src/cad/default-plane-frame.ts`; literal handedness/coordinate tests and standalone demo.

### C71 sketch-profile-source — CORE — GREEN
Purpose: Materialize a preserved center-rectangle or regular-polygon descriptor.
IN: `ProfileSource`, expression context and positive tolerance; unique supplied group/member IDs, length and angle expression strings.
OUT: Owned closed canonical-mm segments, deterministic member order and unchanged source expressions; center stays fixed under dimension edits.
RAISES: `SketchProfileSourceError` for invalid descriptors, counts, ranges or collapsed geometry; expression/geometry errors propagate.
DEPS: C03, C07.
File `src/cad/sketch-profile-source.ts`; exact coordinates, expression/invalid source tests, area oracle and demo.

### C72 kernel-plane-transform — SHELL — GREEN
Purpose: Place one completed local B-rep on its default world plane.
IN: `{session:KernelSession,token:ShapeToken,plane:DefaultPlane}`; live retained single solid.
OUT: Retained single valid world solid; XY returns the input token; successful other planes consume input exactly once. Ordinary failure preserves input ownership.
RAISES: `PlaneTransformError`, `DisposedSessionError`; invalid token/plane propagate. Unexpected native/cleanup faults forbid further native calls and require worker termination.
DEPS: C01, C70.
File `src/cad/kernel-plane-transform.ts`; actual asymmetric bounds/COM, ±depth, all-plane STEP and ownership tests, real native demo.

### C73 sketch-profile-edit — CORE — GREEN
Purpose: Apply atomic edits to complete controlled sketch profile groups.
IN: `{sketch,action?,usedIds,context,tolerance}`; structurally valid sketch; add/edit/detach/remove/construction actions and exact membership.
OUT: Owned sketch with unrelated content unchanged; absent action validates only. Detach materializes current geometry explicitly; individual controlled-member edits reject.
RAISES: `SketchProfileEditError` for invalid group/action/target/reference; C71/expression errors propagate.
DEPS: C71, C03.
File `src/cad/sketch-profile-edit.ts`; overlapping groups, stale/foreign references, detach after variable change, construction and source preservation tests/demo.

### C74 cad-expression-policy — CORE — GREEN
Purpose: Evaluate the shared CAD expression inventory and unit bindings.
IN: `{units,variables,linearMm,parameters?,bindUnits?}`; ordered typed length/angle parameters with optional positive/nonzero range.
OUT: `{context,values,boundSources}`; one evaluated variable graph, values in caller order, optional physically equivalent source bindings; no mutation.
RAISES: `CADEditError` for range violations; C03/C04 errors propagate.
DEPS: C03, C04.
File `src/cad/cad-expression-policy.ts`; graph, unit, dimension/range/error tests and demo.

### C75 cad-legacy-sketch-edit — CORE — GREEN
Purpose: Apply the existing free-geometry sketch edits to one selected sketch.
IN: `{content:CADContent,action:LegacySketchAction,sketch?:Id}`; line/rectangle/circle/position/dimension/clear/remove/constraint/relation operations.
OUT: Owned C50-valid content with unchanged revision and unrelated sketches preserved; numeric legacy positions stay canonical mm, formulas stay sources.
RAISES: `CADEditError` for invalid IDs/targets/conflicts/ranges; C50/C74/C07 errors propagate.
DEPS: C50, C74, C07.
File `src/cad/cad-legacy-sketch-edit.ts`; existing sketch tests plus direct isolation/revision tests/demo.

### C76 cad-model-edit — CORE — GREEN
Purpose: Apply current model and unit edits with complete expression validation.
IN: `{content:CADContent,action:ModelAction}`; plane/variable/extrude/cut/edge-feature/removal/units operations.
OUT: Owned C50-valid content with unchanged revision; cuts inherit the root plane; units bind every supported variable/dimension/position/profile/feature source.
RAISES: `CADEditError` for invalid target/ID/range/name/units/plane; C50/C74 errors propagate. Referenced variable removal rejects atomically.
DEPS: C50, C74.
File `src/cad/cad-model-edit.ts`; native unit/plane/source invariants, direct model-action tests and demo. Production revolve is not implemented by this contract.

## Production revolve increment

[CAD-REVOLVE-INCREMENT.md](CAD-REVOLVE-INCREMENT.md) closes the bounded +V-axis
boss contract after the real native proof. It defines the exact source union,
signed angular range, graph guards, failure clearing, analytic/STEP oracles,
worker lifetime and editing/UI seams. Implement after the current checkpoint
repairs finish: C77 and characterized C59 extraction, C79, C78, then source,
worker/export and connected UI. Existing C59 gains the explicit fail-stop and
cleanup-before-retain amendment when C77 is joined. C50 keeps `bossOf`
extrusion-only; C76 adds C79 as its third collaborator only when integrated.
No proof-only fixture enters production. No requirement is promoted by this map.

### C77 kernel-profile-face — SHELL — GREEN
Purpose: Build one analytic worker-local planar face from a validated region.
IN: `{session:KernelSession,region:ProfileRegion}`; live C01 and C64 canonical-mm simple outer CCW polygon/circle plus validated disjoint CW holes.
OUT: `{ok:true,face:TopoDS_Face}` with one caller-owned raw wrapper after all other temporaries are cleaned; or `{ok:false,reason:'outline-wire'|'hole-wire'|'outer-face'|'hole-face'}` after known rejection and complete cleanup.
RAISES: `DisposedSessionError`; unexpected/native/cleanup exceptions propagate unchanged and forbid further native calls until worker termination.
DEPS: C01, C64.
File `src/cad/kernel-profile-face.ts`; no source compilation, region inference, tolerance repair, session retention or revolve policy. C59's polygon/circle/hole/negative-prism and STEP goldens must stay unchanged.
The characterized extraction, lifetime amendment and C65 caller regression are verified in [profile-face evidence](CAD-PROFILE-FACE-EVIDENCE.md). GREEN is not human acceptance.

### C79 revolve-recipe — CORE — GREEN
Purpose: Compile a bounded +V-axis revolve source into evaluated parameters or a solved native-ready section.
IN: `{operation:'parameters'|'profile',source,sketchId,context,tolerance,entities?}`; exact definition from the linked contract, positive finite document tolerances; profile mode requires actual solved C64 entities.
OUT: Owned `{axis:{origin:[0,0,0],direction:[0,1,0]},angleRad}`; profile mode additionally returns one owned hole-free `ProfileLoop`. Signed angle satisfies `angularRad < abs(angle) <= 2π`; polygon U is nonnegative, circles clear the axis by more than linear tolerance.
RAISES: `RevolveRecipeError` for invalid source/axis/reference/tolerance/angle/selection/half-plane; C03 expression and C64 profile errors propagate readably.
DEPS: C03, C64.
File `src/cad/revolve-recipe.ts`; no reflection, modulo normalization, dropped holes, native access or source mutation. Parameters mode validates source edits without pretending to solve geometry.
The [recipe checkpoint](CAD-REVOLVE-INCREMENT.md#c79-recipe-checkpoint--green-not-accepted) records 17 RED → 17 GREEN, 940 passing unit tests, type/module checks, demo and independent review. No connected revolve feature or additional whole-product requirement is claimed.

### C78 kernel-revolve — SHELL — GREEN
Purpose: Execute one validated bounded revolve recipe in OpenCascade.
IN: `{session:KernelSession,recipe:C79 profile result}`; local XY section and radians, live C01 session.
OUT: One retained valid positive-volume single solid token after temporary cleanup; caller consumes/releases it. No target body is fused or consumed.
RAISES: `RevolveError` for known builder/null/non-solid/invalid-volume rejection, `DisposedSessionError`; unexpected/native/cleanup faults propagate with no further native calls.
DEPS: C01, C77, C79.
File `src/cad/kernel-revolve.ts`; real cylinder/tube/torus signed-sweep, analytic mass/bounds/caps and STEP fixtures; exact ownership/fault traces and no token before completed cleanup.
The [executor checkpoint](CAD-REVOLVE-INCREMENT.md#c78-native-executor-checkpoint--green-not-accepted) records observed RED, native/ownership GREEN, cumulative extrusion seams, type/module checks and independent review. Source editing, worker/export routing and connected UI remain unverified; no additional requirement or human acceptance is claimed.
