# Cross-workspace snapshot transfers

Parent review (2026-11-13): this map was committed before the owner-authorized BATCH. Implementation and acceptance are separate; no acceptance was delegated.

Status (2026-11-13): **IMPLEMENTED; bounded contract and combined regression gates GREEN.** The original isolated Chrome 9/9 and focused unit 60/60 results below are historical scoped evidence. Subsequent endpoint/WebM, export-focus and shell recovery/Save-availability repairs are linked below. Candidate `9980ea171176a67ab825a15083838fed0849060cd52c8d6857652d75cf6efaa2` passes the canonical 89-case combined browser gate, including immediate Save after Redo; [raw output](evidence/modeling-offline-browser-green.log) records 4.0 minutes and exit 0. The [modeling and offline checkpoint](MODELING-OFFLINE-CHECKPOINT.md) is authoritative for final results and the parent-reviewed XWS-001/003 credits. Earlier CAD chooser failures and their test-only correction remain in the [diagnosis](CAD-REOPEN-DIAGNOSIS.md).

Scope is the three original actions in N-006 / XWS-001–003, with the existing Video frame pipeline only. **XWS-002 remains incomplete:** title/fade/letterbox transfer is implemented, but the required correction stage does not exist. This is not a general clipboard, live link or export service. The committed map authorized implementation under BATCH. These refinements bind D01–D05/A-D-Bridge from [MODULE_MAP-MEDIA.md](MODULE_MAP-MEDIA.md) and C35 from [MODULE_MAP-CAD.md](MODULE_MAP-CAD.md) to working editors; they do not mark their larger planned dependencies GREEN.

## User behavior and preservation

| Command | Source snapshot | Destination |
|---|---|---|
| `bridge.imageToVideo` — Send to Video bin | Entire committed Image composite, all visible layers and supported blends, original pixel dimensions and alpha | A named still in the current Video bin; one undoable append. No automatic timeline clip, project resize or frame-rate change. Create an empty Video project if absent. |
| `bridge.videoFrameToImage` — Send current frame to Image | Current timeline time after pausing playback and waiting for its decoded frame; full project resolution, letterbox, fades and title overlays | A new unsaved Image project with one editable raster layer. |
| `bridge.cadToImage` — Send transparent view to Image… | Committed solid geometry and current camera; explicit pixel dimensions, transparent background, no editing overlays | A new unsaved Image project with one editable raster layer. |

These are independent copies. Source layers, CAD features/imported STEP assets, Video clips, file handles and undo/redo remain editable and unchanged by capture. Normal flushing may first commit an already-authored valid field edit through its existing history path; capture itself creates no source edit. A floating Image selection, live stroke/shape/opacity preview, open modal, unresolved CAD preview/rebuild, pending media import or invalid field blocks transfer with “Finish or cancel the current edit, then send again.” Do not silently place a selection, cancel a preview, call an export command with editing side effects, or render a different snapshot into an editor to obtain pixels.

For a new Image target, use the existing New/Open replacement semantics: flush pending target input, retain a dirty prior project in Recent only after its exact revision has a successful durable backup, or use the existing safe replacement fallback when no Recent port exists. Failed/denied/quota storage keeps that project open with an actionable error. The new project has a fresh ID and no inherited save-file handle. Its history starts fresh; reopening another project does **not** restore an old undo chain. Persistent history across separate documents is outside this increment. Source history is preserved, and an append to an existing Video bin has exactly one target undo step.

Switch to the destination only after successful application. Cancellation, unsupported capture, stale state or failed replacement leaves both projects and the current workspace intact. Ordinary target dirty/recovery/save status remains truthful; copying into a project does not mean a file has been saved. No upload, remote image, download, source-file overwrite or clipboard permission is needed.

## Implemented seams

| Working seam | Evidence / required refinement |
|---|---|
| `image-content.ts`, `image-composite.ts`, `image-source.ts` | D02 resolves committed tiles through the existing pure compositor. It never calls mutable workspace `flattened()` or export. `image-source-adapter.ts` blocks floating pixels, live stroke/shape/marquee/opacity previews and pending import; selection stays unchanged. |
| `video-timeline.ts` | New `import-media`/`place-media`/`remove-media` operations preserve unplaced media. Import owns bytes, never resizes and never adds a clip; deletion retains the source; referenced bin removal fails. Native version 1 already carries these records. Existing `add-media` import-and-place behavior remains. |
| `video-workspace.ts` | `video-media-bin.ts` supplies the minimum V31 thumbnail/name/dimension/place/remove UI. `video-field-edit.ts` validates pending inspector text before a single commit. D03 privately decodes the requested frame and calls the same `video-frame-renderer.ts` used by preview; it never reads a potentially stale display canvas. |
| `cad-viewport.ts` (C56), parametric/imported views | Local typed capture ports provide the ready committed preview, aggregate imported bodies, camera and revision. C35 uses a separate temporary transparent WebGL renderer; no global canvas search or background color-keying. |
| `app/app-shell.ts` | The optional editor bridge and host transfer route use authoritative shell state, epochs, pending-input flush, durable replacement guard and acknowledged compare/apply. Target editors are never rendered to obtain a snapshot. |

## Typed transfer boundary — D01

These names and discriminants are the implementation contract (`BridgeResult` is exported from the coordinator). The route determines the only allowed source and destination; runtime validation rejects fabricated combinations as well as malformed pixels.

```ts
type Stamp<W extends 'image' | 'video' | 'cad'> = Readonly<{
  workspace: W; documentId: string; identity: string; epoch: number;
  viewRevision: string; // Image readiness, Video playhead, or CAD camera/preview
}>;
type Pixels = Readonly<{
  width: number; height: number; rgba: Uint8ClampedArray;
  colorSpace: 'srgb'; alpha: 'straight'; // top-left, tightly packed RGBA8
}>;
type TransferRaster = Readonly<{ version: 1; label: string; pixels: Pixels }> & (
  | { route: 'image-to-video-bin'; source: Stamp<'image'> }
  | { route: 'video-frame-to-image'; source: Stamp<'video'>;
      frame: { timelineSeconds: number; fps: number } }
  | { route: 'cad-viewport-to-image'; source: Stamp<'cad'>;
      background: 'transparent' }
);
type TransferIntent =
  | { route: 'image-to-video-bin' }
  | { route: 'video-frame-to-image' }
  | { route: 'cad-viewport-to-image'; width: number; height: number };
type BridgeResult =
  | { ok: true; workspace: 'image' | 'video'; documentId: string; identity: string }
  | { ok: false; code: 'pending-edit' | 'unavailable' | 'stale' | 'invalid-raster'
      | 'capture' | 'encode' | 'replacement' | 'cancelled'; message: string };
```

Dimensions are positive safe integers, `width * height <= 16_777_216` (the current Image limit), and exact length is `4 * width * height`. Reject invalid products, detached/shared buffers, unsupported color/alpha, invalid stamps and nonfinite frame time/rate before copying or allocating. Channel/row order is a producer guarantee verified by asymmetric pixel goldens, not something a validator can infer from arbitrary bytes. A producer may have tighter capability bounds, which it reports explicitly. Never silently downscale or crop. One transfer may run at a time; temporary capture, encoder and GPU resources are released on every exit. This bounds individual raster allocations to 64 MiB, not total application memory.

D01 returns an owned copy; source input buffers cannot alias delivered pixels. Typed-array contents are mutable despite a readonly record: ownership, copying at the destination and tests enforce isolation, not a claim that `Object.freeze` freezes bytes. No DOM, canvas, worker token, URL, native file handle or mutable editor object crosses the raster boundary. Labels are plain display text. Consumers accept only these routes and create their own IDs.

This intentionally replaces the map's future tiled `PixelSurface` with a contiguous owned RGBA boundary matching the current working `Raster`. Tiling remains internal to Image. Replace the ambiguous `transparent:boolean` with the explicit alpha representation and CAD background policy: a solid may legitimately fill every pixel, so requiring at least one alpha-zero pixel is not a valid general validator. Transparency and fringe correctness need producer tests.

## Bricks and testbench order

Every implementation brick gets its contract/header and failing independent testbench first, then the smallest implementation; keep new source files at most 300 lines and three public exports. Existing oversized workspace files receive wiring only. No broad timeline, CAD renderer or Image editor rewrite is part of this transfer batch.

| ID / file | Contract and working dependencies | First evidence |
|---|---|---|
| D01 `bridge/transfer-contract.ts` — CORE | Validate the closed union, dimensions, color/alpha, stamps and ownership; return owned `TransferRaster`. Preserve direction/raster/transparency error classifications. No browser dependencies. | Literal arrays, invalid routes/limits, buffer alias tests; no input mutation. |
| D02 `bridge/image-source.ts` — CORE | Committed `ImageContent` + source stamp/label → full composite transfer. Depend on working `imageContent` and `compositeLayers`, rather than pretend future I06 types exist. Resolve every visible supported layer without changing its native data or metadata. | Exact 2×2 RGBA/blend fixtures; layer visibility/opacity, source native bytes and history identity unchanged. |
| V02 / V31 prerequisite — current `video-timeline.ts` and new `video/video-media-bin.ts` | Bin-only generated PNG import; explicit placement (default 3 seconds) and unreferenced removal. Existing `Media.id` keys `bytes`; native encode maps it to asset `media-${id}`. Preserve all unplaced assets on clip deletion. Bin UI remains accessible with an empty timeline. | Unplaced asset native round trip; no resize/clip on import; place/remove/undo; reject referenced removal; deleting last clip retains its source. This is the bounded current bin, not planned multi-track V02/V31 completion. |
| C35 `cad/cad-viewport-capture.ts` — SHELL | Typed live C56 capture port + size + committed preview/document stamp and camera stamp → straight-alpha sRGB `ViewportCapture`. D04 consumes it. This is a bounded extension of C56, not completion of planned C31. | Real Chrome transparent offscreen capture, all imported bodies, camera, orientation, color, context failure and state restoration. |
| D03 `bridge/video-source-adapter.ts` — SHELL | Committed VideoContent, owner Document, source/playhead stamp, current-state predicate and abort signal → full project-resolution transfer. Private Blob-backed image/video decoding plus `video-frame-renderer.ts`; no DOM query or display-canvas read. | Distinct adjacent video-frame fixture, pending seek, fades/title, stale seek, decode failure, cancellation and URL release. |
| D04 `bridge/cad-source-adapter.ts` — SHELL | Live typed C35 port + source stamp/label/size + abort signal → validated CAD transfer; no hidden viewport registry. | Stale geometry, same-geometry new document identity, camera change, lost context, cancellation. |
| D05 `bridge/destination-adapter.ts` — SHELL | Validated transfer + explicit current target snapshot and caller-issued IDs → candidate new Image document **or** generated PNG/media pair for a bin edit. No live mutation, UI navigation, storage writes or hidden global state. Image uses `imageContent`; Video uses current media/bytes/native mapping. | Independent decoded PNG pixels/alpha/size; Image raw-layer native round trip; encode failure leaves both candidates unapplied. |
| A-D-Bridge `bridge/workspace-bridge.ts` + narrow app/editor wiring — SHELL assembly | Coordinate source/target readiness, capture, materialization, cancellation and shell-authorized compare-and-apply. The shell remains the only owner of state replacement and history. | Controlled async races/storage failures first, then full production browser workflows. |

For D05, `png-encode.ts` uses local PNG chunk/CRC assembly and browser `CompressionStream('deflate')`. Independent Node inflate/CRC and real Chrome tests prove every straight RGBA byte, including low alpha and nonzero RGB beneath alpha zero. Input is streamed a row at a time and compressed output is bounded; this is not a bound on total editor memory. If CompressionStream is unavailable, delivery fails before any target edit. No dependency or Canvas premultiplication round trip was added. D05 accepts the typed **validated** internal boundary; A-D runs D01 immediately before delivery. Its three runtime collaborators are I51 `imageContent`, current `videoTimeline`, and the PNG helper.

## Source and destination lifecycle

The optional host addition is `transfer(intent: TransferIntent): Promise<BridgeResult>`, scoped to the mounted source workspace. `EditorBridge` provides `prepare(role: 'source'|'target'): void`, `revision(): string`, and `capture(intent, sourceStamp, signal): Promise<TransferRaster>`. `prepare` may report a pending edit but must not mutate previews. Existing `flush()` commits ordinary pending fields first; a blocked gesture/modal stays editable. Capture takes only the explicitly stamped committed snapshot and view state. D05 receives the target value from the shell, never a hidden view's cached `current` variable.

1. Reject unavailable directions, active dialog/capture/export or unresolved recovery. Flush ordinary source input, call its readiness port, and record source ID/identity/epoch plus view revision. For Video, pause first and freeze the requested time; pausing changes playback only, not document history.
2. Prepare the destination before reading its snapshot. Flush any mounted target editor's pending input and reject unfinished gestures. Record target identity/epoch or absence. Do not mount or render it merely to force pending state into a snapshot.
3. Capture into owned bytes, validate D01, then materialize a candidate with D05. After every await, reject a changed source/document/view, changed target, disposed shell or aborted request. A workspace switch or new transfer intent aborts the old request; late callbacks cannot navigate back or apply data.
4. For a new Image (or absent Video), call the existing shared replacement guard and validate the candidate through its adapter. Recheck all source and target tokens **after** asynchronous backup/consent and immediately before replacement. For existing Video, validate the bin-only candidate and apply exactly one compare-and-swap history edit using its current identity. The shared apply operation must acknowledge success rather than treating a void/stale `commit` as success.
5. Only an acknowledged application switches workspace and reports success. Keep prior source state and handles. Begin normal target recovery/Recent persistence and retain ordinary dirty/unload warnings; failed target backup is not described as saved. Release resources in `finally`.

The C35 port is internal to the CAD shell; its live Three.js capabilities never cross D01. `read()` fails when there is no ready committed solid, and grants C35 access only for the guarded capture call. C35 clones the camera state, reads the expected identities before and after rendering, and returns owned pixels. Both CAD assemblies supply the document identity; C56 increments `viewRevision` for committed preview, camera, framing or appearance changes. A plane/unit change invalidates capture even if physical triangles are unchanged. D04 retains the dialog-opening stamp through commit: shared dialogs cache successful validation, so a camera/resize change after validation must be rejected again by `prepare`, not accepted when OK is pressed.

```ts
type CaptureStamp = Readonly<{ documentIdentity: string; viewRevision: string }>;
type CadCapturePort = {
  read(): CaptureStamp & Readonly<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene;
    camera: THREE.OrthographicCamera; overlays: readonly THREE.Object3D[];
    width: number; height: number; // current drawing-buffer pixel dimensions
  }>;
  isCurrent(stamp: CaptureStamp): boolean;
};
// C35: captureCADViewport({ viewport, width, height, expected, signal })
// -> Promise<Pixels & { source: 'cad'; stamp: CaptureStamp }>
```

CAD capture defaults to the current drawing-buffer pixel dimensions, displayed explicitly. The dialog offers native, half, quarter and double resolution choices only when they preserve aspect and fit the **4,194,304-pixel** capture cap. An over-budget native size requires explicit selection of a smaller size. It never silently downscales. C35 clones the scene/camera and creates a temporary transparent, antialiased WebGL renderer using the same committed geometry/materials, color space, tone mapping and exposure. Clone-only overlay visibility and transparent clear state leave the visible renderer untouched. Readback is flipped to top-left and unpremultiplied explicitly; alpha-zero RGB is cleared. The temporary context is disposed/lost on every exit. This was selected over borrowing the live opaque renderer or a multisample render target because real Chrome proved edge alpha and preserved visible state with this smaller ownership boundary. GPU limits/context loss fail visibly. The proof covers current opaque CAD materials and antialiasing, not arbitrary future translucent materials or every GPU. The port does not duplicate CAD geometry or sketch-frame contracts.

D03 uses a new private decoder for each capture. It waits for loaded data and `seeked`, verifies `readyState >= 2`, non-seeking state and requested source time within 0.01 seconds, with abort and a 10-second timeout. V-TIMELINE supplies a source sample strictly inside the half-open trim at End; finite decoded duration further bounds the sample. Positive unknown duration (`Infinity`, as reported for multi-chunk MediaRecorder WebM) permits a ready bounded seek, while final decoded time must stay inside the clip and any known media duration. NaN, newly revealed duration at/before the in-point and clamps before the in-point or at the excluded out-point fail. It does not use `requestVideoFrameCallback`; adjacent known-color Chrome fixtures establish the currently supported path. It invokes the shared full-resolution composition path, including opaque black letterbox/fade and titles. The private media element is paused/cleared and its Blob URL revoked on success, decode failure, staleness or cancellation. HTML media seek does not establish frame-exact demux guarantees across formats/browsers. XWS-002 requires a title **and correction**, so full verification stays open until the correction path exists and passes the capture test.

## Goldens and acceptance evidence

| Test | Independent expected result |
|---|---|
| D01 bounds/ownership | 1×1 and 3×2 accepted; invalid dimensions, overflow, wrong lengths/color/route, shared/detached buffer and malformed stamp rejected. Staleness is checked by the shell against its authoritative state. A maximum-size case stays within declared allocation policy. Mutating caller or destination buffers cannot alter the source or earlier history. |
| D02 2×2 RGBA | Bottom `[red opaque, clear, blue opaque, clear]`; top normal `[clear, green alpha 128, red alpha 128, clear]`. Exact output row-major: `[255,0,0,255, 0,255,0,128, 128,0,127,255, 0,0,0,0]`. A hidden opaque layer changes nothing. Separate 50% normal fixture: bottom `[128,64,200,255]`, top `[200,100,50,255]` → `[164,82,125,255]`. Assertions use literal values, not the production compositor as oracle. |
| PNG/native persistence | Independently decode generated PNG; assert width/height and every RGBA byte, including arbitrary RGB at alpha 1/2/127/128/254 and transparent pixels. Parse saved Video assets and Image raw layers through an independent fixture reader. Reopen a bin-only project and prove the unplaced still survived before timeline placement. |
| D03 frame/size | Locally bundled distinct frame-coded video with known dimensions and source time; capture before/after a pending seek, with fade and title. Assert project-size pixels, letterbox/background alpha 255, exact interior-color regions and independently specified overlay regions. Font antialiasing/codec tolerances must be declared, not expanded after a failure. Add a correction fixture when that stage exists. |
| C35/D04 alpha/geometry | Fixed asymmetric colored solid and multi-body imported solid, known camera and requested 320×240 size. Background corners alpha 0, solid interiors alpha 255, nontrivial edge alpha on the fixture's diagonal edges, correct row orientation and projected geometry bounds. Composite the output over black and white and compare against independent reference renders to detect background-color fringes; compare premultiplied color at low-alpha edges, not unstable straight RGB. Record GPU/browser and measured tolerance; no universal cross-GPU bit-exact claim. |
| Source/target invariants | Before/after native bytes, layer/feature/media metadata, source history/redo, title, file handle and selection are unchanged by capture. Valid pending field input flushes once; active strokes/floating selections/modals block without mutation. Existing target Video append/undo/redo returns to exact prior content; new Image replacement obeys documented history semantics. |
| Failure/race matrix | Quota/denied/unavailable Recent, cancelled fallback, target input pending, target changed during encode/backup, source edit/seek/camera change, same-ID reopen, workspace switch, disposal, readback/codec failure and context loss. No partial asset insertion, wrong target, lost revision, late navigation, leaked URL/GPU resource or false success. |

Real Chrome production browser verification must exercise all three commands through visible menus, navigate back to edit each source, use target Undo/Redo, immediately Save, decode the downloaded native file, reopen it and verify the raster/bin asset. Include a dirty existing Image target, an existing Video with its own clips, and a fresh Video with no clips. Repeat after reload with exact-revision backup acknowledgment, and exercise storage failure with the old target retained. Add keyboard operation, visible disabled/pending reasons and a reviewed 1280×720 screenshot. Assert no outbound network request; hosted and loopback static-server flows use identical local capture logic. Service-worker/offline startup remains a separate distribution gate.

## Implementation status and reproducible evidence

All new runtime files are at most 300 lines and have at most three public symbols and three runtime collaborators. The 12-file method check passes; that verifies structure, not behavior. Existing large editor/shell files received port wiring and lifecycle integration. No runtime dependency was added. Native Video stays version 1; Image uses the independently implemented current I51 encoding.

| Brick / bounded status | Tests and demo evidence |
|---|---|
| D01 GREEN | `transfer-contract.test.ts`: three tests for routes, stamps, dimensions, byte ownership, shared/detached buffers and the declared allocation boundary. `bridge-core.demo.ts` prints an independently mutable owned copy. |
| D02 + Image readiness helper GREEN | `image-source.test.ts` (two) checks literal layered RGBA, hidden layers, opacity/multiply and unchanged source native bytes; `image-source-adapter.test.ts` blocks each live edit category. Core demo prints literal composite bytes and retained source layers; workspace browser cases preserve source native bytes/history/selection. |
| D03 + frame-renderer helper GREEN for current pipeline | `video-source-adapter.test.ts` rejects missing/stale/aborted requests before DOM work, invalid decoded durations and post-seek frames outside the clip. Raster browser proof checks red/green/blue adjacent frames, title pixels, letterbox/fade, corrupt media, stale capture, cancellation and seven created/released Blob URLs. [Endpoint/native repair evidence](VIDEO-BOUNDARY-REPAIR.md) adds exact trimmed End preview/native pixel checks and actual WebM export→import→capture with unknown decoded duration. Raster demo exposes the same independent known-color fixture. |
| C35 + D04 GREEN for current opaque CAD preview | `cad-viewport-capture.test.ts` rejects budgets, abort, camera/document staleness, including a new document with unchanged physical geometry. Two D04 tests cover explicit sizes and cached dialog validation. Raster browser proof checks exact 320×240 orientation/interior colors, >100 partial-alpha pixels, black/white fringe error ≤2 and unchanged source state; separate context-loss case. Workspace cases cover native size choice, resize during the dialog, editable parametric source, two disconnected imported STEP bodies and all original STEP bytes. |
| D05 + PNG helper GREEN | Two PNG unit tests independently inflate/check CRC and literal low/zero-alpha bytes; Chrome independently inflates the same output. Two destination tests cover editable Image bytes/native reopen, Video native media mapping, no resize/clip and absent Video baseline. Core demo independently inflates generated PNG and native-round-trips the unplaced still. |
| A-D-Bridge GREEN at coordinator/shell boundary | Coordinator tests cover controlled source/target/epoch/view/workspace races, post-backup staleness, cancellation, denied replacement and unavailable PNG compression without apply. `app-shell-bridge.test.ts` uses fake-indexeddb through the actual Recent adapter and hidden pending target input to prove exact durable backup and quota failure retention. Shell/recovery regressions remain cumulative; current combined counts belong to the checkpoint report. |
| V02/V31 **bounded bin prerequisite GREEN** | Four timeline tests, bin DOM test and pending field test. Workspace cases prove fresh/existing bin append is one undoable edit, native unplaced asset reopen, explicit placement, referenced-remove disabled, and immediate pending field Save. Future source relink, large-file read-in-place, richer sorting/search/metadata and the broad Video map remain open. |

Commands run from the repository root:

The command counts below record the original transfer gate, not the current
suite size. Later evidence covers [endpoint/native boundaries](VIDEO-BOUNDARY-REPAIR.md),
[export focus](VIDEO-EXPORT-FOCUS.md), and [recovery/Save availability](RECOVERY-CONSISTENCY.md).
The earlier restored-project `*` expectation was corrected without a runtime
change; the subsequently reproduced endpoint, focus and storage failures needed
their own contracted repairs. The current parent candidate includes those
repairs. Its final combined result belongs to the checkpoint report.

```sh
node --import tsx --test src/bridge/*.test.ts src/video/video-timeline.test.ts src/video/video-media-bin.test.ts src/video/video-field-edit.test.ts src/cad/cad-viewport-capture.test.ts src/cad/cad-viewport.test.ts src/app/app-shell-bridge.test.ts src/app/app-shell.test.ts
# 60 tests; 60 pass; 0 fail
node node_modules/@playwright/test/cli.js test --config src/bridge/bridge.playwright.config.ts
# isolated production build: 9 passed (14.0 s), Chrome 154.0.8037.97 on Linux, 1280×720
node node_modules/typescript/bin/tsc --noEmit
# exit 0
node --import tsx src/bridge/bridge-core.demo.ts
```

The core demo's actual output:

```text
D02 composite: 128,0,127,255,0,255,0,128 | source layers: 2
D01 owned copy: true
D05/V02 PNG: exact straight RGBA | media: 1 | clips: 0 | frame: 1280x720 | native round trip: true
```

For an interactive demo, start the ordinary local Vite dev server with an unused port:

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4195 --strictPort
```

Open `http://127.0.0.1:4195/src/bridge/bridge-raster.demo.html` and choose **Run captures**. It reports CAD alpha/fringe/state metrics, three Video frames, failure/cleanup results and PNG byte length using the same fixture exercised by the real-browser raster tests. The standalone page is demo-only and excluded from the app entry. Open `http://127.0.0.1:4195/src/bridge/bridge-workspace.demo.html` for the real Image/Video/CAD assembly. Create/draw an Image, use **Image → Send image to Video bin**, place its bin item, then use **Video → Send current frame to Image**. Create/extrude a CAD rectangle and use **Solid → Send transparent view to Image…**. Save/reopen each native file using the ordinary shared controls. These demos use local browser storage at their origin; a snapshot is not a saved file. Both HTML entries also passed an isolated Vite build; their underlying capture/workspace fixtures are the tested browser entries.

The dedicated browser harness creates/deletes an isolated temporary build and serves it at **4194**; it never rebuilds shared `dist`. After a coordinated production build, this command uses the actual full-app `dist` for the workspace cases:

```sh
BRIDGE_WORKSPACE_APP=1 node node_modules/@playwright/test/cli.js test --config src/bridge/bridge.playwright.config.ts bridge-workspace.browser.spec.ts
```

Do not run another bridge server concurrently. The cases include native Save/New/Open, exact stored container-byte acknowledgment followed by page reload, byte-identical recovered Video/Image, source editability/history, target undo/redo, storage failure, pending selection, CAD dialog staleness, trimmed End pixels and real WebM export→import→capture. Recovery intentionally marks restored projects unsaved; the reload test expects that marker. The Save-after-Redo regression retains its immediate shortcut and exact native-byte assertions and passes in the final 89-case [combined gate](MODELING-OFFLINE-CHECKPOINT.md).

Evidence: [focused unit output](evidence/cross-workspace-unit.log), [12-module structural check](evidence/cross-workspace-modules.log), [core demo output](evidence/cross-workspace-demo.log), [isolated Chrome output](evidence/cross-workspace-isolated-browser.log), [browser/WebGL environment](evidence/cross-workspace-browser-environment.json), and [reviewed full-app CAD screenshot](evidence/cross-workspace-cad.png). Chrome's normal headless launch on this Linux host reports ANGLE/Vulkan SwiftShader, WebGL 2.0 and antialiasing enabled; this does not establish coverage on other hardware GPUs. Screenshot review at 1280×720 confirms the complete CAD plate appears inside an editable Image layer, with visible checkerboard around all sides and ordinary native/history controls. Pixel correctness comes from assertions, not visual inspection.

Requirement disposition: the parent reviewed the full procedures and credited **XWS-001 PASS** for exact whole-image PNG/bin transfer plus native reopen and one-step undo/redo, and **XWS-003 PASS** for transparent parametric/imported CAD capture plus editable unchanged sources/native Image reopen. **XWS-002 remains UNTESTED** until Video corrections are implemented and included in capture tests. The separate [offline gate](OFFLINE-WORKFLOW.md#current-combined-offline-gate) also passes for this candidate; live hosted deployment, other browser/GPU implementations and native platform launcher acceptance remain separate. Full-app requests are checked for foreign HTTP origins; no upload/network transfer path was introduced. These credits do not establish full Video or consumer acceptance.
