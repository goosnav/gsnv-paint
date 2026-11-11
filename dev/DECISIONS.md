# Decisions

Research date: 2026-11-10. Package/archive inspection is not a runtime test. Versions below are candidates to pin at their phase spike.

## D01 — one static product

Choose one static TypeScript browser build, with DOM/CSS chrome and worker adapters. The local server only serves that build. Alternative: desktop-specific UI or backend geometry/media processing. Rejected because the owner requires identical browser/local behavior and client-side work. Revisit only with a changed owner requirement.

## D02 — OpenCascade B-rep kernel

Choose `replicad-opencascadejs@1.2.1`, a proven reduced OpenCascade.js build, in a dedicated worker. Its published single-thread WASM is 22,942,327 bytes; threaded WASM is 22,475,349 bytes. Both are below Pages' 26,214,400-byte cap. Start with single-thread WASM in a worker; test threaded acceleration separately. Alternative stock `opencascade.js@1.1.1` has a 65,864,037-byte WASM file, exceeding the cap. No handwritten B-rep kernel and no mesh substitute.

The package exports prism/revolve, booleans, fillet/chamfer, thick-solid/offset, transformations, validation, distance/mass properties, STEP reader/writers, STL, meshing and hidden-line operations. These declarations are sufficient to select a spike, not claim features pass. Source build uses native WASM exceptions, SIMD and web/worker/node environments. Revisit if actual required operations fail, binding gaps emerge, or measured asset size exceeds the cap.

Sources: [pinned manifest](https://raw.githubusercontent.com/sgenoud/replicad/5e4ad9bb5a35bb9ae0571e91c25fa1897ba0570c/packages/replicad-opencascadejs/package.json), [binding configuration](https://raw.githubusercontent.com/sgenoud/replicad/5e4ad9bb5a35bb9ae0571e91c25fa1897ba0570c/packages/replicad-opencascadejs/build-source/defaults.yml), [worker guidance](https://replicad.pages.dev/docs/use-as-a-library/).

License: LGPL-2.1-only for this package. Commercial distribution is permitted subject to its terms; preserve exact license/notices and OCCT's exception, provide corresponding library sources/build scripts and modifications, and keep replaceable WASM plus rebuilding/relinking instructions. Inspect the exact installed artifact before shipping. [Package license](https://raw.githubusercontent.com/sgenoud/replicad/main/packages/replicad-opencascadejs/LICENSE), [OCCT exception](https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/OCCT_LGPL_EXCEPTION.txt).

## D03 — proven 2D constraints

Choose `@salusoft89/planegcs@1.3.0`, the FreeCAD PlaneGCS WASM wrapper, in the CAD worker. Published WASM: 484,003 bytes. It exposes solving, conflicting/redundant constraint IDs and temporary drag constraints. Concentric, collinear and fix are represented by documented primitive combinations. Never infer fully-defined status from appearance. Non-driving dimensions have upstream known issues; derive read-only displayed measurements from solved geometry instead.

Alternative SolveSpace/libslvs is a proven GPLv3-or-later solver; commercial use is allowed, but broader distribution obligations are unnecessary here. Alternative implementing a solver violates the request. Revisit if a required constraint cannot be represented correctly or solver diagnostics fail the spike.

License discrepancy: npm metadata says LGPL-2.0-or-later, while source/build headers say LGPL-2.1-or-later. Preserve both evidence and comply with LGPL-2.1-or-later obligations, distributing corresponding source and replacement/rebuild information. [Upstream docs](https://github.com/Salusoft89/planegcs), [source header](https://raw.githubusercontent.com/Salusoft89/planegcs/main/planegcs/CMakeLists.txt), [SolveSpace license](https://solvespace.com/library.pl).

## D04 — Pages and isolation

Pages' current per-asset cap is 25 MiB, equal to 26,214,400 bytes. The owner requests assets under the limit, so the build gate rejects sizes greater than or equal to it. Measure emitted uncompressed files. No dependence on HTTP compression to meet the cap. Free-plan file count is 20,000; check count as well.

Both Pages `_headers` and local static responses set COOP `same-origin`, COEP `require-corp`, CORP `same-origin`. Verify `crossOriginIsolated` in the window and workers; the presence of a configuration file is insufficient. Bundle runtime assets locally. Revisit when hosting policy changes or a browser integration requires another documented policy.

[Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/), [Emscripten threads](https://emscripten.org/docs/porting/pthreads.html).

## D05 — native media plus WASM containers

Choose WebCodecs for native coding and `@libav.js/variant-webcodecs@6.10.9` for MP4/WebM containers and parsers. Source reads use block-reader devices backed by `File.slice`; never preload complete media into the WASM filesystem. Published threaded WASM is 2,511,606 bytes, ordinary WASM 2,344,846 bytes; largest package file is 4,679,865 bytes. Exact shipped artifacts still require size verification.

Alternative `mp4-wasm` documents audio muxing and demuxing work in progress and is insufficient for this acceptance case. Optional `libavjs-webcodecs-bridge@0.3.2` is ISC but its polyfill dependency requires an audit before adoption. Revisit if the selected container library cannot preserve required timestamps or export cancellation.

WebCodecs guarantees no codec. Probe exact H.264/AAC and WebM configurations, and actual encoder initialization. AAC encoding is a known platform risk on Linux. Missing capability gets an explicit UI message; golden MP4 remains UNTESTED/blocked, never passes by falling back silently.

License: compiled libav.js variant is LGPL-2.1; wrapper portions are 0BSD. Preserve notices and exact corresponding FFmpeg/library source, build configuration and changes. No proprietary codec service or uploads. [Upstream](https://github.com/Yahweasel/libav.js), [I/O contract](https://raw.githubusercontent.com/Yahweasel/libav.js/master/docs/IO.md), [license](https://raw.githubusercontent.com/Yahweasel/libav.js/master/LICENSE.md), [WebCodecs spec](https://www.w3.org/TR/webcodecs/), [Chrome guidance](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs), [rejected alternative](https://github.com/mattdesl/mp4-wasm).

## D06 — process overrides and retained gates

The owner requires committed specs in `dev/`, XP chrome/Tahoma, pre-authorized phase BATCH and bricks ending GREEN. These override the skills' ordinary private-doc, design-token and one-brick reporting defaults. Acceptance is still the owner's. Unexpected test failures, surprises, contract changes and hard limits halt BATCH. Provisional assembly of GREEN bricks is authorized by the batch instruction; it is not a claim of ACCEPTED status.

No source code from other Goosnav repositories, including prior launcher implementations, will be ported. The installed skill supplies the protocol; this product owns its original launcher implementation. No later productization milestone is authorized. M1a requires actual native launcher/browser evidence on each claimed OS/architecture. Cross-compiling alone does not pass. The generic productization template's application API and GUI quit endpoints are omitted because the local server is explicitly static-only; lifecycle control stays in the launcher supervisor. Revisit only on owner direction.

## D07 — originals and product scope

Name is exactly `gsnv-paint`; workspaces are Image, Video, CAD. Copy is short and factual. Software interface glyphs are original paths created for this product, not Microsoft assets or canonical comic art. No logos, wallpapers, sounds, mascots, generated comic art, remote services, extra features or marketing claims are implied.

## D08 — native project persistence

Each workspace has a documented versioned envelope and its own content schema. File System Access is primary, explicit file input/download is fallback. Large recovery data belongs in browser local IndexedDB/OPFS; localStorage holds only small journal metadata. Alternative putting all pixel/video payload into synchronous localStorage risks quota and UI stalls. “Local storage” is interpreted as on-device browser persistence, with no cloud storage. Revisit if the owner specifically requires all data in the localStorage API.

## D09 — real browser verification during shell construction

Use pinned Vite 8.3.8 (MIT) to serve TypeScript module fixtures and Playwright 1.65.0 (Apache-2.0) to exercise installed desktop Chrome. Added when S06 first required a real browser resource. Alternative: fake-only shell tests; rejected because they cannot prove browser integration. Headless Linux evidence is labeled explicitly and never substitutes for other browsers, native OS launcher tests or hardware tests. Browser tests fail when the browser/server is missing; they do not silently skip. Revisit if a test needs a headed interaction or real hardware.

The fixture server has the same isolation header policy required by D04; release Pages/local verification remains separate. [Playwright browser channels](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge), [WebCodecs configuration support](https://www.w3.org/TR/webcodecs/).

## D10 — C01 pinned runtime lifetime

Phase 2 inspection of installed `replicad-opencascadejs@1.2.1` confirms its generated loader, not just declarations: `locateFile` is honored, but advertised `wasmBinary`/`wasmMemory` overrides are absent in single-thread JS. The native memory starts at 1,600 pages (104,857,600 bytes), with a compiled maximum of 65,536 pages (4 GiB). Do not claim a configurable heap cap. The single build in a dedicated worker is the initial supported mode. The pthread build eagerly creates `navigator.hardwareConcurrency` workers, imports its sibling loader, and has no public pool shutdown API; requests for that mode raise a readable CapabilityError until bounded lifecycle support is independently verified. This follows D02's single-first decision, not a claim that threaded execution passes.

C01 transfers ownership of distinct shape wrappers to its token registry, invalidates all tokens on close, and normally releases each tracked wrapper once. Fatal WASM exceptions/traps stop native calls; whole-worker termination reclaims the abandoned faulted heap. Executor temporaries remain executor-owned. Closing the registry cannot unload the WASM heap; the worker owner must terminate the worker after close/cancellation/fatal native error. A failed open/probe reports a readable error and never returns a usable session. Future job cancellation terminates and replaces the worker, invalidates its generation and replays committed source; it cannot interrupt a synchronous vendor call in place. Pattern limits and production job deadlines remain C27/H-CAD-05 work, not guessed C01 guarantees.

The build exports exception introspection/refcount helpers but not stackSave/stackRestore. Catch a native exception only to extract type/message and decrement its reference, then invalidate and replace that worker. Do not continue geometry on the faulted instance. [Emscripten exception guidance](https://emscripten.org/docs/porting/exceptions.html#handling-c-exceptions-from-javascript) requires shadow-stack restoration for continued module use. Alternative adding custom kernel exports is deferred until measured need; silent continued reuse is unsafe.

Exact library source/build provenance: [package source at gitHead 5e4ad9b](https://github.com/sgenoud/replicad/tree/5e4ad9bb5a35bb9ae0571e91c25fa1897ba0570c/packages/replicad-opencascadejs), build images `ghcr.io/taucad/opencascade.js:3.1.0-single-threaded` / `3.1.0-multi-threaded`, [pinned build dependencies](https://raw.githubusercontent.com/taucad/opencascade.js/v3.1.0/DEPS.json). That manifest identifies OCCT V8_0_1 at b8f597c677811d1f9f4d8a97f5ae2825c0353a42. The npm archive alone omits corresponding C++/build source and the [OCCT exception](https://raw.githubusercontent.com/taucad/opencascade.js/v3.1.0/LICENSE.OCCT-Exception); release packaging must preserve them and provide replacement/rebuild instructions. This is not distribution clearance.

D03 clarification from pinned sources: FreeCAD native files carry LGPL-2.0-or-later; wrapper/build headers carry LGPL-2.1-or-later; packaged LICENSE is LGPL 2.1. These are component notices, not simply inaccurate metadata. Preserve both and apply the compatible LGPL 2.1 terms. No solver runtime claim follows from declaration inspection.

Cloudflare's primary [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) were rechecked on 2026-11-11: 25 MiB per asset, 20,000 files on Free. The strict-under asset gate remains unchanged.

Exact inspected notice copies: [package LGPL text](licenses/replicad-opencascadejs-1.2.1.LICENSE.txt), [OCCT exception](licenses/OCCT-8.0.1-EXCEPTION.txt). [C01 artifact manifest](evidence/C01-assets.json) records installed source-asset sizes and SHA-256 hashes; it does not certify final emitted files or a complete corresponding-source distribution.

## D11 — PlaneGCS declaration packaging

Pin `@salusoft89/planegcs@1.3.0` in the lockfile. Its published `dist/index.d.ts` fails strict NodeNext checking with 14 TS7016/TS2835 diagnostics: the native module declaration is absent from `dist`, and relative declaration imports omit required extensions. The same package includes the missing declaration at `planegcs_dist/planegcs.d.ts`. This is a dependency packaging defect; it is not evidence of incorrect native solving.

Choose a reproducible declaration-only preparation step in [prepare-planegcs.mjs](prepare-planegcs.mjs). It copies that published declaration into its expected location and appends `.js` to extensionless relative declaration imports. The [manifest](planegcs-declarations.json) records exact original/prepared SHA-256 values and upstream commit 9d26baef0b240fe0eef4186d4e5e5e66ec3620b7. Version and every expected input/output are validated before writing. Repeated preparation makes no changes. No vendor signatures are rewritten and no JavaScript/WASM changes. Fresh `npm ci` runs the preparation; script-disabled installs require explicit `npm run prepare:solver`.

Alternatives: global `skipLibCheck` hides declaration problems; switching the whole project to Bundler resolution still leaves a missing declaration; a `paths` declaration mirror can also affect runtime resolution in tooling. The narrow installed-package repair preserves existing strict checks and package resolution. Revisit and remove the repair when an audited upstream release packages valid NodeNext declarations. Do not relax hash guards to adopt a changed package silently.

The exact packaged [LGPL text](licenses/planegcs-1.3.0.LICENSE.txt) is retained. D03/D10's component-specific license notices and corresponding source/build/replacement obligations still apply before distribution. This preparation is development tooling, not a product brick, solver implementation, or release clearance. No requirement is passed by declaration checking; the subsequent C02 worker spike is recorded below and in Phase 2.

## D12 — C02 solver ownership and loading

Bundle the published `GcsWrapper` normally and load the pinned native glue default initializer through `moduleUrl`, with an explicit same-origin `wasmUrl`. Alternative loading package-root `index.js` as one raw URL would leave its relative imports unresolved after asset emission. The worker adapter neither implements a solver nor changes vendor algorithms. Revisit this loading choice if upstream publishes a standalone entry.

Expose only the approved nine wrapper methods, `dof`, `snapshot`, generation and closed-state query. Freeze the facade, copy primitive/parameter inputs and snapshot/diagnostic outputs, and guard even previously captured methods. The native `GcsSystem`, wrapper indexes and destruction API remain private. Ordinary solve statuses and negative degrees of freedom pass through unchanged; C16 owns geometry acceptance/commit policy. Readiness uses a separate temporary system to solve a known point and verify contradictory-coordinate reporting, preserving live data/settings. Alternative clearing the live wrapper for a health check would discard source state; revisit if the vendor provides a non-mutating native health check.

Any thrown engine call invalidates the port and propagates the vendor error; the owner must terminate the worker. Failed load/probe likewise leaves uncertain native cleanup to termination. Successful probes destroy their temporary system once. Normal close invalidates before native destruction and returns a readable diagnostic if destruction fails, with no retry. Revisit only with a verified vendor recovery protocol. The pinned binary declares fixed, unshared memory of 337 pages / 22,085,632 bytes; this is not a total worker-memory bound. Close releases native objects, while worker termination reclaims the whole runtime and cancels synchronous work.

[C02 asset evidence](evidence/C02-assets.json) preserves hashes and the inspected memory declaration. Source loader is 26,129 bytes, WASM 484,003 bytes. The real browser fixture verifies solving, reports, probe isolation, closed-method guards, worker replacement and bounded main-thread responsiveness. The combined CAD-A1 seam was subsequently verified in the Phase 2 paired-engine checkpoint. The production CAD registry, final emitted assets, offline deployment and commercial distribution package remain later gates. D03/D10/D11 license and corresponding-source obligations are unchanged.


## D13 — dimension expression units and arithmetic boundary

C03 parses the requested arithmetic directly, with no host evaluation, functions or general math-language dependency. Variable values arrive in canonical millimetres/radians/scalars. Explicit suffixes are `mm`, `inch`, `in`, `deg`, `rad`, and `°`; unit names are reserved and case-sensitive. Bare numeric arithmetic stays implicit until addition/subtraction with a dimension or the final field boundary supplies document length units or degrees. This permits `width / 2` as scaling and `width + 2` as an offset in document units. Treating every bare number as a dimension immediately would make ordinary division unusable. An explicit scalar variable or dimensional ratio remains scalar, including when multiplied by zero. Compound dimensional products/quotients are outside the approved three-kind grammar and fail visibly.

Iterative operator/value stacks preserve normal precedence without recursion limits on nested user input. Every numeric operation and unit conversion must stay finite; negative zero is normalized on output. Errors retain the original UTF-16 offset/token, and results retain unique sorted dependency names even when a term has zero weight. Revisit the parser only if the owner changes the grammar; do not add functions or host evaluation opportunistically. Unit factors are definitions rather than user tuning values.

Document-unit switching still needs integration that preserves existing physical geometry and variable relationships. Merely reevaluating unchanged bare source expressions with a different `context.units` would change their physical sizes. C03 deliberately does not migrate documents or rewrite saved expressions; CAD-017/018/019 remain untested until the full editing/rebuild/persistence procedures pass.

## D14 — script launchers for the source folder

Owner request, 2026-11-11: top-level `run.command`, `run.ps1` and `run.sh` so the repository starts on any OS. This overrides the productization skill's default of five native launcher images for now. The scripts start this source folder; they are not the M1a universal ZIP. REL-019 and its native launcher matrix remain Phase 5 work and remain UNTESTED. `run.cmd` exists because Windows does not run a `.ps1` on double-click.

Each wrapper only finds a runtime: the installed Node.js when it is 22.12 or newer, otherwise pinned Node.js 24.22.3 downloaded from nodejs.org into the user's application-data folder and verified against the SHA-256 values in `launcher/node-runtime.sha256`, copied from the official `SHASUMS256.txt` on 2026-11-11. All remaining logic is one file, `launcher/start.mjs`: `npm ci` when the lockfile is newer than the installed modules, a Vite build when sources are newer than `dist/`, then Vite's preview server and the default browser. Alternative: a handwritten static server; rejected while the pinned Vite already serves `dist/` with D04's headers, loopback binding and Host validation. Revisit when the packaged release must run without `node_modules`.

The local origin is fixed at `http://127.0.0.1:24173`. Browser storage is per origin, so a port that moved between launches would hide recovery data (D08). A second launch finds the running copy and reopens it. A port held by another program is a visible `APP-START` failure, not a silent move. `GSNV_PAINT_PORT` overrides the port and therefore selects different browser storage.

Evidence on macOS 26 arm64 only: installed-Node and managed-Node starts, checksum mismatch, download failure, missing files, a folder name with spaces and non-ASCII characters, second-launch reuse, `crossOriginIsolated` true in a real page. Linux and Windows wrappers are UNTESTED; `run.sh` additionally parses under `dash`.


## D15 — XP-inspired web application chrome

The owner's aesthetic-overhaul request replaces the earlier literal OS-window treatment. CTL-001 now calls for a web application: an application header and workspace navigation, useful menus and status, restrained bevels and neutral panels. No simulated desktop, Start/taskbar/clock or window-management buttons. The original Tahoma-style type and original app glyphs remain. Public S10 inputs/callbacks and stable viewport/panel ownership are unchanged. This authorizes the presentation update; it does not approve C05's separate pending revision contract amendment.

Alternative: remove only the decorative footer. Rejected because duplicated window framing and scattered workspace navigation still obscure the work. Revisit on explicit owner direction. [UI refresh evidence](UI-REFRESH.md) records before/after checks and limits.

## D16 — deliver a working CAD path before the remaining feature families

The owner's renewed goal is to bring the unfinished application to a usable state. The production shell currently registers no editors. Deliver a vertical CAD increment now, preserving the full scope, CAD priority, existing GREEN contracts, and human acceptance boundary. This is an execution-order revision, not completion of Phase 2. The committed additive contracts C50–C58 below supply a supported subset of the existing CAD document schema and connect the verified engines to the production shell. C05's pending amendment remains pending; none of C05's implementation or approved contract is changed.

Alternative: continue every domain module before mounting any editor. Rejected because it leaves the deployed application unusable throughout development. Revisit this increment once the full C05–C49 contracts are implemented; replace subset implementations behind their seams while preserving saved documents. Unsupported features must be rejected visibly on open, never silently discarded. The complete CAD golden part, all Image/Video requirements and packaging gates remain open.

Render actual OpenCascade triangulations with pinned Three.js 0.187.0 (MIT, commercial distribution permitted with its copyright/license notice). Three.js is a rendering adapter, not a second solid model. Source: https://github.com/mrdoob/three.js/blob/dev/LICENSE and https://threejs.org/docs/. Preserve the installed license in the build notices. PlaneGCS and OCCT license obligations from D03/D10 remain unchanged. No server computation, CDN dependency or uploaded geometry.

## D17 — native STEP exchange and output from the working editor

Continue the existing independent C37 contract, then C59/C60 connect its output to the working CAD adapter. Extract C54's characterized wire/face/prism construction into C59 so display and export use the same solid. C54's public input/output and numerical expectations remain unchanged. C60 owns a separate short-lived export worker and starts the native file picker while user activation is available. Source edits cancel the job; no stale result is downloaded, and exporting never marks the editable project saved. Alternative: reuse the on-screen triangle mesh for export; rejected because STEP requires the analytic B-rep. The full graph, import UI, other formats and golden part remain required.

The real C37 test exposed an OCCT binding detail: `StepModel.SetWriteLengthUnit(25.4)` scales coordinates but does not set the STEP header's unit when the exposed `Transfer` overload initializes parameters from `Interface_Static`. Set/restore `write.step.unit` around the synchronous export and explicitly keep the local model unit at 1 mm. The kernel and this temporary setting stay inside one serial worker. Import sets `SetSystemLengthUnit(1)` after reading file units. Real tests alternate mm → inch → mm and re-import after disposing source bodies. Revisit when the binding exposes the explicit `DESTEP_Parameters` overload. [Pinned writer source](https://github.com/Open-Cascade-SAS/OCCT/blob/V8_0_1/src/DataExchange/TKDESTEP/STEPControl/STEPControl_Writer.cxx), [writer reference](https://occt3d.com/dev/doc/refman/html/class_s_t_e_p_control___writer.html), [reader reference](https://occt3d.com/dev/doc/refman/html/class_s_t_e_p_control___reader.html).
