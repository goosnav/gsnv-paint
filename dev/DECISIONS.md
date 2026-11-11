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
