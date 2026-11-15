# Consumer workflow gaps — 2026-11-15

This is a read-only code/evidence audit, not a release or owner-acceptance claim.
Inspected HEAD `0894f55` and the concurrent uncommitted Paint upgrade. No full
suite, browser, deployment, OS picker or performance test was run for this audit.
The parent must append the final candidate's verification separately; new test
files and reachable commands alone are not evidence that their journeys pass.

Authority remains the original [402 requirements](requirements.json), the
owner-authorized authoring workspaces, and [PU-01–16](PAINT-UPGRADE-2026-11.md).
No new feature scope is authorized by this backlog. CAD retains priority after
finishing the currently requested Paint repair. Music means the planned waveform
editor; a DAW/piano roll and a local system terminal are not missing deliverables.

## Evidence baseline and bookkeeping

Read-only tally: `python3` loaded `dev/requirements.json` and counted `status` by
ID family. Result: **402 total; 47 PASS; 0 FAIL; 355 UNTESTED**. These are recorded
historical requirement results, not 402 freshly executed tests. Zero recorded
FAIL does not mean no missing functionality.

| Family | PASS | UNTESTED | Meaning |
|---|---:|---:|---|
| CAD | 18 | 106 | Native plate/rebuild/STEP oracles and selected sketch/revolve procedures |
| Image | 2 | 102 | Exact acceptance sequence and native round trip only |
| Video | 0 | 73 | Basic editor tests do not satisfy the full original Video procedures |
| Shared controls | 0 | 30 | Every-workspace quantifiers remain open despite component evidence |
| Performance | 0 | 4 | No declared full benchmark has closure |
| Document / Slides / Audio / Spreadsheet / Code | 15 | 0 | Three bounded authoring requirements each; not full Office/DAW/IDE parity |
| System / cross-workspace / release / authoring integration | 12 | 40 | Includes offline and two transfer procedures; distribution remains incomplete |

`06-TRACEABILITY.md` displayed **46/356** and a stale CAD total at audit time;
its summary now matches JSON and `CONSUMER-READINESS.md`: **47/355** after CAD-071. Do not resolve the mismatch by crediting
new capabilities without running their complete procedures.

Historical, scoped evidence worth retaining:

- [CAD consumer repair](CONSUMER-REPAIR-CHECKPOINT.md): actual production plate
  volumes 56,654.424808105 and 68,654.424808105 mm³, dependent placement, native
  reopen, STEP volume round trip and a readable failed-fillet path.
- [Connected revolve](CAD-REVOLVE-EVIDENCE.md): CAD-071 procedure passed for the
  documented root-sketch/+V-axis boss. It does not establish downstream features
  on revolved bodies or revolve cut.
- [Authoring checkpoint](AUTHORING-CHECKPOINT.md): bounded Document, Slides,
  Audio, Spreadsheet and Code journeys, with their format/runtime limits.
- [Fonts](PAINT-FONTS.md): FONT-01–06 recorded PASS; 1,047 historical unit passes,
  real TTF/CFF OTF browser fixtures. [Touch repair](PAINT-TOUCH.md) and
  [controls/footer repair](PAINT-CONTROLS-DOCUMENT-FOOTER.md) contain explicit
  Chromium/Linux WebKit evidence and device/print exclusions.
- Current upgrade leaf evidence is provisional component evidence: batch
  paths/files/ZIP **11/11** and Actions dialog **6/6** focused units, scoped strict
  TypeScript and module checks passed during implementation. These do not close
  PU-12/15 without integrated browser journeys and output inspection.

## CAD: highest consumer-impact gaps

The current editor is a useful bounded solid modeler, not the requested complete
parametric system. Evidence is structural: `editable-cad-content.ts` accepts a
root default-plane sketch followed by a blind boss extrusion and pocket/edge
features, or a root sketch and sole revolve boss. It rejects partial rollback,
suppression, custom appearance and drawing content. `cad-imported-view.ts` keeps
STEP imports as fixed sources and explicitly lacks face selection/editing.

| Priority | Concrete gap and consequence | Related requirements (including regressions) | Next bounded increment and acceptance |
|---|---|---|---|
| CAD-1 | No selectable solid faces/edges/vertices or planar-face sketch attachment. Typical users cannot click the face they intend to modify. | CAD-021, 096–101 | Preserve topology identity through worker tessellation; add hover/selection filters, then one planar-face sketch → pocket journey. Rebuild after parameter changes, detect invalidated attachment, save/reopen and compare native geometry. |
| CAD-2 | History schema rejects suppression/rollback; general dependency-safe reorder and rename are not established. A root revolve cannot have downstream features. | CAD-007–014, 016 | First add suppress/unsuppress plus rollback for the existing extrusion/pocket/edge stack. Prove source retention, readable invalid dependencies, restoration and single-step undo before broadening the graph. |
| CAD-3 | Sketch entity type is segment/circle; tools expose select/line/rectangle/circle/center rectangle/polygon. Arcs, slots, point entities and trim/extend/offset are absent from this source model. Only a subset of requested constraint/dimension types is represented. | CAD-027–029, 031–042, 045–062 | Add one arc representation and end-to-end dimension/constraint flow, then trim/extend. Use the existing solver; verify overconstraint explanation, dragging remaining DOF and native round trip. Do not infer solver UI support from the solver library's capabilities. |
| CAD-4 | Boss extent is blind; pockets allow blind/through. No shell, counterbore/countersink, feature patterns/mirror or reference-geometry families in the supported graph. | CAD-064–066, 068–072, 075, 077–085 | Add mid-plane extrusion first, preserving variables/units and native geometry; then a hole-feature family with independent analytic volume oracles. Face-dependent extents follow CAD-1. |
| CAD-5 | Solid viewport is one shaded-with-edges mesh. Full view controls, measurement, section, per-face appearance and drag dimensions are not proven. | CAD-086–112 | Add standard-view/fit/trackpad controls and direct measurements for selected topology; verify typed/drag parity and units. Then section/display modes. Volume inspection already has narrow evidence; do not mark every mass/measurement requirement from that. |
| CAD-6 | STEP/STL paths exist, but 3MF, DXF and dimensioned drawing/PDF are not in the current graph/UI. | CAD-113–121 | First close the existing STEP/STL full procedures. Add sketch DXF with independent parser/unit checks; separately add four-view drawing sheets with measured dimensions and inspected PDFs. |

Keep the original acceptance plate and native fault cleanup in every CAD ladder.
The tested plate is valuable but cannot exercise the unsupported history/topology
families. The source's 64-feature bound is not evidence of a fast 50-feature model.

## Image: finish current repair, then preserve editability

The current PU increment addresses the latest owner requests: menu layering,
Help, licensed icons/logo, startup/New, hard coverage, persistent pixel policy,
fixed palettes/dithering/down-pixel, operations/recording, scripts and safe batch.
The initial read-only audit left **PU-01–16 UNTESTED**. Their integrated
implementation results are now tracked separately in the
[Paint upgrade checkpoint](PAINT-UPGRADE-CHECKPOINT.md); that evidence supersedes
the provisional component counts above. It does not close the original Image
requirements or grant release/owner acceptance.

1. Finish the current integrated gate: real TTF/OTF binary edges; pixel-art versus
   smooth migration; full-composite palette parity between canvas, PNG, clipboard
   and transfers; New/recovery cancellation; Help offline/focus; dropdown click
   isolation; two input sizes for action preview; recorder Undo/Redo and embedded
   text; explicit script Run/Stop; folder/ZIP outputs with untouched source hashes,
   failure report and cancellation. Exercise export after each major operation.
2. **Editable text is absent**: `image-content.ts`/`image-workspace.ts` explicitly
   rasterize text; metadata contains raster tiles, not editable text objects.
   Imported fonts, multiline entry and transform do not close IMG-036. A small
   text-layer increment needs text/font/style/layout persistence, reopen/edit,
   undo and explicit rasterization before claiming this requirement.
3. **Layer lock/alpha lock/masks are absent from persisted LayerMeta** (IMG-076,
   077, 079). Add lock/alpha lock first with input/recipe/history tests; layer masks
   require a separate versioned storage and compositing change. Existing selection
   coverage is not a layer mask. Avoid losing stored masks in unsupported readers.
4. **Transform is incomplete for the original skew requirement**: the present
   `image-transform.ts` and `raster-transform.ts` provide translation, scale and
   rotation, not skew (IMG-062/063/066). Close current handles/typed parity first,
   then add skew with preview/commit pixel equality, selection coverage and undo.
5. Explicit remaining original work includes rounded/polygon shapes, polygon
   lasso, selection feather/grow/shrink, rulers/guides/snapping, full resize
   sampler/anchor choices, HSV/recent colours and full export-format/quality
   workflows. Do not group every one as absent: examine its reachable UI and run
   its exact IMG procedure before assigning implementation versus evidence work.

Sharp zoom cannot recover lost detail or remove pre-existing JPEG/text antialiasing.
Pixel-art generated coverage and a strict palette solve different problems.
Keep that distinction in Help; never silently recolour imported/legacy source
pixels merely because a view preference changed.

## Other editors: preserve working scope and name limits

| Workspace | Evidence / verified boundary | Remaining consumer checks or implementation gap |
|---|---|---|
| Video | Basic sequence/trim/split/title/fade/export paths and recovery have historical tests. `video-timeline.ts` is explicitly one nonoverlapping sequence; `video-workspace.ts` imports whole bytes and exports in real time with MediaRecorder. | This is an implementation gap, not just missing test credit, for read-in-place media, multitrack, WebCodecs + WASM muxing, keyframes, transitions and the three-clip H.264/AAC sync golden. All VID requirements remain UNTESTED. Next: bound large-file import and establish frame-exact codec/muxer proof before adding multitrack UI. Video yields to CAD. |
| Audio | AUD-001–003 recorded PASS for waveform selection, cut/copy/paste/trim/fades/gain/normalize, native reopen and literal PCM16 WAV. | Confirm physical playback and representative browser-supported compressed imports. Imported audio is resampled to 48 kHz; 128 MiB source/256 MiB decoded bounds and mono/stereo single-recording scope should stay visible. Composing instruments is outside the chosen scope. |
| Document | DOC-001–003 and Chromium clean/numbered PDF procedures have recorded PASS. Menu footer settings are present; PDF uses browser print. | Native Safari/macOS/iOS print headers can still add title/date/about:srcdoc/page text independently. Physical print-dialog workflow remains UNTESTED. Verify the exact user browser and default footer; preserve concise guidance. A deterministic one-click PDF engine would be a separately contracted alternative, not something already delivered. |
| Slides | SLD-001–003 recorded PASS for editable objects, native reopen, presentation and independently parsed PDF. | Native print/presentation behavior on the user's tablet/browser remains UNTESTED. Preserve that scope rather than assuming broad PowerPoint compatibility. |
| Spreadsheet | SHEET-001–003 recorded PASS for supported formulas, ranges, fill, formats, sorting/filtering, native/CSV/XLSX workflows. | Run representative customer XLSX round trips and inspect diagnostics. Limits are 32 sheets/10k rows/256 columns/50k stored cells. No claim for macros, charts, merged cells, external links or complete Excel formula/style compatibility. Unsupported data must stay visibly diagnosed. |
| Code | CODE-001–003 recorded PASS for editing and explicit Run/Stop, isolated JS, bundled Python/local imports and script-free HTML/CSS preview. | The owner chose browser execution, not a system shell. JS currently cannot import other local project modules or run DOM APIs; HTML/CSS preview does not execute scripts. Keep the capability statement visible. Integrated interactive web-app preview would require a separate sandbox contract, not a hidden relaxation. |
| Photo | `PHOTO-WORKFLOW.md` records real DNG decode, adjustments/crop, byte-identical source/native reopen and JPEG exports. | Evidence is bounded to those fixtures. Other advertised RAW/HEIC/TIFF inputs depend on decoder/browser support and need samples. Zoom above fit enlarges a screen-resolution preview; full-detail inspection and large-RAW memory remain limitations, not verified desktop-photo-editor parity. |

## Release and usability gates that still block a complete-product claim

- **Physical iPad/iPhone, Apple Pencil, palm contact and native Safari gesture
  behavior: UNTESTED.** Chromium touch emulation and Linux WebKit are valuable
  regressions, not device certification. Repeat the user's long loop, extra
  finger contact, app switch, zoom/map, text and clipboard workflows on hardware.
- **Native OS file/folder picker UI and write permissions: UNTESTED** in this
  audit. Automated injected handles/file-input/download paths do not establish
  macOS/Windows/iOS picker UX. Verify JPG/PNG/native-project Open, TTF/OTF, denied
  permissions, cancelled pickers, batch destination and saved file reopening.
- **Full performance fixtures PERF-001–004: UNTESTED.** Use the declared hardware,
  warmup and ten trials from `05-VERIFICATION.md`; report frame deadlines,
  input-to-paint latency, sync and peak memory. Worker responsiveness fixtures
  do not establish 60 fps or a <2 s 50-feature rebuild.
- **M1a universal ZIP/platform matrix remains incomplete.** A Linux source
  launcher and local static-host tests are not Windows/macOS executable/package
  smoke. Package the identical static payload, test offline launch and port
  reuse, and keep CANDIDATE_FOR_ACCEPTANCE separate from owner acceptance.
- Re-run full units/type/build/spec, production browser journeys, local static
  hosting/isolation/asset-size checks, cold offline/update/recovery and deployment
  dry-run for the final artifact. A dry-run or Git push is not proof that
  `paint.goosnav.shop` has the candidate build or that an existing service-worker
  client updated. Record live build identity only after actually checking it.
- Source-visible unsupported features and requirements with partial evidence
  stay UNTESTED, with a reason. Skipped/missing-device checks never become PASS.

Recommended order: complete the contracted PU wave and its safety regressions;
CAD topology/face workflow → bounded history controls → sketch constraints and
feature expansion; Image editability/layer protections; measured performance
and packaging. Keep Video codec/multitrack work as its own later phase. No broad
rewrite or extra feature family is needed to take these steps.
