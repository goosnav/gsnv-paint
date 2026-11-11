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
