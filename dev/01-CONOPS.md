# Concept of operations

`gsnv-paint` is one local creative tool with Image, Video and CAD workspaces. A desktop user keeps projects editable, works without a service account, and transfers useful results between workspaces without uploading work. CAD correctness takes precedence over breadth elsewhere.

## Needs and operating scenarios

| Need | User outcome and validation scenario |
|---|---|
| N-001 | Keep work private and available offline. Load the site once, disconnect, reopen, create work, recover after a crash, and save/open a real file. No document content leaves the device. |
| N-002 | Learn one set of desktop conventions. Switch between workspaces, use menus/tooltips/status prompts, keyboard controls, direct manipulation and numeric edits; undo a mistaken operation and recover the previous document. |
| N-003 | Produce an editable, correct solid. Sketch the golden plate, constrain and dimension it, add the features, edit width, inspect errors, measure and export/re-import the result. Produce a dimensioned drawing. |
| N-004 | Edit everyday raster artwork. Import a supported image, paint/select/transform/layer/filter it, preserve editable text and masks in a project, then export a flattened delivery image. |
| N-005 | Edit everyday video. Reference local media, arrange and trim multiple tracks, add the specified transitions/titles/corrections/keyframes, preview in sync and export a bounded timeline. |
| N-006 | Continue work between media. Send Image to the Video bin, the current Video frame to Image, and a transparent CAD capture to Image with documented resolution and color treatment. |
| N-007 | Run the same product from the web or a local package. Use a static Cloudflare Pages site or a universal ZIP whose local server serves the identical static bytes. See actionable capability/launcher errors. |

## Authorized authoring extension (2026-11-13)

N-008: Create local documents, slides, waveform audio, spreadsheets and runnable browser code in the same application. Build a deck and present/export it, edit a recording and export WAV, calculate a workbook with editable formulas, and run/stop JavaScript or Python or preview HTML/CSS. Native save/reopen, shared history and failure recovery preserve each project. This extends the original three-workspace brief under the owner's later requests; the original CAD/Image/Video requirements remain binding. The separate Photo request is recorded in `PLAN-2026-11-12.md`.

## Environment and limits

Current desktop Chromium; at least 1280×720 CSS pixels. Other browsers receive feature checks and clear unavailable-capability messages. Browser codecs, GPU capacity, storage quota and operating-system file permissions vary. Permission denial leaves existing work intact. A first site load requires connectivity to populate the offline cache. Initial local runtime bootstrap may need connectivity; completed installation and cached application work offline.

No backend application logic, account, telemetry, upload, remote rendering, cloud persistence, or runtime CDN. User files stay in browser storage or files the user selects. A loopback static server is the sole local backend. Large video sources are read by ranges, not loaded whole. Cross-origin isolation is required where threaded WASM needs it.

## Scope boundary

The complete owner list is binding, enumerated in requirements. CAD excludes assemblies/mates, sweeps, lofts, draft, surfacing, sheet metal, weldments, simulation, rendering and configurations. Image excludes CMYK, RAW, adjustment layers, layer styles, vector paths, generative/content-aware fill and scripting. Video excludes multicam, motion tracking, nested sequences, scopes, plugins and automatic captions. Distribution excludes subsequent M1b/M2/M3/M4 gates.

## Validation

The owner runs the seven scenarios above on a candidate artifact. Passing automated tests does not substitute for owner acceptance. A partial phase build is labeled by its phase and does not claim unbuilt workspaces are functional.
