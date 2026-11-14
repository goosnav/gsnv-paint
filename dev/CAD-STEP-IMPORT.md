# Consumer STEP import contract

Status: approved bounded map extension; contracts and testbench specified before implementation, 2026-11-13. C66–C69 and CAD-IMPORT are PLANNED. Parent commits this map before the existing phase BATCH proceeds. Only the owner grants ACCEPTED. This extension implements the working-editor path for CAD-116 and the reimport portion of CAD-124; it does not complete all remaining CAD requirements or C36's general project codec.

## Scope and persisted source

Import STEP opens a new unsaved CAD project after the shared host's usual replacement consent. A cancellable worker validates every imported solid before the new project is offered to the host. Invalid, incomplete, empty, canceled, timed-out or stale imports leave the active project and its history intact. No remote service, invented sketch history, mesh reconstruction or partial-body success is allowed.

The native envelope remains exactly `{format:'gsnv-cad',version:1,id,title,content}`. Existing C50 parametric projects and their empty asset lists remain byte-for-byte equivalent at the JSON value level. Imported projects use the existing module-map import definition and binary-asset schema:

```ts
content = {
  units: 'mm' | 'inch',
  tolerance: { linearMm: number, angularRad: number, relative: number },
  variables: [],
  graph: {
    features: [{
      id: string, name: string, kind: 'import', dependsOn: [], suppressed: false,
      definition: { assetId: string, placement: number[] }
    }],
    rollback: 1, revision: number
  },
  assets: [{ id: string, mime: 'model/step', name: string, byteLength: number }],
  appearance: /* the existing C50 canonical default appearance */,
  drawing: null
}
```

`placement` is exactly the 16-entry row-major identity matrix. The sole asset and sole import feature reference each other. Metadata names are nonempty text; feature and asset IDs are nonempty and distinct. The runtime source replaces the asset's `byteLength` with an owned `Uint8Array` called `bytes`; S15 carries those exact bytes separately as `{id,mime,bytes}`. Source bytes, metadata and feature order persist. A STEP source can contain any positive number of solids within the declared resource limits; every valid solid is preserved in source, preview, inspection and STEP export. No single-solid normalization is applied to imports.

The feature tree labels the source **Imported STEP — non-parametric** and shows its filename and solid count. It does not offer sketch dimensions, fillets or other parametric editing for imported bodies. Users can inspect the entire model and individual bodies, orbit/pan/zoom/fit, change displayed units, save/reopen the native source, and export STEP or the displayed STL triangulation. Unit changes increment the document revision without rewriting STEP bytes or changing canonical millimeter geometry. Shared undo/redo, save, recovery and replacement behavior apply normally.

## C66 cad-project-source — CORE — PLANNED

File `src/cad/cad-project-source.ts`; public `cadProjectSource(request)`, type `CADSource`, and type guard `isSTEPSource(source)`. Runtime dependency: C50 only. The guard discriminates already validated sources; it is not an untrusted-input validator.

Entry request/response contract:

```ts
{ operation: 'read', value: unknown }                         // -> owned CADSource
{ operation: 'decode', content: unknown, assets: NativeAsset[] } // -> owned CADSource
{ operation: 'encode', source: CADSource }                    // -> {content, assets}
{ operation: 'import', name: string, bytes: Uint8Array,
  units: 'mm' | 'inch', featureId: string, assetId: string }   // -> owned imported CADSource
{ operation: 'units', source: CADSource, units: 'mm' | 'inch' }// -> imported CADSource
```

`read` accepts runtime source, while `decode` validates metadata and the separate native assets. `encode` returns JSON-only content and independently owned binary assets. `import` creates canonical defaults and revision zero but makes no kernel-validity claim. `units` is restricted to imported sources; parametric sources continue through C51's expression binding. A no-op unit setting leaves the revision unchanged; a real edit rejects safe-integer revision exhaustion before returning a result.

Every public path validates exact record keys, finite positive tolerances, canonical appearance, the single identity-placement import, no variables/drawing, nonnegative safe revision, exact rollback, MIME, matching source reference, exact decoded byte length, and absence of missing/extra/duplicate assets. Unknown or unsupported source fields fail visibly rather than being discarded. Inputs and returned bytes cannot alias each other. The source cap is 64 MiB, nonempty, and applies before native parsing. C69 passes S07 open `maxBytes: 64 * 1024 * 1024`; S07 rejects larger selected files before any `File.slice` allocation. The parent owns that optional shared port extension. C66 validates the same bound independently for native decode and runtime sources.

RAISES: `CADSourceError` with an actionable field/reason for malformed imported data, asset mismatch, unsupported import structures, oversized/empty bytes, invalid unit edits or exhausted revision; existing C50 validation errors propagate for parametric sources. No I/O or randomness; caller supplies IDs. S03/S15 remain responsible for envelope/container integrity.

Testbench before code: legacy C50 encode/decode equivalence; literal imported native roundtrip with exact bytes; caller/output ownership; all unknown/missing fields, MIME/reference/length/extra-asset failures; multiple feature/nonidentity placement rejection; unit roundtrip with identical bytes; atomic failure and revision exhaustion. `node --import tsx --test src/cad/cad-project-source.test.ts`; demo `node --import tsx src/cad/cad-project-source.demo.ts`.

## C67 solid-preview-group — CORE — PLANNED

File `src/cad/solid-preview-group.ts`; public `combineSolidPreviews(bodies)`. No runtime brick dependencies; C54 `SolidPreview` is a type-only boundary. Input is a nonempty ordered list `{id:string,solid:SolidPreview}` with unique IDs. Output is an owned aggregate `SolidPreview` plus ordered per-body `{id,volume,area,center}` measurements.

All B-rep measurements remain canonical mm/mm²/mm³. The aggregate concatenates every body's vertices/triangles with exact index offsets, sums body volume/area and uses the volume-weighted center. It never unions, deduplicates or drops overlapping bodies; aggregate volume is explicitly the sum of source solids, not the volume of their boolean union. Each body remains inspectable separately.

RAISES: `SolidPreviewError` for empty input, duplicate/empty IDs, nonfinite or nonpositive volume, negative/nonfinite area, invalid center/buffer shapes, nonfinite coordinates, out-of-range indices, empty triangles, aggregate overflow or resource-limit overflow. Limit: 5,000,000 vertices and 5,000,000 triangles in total, bounded before allocation. Inputs are immutable and output buffers own their memory. Type-only previews contain no topology identity; face/edge picking and native transforms remain future work.

Testbench before code: two literal offset triangles with different volumes and known weighted center; exact index/order retention; all malformed boundaries, overflow and aliasing. `node --import tsx --test src/cad/solid-preview-group.test.ts`; demo `node --import tsx src/cad/solid-preview-group.demo.ts`.

## C68 step-preview — SHELL — PLANNED

File `src/cad/step-preview.ts`; public `stepPreview({session,bytes,units})`. Runtime dependencies C37, C54 and C67. Input uses a live worker-local C01 session and bounded source bytes. C37 strictly imports all solids; C54 consumes each retained token while producing its B-rep measurements and display triangles; C67 combines the complete ordered group. Output contains only owned geometry buffers and measurements.

RAISES: existing STEP import, preview or aggregation errors; no partial output. Successful calls release every imported token. On an ordinary preview failure, C54 releases the currently consumed token and C68 releases every remaining unconsumed token. An unexpected native fault (numeric exception, `WebAssembly.RuntimeError` or `WebAssembly.Exception`) performs no subsequent native, wrapper, filesystem or session cleanup call; the caller terminates the worker. Unknown native/adapter exceptions are treated conservatively as faults when ownership is uncertain. A failed result never replaces a good imported document or publishes old geometry.

Testbench before code: real-kernel import of the exact existing 120 mm golden acceptance plate export; expected volume 68,654.425 mm³ ±0.01%; exact source remains unchanged; two-body STEP retains both complete meshes/measurements; mm/inch import gives equivalent physical dimensions; repeated calls leave zero retained tokens; bad/partial STEP rejects. Inject second-body ordinary failure and native faults where the public runtime port permits, checking cleanup and the absence of calls after a fault. `node --import tsx --test src/cad/step-preview.test.ts`; demo `node --import tsx src/cad/step-preview.demo.ts`.

The fixture `src/cad/fixtures/acceptance-plate-120mm.step` will be captured from the **unchanged existing** `part-builder.test.ts` production golden's actual C37 export, using a temporary test harness. Its manifest records the source test, dimensions, measured volume and fixture provenance. Construction logic will not be copied into another permanent golden builder. The original golden test and its positional assertions stay unchanged.

## C69 cad-step-import — SHELL — PLANNED

File `src/cad/cad-step-import.ts`; public `cadSTEPImport(ports)` returns `run({identity,units})`, `cancel()` and `dispose()`. Runtime dependencies S07, C66 and C55. Ports supply FilePorts, worker factory/asset URLs, caller-issued IDs, status callback and `onImport(source,preview,baseIdentity)`. The callback offers a fully validated candidate to assembly; it does not bypass shared replacement consent.

`run` starts a local STEP/STP chooser under the initiating user gesture with S07 `maxBytes: 64 * 1024 * 1024`, reads/owns the selected bytes, creates C66 source and submits it to the worker. It offers a candidate only after a successful complete preview. One active job is allowed; a new run, cancel, disposal or assembly document replacement suppresses stale chooser/worker results. Worker cancellation/error/timeout terminates its native work. The C55 30-second watchdog remains the upper bound, not a performance acceptance claim. No document/history mutation or network request occurs here.

RAISES: `TypeError` for invalid ports; operational chooser/read/source/worker errors use the status callback. Cancellation is a normal visible state. The picker itself may remain open until dismissed, but its late result cannot publish. Testbench: valid native file staging, no publication before worker validation, failed/empty import, canceled/stale picker and worker, disposal, replacement, and retry. `node --import tsx --test src/cad/cad-step-import.test.ts`; demo uses the CAD-IMPORT browser fixture.

## CAD-IMPORT assembly and existing seam amendments

The public factory remains `createCADWorkspace(files:FilePorts):WorkspaceAdapter`; main/shared/package files do not change. Move the existing working parametric adapter into `cad-parametric-workspace.ts` without changing its editor behavior. The thin `cad-workspace.ts` facade owns C66 native encode/decode, the Import STEP command (`cad.importSTEP`), C69 lifetime, and routing between the parametric and imported editor views. New projects remain parametric. Router disposal releases the old view; imported unit commits use shared transactions. Snapshot identity changes cancel pending imports. `host.open` remains the final replacement authority.

An imported editor assembly uses C56 with no sketch content, C55 for native-open/revision previews, C60 for STEP export, C38 for STL and C66 for unit edits. Its feature tree and panel expose all solid measurements and the original filename. Geometry becomes empty during a rebuild or failure, so no stale solid is shown as current. The imported view presents normal export progress/errors and supports Escape cancellation, fit and focus restoration. STL carries all aggregate triangles in millimeters; its 0.1 mm display deflection remains explicit.

C55's request source and C60's export source widen from C50 `CADContent` to C66 `CADSource`. C55 replies add optional ordered imported-body measurements while retaining the existing parametric reply fields. Its cancellation/identity/timeout behavior is unchanged. The rebuild worker dispatches imported sources through C68 without initializing PlaneGCS; parametric sources continue through the unchanged `buildPart`. The STEP export worker reimports and exports **all** original solids through C37 at the requested output units. Fresh-worker termination continues to own fault cleanup. C37 strict validation, C50/C51/C52 parametric contracts, native version 1 and the existing golden remain unchanged.

All new runtime files stay under 300 implementation lines (soft target 200); split before reaching the hard limit. Assembly dependencies are declared here rather than presented as capped bricks. C36 remains PLANNED; this supports only the existing parametric subset or one fixed imported STEP source, not assemblies, mixed imported/parametric feature graphs, colors, references, transforms or imported-face editing.

## Integration gates and evidence record

Before claiming GREEN, run each focused testbench and demo, the modular checker for the new leaves, targeted TypeScript checks, existing C55/C60 tests, and the unchanged `src/cad/part-builder.test.ts` golden. No broad suite or shared production build is run by this worker; the parent owns and coordinates those gates.

The CAD-IMPORT browser suite uses a real coordinated production build and isolated output directory/port. It imports the captured golden STEP, verifies the non-parametric tree and measured volume, fits/orbits the visible solid, switches mm/inch without physical change, exports STEP and checks independent C37 readback, saves/reopens a native file with exact embedded bytes, checks undo/redo, imports a two-solid fixture, and verifies invalid/canceled imports preserve the current project. It captures browser errors and external HTTP traffic. Development fixtures may diagnose behavior but do not count as production evidence.

Planned commands:

```sh
node --import tsx --test src/cad/cad-project-source.test.ts src/cad/solid-preview-group.test.ts src/cad/step-preview.test.ts src/cad/cad-step-import.test.ts
node --import tsx --test src/cad/cad-worker-client.test.ts src/cad/cad-step-export.test.ts src/cad/part-builder.test.ts
node_modules/.bin/playwright test --config src/cad/playwright.step-import.config.ts
```

No implementation, passing tests or acceptance is asserted by this initial contract record. Results, limitations and exact commands will be recorded after execution.
