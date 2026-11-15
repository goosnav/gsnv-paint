# Paint usability, pixel policy and automation upgrade

Approved plan, 2026-11-15. Baseline `1129065`; clean `main`, equal to origin.
Owner authorized implementation and ordinary non-force pushes to main. Existing
BATCH authority applies after this map is committed. Bricks finish GREEN;
acceptance remains the owner's. This supplements rather than replaces the original
402-requirement ledger. Current original ledger: 47 PASS, 355 UNTESTED.

## ConOps

For an artist, Paint turns local images or a blank canvas into editable artwork
and reusable image-processing recipes through familiar drawing controls, complete
when the artwork or batch outputs can be reopened with the expected pixels.
The same static client runs hosted and in the local launcher. No uploads, accounts,
telemetry, remote fonts, arbitrary script filesystem access or server processing.

Journeys: first launch/New/recovery; find and use tools through Help; draw hard
text and shapes; reduce colours and down-pixel with reversible previews; record
editing and replay at different sizes; author JavaScript recipes; process a file
or folder without modifying originals; save/reopen/export consistently.

## Decisions and boundaries

- Default: white 800×600, Pixel art, full colour. Pixel art means binary generated
  geometric coverage and nearest resampling. Smooth artwork retains antialiasing.
  Intentional soft brushes/opacity/blur remain explicit. Existing imported and
  legacy pixels are unchanged until an explicit effect is applied.
- Strict palettes contain N opaque RGB swatches plus transparency; final composite
  quantization is shared by viewport, export, clipboard, eyedropper and bridges.
  Palette is fixed until edited or explicitly regenerated. Limits: 2/4/8/16/32/64/128/256.
- Dither options: none, ordered Bayer 4×4, Floyd–Steinberg. Down-pixel uses nearest
  sampling, either retaining canvas size or creating the requested smaller image.
  Existing averaged Pixelate stays available under a distinguishable name.
- Full editing recorder, JavaScript built-in-operation recipes, coordinates scale
  x/y independently per step; scalar radii use the smaller factor. Explicit output
  resize/canvas dimensions stay absolute. Text records committed pixels as assets.
- Scripts return validated operations, never host commands. Opening never executes.
  Stop/timeout terminates workers; browser hard memory quotas cannot be promised.
- Batch processes one input at a time, recursion off. Snapshot inputs first. New
  timestamp/run-ID output child only; originals untouched. Single-file parents
  require a separate destination choice. Unsupported directory write => labelled
  ZIP download. Bad inputs continue; destination/write failures stop visibly.
- Tabler v3.52.0 MIT subset, locally vendored with provenance, replaces Paint/common
  glyphs. Light pixel styling rather than coarse newly invented artwork. White
  Goosnav mark is preserved in a small pixel-derived, optically centred asset.
- Physical iOS/Pencil and native OS file-picker UI remain untested without hardware.
  Sharp display cannot reconstruct lost detail or automatically repair JPEG edges.

## Requirement / verification matrix

All rows began UNTESTED. Final **PU-01–PU-16 PASS** results, actual commands, outputs and platform limits are recorded in [the candidate checkpoint](PAINT-UPGRADE-CHECKPOINT.md). Original requirement statuses remain unchanged.

| ID | Contract | Verification |
|---|---|---|
| PU-01 | Opaque menu/submenu layers cover toolbar controls and receive their clicks. | Browser screenshot pixel region, dispatch count, keyboard/resize checks. |
| PU-02 | Shared offline Help search, FAQ, getting started, F1; font synonyms reveal import workflow; Show me routes existing safe tools. | Search units; browser offline, focus, mobile, no content insertion. |
| PU-03 | Coherent licensed Paint/common glyphs and centred white pixel logo. | License/hash checks; browser actual-size DPR1/2 review. |
| PU-04 | Fresh launch creates canvas after safe recovery; New dialog collects size/background/mode/palette with safe cancel. | App units/browser recovery, cancel, valid/invalid values. |
| PU-05 | Persist Pixel art/Smooth artwork in rgba8-layers-v3; migrate old layouts byte-exact. | Content roundtrip, malformed policy, old fixture tests. |
| PU-06 | Pixel-generated text/shape coverage is binary before intentional opacity; transforms preview committed raster semantics. | Real TTF/OTF alpha/RGB tests; preview/commit pixel comparisons. |
| PU-07 | Strict palette output guarantees N RGB colours and binary alpha on all composite outputs. | Exact output properties; browser viewport/PNG/copy/bridge consistency. |
| PU-08 | Deterministic palette generation, editable swatches, none/Bayer/FS dithering. | Golden/edge/error/property tests; preview cancel and one-step undo. |
| PU-09 | Down-pixel logical dimensions/block size retain-size or resize, sharp nearest output. | Goldens, linked dimensions, browser preview/cancel/undo. |
| PU-10 | Versioned validated operations/recipes shared by interactive and replay logic. | Interactive/replay equivalence, invalid schemas, bounds and portability. |
| PU-11 | Recorder captures strokes, selection, transforms, layers, text/assets, seeds; Undo/Redo updates effective steps; unsupported steps pause visibly. | Full workflow replay golden, cancelled previews, history boundary, assets. |
| PU-12 | Actions editor supports enable/reorder/rename/remove/save/open, preview copy, apply once. | Format roundtrip and browser journey/undo/cancel. |
| PU-13 | JavaScript metadata + built-in operations returns bounded validated recipe through isolated execution. | Result spoof/oversize/network/storage tests, infinite-loop Stop, offline. |
| PU-14 | Per-step coordinates scale with input; explicit output sizes absolute; distinct input-size previews before batch. | Mixed-size golden and preview browser tests. |
| PU-15 | Batch safe directory/file input, timestamp child or ZIP, no original writes, sequential memory, progress/Stop/report. | Real Chromium folder + WebKit ZIP, collision/traversal, partial failures and hashes. |
| PU-16 | Existing application/regression/static host stays green; honest suite gap audit. | Full units/build/spec, focused production browsers/static host; reviewed backlog. |

## Mode A module map and frozen seams

These leaf contracts are approved design, not completion claims. All new leaves
receive a sibling testbench before implementation, runnable demo, bounded header.
Parent owns shared schemas, migration, assemblies, security policy and integration.

1. **HELP-INDEX CORE** `help-index.ts`: `searchHelp({query,workspace,commands})`
   returns ranked immutable local articles/command results. Article records have
   id/title/workspace/keywords/steps and optional existing command. No I/O.
   **HELP-DIALOG SHELL** `help-dialog.ts`: `showHelp({document,root,workspace,commands,section,onCommand})`
   Promise closed; local dialog, search/results/tutorial/FAQ, focus trap/restore.
   Accepts only caller-supplied command targets. Dependencies: HELP-INDEX, DOM.
2. **ICON SHELL** existing `icons.ts`: preserve public renderIcon/catalog API;
   **TABLER DATA** pinned vendored source plus generated path data. Existing tests
   and visual smoke. Parent integrates chrome stacking/logo layout.
3. **PIXEL-POLICY CORE** `image-pixel-policy.ts`: types
   `PixelPolicy={mode:'pixel-art'|'smooth'; palette:null|{colours:readonly RGB[];dither:'none'|'bayer'|'floyd-steinberg'}}`;
   `pixelPolicy(unknown?)` validates/copies/freezes; default pixel-art/null;
   `pixelCoverage(Raster,mode)` returns new raster, thresholds alpha>=128 in pixel
   mode (zero RGB when clear), preserves opaque RGB; smooth byte copy. No I/O.
4. **PALETTE CORE** `image-palette-core.ts`: `generatePalette(raster,count)` deterministic
   median cut, stable tie rules; `presetPalette(count)` stable fixed RGB swatches.
   **QUANTIZE CORE** `image-quantize.ts`: `quantizeImage(raster,palette)` copies
   strict final output, closest squared RGB, stable first tie; dithers RGB/alpha.
   **DOWNPIXEL CORE** `image-downpixel.ts`: `downpixelImage(raster,{width,height,resize})`
   returns nearest sampled low-resolution raster or sharp blocks at source size.
5. **IMAGE-CONTENT CORE** existing migration: policy mandatory in returned content;
   optional policy on new/layers; explicit policy-update request; all mutations
   preserve policy. Encoding v3; older layouts default pixel-art/null without pixel
   conversion. Existing MAX_PIXELS applies. Parent owns this seam.
6. **IMAGE-OUTPUT assembly** one composite+policy output seam shared by consumer
   paths. Worker SHELL runs expensive pure effects/replay; request IDs discard stale
   previews. New canvas/settings/effects UI uses original immutable source.
7. **IMAGE-OPERATIONS CORE assembly** validated discriminated semantic operations;
   **IMAGE-RECIPE CORE** version1 `.gsnv-actions`, reference sizes, enabled labelled
   steps, deterministic seeds and embedded RGBA assets, output settings. Split
   drawing/selection/layer/process executors into bounded leaves; do not grow one
   giant switch. Parent freezes detailed operation union before dependent work.
8. **IMAGE-RECORDER CORE** observes committed semantic operations and history IDs;
   maintains effective steps for Undo/Redo, stops on pre-record history traversal,
   reports unsupported action. No event/DOM recording.
9. **RECIPE-SCRIPT SHELL** isolated opaque-origin worker structured-result channel;
   operations-only allowlist validated by CORE; fresh worker, source/result/count
   limits, run IDs, timeout/Stop. No network/storage/filesystem authority.
10. **BATCH-PATH CORE** safe relative output names/collisions/report; **BATCH-FILES
    SHELL** directory or file input snapshots, writable handles or ZIP fallback;
    **BATCH-RUN SHELL assembly** decode -> worker replay -> encode -> closed write,
    one input at a time. Inputs never used as output handles.
11. **IMAGE-APP/APP-SHELL assemblies** compose New, Help, policy, effects, actions,
    script and batch UI. Shared mutable ownership remains parent-only.

Build order: 1–2/menu, 3–6/persistence/startup, 7–8/recorder, 9–10/script/batch,
11 integration at each rung; final audit and independent verification. Shared
boundaries are serial. Leaf work may proceed independently only after its contract
and dependencies exist. Push each stage with its tests green; do not report skipped
checks as passes. Final report must leave incomplete original requirements visible.

## Execution evidence

Baseline: 1,047 passing unit tests, production build and 38 focused browser tests
from font increment (historical evidence, not fresh validation of this upgrade).
Implementation completed as GREEN bricks. Final evidence: **1,214 units**, **160 main browser checks plus 46 final affected checks**, **20 Linux WebKit checks**, **9 complete offline checks**, and local Cloudflare/deployment validation. See [the checkpoint](PAINT-UPGRADE-CHECKPOINT.md) for exact commands, logs, limitations and remaining original requirements. These are verification results, not owner acceptance.

Map correction: existing `image-palette.ts` is the colour/tool UI SHELL. The new
pure palette generator is `image-palette-core.ts`; existing UI ownership is unchanged.

### Operation interface refinement (before implementation)

I-CONTENT is a bounded CORE assembly composing raster storage, selection, blend
metadata and policy validation; four seams justify its assembly classification.
New recipe executor is similarly an assembly over bounded drawing/selection/layer
and processing leaves. Exposed operation data uses active-layer indices instead of
opaque document IDs. Each recipe step has a reference width/height; replay scales
coordinates, scalar radii and embedded image placements from this reference.
The executor owns no DOM, clock or randomness. Seeded spray events record their
actual points and seeds. Full strokes retain ordered pointer segments so their
spacing/flow matches interactive delivery. Recipe state contains image plus a
private clipboard, with copy/cut/paste acting on the current input. External image
and committed text pixels are embedded losslessly as asset IDs. Layer actions,
selection shape/wand/all/none/invert, delete, move/affine, shape/fill/gradient,
adjustment, whole-image transform, pixel-policy and downpixel are explicit operation
variants. Unknown variants and out-of-bounds resource requests reject visibly.

Recipe v1 JSON: `{format:'gsnv-actions',version:1,name,steps,assets,output}`; each
step `{id,label,enabled,reference:{width,height},operation}`. Assets encode bounded
RGBA bytes losslessly with dimensions; output is PNG or editable project. Maximum
1,000 steps, 1,000,000 total stroke samples, 128 MiB decoded assets, 192 MiB file.
Application never evaluates recipes. Scripting accepts JavaScript separately and
returns this validated operation list via a bounded worker channel. Recipe editing
and recording use the same validation before execution.
