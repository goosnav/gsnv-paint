# First working CAD increment — provisional GREEN

This document records the original increment and its historical checks. Current
default-plane/profile capabilities are in [modeling evidence](CAD-MODELING-EVIDENCE.md).
The [connected revolve checkpoint](CAD-REVOLVE-EVIDENCE.md) extends the native
version-1 format with the exact `[Sketch, Revolve]` union described in
[CAD-REVOLVE-INCREMENT.md](CAD-REVOLVE-INCREMENT.md). Root axes remain sketch-relative;
angle expressions remain source text and unit changes preserve physical angles.
Existing extrusion/imported-STEP files retain their meanings. The current
editable format boundary rejects unsupported features rather than discarding them.

The production entry registers a CAD workspace instead of an empty adapter registry. C50–C58 and CAD-APP connect editable source, PlaneGCS constraints, OpenCascade B-rep extrusion, a sketch viewport, a solid viewport and the shared history/file/recovery shell. The full Phase 2 gate is not complete. No brick is human-ACCEPTED; this is not CANDIDATE_FOR_ACCEPTANCE.

## Supported workflow

New creates one XY sketch. Two-click line and corner-rectangle tools accept exact pointer coordinates; the rectangle replaces the current sketch and stores H/V constraints, a fixed corner and two driving dimensions. Typed line coordinates and rectangle dimensions are available through Sketch. Fields accept the existing arithmetic grammar, with explicit units; named references in an opened document resolve through C04. The UI for defining variables is not implemented.

Select edges with V/Ctrl-click, apply or remove H/V constraints, delete geometry, and edit a displayed dimension by double-click or its Part-panel control. A single simple closed linear profile extrudes with signed blind depth. Both engines run in one cancellable worker. The solid is a validated OCCT B-rep; volume, area and center of mass come from that B-rep. Three.js displays its actual triangulation. It is not a mesh substitute for solid modelling.

Live dialog previews do not enter history or recovery. Cancel restores source and display; OK records one immutable edit. New/save/open, Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z, project download/file-input fallback and local recovery are connected to the shared shell. Failed sketches/extrusions display readable errors and clear the stale result. Worker cancellation, timeout and faults terminate native work; stale replies cannot publish.

## Format boundary

The file is the existing S15 `GSNVPK1` container, with the S03 envelope `{format:'gsnv-cad',version:1,id,title,content}`. C50 implements the documented subset of `CADContent` from MODULE_MAP-CAD: one nonsuppressed XY sketch, up to one nonsuppressed blind boss, rollback at the end, empty imported assets, default appearance and no drawing. Coordinates are canonical mm; dimension source expressions remain editable. IDs, references, exact keys, finite geometry, positive tolerances and safe revisions are validated. Unsupported fields/features are rejected on open instead of removed. Native pointers and display meshes never enter the file.

C51 does not implement or amend C05. Its separate source-edit contract rejects revision exhaustion. During integration, its rectangle request gained an optional finite corner origin (default [0,0]) so pointer placement and typed placement agree; a regression test checks the supplied anchor. C52 rejects a solver result that collapses an edge, preserving editable source. C50 remains the file boundary. Existing future CAD contracts remain planned.

## Verification

Environment: Linux x64, desktop Chrome 154.0.8037.97, headless at 1280×720. Other browsers/OSes, physical pen/trackpad hardware and native OS file picker interaction are untested for this increment.

| Command | Final result | Evidence |
|---|---|---|
| `npm test` | 445 tests, 445 pass, 0 fail, 0 skipped; exit 0 | [unit output](evidence/CAD-APP-unit.txt) |
| `npm run test:browser` | 16 tests, 16 pass, 0 skipped; production build included; exit 0 | [browser output](evidence/CAD-APP-browser.txt) |
| `npx wrangler deploy --dry-run --no-autoconfig` | 16 static files read, no bindings, successful dry run; exit 0 | [deployment output](evidence/CAD-APP-deploy.txt) |
| `npx wrangler dev --local` + actual browser CAD smoke | HTTP 200 and isolation headers on HTML/worker/WASM; 60000 mm³ solid; no page errors | [local Cloudflare runtime](evidence/CAD-APP-cloudflare-runtime.txt) |
| Goosnav checker on C50–C58 | All nine pass; exit 0 | [checker output](evidence/CAD-APP-checkers.txt) |
| `npm run test:spec` | Trace/map/link closure; 386 requirements, 167 contracts | [trace output](evidence/CAD-APP-spec.txt) |

The production browser test creates a 100×60×10 mm part (60000 mm³), previews width 120 (72000 mm³), cancels and confirms, exercises undo/redo, downloads/reopens the native project, reloads and restores local recovery. Additional cases draw exact (0,0)→(20,10) line and (0,0)→(30,20) rectangle coordinates, solve H/V on a sloped line, edit a displayed dimension to rebuild a 6000→8000 mm³ solid, reject an open extrusion and flag conflicting constraints. These basic solids do not substitute for the required fillet/hole/pocket plate golden.

The C54 testbench also loads the real pinned OCCT binary directly and checks exact volume, area, center, reversed depth and triangle indices. C55 tests cancellation, stale revisions, worker faults, timeout and clean retry with controlled resources. The production smoke crosses those seams with real browser workers and WebGL. The browser demo `/dev/fixtures/cad-workspace.html` was opened and produced 60000 mm³ with no external application requests. Seven standalone demos ran; their [illustrative output](evidence/CAD-APP-demos.txt) is not test evidence. The [production screenshot](evidence/CAD-APP-production.png) was visually inspected.

Initial RED evidence: each new brick's sibling tests failed at its unimplemented entry point; the production test initially failed because New was disabled with no adapter. Integration exposed focus loss after property updates, SVG hit testing disabled by the chrome's icon rule, and dimension-label pointer capture. Each was reproduced through the real production UI before correction. The Open test also needed to await enabled controls and the asynchronous replacement dialog; no product validation was removed. Final assertions retain the original geometry and persistence expectations.

Vite reports the native solver's conditional `node:module` import as browser-externalized and warns about the Three.js bundle size. The actual worker/viewport browser tests pass. The largest emitted asset is 22,942,327 bytes, below Cloudflare's 26,214,400-byte cap; [all asset sizes](evidence/CAD-APP-assets.json) are recorded. Live Cloudflare authentication/upload/hosted-origin verification was not run.

## Requirement status

New complete procedures passing: **CAD-043, CAD-044, CAD-059**. The exact sketch browser test verifies sloped-line H/V solving within the document tolerance, plus displayed-dimension editing and downstream solid rebuild.

Previously passing IDs remain: SYS-005, CAD-001, CAD-002, CAD-003, CAD-006, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028. No requirement is recorded FAIL after the final checks. **Every other ID remains UNTESTED**: 370 of 386. The authoritative per-ID list is requirements.json and 06-TRACEABILITY.md. Passing subset/seam evidence does not close a wider verification procedure. In particular CAD-023/024 still need their exact saved/reopened entity-parameter procedure; CAD-063 still needs its specified B-rep bounds/section checks.

Remaining work includes the full CAD graph and sketch/feature families, topology selection and views, STEP/STL/3MF/DXF/PDF output, the acceptance plate and performance gates, Image, Video, cross-workspace actions, offline caching, exact corresponding-source release archives and the M1a platform matrix. This increment does not reduce those requirements.

## Tuning and maintenance

C50 owns document defaults and supported schema. C51 owns edit semantics; its testbench sends every result through the actual C50 validator. C52 is the only linear PlaneGCS compiler; C53 owns profile admission. C54's display tessellation uses 0.1 mm/0.5 rad and cannot change B-rep measurements. C55's 30 s watchdog bounds a stuck job without claiming the 2 s rebuild target. C56 owns 4 px/mm initial view scale, sketch margins, materials and rendering; geometry remains outside it. C57 owns click/snap interpretation; C58 owns property DOM. `cad-workspace.css` controls presentation. The production browser suite is the regression gate for their combined workflow.
