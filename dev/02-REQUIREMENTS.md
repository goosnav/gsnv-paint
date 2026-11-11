# System requirements — gsnv-paint

This is the Phase 0 baseline derived from the user brief. `requirements.json` is the structured source for IDs, phase ownership, planned verification, and status. This document and `06-TRACEABILITY.md` are matching human-readable views. No implementation capability has been verified by writing these documents.

All requirements are **Must** within the stated scope. CAD has scheduling priority; Video gives first if the user authorizes a scope tradeoff. A listed family passes only when **every named option and case** passes. The `phase` field identifies introduction/ownership. The separate `verificationPhase` field identifies the first planned phase in which the entire stated verification procedure can finish. Shared controls are rechecked in each workspace when it arrives. Phase gates run all required procedures for completed bricks and integration seams; a broad requirement remains UNTESTED until its complete procedure passes at its verification phase. Partial coverage is recorded as evidence, never as a partial PASS. Later integrations require regression evidence and may invalidate an earlier result. IDs are permanent after this baseline is committed.

## Parent needs and rationale

Each row inherits its rationale from its parent need below. The exact original brief remains the authority if a transcription issue is found.

| Need | Rationale |
|---|---|
| N-001 | Private, offline creative work without accounts, telemetry, or uploads. |
| N-002 | A consistent desktop interface and predictable controls across workspaces. |
| N-003 | Editable, accurate parametric solid modeling with reliable exchange and inspection. |
| N-004 | Daily raster drawing, selection, layer, adjustment, and image-file work. |
| N-005 | Daily timeline editing, audiovisual preview, and media export. |
| N-006 | Transfer creative results between workspaces without an external service. |
| N-007 | A traceable, maintainable product distributed as a static site and local candidate. |

## Verification conventions

`verificationPhase` does not defer the implementation of a shared control: its shell brick is built and checked in Phase 1, then its full workspace-level procedure closes when all dependent workspace behaviors exist. Lifecycle inspections apply at their owning checkpoint and recur at every later relevant gate.

`T` means an executed test, `I` means inspection, and `A` means analysis. Each procedure has ID `V-<requirement-ID>` and appears with its literal input/action/assertion below. Every capability begins `UNTESTED`. A specification closure check can pass while the product requirements remain untested. Missing tools, unavailable platforms, skipped tests, and unsupported codecs are never a capability pass.

Numerical precision, image interpolation, codec behavior, and feature-reference policy must be fixed in the relevant brick contract before its testbench is written. Golden expected values must be derived independently or reviewed against an external reference, not blessed from the implementation under test.

Performance requirements retain the user’s targets. The reference hardware and repeatable benchmark fixtures must be recorded before measurement. “No visible brush lag” has no user-specified millisecond limit; the verification plan must resolve that acceptance criterion explicitly without silently weakening or inventing a threshold.

## System and architecture constraints

| ID | Need | Introduced | Full verification | Requirement |
|---|---|---:|---:|---|
| SYS-001 | N-002 | 0 | 5 | The product shall be named gsnv-paint. |
| SYS-002 | N-002 | 1 | 4 | The product shall contain Image, Video, and CAD workspaces in one application window. |
| SYS-003 | N-007 | 0 | 0 | The implementation shall be greenfield and shall not clone, read, or port code from another Goosnav repository. |
| SYS-004 | N-007 | 0 | 0 | The product shall implement only the daily-use functions enumerated by the user, with no additions outside that scope. |
| SYS-005 | N-007 | 0 | 0 | The phase plan shall prioritize CAD over Image and Video, reducing Video first if a capacity tradeoff is required. |
| SYS-006 | N-001 | 1 | 4 | All editing, geometry, pixel, timeline, codec, and file-processing logic shall execute client-side. |
| SYS-007 | N-001 | 1 | 5 | The product shall require no account. |
| SYS-008 | N-001 | 1 | 4 | The product shall send no telemetry. |
| SYS-009 | N-001 | 1 | 4 | The product shall upload no user project or source-media data. |
| SYS-010 | N-001 | 5 | 5 | The product shall work offline after its first successful load. |
| SYS-011 | N-007 | 5 | 5 | The browser and local shells shall serve the same static build. |
| SYS-012 | N-007 | 5 | 5 | The browser shell shall deploy to Cloudflare Pages. |
| SYS-013 | N-002 | 1 | 4 | The supported browser target shall be current desktop Chromium at a viewport of at least 1280 by 720 pixels. |
| SYS-014 | N-002 | 1 | 4 | On other browsers, the product shall state missing capabilities in the UI rather than silently failing. |
| SYS-015 | N-007 | 0 | 4 | Geometry, pixel, and timeline logic shall be UI-free CORE modules. |
| SYS-016 | N-007 | 0 | 4 | Canvas, WebGL, codecs, and file access shall reside in SHELL adapters. |

| Verification | Method | Concrete procedure and pass assertion |
|---|---|---|
| V-SYS-001 | I | Inspect application title, package name, README, and release manifest; assert the product name is gsnv-paint. |
| V-SYS-002 | T | Switch through all three workspaces; assert each is hosted by the same shell and document context is retained. |
| V-SYS-003 | I | Inspect the source provenance and dependency record plus repository-operation log; assert no other Goosnav repository supplied implementation code. |
| V-SYS-004 | I | Compare exposed commands and planned bricks against this baseline and the explicit exclusions; every command must have an in-scope requirement. |
| V-SYS-005 | I | Inspect phase order and any scope decision; assert CAD precedes Image and Video and any proposed reduction names Video first without silently deleting requirements. |
| V-SYS-006 | T | Exercise representative CAD, Image, and Video edits with network interception; assert processing completes without a backend request, then inspect runtime boundaries. |
| V-SYS-007 | T | Launch a clean profile offline after installation; open and edit each workspace without login, registration, or identity prompts. |
| V-SYS-008 | T | Record every network request while opening files, editing, saving, and exporting in all workspaces; assert no telemetry request or beacon occurs. |
| V-SYS-009 | T | Use distinctive fixture bytes and record network traffic during all import, edit, save, and export paths; assert no user bytes leave the client. |
| V-SYS-010 | T | Load the complete app once, disable network, close and reopen it, then create, edit, reopen, and export one document per workspace; assert no required asset is missing. |
| V-SYS-011 | I | Compare per-file hashes of the web build and local ZIP static payload; assert equality excluding shell-only launcher and manifest files. |
| V-SYS-012 | T | Build the static artifact and inspect the Pages deployment configuration; smoke-test the deployed origin when credentials permit and record the actual origin. |
| V-SYS-013 | T | Record Chromium version and run the workspace smoke suite at exactly 1280 by 720; assert essential tools, dialogs, and status remain usable. |
| V-SYS-014 | T | Inject unsupported file-system, codec, WebGL, and WASM-thread capability results; assert a readable capability message names each unavailable operation. |
| V-SYS-015 | I | Inspect CORE imports and module contracts; assert no DOM, Canvas, WebGL, codec, file-access, or shell dependency is imported. |
| V-SYS-016 | I | Inspect the module map and import graph; assert each browser/platform API is owned by a named SHELL adapter. |

## Shared chrome, controls, history, and persistence

| ID | Need | Introduced | Full verification | Requirement |
|---|---|---:|---:|---|
| CTL-001 | N-002 | 1 | 4 | The shell shall use original Windows XP-era blue-gradient title bars, beveled buttons, a menu bar, icon toolbars, a left tool palette, right docked panels, a status bar, and classic modal dialogs. |
| CTL-002 | N-002 | 1 | 1 | The UI font stack shall use a Tahoma-style desktop appearance. |
| CTL-003 | N-002 | 1 | 4 | The shell shall keep chrome and interaction conventions identical while swapping menus, toolbars, and panels for the selected workspace. |
| CTL-004 | N-002 | 1 | 4 | Every tool shall have an original icon. |
| CTL-005 | N-002 | 1 | 4 | Every tool shall have a tooltip containing its shortcut. |
| CTL-006 | N-002 | 1 | 4 | Every active tool shall show a status-bar instruction describing what the next click does. |
| CTL-007 | N-002 | 1 | 4 | Every value set by dragging shall also accept typed input. |
| CTL-008 | N-002 | 1 | 4 | Every dialog that changes document content shall preview its changes live before OK. |
| CTL-009 | N-002 | 1 | 4 | Escape shall cancel the active tool operation or open dialog. |
| CTL-010 | N-002 | 1 | 4 | Enter shall confirm the active valid operation or dialog. |
| CTL-011 | N-002 | 1 | 4 | Wheel input shall zoom at the cursor in each zoomable workspace view. |
| CTL-012 | N-002 | 1 | 4 | Space-drag shall pan 2D views. |
| CTL-013 | N-002 | 1 | 4 | Right-click shall open a context menu for the item under the cursor. |
| CTL-014 | N-002 | 1 | 4 | Ctrl+N shall create a new document through the active workspace new-document flow. |
| CTL-015 | N-002 | 1 | 4 | Ctrl+O shall open a supported project or source file through the active workspace flow. |
| CTL-016 | N-002 | 1 | 1 | Ctrl+S shall save the active project to its current file, or request a destination when unsaved. |
| CTL-017 | N-002 | 1 | 4 | Ctrl+C, Ctrl+X, and Ctrl+V shall copy, cut, and paste the active editable selection using workspace-appropriate semantics. |
| CTL-018 | N-002 | 1 | 4 | Delete shall remove the active deletable selection. |
| CTL-019 | N-002 | 1 | 4 | Ctrl+A shall select all eligible items in the focused editing context. |
| CTL-020 | N-002 | 1 | 4 | Every document-changing action shall support undo and redo. |
| CTL-021 | N-002 | 1 | 1 | Undo history shall retain at least 100 steps per document. |
| CTL-022 | N-002 | 1 | 4 | Ctrl+Z shall undo the last document-changing action. |
| CTL-023 | N-002 | 1 | 4 | Ctrl+Y and Ctrl+Shift+Z shall each redo an undone action. |
| CTL-024 | N-002 | 1 | 4 | Each workspace shall expose a history panel showing document actions. |
| CTL-025 | N-001 | 1 | 4 | Each workspace shall autosave its editable document to local browser storage. |
| CTL-026 | N-001 | 1 | 1 | The application shall offer crash recovery from the latest complete autosave. |
| CTL-027 | N-001 | 1 | 1 | The application shall save and open real files through the browser file-system API when available. |
| CTL-028 | N-001 | 1 | 1 | The application shall provide download and file-input fallback when the file-system API is unavailable. |
| CTL-029 | N-001 | 1 | 4 | Every workspace shall have a versioned and documented project format. |
| CTL-030 | N-001 | 1 | 4 | Every workspace project format shall reopen its document fully editable. |

| Verification | Method | Concrete procedure and pass assertion |
|---|---|---|
| V-CTL-001 | T | Capture every workspace at 1280 by 720 and compare each listed chrome component against the approved visual checklist; all eight components must be present. |
| V-CTL-002 | T | Inspect the declared font stack and computed UI font; assert Tahoma or its documented metric-compatible fallback is applied to menus, panels, tooltips, and dialogs. |
| V-CTL-003 | T | Switch Image to Video to CAD to Image; assert shell layout and control behavior are shared while each workspace exposes its own relevant commands. |
| V-CTL-004 | T | Enumerate registered tools and inspect each icon asset; assert each tool resolves to an app-authored graphic with recorded provenance. |
| V-CTL-005 | T | Enumerate registered tools, hover each toolbar/palette entry, and assert its tooltip names the tool and its assigned shortcut; invoke that shortcut in the relevant context. |
| V-CTL-006 | T | Activate each tool and advance its interaction states; assert every state exposes a nonempty next-click instruction matching the expected action. |
| V-CTL-007 | T | For every registered draggable value, set a known value by drag, then type an exact value; assert the resulting model uses the typed value. |
| V-CTL-008 | T | Open each content-editing dialog, change a parameter, inspect the preview before confirmation, cancel, and assert the original document is restored; then repeat and confirm. |
| V-CTL-009 | T | Start a multistep tool and edit each dialog type; press Escape and assert the pending preview is removed without adding a document mutation. |
| V-CTL-010 | T | Provide valid inputs to each confirmable interaction and press Enter; assert exactly one confirmed command is applied. |
| V-CTL-011 | T | Place the cursor over a known document point and wheel in and out; assert the point remains at the same screen coordinate within one pixel. |
| V-CTL-012 | T | In Image, CAD sketch, and Video 2D preview, hold Space and drag 100 pixels; assert the view translates by the expected amount without modifying content. |
| V-CTL-013 | T | Right-click representative face, edge, sketch entity, image layer/pixel selection, timeline clip/track, and empty canvas; assert the menu target and enabled commands match the hit item. |
| V-CTL-014 | T | Press Ctrl+N in every workspace, confirm the new-document settings, and assert the new editable document has those settings. |
| V-CTL-015 | T | Press Ctrl+O in each workspace, choose a fixture file, and assert it opens with the expected content. |
| V-CTL-016 | T | Save a new project with Ctrl+S, edit it, save again, reopen the chosen file, and assert the latest edit is present. |
| V-CTL-017 | T | For a CAD sketch selection, Image pixel/layer selection, and Video clip selection, exercise copy/paste and cut/paste; assert copies preserve content, cut removes the source, and undo restores it. |
| V-CTL-018 | T | Select a sketch entity or deletable feature, image selection/layer, and timeline clip; press Delete and assert only the active target is removed. |
| V-CTL-019 | T | Focus CAD sketch, Image canvas, and Video timeline separately; press Ctrl+A and assert all eligible entities, pixels, or clips in that context are selected. |
| V-CTL-020 | T | Enumerate the command registry and execute each command against a fixture; undo must restore the prior serialized state and redo must restore the resulting state. |
| V-CTL-021 | T | Apply 100 distinct document edits, undo all 100, then redo all 100; assert the initial and final serialized states match their snapshots. |
| V-CTL-022 | T | Apply two edits in each workspace, press Ctrl+Z once, and assert only the second edit is undone. |
| V-CTL-023 | T | Undo two edits in each workspace; use Ctrl+Y for one and Ctrl+Shift+Z for the other; assert both are restored in order. |
| V-CTL-024 | T | Apply named operations in every workspace and assert the panel lists them in order and indicates the current undo position. |
| V-CTL-025 | T | Edit each workspace, wait for the documented autosave interval, inspect its saved local record, and assert the latest committed state is included. |
| V-CTL-026 | T | Terminate a browser session after a confirmed autosave and during a later incomplete write; reopen and assert recovery offers the latest complete record without corruption. |
| V-CTL-027 | T | With the API available, create a project, save to a chosen file, modify and overwrite it, then reopen it and compare editable state. |
| V-CTL-028 | T | Disable the native file-system API, download a saved project, reopen it through a file input, and compare editable state. |
| V-CTL-029 | T | Inspect the CAD, Image, and Video format specifications and saved fixtures; assert each carries a schema version and documents every persisted editable field. |
| V-CTL-030 | T | Save fixtures containing each editable entity type, reopen them in a fresh session, compare normalized editable state, and modify each persisted entity type successfully. |

## Parametric CAD

| ID | Need | Introduced | Full verification | Requirement |
|---|---|---:|---:|---|
| CAD-001 | N-003 | 2 | 2 | CAD shall use a proven open-source OpenCascade-based B-rep kernel compiled to WebAssembly. |
| CAD-002 | N-003 | 2 | 2 | CAD shall use a proven open-source 2D constraint solver. |
| CAD-003 | N-003 | 2 | 2 | The project shall not implement its own B-rep kernel or 2D constraint solver. |
| CAD-004 | N-003 | 2 | 2 | The B-rep kernel shall execute in a worker. |
| CAD-005 | N-003 | 2 | 2 | The 2D constraint solver shall execute in a worker. |
| CAD-006 | N-003 | 2 | 2 | DECISIONS shall record the kernel and solver licenses and their commercial-distribution obligations. |
| CAD-007 | N-003 | 2 | 2 | CAD documents shall be history-based and parametric. |
| CAD-008 | N-003 | 2 | 2 | The feature tree shall list every sketch and feature in evaluation order. |
| CAD-009 | N-003 | 2 | 2 | Editing any sketch, dimension, or feature shall rebuild every downstream dependent feature. |
| CAD-010 | N-003 | 2 | 2 | The feature tree shall provide a rollback bar. |
| CAD-011 | N-003 | 2 | 2 | A feature shall be suppressible and unsuppressible. |
| CAD-012 | N-003 | 2 | 2 | A feature shall be deletable with readable dependency handling. |
| CAD-013 | N-003 | 2 | 2 | A feature shall be renameable. |
| CAD-014 | N-003 | 2 | 2 | Features shall be reorderable only where dependencies allow. |
| CAD-015 | N-003 | 2 | 2 | A failed feature shall be flagged in the tree with a readable reason. |
| CAD-016 | N-003 | 2 | 2 | A failed rebuild shall never silently present a stale or invalid model as the current successful result. |
| CAD-017 | N-003 | 2 | 2 | Each CAD document shall support millimeter or inch units. |
| CAD-018 | N-003 | 2 | 2 | CAD dimension fields shall accept named variables. |
| CAD-019 | N-003 | 2 | 2 | Every CAD dimension field shall accept expressions involving variables, such as width / 2. |
| CAD-020 | N-003 | 2 | 2 | A sketch shall be creatable on each of the three default planes. |
| CAD-021 | N-003 | 2 | 2 | A sketch shall be creatable on any planar face. |
| CAD-022 | N-003 | 2 | 2 | Entering a sketch shall orient the view normal to its plane. |
| CAD-023 | N-003 | 2 | 2 | The sketcher shall create line entities. |
| CAD-024 | N-003 | 2 | 2 | The sketcher shall create corner rectangle entities. |
| CAD-025 | N-003 | 2 | 2 | The sketcher shall create center rectangle entities. |
| CAD-026 | N-003 | 2 | 2 | The sketcher shall create circle entities. |
| CAD-027 | N-003 | 2 | 2 | The sketcher shall create 3-point arc entities. |
| CAD-028 | N-003 | 2 | 2 | The sketcher shall create center-point arc entities. |
| CAD-029 | N-003 | 2 | 2 | The sketcher shall create tangent arc entities. |
| CAD-030 | N-003 | 2 | 2 | The sketcher shall create regular polygon entities. |
| CAD-031 | N-003 | 2 | 2 | The sketcher shall create slot entities. |
| CAD-032 | N-003 | 2 | 2 | The sketcher shall create point entities. |
| CAD-033 | N-003 | 2 | 2 | The sketcher shall create construction line entities. |
| CAD-034 | N-003 | 2 | 2 | The sketcher shall provide trim. |
| CAD-035 | N-003 | 2 | 2 | The sketcher shall provide extend. |
| CAD-036 | N-003 | 2 | 2 | The sketcher shall provide offset. |
| CAD-037 | N-003 | 2 | 2 | The sketcher shall provide mirror. |
| CAD-038 | N-003 | 2 | 2 | The sketcher shall provide corner fillet. |
| CAD-039 | N-003 | 2 | 2 | The sketcher shall provide corner chamfer. |
| CAD-040 | N-003 | 2 | 2 | The sketcher shall provide linear pattern. |
| CAD-041 | N-003 | 2 | 2 | The sketcher shall provide circular pattern. |
| CAD-042 | N-003 | 2 | 2 | The sketcher shall provide project edges. |
| CAD-043 | N-003 | 2 | 2 | The sketcher shall support the horizontal constraint. |
| CAD-044 | N-003 | 2 | 2 | The sketcher shall support the vertical constraint. |
| CAD-045 | N-003 | 2 | 2 | The sketcher shall support the coincident constraint. |
| CAD-046 | N-003 | 2 | 2 | The sketcher shall support the parallel constraint. |
| CAD-047 | N-003 | 2 | 2 | The sketcher shall support the perpendicular constraint. |
| CAD-048 | N-003 | 2 | 2 | The sketcher shall support the tangent constraint. |
| CAD-049 | N-003 | 2 | 2 | The sketcher shall support the concentric constraint. |
| CAD-050 | N-003 | 2 | 2 | The sketcher shall support the equal constraint. |
| CAD-051 | N-003 | 2 | 2 | The sketcher shall support the collinear constraint. |
| CAD-052 | N-003 | 2 | 2 | The sketcher shall support the midpoint constraint. |
| CAD-053 | N-003 | 2 | 2 | The sketcher shall support the symmetric constraint. |
| CAD-054 | N-003 | 2 | 2 | The sketcher shall support the fix constraint. |
| CAD-055 | N-003 | 2 | 2 | The sketcher shall infer applicable geometric constraints while drawing. |
| CAD-056 | N-003 | 2 | 2 | Sketch constraints shall be shown as glyphs. |
| CAD-057 | N-003 | 2 | 2 | Sketch constraints shall be deletable. |
| CAD-058 | N-003 | 2 | 2 | A single dimension tool shall select linear, aligned, radius, diameter, or angle dimensions from one or two selected entities. |
| CAD-059 | N-003 | 2 | 2 | Double-clicking a dimension shall edit its value. |
| CAD-060 | N-003 | 2 | 2 | The sketcher shall use distinguishable color states for under-defined, fully defined, and over-defined geometry. |
| CAD-061 | N-003 | 2 | 2 | Under-defined sketch geometry shall be draggable within its remaining degrees of freedom. |
| CAD-062 | N-003 | 2 | 2 | An over-constrained sketch shall produce a flagged, readable error. |
| CAD-063 | N-003 | 2 | 2 | CAD shall support extrude boss in blind mode. |
| CAD-064 | N-003 | 2 | 2 | CAD shall support extrude boss in mid-plane mode. |
| CAD-065 | N-003 | 2 | 2 | CAD shall support extrude boss in up to face mode. |
| CAD-066 | N-003 | 2 | 2 | CAD shall support extrude boss in through all mode. |
| CAD-067 | N-003 | 2 | 2 | CAD shall support extrude cut in blind mode. |
| CAD-068 | N-003 | 2 | 2 | CAD shall support extrude cut in mid-plane mode. |
| CAD-069 | N-003 | 2 | 2 | CAD shall support extrude cut in up to face mode. |
| CAD-070 | N-003 | 2 | 2 | CAD shall support extrude cut in through all mode. |
| CAD-071 | N-003 | 2 | 2 | CAD shall support revolve boss. |
| CAD-072 | N-003 | 2 | 2 | CAD shall support revolve cut. |
| CAD-073 | N-003 | 2 | 2 | CAD shall support constant-radius fillet. |
| CAD-074 | N-003 | 2 | 2 | CAD shall support chamfer. |
| CAD-075 | N-003 | 2 | 2 | CAD shall support shell. |
| CAD-076 | N-003 | 2 | 2 | CAD shall support simple hole. |
| CAD-077 | N-003 | 2 | 2 | CAD shall support counterbore hole. |
| CAD-078 | N-003 | 2 | 2 | CAD shall support countersink hole. |
| CAD-079 | N-003 | 2 | 2 | CAD shall support linear feature pattern. |
| CAD-080 | N-003 | 2 | 2 | CAD shall support circular feature pattern. |
| CAD-081 | N-003 | 2 | 2 | CAD shall support feature mirror. |
| CAD-082 | N-003 | 2 | 2 | CAD shall create offset plane reference geometry. |
| CAD-083 | N-003 | 2 | 2 | CAD shall create angled plane reference geometry. |
| CAD-084 | N-003 | 2 | 2 | CAD shall create axis reference geometry. |
| CAD-085 | N-003 | 2 | 2 | CAD shall create point reference geometry. |
| CAD-086 | N-003 | 2 | 2 | Feature depth and distance shall be adjustable by a drag arrow in the viewport. |
| CAD-087 | N-003 | 2 | 2 | Feature depth and distance shall accept typed values. |
| CAD-088 | N-003 | 2 | 2 | Double-clicking a feature shall reveal editable dimensions in place. |
| CAD-089 | N-003 | 2 | 2 | Middle-drag shall orbit the CAD view. |
| CAD-090 | N-003 | 2 | 2 | Shift+middle-drag shall pan the CAD view. |
| CAD-091 | N-003 | 2 | 2 | CAD shall provide a view cube. |
| CAD-092 | N-003 | 2 | 2 | CAD shall provide on-screen orbit, pan, and zoom controls usable without a middle mouse button. |
| CAD-093 | N-003 | 2 | 2 | CAD shall provide standard orthographic views. |
| CAD-094 | N-003 | 2 | 2 | CAD shall provide an isometric view. |
| CAD-095 | N-003 | 2 | 2 | F shall zoom the CAD view to fit the visible model. |
| CAD-096 | N-003 | 2 | 2 | CAD shall provide normal-to view for a selected planar face. |
| CAD-097 | N-003 | 2 | 2 | CAD shall select faces, edges, and vertices. |
| CAD-098 | N-003 | 2 | 2 | CAD shall highlight hovered faces, edges, and vertices. |
| CAD-099 | N-003 | 2 | 2 | Ctrl shall enable multiple CAD selections. |
| CAD-100 | N-003 | 2 | 2 | CAD shall support box selection. |
| CAD-101 | N-003 | 2 | 2 | CAD shall provide face, edge, and vertex selection filters. |
| CAD-102 | N-003 | 2 | 2 | CAD shall provide shaded-with-edges, shaded, wireframe, and hidden-line display modes. |
| CAD-103 | N-003 | 2 | 2 | CAD shall provide a section view. |
| CAD-104 | N-003 | 2 | 2 | CAD shall support per-body color. |
| CAD-105 | N-003 | 2 | 2 | CAD shall support per-face color. |
| CAD-106 | N-003 | 2 | 2 | The CAD measure tool shall report distance. |
| CAD-107 | N-003 | 2 | 2 | The CAD measure tool shall report angle. |
| CAD-108 | N-003 | 2 | 2 | The CAD measure tool shall report radius. |
| CAD-109 | N-003 | 2 | 2 | CAD mass properties shall report volume. |
| CAD-110 | N-003 | 2 | 2 | CAD mass properties shall report surface area. |
| CAD-111 | N-003 | 2 | 2 | CAD mass properties shall calculate mass from user-specified density. |
| CAD-112 | N-003 | 2 | 2 | CAD mass properties shall report center of mass. |
| CAD-113 | N-003 | 2 | 2 | CAD shall export STEP. |
| CAD-114 | N-003 | 2 | 2 | CAD shall export STL. |
| CAD-115 | N-003 | 2 | 2 | CAD shall export 3MF. |
| CAD-116 | N-003 | 2 | 2 | CAD shall import STEP as a non-parametric solid. |
| CAD-117 | N-003 | 2 | 2 | CAD shall export a sketch as DXF. |
| CAD-118 | N-003 | 2 | 2 | CAD shall export a planar face as DXF. |
| CAD-119 | N-003 | 2 | 2 | CAD shall provide a drawing sheet with front, top, right, and isometric views. |
| CAD-120 | N-003 | 2 | 2 | CAD drawing sheets shall include dimensions. |
| CAD-121 | N-003 | 2 | 2 | CAD shall export the drawing sheet as PDF. |
| CAD-122 | N-003 | 2 | 2 | The CAD acceptance plate shall have volume 56654.425 mm3 within 0.01 percent. |
| CAD-123 | N-003 | 2 | 2 | Changing the acceptance plate length from 100 to 120 mm shall rebuild to volume 68654.425 mm3 within 0.01 percent. |
| CAD-124 | N-003 | 2 | 2 | STEP export and re-import of the acceptance plate shall preserve its volume. |

| Verification | Method | Concrete procedure and pass assertion |
|---|---|---|
| V-CAD-001 | I | Inspect the pinned dependency, upstream provenance, compiled artifact, and spike evidence; assert the engine is OpenCascade-based B-rep WASM and successfully creates and measures a solid. |
| V-CAD-002 | I | Inspect the pinned solver, upstream provenance, and spike evidence; assert it solves a constrained rectangle and reports a contradictory constraint set. |
| V-CAD-003 | I | Inspect the CAD dependency boundary and implementation ownership; assert geometry-kernel and constraint-solving calls delegate to the recorded upstream engines. |
| V-CAD-004 | T | Instrument a long kernel operation; assert the kernel call runs in a worker and the main thread continues to accept cancellation or navigation input. |
| V-CAD-005 | T | Instrument a long constraint solve; assert the solve runs in a worker and the main thread continues to accept interaction. |
| V-CAD-006 | I | Inspect pinned license texts and DECISIONS for both engines; assert commercial-distribution terms and required notices/source/relinking obligations are recorded without treating availability as license approval. |
| V-CAD-007 | T | Build a constrained sketch and dependent extrusion, change a driving dimension, and assert the solid rebuilds from stored feature parameters. |
| V-CAD-008 | T | Create two sketches and three dependent features; assert all five appear once in the tree in rebuild order. |
| V-CAD-009 | T | Edit each source category in a three-feature chain and assert downstream geometry and measured properties reflect the change. |
| V-CAD-010 | T | Move rollback before the third feature of a five-feature part; assert only the prefix is evaluated and restoring the bar evaluates the full part. |
| V-CAD-011 | T | Suppress an intermediate feature and inspect downstream status, then unsuppress it; assert the original evaluated model is restored. |
| V-CAD-012 | T | Delete an independent feature and then attempt deletion of a depended-on feature; assert the resulting history is valid or a readable dependency decision is required. |
| V-CAD-013 | T | Rename a feature and save/reopen; assert its name changes without changing its stable references or geometry. |
| V-CAD-014 | T | Move an independent feature across a sibling and assert success; move a consumer before its source and assert a readable rejection without corrupting history. |
| V-CAD-015 | T | Apply a fillet larger than the selected solid supports; assert the feature is flagged with a reason identifying the failed operation. |
| V-CAD-016 | T | Break an upstream reference, rebuild, and assert the error and affected downstream states are visible and any last-good geometry is clearly identified as stale. |
| V-CAD-017 | T | Create a 25.4 mm edge, switch document units to inch, and assert it displays as 1 inch without changing physical geometry; round-trip the document unit setting. |
| V-CAD-018 | T | Define width = 40, bind a sketch or feature dimension to width, change width to 60, and assert all bound dimensions rebuild to 60. |
| V-CAD-019 | T | For each registered dimension field type, enter width / 2 with width = 40; assert the resulting dimension is 20 in document units and changing width updates it. |
| V-CAD-020 | T | Create one sketch on XY, YZ, and XZ and assert its coordinates map to the selected plane. |
| V-CAD-021 | T | Select a planar face of a rotated solid, create a sketch, and assert its plane coincides with that face. |
| V-CAD-022 | T | Enter sketches on all default planes and an angled planar face; assert the camera direction is perpendicular to the sketch plane. |
| V-CAD-023 | T | In an empty sketch, click (0,0) then (20,10); assert one line with those endpoints, then save/reopen and compare entity parameters. |
| V-CAD-024 | T | In an empty sketch, click (0,0) then (30,20); assert a closed four-line rectangle bounded by those corners, then save/reopen and compare entity parameters. |
| V-CAD-025 | T | In an empty sketch, click center (10,10) then corner (25,20); assert a closed rectangle symmetric about (10,10), then save/reopen and compare entity parameters. |
| V-CAD-026 | T | In an empty sketch, click center (0,0) then a radius point (10,0); assert a radius-10 circle, then save/reopen and compare entity parameters. |
| V-CAD-027 | T | In an empty sketch, click (0,0), (10,10), and (20,0); assert an arc passing through all three points, then save/reopen and compare entity parameters. |
| V-CAD-028 | T | In an empty sketch, click center (0,0), start (10,0), and end (0,10); assert a radius-10 quarter arc with the requested sweep, then save/reopen and compare entity parameters. |
| V-CAD-029 | T | In an empty sketch, select the end of a line and click an arc endpoint; assert an arc tangent to the selected line at the shared endpoint, then save/reopen and compare entity parameters. |
| V-CAD-030 | T | In an empty sketch, type 6 sides, choose center (0,0), and radius 10; assert a closed six-sided regular polygon with equal sides, then save/reopen and compare entity parameters. |
| V-CAD-031 | T | In an empty sketch, choose centers (0,0) and (20,0), then width 8; assert a closed slot with parallel sides and radius-4 semicircular ends, then save/reopen and compare entity parameters. |
| V-CAD-032 | T | In an empty sketch, click (7,9); assert a point at (7,9), then save/reopen and compare entity parameters. |
| V-CAD-033 | T | In an empty sketch, draw a line and mark it construction; assert reference geometry omitted from profile area and solid creation, then save/reopen and compare entity parameters. |
| V-CAD-034 | T | Use two crossing lines; apply trim and assert removing the clicked segment preserves the other line and remaining segments. |
| V-CAD-035 | T | Use a short line aimed at another line; apply extend and assert the selected line endpoint reaches the target intersection. |
| V-CAD-036 | T | Use a closed 20 by 10 rectangle and distance 2; apply offset and assert the offset contour is consistently 2 units from the source. |
| V-CAD-037 | T | Use a line segment and a selected mirror axis; apply mirror and assert the copy is reflected about the axis with preserved dimensions. |
| V-CAD-038 | T | Use two perpendicular lines meeting at a corner and radius 3; apply corner fillet and assert the corner is replaced by a radius-3 arc tangent to both trimmed lines. |
| V-CAD-039 | T | Use two perpendicular lines meeting at a corner and distance 3; apply corner chamfer and assert the corner is replaced by the requested straight chamfer. |
| V-CAD-040 | T | Use a circle, count 4, and pitch 10; apply linear pattern and assert four instances are equally spaced by 10 along the chosen direction. |
| V-CAD-041 | T | Use a circle offset from an origin, count 6, and sweep 360 degrees; apply circular pattern and assert six instances have the requested angular spacing about the chosen center. |
| V-CAD-042 | T | Use an existing solid edge crossing the active sketch plane or lying in its projection; apply project edges and assert the projected sketch edge matches the chosen geometric projection and records its reference. |
| V-CAD-043 | T | Create a sloped line; apply horizontal, solve, and assert its endpoints have equal Y within the documented solver tolerance. |
| V-CAD-044 | T | Create a sloped line; apply vertical, solve, and assert its endpoints have equal X within the documented solver tolerance. |
| V-CAD-045 | T | Create two distinct endpoints; apply coincident, solve, and assert their positions become equal within the documented solver tolerance. |
| V-CAD-046 | T | Create two nonparallel lines; apply parallel, solve, and assert their direction vectors become parallel within the documented solver tolerance. |
| V-CAD-047 | T | Create two oblique lines; apply perpendicular, solve, and assert their dot product becomes zero within the documented solver tolerance. |
| V-CAD-048 | T | Create a line and circle; apply tangent, solve, and assert the line touches the circle with a perpendicular radius at contact within the documented solver tolerance. |
| V-CAD-049 | T | Create two circles; apply concentric, solve, and assert their centers become equal within the documented solver tolerance. |
| V-CAD-050 | T | Create two lines of different length and separately two circles of different radius; apply equal, solve, and assert line lengths or circle radii become equal within the documented solver tolerance. |
| V-CAD-051 | T | Create two offset lines; apply collinear, solve, and assert both lines lie on the same infinite line within the documented solver tolerance. |
| V-CAD-052 | T | Create a point and line segment; apply midpoint, solve, and assert the point equals the average of the line endpoints within the documented solver tolerance. |
| V-CAD-053 | T | Create two points and an axis; apply symmetric, solve, and assert the points become reflections across the axis within the documented solver tolerance. |
| V-CAD-054 | T | Create a free entity; apply fix, solve, and assert its constrained coordinates remain unchanged when neighboring geometry is dragged within the documented solver tolerance. |
| V-CAD-055 | T | Draw a nearly horizontal line and snap its endpoint to an existing point; assert the inferred horizontal and coincident constraints are offered/applied according to the displayed inference. |
| V-CAD-056 | T | Apply each supported constraint to a fixture; assert a visible, selectable glyph identifies its type and associated geometry. |
| V-CAD-057 | T | Select a constraint glyph and delete it; assert its constraint record is removed and the released degree of freedom can move. |
| V-CAD-058 | T | Use the same tool on suitable horizontal/vertical distances, an inclined line, circle/arc radius, circle diameter, and two angled lines; assert each of the five types is offered and drives geometry. |
| V-CAD-059 | T | Double-click a displayed dimension, type a new value or expression, confirm, and assert the sketch and downstream solid rebuild. |
| V-CAD-060 | T | Open one fixture for each solve state and assert rendered entity colors match the documented three-state legend. |
| V-CAD-061 | T | Drag an unconstrained endpoint and a point constrained to a line; assert the first follows freely and the second stays on the line. |
| V-CAD-062 | T | Fix a 20-unit line and impose a conflicting 30-unit length; assert a visible over-constraint error identifies the conflicting geometry or constraints and prevents silent acceptance. |
| V-CAD-063 | T | Create a closed profile and depth 12, apply extrude boss in blind mode, and assert the feature extends/cuts exactly 12 units along the selected direction using B-rep bounds and section intersections. |
| V-CAD-064 | T | Create a closed profile and total depth 12, apply extrude boss in mid-plane mode, and assert the feature extends/cuts 6 units to each side of the sketch plane using B-rep bounds and section intersections. |
| V-CAD-065 | T | Create a profile and selected planar stop face, apply extrude boss in up to face mode, and assert the feature terminates on that face and follows it after the stop face moves using B-rep bounds and section intersections. |
| V-CAD-066 | T | Create a profile crossing a body, apply extrude boss in through all mode, and assert the operation traverses the entire intersected target extent and remains through after target thickness changes using B-rep bounds and section intersections. |
| V-CAD-067 | T | Create a closed profile and depth 12, apply extrude cut in blind mode, and assert the feature extends/cuts exactly 12 units along the selected direction using B-rep bounds and section intersections. |
| V-CAD-068 | T | Create a closed profile and total depth 12, apply extrude cut in mid-plane mode, and assert the feature extends/cuts 6 units to each side of the sketch plane using B-rep bounds and section intersections. |
| V-CAD-069 | T | Create a profile and selected planar stop face, apply extrude cut in up to face mode, and assert the feature terminates on that face and follows it after the stop face moves using B-rep bounds and section intersections. |
| V-CAD-070 | T | Create a profile crossing a body, apply extrude cut in through all mode, and assert the operation traverses the entire intersected target extent and remains through after target thickness changes using B-rep bounds and section intersections. |
| V-CAD-071 | T | Apply revolve boss to a rectangular profile offset from an axis and a 360-degree angle; assert a closed revolved solid with analytically expected volume, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-072 | T | Apply revolve cut to an intersecting profile, target body, and revolution axis; assert a revolved void with analytically expected removed volume, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-073 | T | Apply constant-radius fillet to a rectangular prism, one edge, and radius 2; assert a valid solid with a radius-2 edge blend, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-074 | T | Apply chamfer to a rectangular prism, one edge, and distance 2; assert a valid solid with the requested straight bevel, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-075 | T | Apply shell to a box, selected opening face, and wall thickness 2; assert an open hollow solid with 2-unit walls, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-076 | T | Apply simple hole to a plate, center point, diameter 6, and depth 4; assert a cylindrical void 6 units in diameter and 4 units deep, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-077 | T | Apply counterbore hole to a plate, hole diameter/depth, counterbore diameter/depth; assert a stepped cylindrical hole matching all typed diameter and depth values, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-078 | T | Apply countersink hole to a plate, hole diameter/depth and countersink dimensions; assert a conical entrance and cylindrical hole matching typed size and depth values, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-079 | T | Apply linear feature pattern to a seed feature, count 4, and spacing 12; assert four features occur at the requested linear offsets, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-080 | T | Apply circular feature pattern to a seed feature, axis, count 6, and 360-degree sweep; assert six features occur at the requested angular offsets, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-081 | T | Apply feature mirror to a seed feature and reference plane; assert a mirrored feature lies at the reflected location, then edit its driving value and assert dependent rebuild succeeds. |
| V-CAD-082 | T | Create offset plane from a base plane and distance 10; assert a parallel plane 10 units from the base, then reference it from a later feature and rebuild. |
| V-CAD-083 | T | Create angled plane from a base plane, axis, and angle 30 degrees; assert a plane rotated 30 degrees about that axis, then reference it from a later feature and rebuild. |
| V-CAD-084 | T | Create axis from selected reference geometry defining a line; assert a stable reference axis at the defined line, then reference it from a later feature and rebuild. |
| V-CAD-085 | T | Create point from selected coordinates or reference geometry defining a location; assert a stable reference point at the defined location, then reference it from a later feature and rebuild. |
| V-CAD-086 | T | Select an extrude depth and reference-plane distance; drag each viewport arrow, confirm, and assert the displayed parameter and rebuilt geometry match. |
| V-CAD-087 | T | Type exact values into the same extrude depth and reference-plane distance controls; assert the parameter and geometry use those exact values. |
| V-CAD-088 | T | Double-click a supported feature in the viewport or tree; assert its dimensions appear on the model, edit one, and verify the dependent rebuild. |
| V-CAD-089 | T | Middle-drag a known screen delta; assert camera orientation changes while the target remains fixed and document geometry is unchanged. |
| V-CAD-090 | T | Hold Shift and middle-drag; assert camera and target translate together without changing orientation. |
| V-CAD-091 | T | Click each cube face and isometric corner; assert the corresponding standard or isometric camera orientation. |
| V-CAD-092 | T | Use only primary pointer and the on-screen controls to orbit, pan, and zoom; assert each changes the camera as labeled. |
| V-CAD-093 | T | Choose front, back, top, bottom, left, and right views; assert the expected orthogonal camera axes. |
| V-CAD-094 | T | Invoke isometric view and assert the camera has equal projected principal-axis scale with a stable up direction. |
| V-CAD-095 | T | Pan and zoom a model partly offscreen, press F, and assert its visible bounds fit within the viewport with a nonzero margin. |
| V-CAD-096 | T | Select an angled planar face and invoke normal-to; assert the camera direction is perpendicular to that face. |
| V-CAD-097 | T | Pick a known face, edge, and vertex from a fixture; assert each selection resolves to the correct persistent topology identifier. |
| V-CAD-098 | T | Move the pointer over one item of each topology class; assert only the hit candidate receives hover styling before selection. |
| V-CAD-099 | T | Select a face, Ctrl-select a second, and Ctrl-select the first again; assert the selection set adds then toggles the requested item. |
| V-CAD-100 | T | Drag a selection box around a known group of selectable entities; assert the selected set follows the displayed box-selection rule. |
| V-CAD-101 | T | Enable each filter separately and click overlapping topology; assert only the enabled topology class can be selected. |
| V-CAD-102 | T | Render a solid with occluded edges in all four modes and compare approved image fixtures; assert each mode displays the correct surfaces and edge visibility. |
| V-CAD-103 | T | Move a section plane through a hollow fixture; assert the displayed cut reveals the interior at the selected plane without changing the solid. |
| V-CAD-104 | T | Assign different colors to two bodies, save/reopen, and assert each body retains its color. |
| V-CAD-105 | T | Assign a distinct color to one face, save/reopen, and assert only that face retains the override. |
| V-CAD-106 | T | Measure two points and two parallel faces with known separation; assert reported values match analytic distances within documented kernel tolerance. |
| V-CAD-107 | T | Measure two edges at 30 degrees; assert the reported angle matches within documented angular tolerance. |
| V-CAD-108 | T | Measure a radius-5 circular edge and cylindrical face; assert the radius is 5 within documented kernel tolerance. |
| V-CAD-109 | T | Measure a 10 by 20 by 30 box; assert volume is 6000 cubic document units within documented kernel tolerance. |
| V-CAD-110 | T | Measure a 10 by 20 by 30 box; assert surface area is 2200 square document units within documented kernel tolerance. |
| V-CAD-111 | T | Assign a density of 0.002 mass units per cubic unit to a 6000-cubic-unit box; assert mass is 12 and changing density updates mass. |
| V-CAD-112 | T | Measure a uniform box from (0,0,0) to (10,20,30); assert center of mass is (5,10,15) within documented kernel tolerance. |
| V-CAD-113 | T | Export a solid containing a hole and fillet to STEP; parse with an independent fixture validator and assert re-imported B-rep volume and topology-validity match within documented exchange tolerance. |
| V-CAD-114 | T | Export a solid with planar and curved faces to STL; parse with an independent fixture validator and assert the mesh has correct units, closed manifold topology, outward winding, and tessellation error within the chosen export tolerance. |
| V-CAD-115 | T | Export a solid with two colored bodies to 3MF; parse with an independent fixture validator and assert the file parses as 3MF and contains correctly scaled closed meshes with the exported body information. |
| V-CAD-116 | T | Import a STEP fixture containing a valid solid; assert geometry and mass properties match the fixture and the feature tree contains an imported solid rather than invented source features. |
| V-CAD-117 | T | Export a sketch containing lines, circles, arcs, and construction geometry; parse the DXF and compare included geometry, units, and coordinates to the documented export policy. |
| V-CAD-118 | T | Export a planar face with an inner loop; parse the DXF and assert the outer and hole contours preserve coordinates and units. |
| V-CAD-119 | T | Generate a sheet for an asymmetric part; assert all four labeled views match the model orientation and scale. |
| V-CAD-120 | T | Place linear, diameter/radius, and angular dimensions on eligible drawing geometry; assert dimension values match the model and update after a parameter rebuild. |
| V-CAD-121 | T | Export a dimensioned four-view sheet, render the PDF independently, and assert page size, all views, dimension text, and linework match the sheet. |
| V-CAD-122 | T | Model a 100 by 60 by 10 mm plate; fillet the four vertical corner edges R5; cut four diameter-6 through holes with each center 10 mm from its two neighboring edges; cut a centered 20 by 20 pocket 5 deep; assert B-rep volume differs from 56654.425 mm3 by no more than 5.6654425 mm3. |
| V-CAD-123 | T | Change only the length-driving dimension from 100 to 120; rebuild dependent corner, edge-offset hole, and centered-pocket features; assert B-rep volume differs from 68654.425 mm3 by no more than 6.8654425 mm3. |
| V-CAD-124 | T | Export the rebuilt 120 by 60 acceptance plate to STEP, re-import as a new non-parametric solid, and assert volume matches the pre-export B-rep within the documented exchange tolerance and remains within the acceptance-volume tolerance. |

## Raster Image

| ID | Need | Introduced | Full verification | Requirement |
|---|---|---:|---:|---|
| IMG-001 | N-004 | 3 | 3 | Image shall create a document with a typed width and height. |
| IMG-002 | N-004 | 3 | 3 | Image shall create a document with a chosen background, including transparency. |
| IMG-003 | N-004 | 3 | 3 | Image shall paste an image from the clipboard. |
| IMG-004 | N-004 | 3 | 3 | Image shall open supported image files by drag and drop. |
| IMG-005 | N-004 | 3 | 3 | Image shall open PNG files. |
| IMG-006 | N-004 | 3 | 3 | Image shall open JPEG files. |
| IMG-007 | N-004 | 3 | 3 | Image shall open WebP files. |
| IMG-008 | N-004 | 3 | 3 | Image shall open GIF files. |
| IMG-009 | N-004 | 3 | 3 | Image shall open BMP files. |
| IMG-010 | N-004 | 3 | 3 | Image shall export PNG with alpha. |
| IMG-011 | N-004 | 3 | 3 | Image shall export JPEG with a selectable quality. |
| IMG-012 | N-004 | 3 | 3 | Image shall export WebP. |
| IMG-013 | N-004 | 3 | 3 | Image zoom shall range from 1 percent through 6400 percent. |
| IMG-014 | N-004 | 3 | 3 | Image shall show a pixel grid at high zoom. |
| IMG-015 | N-004 | 3 | 3 | Image shall provide rulers. |
| IMG-016 | N-004 | 3 | 3 | Image shall provide guides. |
| IMG-017 | N-004 | 3 | 3 | Image shall provide a configurable grid. |
| IMG-018 | N-004 | 3 | 3 | Image shall support snapping to guides and grid. |
| IMG-019 | N-004 | 3 | 3 | The pencil shall draw hard-edged individual pixels. |
| IMG-020 | N-004 | 3 | 3 | The brush shall support size, hardness, opacity, flow, and stroke smoothing. |
| IMG-021 | N-004 | 3 | 3 | Image shall provide an eraser. |
| IMG-022 | N-004 | 3 | 3 | Image shall provide clone stamp with a user-selected source. |
| IMG-023 | N-004 | 3 | 3 | Pen pressure shall drive brush size and opacity. |
| IMG-024 | N-004 | 3 | 3 | Fill bucket shall support tolerance. |
| IMG-025 | N-004 | 3 | 3 | Fill bucket shall support contiguous and noncontiguous filling. |
| IMG-026 | N-004 | 3 | 3 | Fill bucket shall support sampling all layers. |
| IMG-027 | N-004 | 3 | 3 | Image shall provide a linear gradient. |
| IMG-028 | N-004 | 3 | 3 | Image shall provide a radial gradient. |
| IMG-029 | N-004 | 3 | 3 | Image shall provide an eyedropper. |
| IMG-030 | N-004 | 3 | 3 | Image shall draw line shapes with typed stroke width and fill settings. |
| IMG-031 | N-004 | 3 | 3 | Image shall draw rectangle shapes with typed stroke width and fill settings. |
| IMG-032 | N-004 | 3 | 3 | Image shall draw rounded rectangle shapes with typed stroke width and fill settings. |
| IMG-033 | N-004 | 3 | 3 | Image shall draw ellipse shapes with typed stroke width and fill settings. |
| IMG-034 | N-004 | 3 | 3 | Image shall draw polygon shapes with typed stroke width and fill settings. |
| IMG-035 | N-004 | 3 | 3 | Image text shall support font, size, bold, italic, and alignment. |
| IMG-036 | N-004 | 3 | 3 | Image text shall remain editable until rasterized. |
| IMG-037 | N-004 | 3 | 3 | Image shall provide a move tool. |
| IMG-038 | N-004 | 3 | 3 | Image shall provide a crop tool. |
| IMG-039 | N-004 | 3 | 3 | Image shall provide a hand tool. |
| IMG-040 | N-004 | 3 | 3 | Image shall provide a zoom tool. |
| IMG-041 | N-004 | 3 | 3 | Image shall expose foreground and background colors. |
| IMG-042 | N-004 | 3 | 3 | X shall swap foreground and background colors. |
| IMG-043 | N-004 | 3 | 3 | D shall reset foreground and background colors to their documented defaults. |
| IMG-044 | N-004 | 3 | 3 | The color picker shall support HSV, RGB, and hexadecimal values. |
| IMG-045 | N-004 | 3 | 3 | Image shall provide a color palette. |
| IMG-046 | N-004 | 3 | 3 | Image shall provide recent colors. |
| IMG-047 | N-004 | 3 | 3 | Image shall support rectangle selection. |
| IMG-048 | N-004 | 3 | 3 | Image shall support ellipse selection. |
| IMG-049 | N-004 | 3 | 3 | Image shall support freehand lasso selection. |
| IMG-050 | N-004 | 3 | 3 | Image shall support polygon lasso selection. |
| IMG-051 | N-004 | 3 | 3 | Image shall support magic wand selection. |
| IMG-052 | N-004 | 3 | 3 | Image shall support select by color selection. |
| IMG-053 | N-004 | 3 | 3 | Selection operations shall support add mode. |
| IMG-054 | N-004 | 3 | 3 | Selection operations shall support subtract mode. |
| IMG-055 | N-004 | 3 | 3 | Selection operations shall support intersect mode. |
| IMG-056 | N-004 | 3 | 3 | Image shall provide selection feather. |
| IMG-057 | N-004 | 3 | 3 | Image shall provide selection grow. |
| IMG-058 | N-004 | 3 | 3 | Image shall provide selection shrink. |
| IMG-059 | N-004 | 3 | 3 | Image shall provide selection invert. |
| IMG-060 | N-004 | 3 | 3 | Image shall provide selection all. |
| IMG-061 | N-004 | 3 | 3 | Image shall provide selection none. |
| IMG-062 | N-004 | 3 | 3 | Free transform shall support moving, scaling, rotating, and skewing a selection. |
| IMG-063 | N-004 | 3 | 3 | Free transform shall support moving, scaling, rotating, and skewing a layer. |
| IMG-064 | N-004 | 3 | 3 | Free transform shall provide viewport handles. |
| IMG-065 | N-004 | 3 | 3 | Shift shall constrain free-transform operations. |
| IMG-066 | N-004 | 3 | 3 | Free transform shall accept typed move, scale, rotation, and skew values. |
| IMG-067 | N-004 | 3 | 3 | Image shall flip selections or layers horizontally and vertically. |
| IMG-068 | N-004 | 3 | 3 | Image shall rotate selections or layers. |
| IMG-069 | N-004 | 3 | 3 | Image layers shall support add. |
| IMG-070 | N-004 | 3 | 3 | Image layers shall support delete. |
| IMG-071 | N-004 | 3 | 3 | Image layers shall support duplicate. |
| IMG-072 | N-004 | 3 | 3 | Image layers shall support reorder. |
| IMG-073 | N-004 | 3 | 3 | Image layers shall support merge down. |
| IMG-074 | N-004 | 3 | 3 | Image layers shall support flatten. |
| IMG-075 | N-004 | 3 | 3 | Image layers shall support visibility. |
| IMG-076 | N-004 | 3 | 3 | Image layers shall support lock. |
| IMG-077 | N-004 | 3 | 3 | Image layers shall support alpha lock. |
| IMG-078 | N-004 | 3 | 3 | Image layers shall support opacity. |
| IMG-079 | N-004 | 3 | 3 | Image layers shall support layer masks. |
| IMG-080 | N-004 | 3 | 3 | Image shall support the normal layer blend mode. |
| IMG-081 | N-004 | 3 | 3 | Image shall support the multiply layer blend mode. |
| IMG-082 | N-004 | 3 | 3 | Image shall support the screen layer blend mode. |
| IMG-083 | N-004 | 3 | 3 | Image shall support the overlay layer blend mode. |
| IMG-084 | N-004 | 3 | 3 | Image shall support the darken layer blend mode. |
| IMG-085 | N-004 | 3 | 3 | Image shall support the lighten layer blend mode. |
| IMG-086 | N-004 | 3 | 3 | Image shall support the difference layer blend mode. |
| IMG-087 | N-004 | 3 | 3 | Image shall provide brightness/contrast. |
| IMG-088 | N-004 | 3 | 3 | Image shall provide levels. |
| IMG-089 | N-004 | 3 | 3 | Image shall provide curves. |
| IMG-090 | N-004 | 3 | 3 | Image shall provide hue/saturation/lightness. |
| IMG-091 | N-004 | 3 | 3 | Image shall provide color balance. |
| IMG-092 | N-004 | 3 | 3 | Image shall provide invert. |
| IMG-093 | N-004 | 3 | 3 | Image shall provide desaturate. |
| IMG-094 | N-004 | 3 | 3 | Image shall provide threshold. |
| IMG-095 | N-004 | 3 | 3 | Image shall provide posterize. |
| IMG-096 | N-004 | 3 | 3 | Image shall provide Gaussian blur. |
| IMG-097 | N-004 | 3 | 3 | Image shall provide sharpen. |
| IMG-098 | N-004 | 3 | 3 | Image shall provide noise. |
| IMG-099 | N-004 | 3 | 3 | Image shall provide pixelate. |
| IMG-100 | N-004 | 3 | 3 | Color to transparency shall support tolerance and edge softness. |
| IMG-101 | N-004 | 3 | 3 | Image resize shall support nearest-neighbor, bilinear, and bicubic resampling. |
| IMG-102 | N-004 | 3 | 3 | Canvas resize shall support an anchor. |
| IMG-103 | N-004 | 3 | 3 | A scripted Image tool, layer, selection, and adjustment sequence shall produce pixel-exact golden output. |
| IMG-104 | N-004 | 3 | 3 | The scripted Image acceptance document shall round-trip through its project format unchanged. |

| Verification | Method | Concrete procedure and pass assertion |
|---|---|---|
| V-IMG-001 | T | Create a 320 by 200 document and assert its pixel buffer and exported dimensions are exactly 320 by 200. |
| V-IMG-002 | T | Create transparent and solid-color documents; assert all initial pixels have the chosen RGBA values. |
| V-IMG-003 | T | Put a known 16 by 12 RGBA fixture on the clipboard, paste it, and assert its dimensions and pixels appear in an editable layer. |
| V-IMG-004 | T | Drop a supported image fixture on the canvas; assert its decoded content opens using the documented new-document or new-layer flow. |
| V-IMG-005 | T | Open a valid PNG fixture with known dimensions and reference decoded pixels; assert dimensions, orientation, and pixels match the fixture decoding policy, with an explicit documented frame policy for GIF. |
| V-IMG-006 | T | Open a valid JPEG fixture with known dimensions and reference decoded pixels; assert dimensions, orientation, and pixels match the fixture decoding policy, with an explicit documented frame policy for GIF. |
| V-IMG-007 | T | Open a valid WebP fixture with known dimensions and reference decoded pixels; assert dimensions, orientation, and pixels match the fixture decoding policy, with an explicit documented frame policy for GIF. |
| V-IMG-008 | T | Open a valid GIF fixture with known dimensions and reference decoded pixels; assert dimensions, orientation, and pixels match the fixture decoding policy, with an explicit documented frame policy for GIF. |
| V-IMG-009 | T | Open a valid BMP fixture with known dimensions and reference decoded pixels; assert dimensions, orientation, and pixels match the fixture decoding policy, with an explicit documented frame policy for GIF. |
| V-IMG-010 | T | Export an image containing opaque, semitransparent, and fully transparent pixels; decode the PNG and assert RGBA values are preserved. |
| V-IMG-011 | T | Export a photographic fixture at two quality values, decode both, and assert dimensions and chosen alpha-flattening policy; assert the encoder receives each selected quality. |
| V-IMG-012 | T | Export and decode an RGBA fixture as WebP; assert dimensions, supported alpha behavior, and output format match the chosen export settings. |
| V-IMG-013 | T | Set 1, 100, and 6400 percent using typed controls and wheel to each boundary; assert valid scales and clamped out-of-range values. |
| V-IMG-014 | T | Zoom an 8 by 8 fixture to the documented pixel-grid threshold and above; assert grid boundaries align with individual pixels without modifying image content. |
| V-IMG-015 | T | Show rulers on a known-size document and pan/zoom; assert tick positions track document pixel coordinates. |
| V-IMG-016 | T | Create, move, type-position, and delete horizontal and vertical guides; assert their document coordinates persist through pan/zoom and save/reopen. |
| V-IMG-017 | T | Set grid spacing to 10 pixels and show it; assert grid lines align every 10 document pixels through pan/zoom. |
| V-IMG-018 | T | Move a layer or shape endpoint close to a 10-pixel grid line and guide with snapping enabled, then disabled; assert snapping occurs only when enabled within the documented tolerance. |
| V-IMG-019 | T | Draw a diagonal pencil stroke on a transparent 16 by 16 image with a 1-pixel tip; assert changed pixels have the exact foreground RGBA and no antialiasing fringe. |
| V-IMG-020 | T | Render fixed-path strokes varying each parameter independently; assert footprint follows size, falloff follows hardness, accumulated alpha follows opacity/flow, and smoothing reduces path jitter without changing endpoints. |
| V-IMG-021 | T | Erase a stroke through opaque and semitransparent pixels on an unlocked layer; assert alpha is removed according to the tip settings and other layers are unchanged. |
| V-IMG-022 | T | Choose a source point in a distinctive pattern and paint elsewhere; assert destination pixels copy the corresponding source offset according to brush settings. |
| V-IMG-023 | T | Replay identical pointer paths with pressure 0.25, 0.5, and 1.0; assert configured size and opacity increase with pressure and non-pressure pointers use the documented default. |
| V-IMG-024 | T | Fill a fixture containing neighboring color differences just below and above a chosen tolerance; assert inclusion follows that tolerance. |
| V-IMG-025 | T | Use two disconnected regions of the same color; assert contiguous fill changes only the seed region and noncontiguous fill changes both. |
| V-IMG-026 | T | Put a boundary on an upper layer and fill a lower layer with sample-all-layers on and off; assert the sampled boundary changes the region while writes remain on the active layer. |
| V-IMG-027 | T | Apply a black-to-white gradient from x=0 to x=10; assert endpoint colors and intermediate RGBA values match the documented interpolation. |
| V-IMG-028 | T | Apply a center-to-edge gradient on a known circle; assert equal-radius pixels have equal interpolated colors and endpoints match the chosen colors. |
| V-IMG-029 | T | Sample a known RGBA pixel from the configured layer/composite source; assert the foreground color matches the sampled value. |
| V-IMG-030 | T | Draw a line with stroke width 3 and a distinct fill, then with fill disabled; compare raster pixels to an independently generated fixture and assert typed values match previewed geometry. |
| V-IMG-031 | T | Draw a rectangle with stroke width 3 and a distinct fill, then with fill disabled; compare raster pixels to an independently generated fixture and assert typed values match previewed geometry. |
| V-IMG-032 | T | Draw a rounded rectangle with stroke width 3 and a distinct fill, then with fill disabled; compare raster pixels to an independently generated fixture and assert typed values match previewed geometry. |
| V-IMG-033 | T | Draw a ellipse with stroke width 3 and a distinct fill, then with fill disabled; compare raster pixels to an independently generated fixture and assert typed values match previewed geometry. |
| V-IMG-034 | T | Draw a polygon with stroke width 3 and a distinct fill, then with fill disabled; compare raster pixels to an independently generated fixture and assert typed values match previewed geometry. |
| V-IMG-035 | T | Create text with a bundled test font and vary each option, including left/center/right alignment; assert text properties and deterministic rendered bounds reflect each setting. |
| V-IMG-036 | T | Create text, save/reopen, edit its characters and font size, then rasterize; assert editing works before rasterization and rasterization preserves the rendered pixels. |
| V-IMG-037 | T | Move a selected layer by drag and typed offsets (12,-4); assert pixels move by exactly that document-space offset. |
| V-IMG-038 | T | Crop a 100 by 80 image to rectangle (10,15,50,40); assert document bounds become 50 by 40 and retained pixels correspond to the requested region. |
| V-IMG-039 | T | Drag the view with the hand tool; assert the camera changes while document pixels and layer coordinates remain unchanged. |
| V-IMG-040 | T | Click and type zoom with the zoom tool; assert the requested view scale is applied around the target without editing pixels. |
| V-IMG-041 | T | Set distinct foreground and background colors and use a drawing tool and two-color gradient; assert each uses the intended color slot. |
| V-IMG-042 | T | Set foreground red and background blue, press X, and assert the two color values exchange. |
| V-IMG-043 | T | Set both colors to nondefault values, press D, and assert the displayed and internal colors equal the documented reset values. |
| V-IMG-044 | T | Enter equivalent red values via HSV, RGB, and hex controls; assert the same canonical RGBA color and synchronized controls. |
| V-IMG-045 | T | Choose two palette swatches and assert foreground color updates to the selected swatch value. |
| V-IMG-046 | T | Use three distinct colors, reopen the picker, and assert those colors are available in the recent-color list according to its documented ordering. |
| V-IMG-047 | T | In a 32 by 24 fixture, drag from (2,3) to (10,12); assert the mask covers exactly the documented rectangular pixel bounds against an independent mask fixture. |
| V-IMG-048 | T | In a 32 by 24 fixture, drag bounds (2,3,8,9); assert the mask matches the ellipse equation and edge-coverage policy against an independent mask fixture. |
| V-IMG-049 | T | In a 32 by 24 fixture, replay a closed triangle pointer path; assert the mask covers the path interior according to the documented fill rule against an independent mask fixture. |
| V-IMG-050 | T | In a 32 by 24 fixture, click three triangle vertices and close the polygon; assert the mask covers the polygon interior against an independent mask fixture. |
| V-IMG-051 | T | In a 32 by 24 fixture, click a region with a chosen tolerance; assert the mask follows the seeded color region and tolerance against an independent mask fixture. |
| V-IMG-052 | T | In a 32 by 24 fixture, choose a target color and tolerance in a disconnected-color fixture; assert the mask includes matching pixels across the document against an independent mask fixture. |
| V-IMG-053 | T | Combine two overlapping known rectangle masks using add; assert the resulting mask is the union including edge alpha according to the documented mask-combination rule. |
| V-IMG-054 | T | Combine two overlapping known rectangle masks using subtract; assert the resulting mask is the initial mask minus the new region including edge alpha according to the documented mask-combination rule. |
| V-IMG-055 | T | Combine two overlapping known rectangle masks using intersect; assert the resulting mask is the intersection including edge alpha according to the documented mask-combination rule. |
| V-IMG-056 | T | On an independently defined mask fixture, feather a hard-edged rectangle by radius 3; assert edge alpha follows the documented blur kernel and the selected extent changes as specified. |
| V-IMG-057 | T | On an independently defined mask fixture, grow a rectangle by 2 pixels; assert the binary mask expands by the documented morphological distance. |
| V-IMG-058 | T | On an independently defined mask fixture, shrink a rectangle by 2 pixels; assert the binary mask contracts by the documented morphological distance. |
| V-IMG-059 | T | On an independently defined mask fixture, invert an arbitrary alpha selection mask; assert each resulting mask value equals 255 minus its prior value. |
| V-IMG-060 | T | On an independently defined mask fixture, select all on a 32 by 24 document; assert every document pixel has selection alpha 255. |
| V-IMG-061 | T | On an independently defined mask fixture, clear an arbitrary selection; assert the selection is explicitly empty. |
| V-IMG-062 | T | Transform a selected asymmetric 8 by 6 pixel patch using each of the four operations with known parameters; assert only selected content changes and the output matches the specified resampling fixture. |
| V-IMG-063 | T | Transform an asymmetric layer using each of the four operations with known parameters; assert its resulting placement and rendered pixels match the transform matrix. |
| V-IMG-064 | T | Drag each move/scale/rotate/skew handle on a fixture; assert preview and committed transform match the displayed handle operation. |
| V-IMG-065 | T | Hold Shift during scale and rotation handles; assert aspect-ratio or angular constraints match the displayed rule and releasing Shift removes the constraint. |
| V-IMG-066 | T | Enter translation (10,5), scale (2,1), rotation 30 degrees, and skew 10 degrees; assert the resulting transform matrix matches the typed values. |
| V-IMG-067 | T | Flip an asymmetric fixture in each axis for both a selection and whole layer; assert exact expected pixel coordinates. |
| V-IMG-068 | T | Rotate an asymmetric fixture by the offered right-angle commands and a typed arbitrary angle; assert bounds, pixels, and resampling follow the chosen angle. |
| V-IMG-069 | T | Add a layer; assert it is a distinct transparent editable layer in the documented insertion position. |
| V-IMG-070 | T | Delete the selected layer of a three-layer fixture; assert only that layer is removed and the resulting composite is correct. |
| V-IMG-071 | T | Duplicate a layer containing pixels, mask, and properties; assert a separate editable copy preserves its content and settings. |
| V-IMG-072 | T | Move a layer across two other layers; assert the order and composited result change accordingly. |
| V-IMG-073 | T | Merge a layer into the one below; assert their visible composite is preserved within the defined blend semantics and the layer count decreases by one. |
| V-IMG-074 | T | Flatten a multilayer fixture; assert one raster layer remains and its pixels equal the prior document composite. |
| V-IMG-075 | T | Hide and show a layer; assert its composite contribution disappears and returns without changing stored pixels. |
| V-IMG-076 | T | Lock a layer and attempt painting, transforming, and deletion through normal edit commands; assert prohibited mutations are blocked with a readable state. |
| V-IMG-077 | T | Lock alpha and paint across opaque, transparent, and semitransparent pixels; assert alpha remains unchanged while eligible color channels change. |
| V-IMG-078 | T | Set layer opacity to 0, 50, and 100 percent; assert composition matches the documented alpha calculation. |
| V-IMG-079 | T | Create and edit a grayscale layer mask; assert masked alpha changes the composite without destroying source pixels and save/reopen preserves the mask. |
| V-IMG-080 | T | Composite a two-layer RGBA fixture containing black, white, midtone, and semitransparent samples using normal; assert output pixels match independently calculated channel and alpha results. |
| V-IMG-081 | T | Composite a two-layer RGBA fixture containing black, white, midtone, and semitransparent samples using multiply; assert output pixels match independently calculated channel and alpha results. |
| V-IMG-082 | T | Composite a two-layer RGBA fixture containing black, white, midtone, and semitransparent samples using screen; assert output pixels match independently calculated channel and alpha results. |
| V-IMG-083 | T | Composite a two-layer RGBA fixture containing black, white, midtone, and semitransparent samples using overlay; assert output pixels match independently calculated channel and alpha results. |
| V-IMG-084 | T | Composite a two-layer RGBA fixture containing black, white, midtone, and semitransparent samples using darken; assert output pixels match independently calculated channel and alpha results. |
| V-IMG-085 | T | Composite a two-layer RGBA fixture containing black, white, midtone, and semitransparent samples using lighten; assert output pixels match independently calculated channel and alpha results. |
| V-IMG-086 | T | Composite a two-layer RGBA fixture containing black, white, midtone, and semitransparent samples using difference; assert output pixels match independently calculated channel and alpha results. |
| V-IMG-087 | T | Apply positive and negative brightness and contrast to a grayscale ramp; assert channel outputs match the documented transfer function and clipping. Assert the operation respects the active selection and layer lock state. |
| V-IMG-088 | T | Set input black 20, white 230, gamma 1.5, and output limits on a ramp; assert exact independently calculated channel outputs. Assert the operation respects the active selection and layer lock state. |
| V-IMG-089 | T | Edit control points on a channel curve and a combined curve; assert sampled output values follow the documented interpolation with a live preview. Assert the operation respects the active selection and layer lock state. |
| V-IMG-090 | T | Apply a 120-degree hue shift and separate saturation/lightness changes to known primary colors; assert reference color-conversion outputs. Assert the operation respects the active selection and layer lock state. |
| V-IMG-091 | T | Shift channel balance on shadows, midtones, and highlights of a fixture; assert the documented tonal weighting and clipping. Assert the operation respects the active selection and layer lock state. |
| V-IMG-092 | T | Invert a known RGBA fixture; assert each color channel becomes 255 minus its input and alpha is preserved. Assert the operation respects the active selection and layer lock state. |
| V-IMG-093 | T | Desaturate colored pixels; assert equal output color channels according to the documented luminance calculation and unchanged alpha. Assert the operation respects the active selection and layer lock state. |
| V-IMG-094 | T | Apply threshold 128 to a grayscale ramp; assert pixels on each side of the documented boundary become black or white. Assert the operation respects the active selection and layer lock state. |
| V-IMG-095 | T | Posterize a grayscale ramp to four levels; assert exactly the defined four channel values. Assert the operation respects the active selection and layer lock state. |
| V-IMG-096 | T | Blur an impulse and hard edge with a fixed radius; assert pixels match the documented Gaussian kernel and edge handling. Assert the operation respects the active selection and layer lock state. |
| V-IMG-097 | T | Sharpen a fixed soft-edge fixture; assert output matches the documented kernel and clipping. Assert the operation respects the active selection and layer lock state. |
| V-IMG-098 | T | Apply noise with a recorded deterministic seed and amplitude; assert exact expected output pixels and preserved alpha policy. Assert the operation respects the active selection and layer lock state. |
| V-IMG-099 | T | Pixelate a 16 by 16 fixture with block size 4; assert each block matches the documented representative-color rule. Assert the operation respects the active selection and layer lock state. |
| V-IMG-100 | T | Remove a chosen background from a fixture with solid and antialiased edges; vary tolerance and edge softness separately and assert the alpha transition matches the documented formula without changing unrelated colors. |
| V-IMG-101 | T | Resize a known 7 by 5 RGBA fixture to 13 by 9 with each of the three algorithms; compare every output pixel to independent expected samples. |
| V-IMG-102 | T | Resize a 20 by 10 canvas to 30 by 20 using every offered anchor; assert source pixels shift to the expected offset and new canvas pixels use the chosen background. |
| V-IMG-103 | T | On a 32 by 24 transparent document, use a 1-pixel opaque #FF0000 pencil on points (1,1)-(12,1)-(12,8); add a layer, select rectangle (4,4)-(20,16), fill opaque #4080C0, add rectangle (16,12)-(28,20) to the selection, invert selected RGB then threshold at 128, and set the upper layer to multiply at 50 percent; compare every composite RGBA byte with a checked-in independently reviewed golden fixture. |
| V-IMG-104 | T | Save and reopen the scripted golden document; assert canonical layer/text/mask/selection/parameter state equality and byte-for-byte equality of composite RGBA pixels; edit a retained layer afterward. |

## Video timeline and media

| ID | Need | Introduced | Full verification | Requirement |
|---|---|---:|---:|---|
| VID-001 | N-005 | 4 | 4 | Video shall provide 16:9, 9:16, and 1:1 project presets at 1080p and 4K sizes. |
| VID-002 | N-005 | 4 | 4 | Video project frame rate shall be selectable. |
| VID-003 | N-005 | 4 | 4 | The media bin shall import video, audio, and still images. |
| VID-004 | N-005 | 4 | 4 | The media bin shall show thumbnails for video, audio, and still-image items. |
| VID-005 | N-005 | 4 | 4 | Source media shall be read in place without loading complete large source files into memory. |
| VID-006 | N-005 | 4 | 4 | Video decode shall use the browser native codec API. |
| VID-007 | N-005 | 4 | 4 | Video encode shall use the browser native codec API. |
| VID-008 | N-005 | 4 | 4 | Video shall mux encoded output with a WebAssembly muxer. |
| VID-009 | N-005 | 4 | 4 | The timeline shall support multiple video tracks. |
| VID-010 | N-005 | 4 | 4 | The timeline shall support multiple audio tracks. |
| VID-011 | N-005 | 4 | 4 | Tracks shall support mute. |
| VID-012 | N-005 | 4 | 4 | Tracks shall support solo. |
| VID-013 | N-005 | 4 | 4 | Tracks shall support lock. |
| VID-014 | N-005 | 4 | 4 | Video and audio tracks shall support hide. |
| VID-015 | N-005 | 4 | 4 | Clips shall be draggable from the media bin onto the timeline. |
| VID-016 | N-005 | 4 | 4 | Clips shall be trimmable by dragging either edge. |
| VID-017 | N-005 | 4 | 4 | S shall split a selected clip at the playhead. |
| VID-018 | N-005 | 4 | 4 | Clips shall be movable along the timeline and between compatible tracks. |
| VID-019 | N-005 | 4 | 4 | The timeline shall provide ripple delete. |
| VID-020 | N-005 | 4 | 4 | Timeline snapping shall have an on/off toggle. |
| VID-021 | N-005 | 4 | 4 | Video and audio from one imported audiovisual source shall initially be linked. |
| VID-022 | N-005 | 4 | 4 | Linked audio and video shall be unlinkable. |
| VID-023 | N-005 | 4 | 4 | The timeline shall support markers. |
| VID-024 | N-005 | 4 | 4 | The timeline shall support zoom. |
| VID-025 | N-005 | 4 | 4 | The timeline shall support scrubbing. |
| VID-026 | N-005 | 4 | 4 | Space shall toggle video playback and pause when the timeline has focus. |
| VID-027 | N-005 | 4 | 4 | J, K, and L shall provide backward shuttle, stop, and forward shuttle. |
| VID-028 | N-005 | 4 | 4 | Arrow keys shall step the playhead by one frame. |
| VID-029 | N-005 | 4 | 4 | I and O shall set the timeline in and out range at the playhead. |
| VID-030 | N-005 | 4 | 4 | Home and End shall jump to the timeline start and end. |
| VID-031 | N-005 | 4 | 4 | Video clips shall support position. |
| VID-032 | N-005 | 4 | 4 | Video clips shall support scale. |
| VID-033 | N-005 | 4 | 4 | Video clips shall support rotation. |
| VID-034 | N-005 | 4 | 4 | Video clips shall support opacity. |
| VID-035 | N-005 | 4 | 4 | Video clips shall support crop. |
| VID-036 | N-005 | 4 | 4 | Video clips shall support speed from 0.25x through 4x. |
| VID-037 | N-005 | 4 | 4 | Video clips shall support volume. |
| VID-038 | N-005 | 4 | 4 | Video clips shall support fade in and fade out. |
| VID-039 | N-005 | 4 | 4 | Video clips shall support keyframes on position with linear and ease interpolation. |
| VID-040 | N-005 | 4 | 4 | Video clips shall support keyframes on scale with linear and ease interpolation. |
| VID-041 | N-005 | 4 | 4 | Video clips shall support keyframes on rotation with linear and ease interpolation. |
| VID-042 | N-005 | 4 | 4 | Video clips shall support keyframes on opacity with linear and ease interpolation. |
| VID-043 | N-005 | 4 | 4 | Video clips shall support keyframes on volume with linear and ease interpolation. |
| VID-044 | N-005 | 4 | 4 | Video shall provide a cross dissolve transition. |
| VID-045 | N-005 | 4 | 4 | Video shall provide a dip to black transition. |
| VID-046 | N-005 | 4 | 4 | Video shall provide a dip to white transition. |
| VID-047 | N-005 | 4 | 4 | Video shall provide a wipe transition. |
| VID-048 | N-005 | 4 | 4 | Video shall provide a slide transition. |
| VID-049 | N-005 | 4 | 4 | Video titles shall support font, size, color, outline, shadow, and background box. |
| VID-050 | N-005 | 4 | 4 | Video titles shall support fade in and fade out. |
| VID-051 | N-005 | 4 | 4 | Video shall provide solid-color clips. |
| VID-052 | N-005 | 4 | 4 | Audio clips shall display waveforms. |
| VID-053 | N-005 | 4 | 4 | Video shall support detaching audio from an audiovisual clip. |
| VID-054 | N-005 | 4 | 4 | Video clips shall provide brightness correction. |
| VID-055 | N-005 | 4 | 4 | Video clips shall provide contrast correction. |
| VID-056 | N-005 | 4 | 4 | Video clips shall provide saturation correction. |
| VID-057 | N-005 | 4 | 4 | Video clips shall provide temperature correction. |
| VID-058 | N-005 | 4 | 4 | Video clips shall provide blur correction. |
| VID-059 | N-005 | 4 | 4 | Video clips shall provide black and white correction. |
| VID-060 | N-005 | 4 | 4 | Video clips shall provide chroma key correction. |
| VID-061 | N-005 | 4 | 4 | Video preview shall maintain audio/video synchronization. |
| VID-062 | N-005 | 4 | 4 | Video preview shall lower preview resolution before dropping frames under load. |
| VID-063 | N-005 | 4 | 4 | Video shall export MP4 with H.264 video and AAC audio. |
| VID-064 | N-005 | 4 | 4 | Video shall export WebM. |
| VID-065 | N-005 | 4 | 4 | Video exports shall use project resolution and frame rate. |
| VID-066 | N-005 | 4 | 4 | Video export shall provide quality presets. |
| VID-067 | N-005 | 4 | 4 | Video export shall support the full timeline or the in/out range. |
| VID-068 | N-005 | 4 | 4 | Video export shall report progress. |
| VID-069 | N-005 | 4 | 4 | Video export shall be cancellable. |
| VID-070 | N-005 | 4 | 4 | Video shall export WAV audio. |
| VID-071 | N-005 | 4 | 4 | Video shall export animated GIF. |
| VID-072 | N-005 | 4 | 4 | Video shall export the current frame as PNG. |
| VID-073 | N-005 | 4 | 4 | The automated three-clip Video acceptance timeline shall export MP4 with correct resolution and timing. |

| Verification | Method | Concrete procedure and pass assertion |
|---|---|---|
| V-VID-001 | T | Create all six aspect/size combinations; assert 16:9 is 1920x1080 or 3840x2160, 9:16 is 1080x1920 or 2160x3840, and 1:1 is 1080x1080 or 2160x2160, preserving the selected preset on save/reopen. |
| V-VID-002 | T | Create projects at two supported frame rates including 30 fps; assert timebase, frame stepping, duration display, and export metadata use the selected rate. |
| V-VID-003 | T | Add one video, one audio, and one still-image fixture; assert each appears with the correct media type, duration where applicable, and source reference. |
| V-VID-004 | T | Import the three fixture types; assert each has an appropriate generated visual thumbnail or waveform representation tied to that item. |
| V-VID-005 | T | Open a large fixture through a File or file handle, instrument reads and memory, and seek to distant timestamps; assert bounded ranged/chunked reads and no whole-source array-buffer allocation. |
| V-VID-006 | T | Trace preview decoding of a supported video fixture; assert frames are produced through the native codec adapter rather than a server or whole-file software decoder. |
| V-VID-007 | T | Trace a supported export and assert compressed audio/video packets originate from the native encoder adapter. |
| V-VID-008 | T | Inspect the pinned muxer artifact and trace export; assert encoded packets pass through the WASM muxer and the resulting container parses correctly. |
| V-VID-009 | T | Place overlapping clips on three video tracks; assert ordering, durations, and independent track state survive save/reopen. |
| V-VID-010 | T | Place overlapping audio clips on three tracks; assert all contribute to the mix according to track state. |
| V-VID-011 | T | Mute one contributing audio track and a linked-media track with audio; assert their audio contribution becomes silent without moving clips. |
| V-VID-012 | T | Solo one track in a multitrack project; assert only the configured solo set contributes to preview/export according to the documented video/audio solo rule. |
| V-VID-013 | T | Lock a track and attempt clip move, trim, split, and delete; assert mutations are blocked while playback remains possible. |
| V-VID-014 | T | Hide and show each track type; assert the documented hide behavior is reflected in the track UI and, for video, its preview/export visibility, without changing or losing clip state. |
| V-VID-015 | T | Drag video, audio, and still sources onto compatible tracks at known times; assert clip source and start time match the drop target. |
| V-VID-016 | T | Drag each edge of a clip with spare source media; assert source in/out and timeline duration change correctly without passing media bounds. |
| V-VID-017 | T | Place the playhead inside a selected clip and press S; assert two clips preserve the original combined duration and contiguous source ranges. |
| V-VID-018 | T | Move a clip by drag and typed time, then to a second compatible track; assert source bounds and duration are preserved. |
| V-VID-019 | T | Delete a middle clip with ripple enabled; assert the removed duration closes according to the documented affected-track rule and linked items remain synchronized. |
| V-VID-020 | T | Drag a clip near another clip edge and a playhead with snapping on and off; assert snapping occurs only when enabled within the documented tolerance. |
| V-VID-021 | T | Add an audiovisual source to the timeline and move/trim its video part; assert the linked audio follows with unchanged sync offset. |
| V-VID-022 | T | Unlink an audiovisual pair, move one member, and assert the other does not move. |
| V-VID-023 | T | Add, rename, move by typed time, and delete a marker; assert its time and name persist through save/reopen. |
| V-VID-024 | T | Zoom a timeline containing clips and markers; assert screen scale changes while all timeline times remain unchanged. |
| V-VID-025 | T | Drag the playhead to known frame times; assert preview and time display present the corresponding timeline state. |
| V-VID-026 | T | Press Space while paused and again while playing; assert transport changes state without adding an edit or interfering with 2D Space-drag. |
| V-VID-027 | T | Press J, K, and L from a mid-timeline position; assert backward motion, pause, and forward motion respectively with the displayed shuttle rate. |
| V-VID-028 | T | Press left and right arrows from frame 50 of a 30 fps project; assert positions move to frames 49 and 50 exactly. |
| V-VID-029 | T | Set I at frame 30 and O at frame 90; assert the range endpoints equal those frames and an invalid reversed range receives clear handling. |
| V-VID-030 | T | Press Home and End in a project with a nonzero final clip end; assert playhead reaches frame zero and the documented final timeline boundary. |
| V-VID-031 | T | Set a clip position to (100,50) and assert its composited origin follows that translation. Save/reopen and assert the editable property persists. |
| V-VID-032 | T | Set scale to 50 and 200 percent and assert rendered bounds scale about the documented anchor. Save/reopen and assert the editable property persists. |
| V-VID-033 | T | Set rotation to 30 degrees and assert rendered orientation and bounds match the transform. Save/reopen and assert the editable property persists. |
| V-VID-034 | T | Set opacity to 0, 50, and 100 percent and assert reference alpha composition. Save/reopen and assert the editable property persists. |
| V-VID-035 | T | Set independent crop values on all four edges and assert only the requested source region is visible. Save/reopen and assert the editable property persists. |
| V-VID-036 | T | Set speed to 0.25x, 1x, and 4x; assert source sampling and timeline duration reflect the speed and out-of-range values are rejected. Save/reopen and assert the editable property persists. |
| V-VID-037 | T | Set volume to zero and two known gain values; assert mixed audio amplitude follows the selected gain without changing timeline timing. Save/reopen and assert the editable property persists. |
| V-VID-038 | T | Set known visual/audio fade durations and inspect samples at start, middle, and end; assert the fade envelopes match the documented curve. Save/reopen and assert the editable property persists. |
| V-VID-039 | T | Create two position keyframes at frames 0 and 30; sample frames 0, 7, 15, 23, and 30 for both linear and ease modes; assert values match the documented interpolation and endpoint values survive save/reopen. |
| V-VID-040 | T | Create two scale keyframes at frames 0 and 30; sample frames 0, 7, 15, 23, and 30 for both linear and ease modes; assert values match the documented interpolation and endpoint values survive save/reopen. |
| V-VID-041 | T | Create two rotation keyframes at frames 0 and 30; sample frames 0, 7, 15, 23, and 30 for both linear and ease modes; assert values match the documented interpolation and endpoint values survive save/reopen. |
| V-VID-042 | T | Create two opacity keyframes at frames 0 and 30; sample frames 0, 7, 15, 23, and 30 for both linear and ease modes; assert values match the documented interpolation and endpoint values survive save/reopen. |
| V-VID-043 | T | Create two volume keyframes at frames 0 and 30; sample frames 0, 7, 15, 23, and 30 for both linear and ease modes; assert values match the documented interpolation and endpoint values survive save/reopen. |
| V-VID-044 | T | Place distinct-color clips on either side of a 30-frame transition and compare frames at 0, 7, 15, 23, and 30; assert the two clips are mixed with complementary opacity across the overlap without changing intended timeline duration. |
| V-VID-045 | T | Place distinct-color clips on either side of a 30-frame transition and compare frames at 0, 7, 15, 23, and 30; assert the outgoing clip fades to black then the incoming clip fades from black without changing intended timeline duration. |
| V-VID-046 | T | Place distinct-color clips on either side of a 30-frame transition and compare frames at 0, 7, 15, 23, and 30; assert the outgoing clip fades to white then the incoming clip fades from white without changing intended timeline duration. |
| V-VID-047 | T | Place distinct-color clips on either side of a 30-frame transition and compare frames at 0, 7, 15, 23, and 30; assert the selected spatial boundary reveals the incoming clip across the transition without changing intended timeline duration. |
| V-VID-048 | T | Place distinct-color clips on either side of a 30-frame transition and compare frames at 0, 7, 15, 23, and 30; assert the outgoing/incoming clips translate according to the selected direction and progress without changing intended timeline duration. |
| V-VID-049 | T | Create a title with a bundled fixture font; vary each of the six settings independently and compare rendered bounds and pixels to approved reference frames. |
| V-VID-050 | T | Set title fade durations to 15 frames; assert title opacity at start, middle, steady state, and end follows the documented fade curve. |
| V-VID-051 | T | Create a 90-frame solid clip with a chosen RGBA color; assert every untransformed preview/export frame has that color and its editable duration/color persist. |
| V-VID-052 | T | Import an audio fixture with known silent, tone, and transient regions; assert waveform envelopes align with source times and update correctly after trim and speed changes. |
| V-VID-053 | T | Detach audio from a clip; assert an independently editable audio clip retains the original timing and source samples while the video no longer contributes duplicate audio. |
| V-VID-054 | T | Adjust a grayscale video fixture by a known brightness amount and compare sampled output channels to the documented function. Assert live preview and export apply the same correction parameters. |
| V-VID-055 | T | Adjust a grayscale video fixture by a known contrast amount and compare sampled output channels to the documented function. Assert live preview and export apply the same correction parameters. |
| V-VID-056 | T | Set saturation to zero and an increased value on a colored fixture; assert reference color-conversion outputs. Assert live preview and export apply the same correction parameters. |
| V-VID-057 | T | Apply positive and negative temperature offsets; assert the documented red/blue channel shift on reference pixels. Assert live preview and export apply the same correction parameters. |
| V-VID-058 | T | Blur a sharp-edge video fixture with a known radius and compare sampled output to the documented kernel. Assert live preview and export apply the same correction parameters. |
| V-VID-059 | T | Enable black and white on a colored fixture and assert equal output color channels using the documented luminance weights. Assert live preview and export apply the same correction parameters. |
| V-VID-060 | T | Key a green-screen fixture containing edge spill and a foreground subject; assert the chosen key color/tolerance removes the background while preserving the subject according to the documented key formula. Assert live preview and export apply the same correction parameters. |
| V-VID-061 | T | Play a 1080p30 fixture containing matching visual flashes and audio clicks; measure presented frame/audio clock offsets across playback and seek and assert they stay within one project frame. |
| V-VID-062 | T | Increase compositing load until full-resolution preview misses its deadline; assert the adaptive controller reduces preview resolution before deliberately skipping frames and preserves the audio clock. |
| V-VID-063 | T | Export a known audiovisual timeline, inspect the container with an independent parser, and assert MP4 container, H.264 video, AAC audio, and playable synchronized output. |
| V-VID-064 | T | Export a known audiovisual timeline, inspect the container and chosen supported codecs, and assert a valid playable WebM with correct project timing. |
| V-VID-065 | T | Export projects with different size/rate presets; inspect encoded stream metadata and timestamps and assert dimensions and frame cadence match project settings. |
| V-VID-066 | T | Export the same timeline with every offered quality preset; assert each maps to its documented encoder configuration and produces valid output. |
| V-VID-067 | T | Export a six-second project both fully and with a two-to-four-second range; assert decoded content and durations match the selected boundaries within one frame. |
| V-VID-068 | T | Export a multi-second timeline; assert progress advances monotonically from preparation through completion and reaches completion only after the output is finalized. |
| V-VID-069 | T | Cancel during encode and during mux finalization; assert work stops, resources are released, and no incomplete file is reported as successful. |
| V-VID-070 | T | Export a known tone and impulse timeline as WAV; assert PCM format, duration, sample rate, channels, and sample values follow the selected project audio settings. |
| V-VID-071 | T | Export a short changing-color timeline as GIF; decode it independently and assert frame order, timing, dimensions, and documented palette quantization. |
| V-VID-072 | T | Seek to a known frame, export PNG, decode it, and assert its dimensions and pixels match the full-resolution composited frame. |
| V-VID-073 | T | Create three clips with one dissolve, an overlaid title, and a volume keyframe; export MP4 and independently decode it; assert project dimensions, duration error no greater than one frame, and visual-flash/audio-click sync error no greater than one frame. |

## Cross-workspace transfers

| ID | Need | Introduced | Full verification | Requirement |
|---|---|---:|---:|---|
| XWS-001 | N-006 | 5 | 5 | The application shall send an Image document to the Video media bin. |
| XWS-002 | N-006 | 5 | 5 | The application shall send the current Video frame to Image. |
| XWS-003 | N-006 | 5 | 5 | The application shall send a CAD viewport capture with transparent background to Image. |

| Verification | Method | Concrete procedure and pass assertion |
|---|---|---|
| V-XWS-001 | T | Create a layered Image document with transparency, send it to Video, and assert a new still-image bin item renders the source composite at matching dimensions without a network request. |
| V-XWS-002 | T | Seek a Video timeline with a title and correction to a known frame, send it to Image, and assert an editable Image document contains the full-resolution composited frame pixels. |
| V-XWS-003 | T | Capture a colored solid from the CAD viewport and send it to Image; assert matching visible geometry and alpha zero for background pixels, with no background-color fringe. |

## Performance targets

| ID | Need | Introduced | Full verification | Requirement |
|---|---|---:|---:|---|
| PERF-001 | N-003 | 2 | 2 | The CAD viewport shall sustain the 60 fps target on the declared reference desktop for the benchmark part. |
| PERF-002 | N-003 | 2 | 2 | A parameter change shall rebuild a 50-feature CAD part in under 2 seconds on the declared reference desktop. |
| PERF-003 | N-004 | 3 | 3 | The brush shall have no visible lag on a 4000 by 4000 image with 20 layers on the declared reference desktop. |
| PERF-004 | N-005 | 4 | 4 | Video shall preview a 1080p30 timeline with three video tracks in real time on the declared reference desktop. |

| Verification | Method | Concrete procedure and pass assertion |
|---|---|---|
| V-PERF-001 | T | Record machine, GPU, browser build, viewport size, and a fixed 50-feature fixture; animate orbit for a fixed 30-second interval after warmup and capture frame timestamps; assess 60 fps against the benchmark protocol, retaining trace data. |
| V-PERF-002 | T | Load the checked-in 50-feature parametric fixture, warm the kernel, change a driving dimension, and measure from committed parameter change to accepted final mesh; assert elapsed time is less than 2000 ms for each recorded benchmark run. |
| V-PERF-003 | T | Replay a fixed pressure-aware stroke on a 4000 by 4000, 20-layer fixture; record pointer-event-to-paint timing and a visual capture; obtain the user acceptance judgment for no visible lag, keeping this requirement UNTESTED until the measurable latency budget and machine are agreed. |
| V-PERF-004 | T | Play the fixed three-track 1080p30 benchmark for 30 seconds with audio, record presentation timestamps, resolution adaptation, dropped frames, and A/V offset; assert timeline advances in real time at 30 fps with sync within one frame under the recorded benchmark protocol. |

## Lifecycle, distribution, evidence, and exclusions

| ID | Need | Introduced | Full verification | Requirement |
|---|---|---:|---:|---|
| REL-001 | N-007 | 0 | 0 | Before production code, dev/ shall contain a lean ConOps, requirements with stable IDs, and a verification plan derived from the user brief. |
| REL-002 | N-007 | 0 | 0 | Before brick implementation, Mode A shall produce and commit a module map. |
| REL-003 | N-007 | 0 | 0 | After the map is committed, BATCH execution shall apply to every brick in the current phase while preserving all method halt conditions. |
| REL-004 | N-007 | 0 | 0 | Every completed implementation brick shall end GREEN while acceptance remains the user decision. |
| REL-005 | N-007 | 0 | 0 | Phase 0 shall perform reconnaissance, commit the spec suite and module map, and push them to the target repository. |
| REL-006 | N-007 | 1 | 1 | Phase 1 shall complete the shell, XP chrome, shared controls, and project save/open before later workspace phases. |
| REL-007 | N-007 | 2 | 2 | Phase 2 shall spike the kernel and solver before implementing sketcher, features, inspection, exports, and drawing sheets. |
| REL-008 | N-007 | 3 | 3 | Phase 3 shall implement Image after the CAD phase. |
| REL-009 | N-007 | 4 | 4 | Phase 4 shall implement Video after the Image phase. |
| REL-010 | N-007 | 5 | 5 | Phase 5 shall integrate cross-workspace actions, Cloudflare Pages configuration, and M1a packaging. |
| REL-011 | N-007 | 0 | 0 | The work shall clone, build in, and push to https://github.com/goosnav/gsnv-paint. |
| REL-012 | N-007 | 0 | 0 | Existing target-repository history and content shall be preserved. |
| REL-013 | N-007 | 0 | 0 | A push shall occur at the end of every phase only after all required phase checks are green. |
| REL-014 | N-007 | 0 | 0 | The workflow shall never force-push. |
| REL-015 | N-007 | 0 | 0 | A push or deployment credential failure shall stop that operation and be reported. |
| REL-016 | N-007 | 1 | 5 | Naming, copy voice, and invariants shall follow the Goosnav Comics branding skill while XP visual chrome overrides its visual chrome guidance. |
| REL-017 | N-007 | 1 | 5 | All shipped icons and graphics shall be original artwork drawn for this application. |
| REL-018 | N-007 | 1 | 5 | The application shall ship no Microsoft logos, wallpapers, sounds, or icon bitmaps. |
| REL-019 | N-007 | 5 | 5 | The local application shall be distributed as an M1a universal ZIP. |
| REL-020 | N-007 | 5 | 5 | The local backend shall only serve static files and open the build in the browser. |
| REL-021 | N-007 | 5 | 5 | The local release workflow shall stop at CANDIDATE_FOR_ACCEPTANCE. |
| REL-022 | N-007 | 5 | 5 | Cloudflare Pages shall send the cross-origin isolation headers required by the chosen WASM-thread build. |
| REL-023 | N-007 | 0 | 0 | The current Cloudflare Pages per-file size limit shall be verified from official documentation. |
| REL-024 | N-007 | 5 | 5 | Every deployed asset shall be below the verified Cloudflare Pages per-file limit, trimming the kernel build if required. |
| REL-025 | N-007 | 0 | 0 | Every phase-end report shall list passing, failing, and untested requirement IDs with the test command and its output. |
| REL-026 | N-007 | 0 | 0 | Skipped or unavailable checks shall never be reported as passing. |
| REL-027 | N-007 | 0 | 0 | Browser and OS claims shall be limited to environments actually smoke-tested. |
| REL-028 | N-007 | 0 | 0 | Every requirement shall trace to a verification procedure. |
| REL-029 | N-007 | 0 | 4 | User acceptance shall use automated golden-output CAD, Image, and Video checks. |
| REL-030 | N-007 | 2 | 2 | The CAD workspace shall exclude assemblies and mates, sweeps, lofts, draft, surfacing, sheet metal, weldments, simulation, rendering, or configurations. |
| REL-031 | N-007 | 3 | 3 | The Image workspace shall exclude CMYK, RAW, adjustment layers, layer styles, vector paths, generative fill, content-aware fill, or scripting. |
| REL-032 | N-007 | 4 | 4 | The Video workspace shall exclude multicam, motion tracking, nested sequences, scopes, plugins, or automatic captions. |

| Verification | Method | Concrete procedure and pass assertion |
|---|---|---|
| V-REL-001 | I | Inspect the first specification commit and repository history; assert all three artifacts precede implementation and every requirement has a verification entry. |
| V-REL-002 | I | Inspect the map, contracts/ownership boundaries, and commit history; assert the map commit predates the first implementation brick. |
| V-REL-003 | I | Inspect the phase execution record; assert the user preauthorization is referenced and any triggered halt condition stops dependent implementation rather than being bypassed. |
| V-REL-004 | I | Inspect each brick receipt and its command/output evidence; assert all required checks pass and no agent self-awards user acceptance. |
| V-REL-005 | I | Inspect Phase 0 evidence, committed tree, local commit ID, and remote branch ID; assert the pushed commit includes the reconnaissance/spec/map deliverables. |
| V-REL-006 | I | Inspect phase receipts and implementation commit order; assert Phase 1 scope has its own passing verification record before Phase 2 integration. |
| V-REL-007 | I | Inspect the Phase 2 brick order and spike evidence; assert both engine spikes precede dependent CAD bricks. |
| V-REL-008 | I | Inspect phase receipts and commits; assert the Image phase follows the CAD phase or a user-authorized phase change is explicitly recorded. |
| V-REL-009 | I | Inspect phase receipts and commits; assert the Video phase follows the Image phase or a user-authorized phase change is explicitly recorded. |
| V-REL-010 | I | Inspect the Phase 5 receipt and artifact manifest; assert all three integration deliverables have their mapped checks. |
| V-REL-011 | I | Inspect the checkout remote URL, working tree, commits, and remote ref; assert the target repository is goosnav/gsnv-paint. |
| V-REL-012 | I | Compare the initial remote commit and tree with the resulting history; assert the initial commit remains an ancestor and existing content has not been discarded without an authorized replacement. |
| V-REL-013 | I | For each phase receipt, compare check exit statuses, result classification, commit ID, and remote push evidence; assert required checks passed before that phase push. |
| V-REL-014 | I | Inspect push commands and remote history; assert no force or lease-forced ref update was used. |
| V-REL-015 | I | Inject or observe a credential rejection in a controlled workflow check; assert no bypass/retry using unrelated credentials occurs and the report includes the blocked operation. |
| V-REL-016 | I | Inspect displayed product copy, names, and applicable brand invariants against the recorded skill baseline; assert the documented visual override is used without importing unrelated branded assets. |
| V-REL-017 | I | Inspect the asset manifest and source artwork; assert each icon/graphic has app-specific original provenance. |
| V-REL-018 | I | Inspect all packaged assets and their provenance; assert none belongs to the four prohibited Microsoft asset categories. |
| V-REL-019 | I | Inspect the ZIP layout against the productization skill manifest; extract and exercise the required launchers on each actually available OS, recording untested OS checks as untested. |
| V-REL-020 | I | Inspect server code and route behavior; assert it serves the shared static payload, opens the local browser URL, and exposes no editing, upload, account, or processing API. |
| V-REL-021 | I | Inspect the release state and receipt; assert it is CANDIDATE_FOR_ACCEPTANCE and no final acceptance or production-release claim is made. |
| V-REL-022 | I | Serve the Pages artifact, inspect COOP/COEP response headers, and assert window.crossOriginIsolated and the selected shared-memory worker smoke test succeed in the tested Chromium build. |
| V-REL-023 | I | Record the dated official source and documented per-file limit in DECISIONS; assert the value is evidence-backed rather than recalled. |
| V-REL-024 | I | Measure every emitted asset in bytes, compare against the recorded limit, and assert each is below it; if the kernel fails, verify a trimmed build still passes required geometry checks before deployment. |
| V-REL-025 | I | Inspect each phase report; assert complete phase requirement classification and verbatim command/output or an explicit unavailable-check reason. |
| V-REL-026 | I | Compare test runner statuses and environment availability with the phase report; assert every skipped/unavailable check is identified as untested or blocked. |
| V-REL-027 | I | Compare every browser/OS support claim in the release report to recorded versioned smoke evidence; assert no untested environment is labeled tested. |
| V-REL-028 | I | Parse requirements.json and the traceability table; assert every unique requirement has a valid parent need, module assignment, unique V-ID, method, procedure, and status. |
| V-REL-029 | I | Inspect the planned and eventually implemented acceptance cases; assert they retain the prescribed plate volumes/error cases, pixel-exact Image golden/round-trip, and three-clip synchronized MP4 assertions. |
| V-REL-030 | I | Inspect the CAD command registry, UI, dependency choices, and roadmap; assert none of the enumerated out-of-scope capabilities is implemented or scheduled without a new user instruction. |
| V-REL-031 | I | Inspect the Image command registry, UI, dependency choices, and roadmap; assert none of the enumerated out-of-scope capabilities is implemented or scheduled without a new user instruction. |
| V-REL-032 | I | Inspect the Video command registry, UI, dependency choices, and roadmap; assert none of the enumerated out-of-scope capabilities is implemented or scheduled without a new user instruction. |

## Baseline status

Total: **386 requirements**, all initially **UNTESTED**. Status changes require a dated evidence record naming the exact command or inspection, environment, output, and relevant commit.

Open verification definitions: reference desktop hardware; CAD viewport statistical frame criterion; Image brush latency acceptance; native codec availability matrix; video preset/frame-rate detail beyond the explicitly enumerated presets; GIF frame policy; feature-reference/deletion policy; numerical and export tolerances. These are design/test-contract questions, not permission to omit a requested function.
