# Cross-workspace snapshot transfers

Parent review (2026-11-13): this map is approved for the owner-authorized BATCH after commit. Every implementation and acceptance gate remains unverified until its named tests run. No acceptance is delegated.

Status: **PLAN — not implemented or verified**. Scope is the three original actions in N-006 / XWS-001–003; it does not expand them into a general clipboard, live link or export service. Parent review and a committed contract precede implementation under BATCH. Reuse D01–D05 and assembly A-D-Bridge from [MODULE_MAP-MEDIA.md](MODULE_MAP-MEDIA.md), and C35 from [MODULE_MAP-CAD.md](MODULE_MAP-CAD.md). The refinements below bind those planned contracts to the working editors; they do not mark their larger planned dependencies GREEN.

## User behavior and preservation

| Command | Source snapshot | Destination |
|---|---|---|
| `bridge.imageToVideo` — Send to Video bin | Entire committed Image composite, all visible layers and supported blends, original pixel dimensions and alpha | A named still in the current Video bin; one undoable append. No automatic timeline clip, project resize or frame-rate change. Create an empty Video project if absent. |
| `bridge.videoFrameToImage` — Send current frame to Image | Current timeline time after pausing playback and waiting for its decoded frame; full project resolution, letterbox, fades and title overlays | A new unsaved Image project with one editable raster layer. |
| `bridge.cadToImage` — Send transparent view to Image… | Committed solid geometry and current camera; explicit pixel dimensions, transparent background, no editing overlays | A new unsaved Image project with one editable raster layer. |

These are independent copies. Source layers, CAD features/imported STEP assets, Video clips, file handles and undo/redo remain editable and unchanged by capture. Normal flushing may first commit an already-authored valid field edit through its existing history path; capture itself creates no source edit. A floating Image selection, live stroke/shape/opacity preview, open modal, unresolved CAD preview/rebuild, pending media import or invalid field blocks transfer with “Finish or cancel the current edit, then send again.” Do not silently place a selection, cancel a preview, call an export command with editing side effects, or render a different snapshot into an editor to obtain pixels.

For a new Image target, use the existing New/Open replacement semantics: flush pending target input, retain a dirty prior project in Recent only after its exact revision has a successful durable backup, or use the existing safe replacement fallback when no Recent port exists. Failed/denied/quota storage keeps that project open with an actionable error. The new project has a fresh ID and no inherited save-file handle. Its history starts fresh; reopening another project does **not** restore an old undo chain. Persistent history across separate documents is outside this increment. Source history is preserved, and an append to an existing Video bin has exactly one target undo step.

Switch to the destination only after successful application. Cancellation, unsupported capture, stale state or failed replacement leaves both projects and the current workspace intact. Ordinary target dirty/recovery/save status remains truthful; copying into a project does not mean a file has been saved. No upload, remote image, download, source-file overwrite or clipboard permission is needed.

## Current seams and necessary corrections

| Working seam | Evidence / required refinement |
|---|---|
| `image-content.ts`, `image-composite.ts`, `raster-ops.ts` | Native Image layers already preserve straight-alpha RGBA bytes. Resolve committed layer tiles into owned rasters and call the pure compositor. The private `image-workspace.ts` `flattened()` reads mutable working buffers, and export places floating selections; neither is the transfer entry point. Image currently has no pending-edit flush/readiness contract. |
| `video-timeline.ts` | `media` and `bytes` already serialize unplaced stills. `add-media` also appends a clip and may resize the first timeline; clip deletion currently prunes every unused media record. Add bin-only import/place/remove semantics, retain unused bin assets, and reject bin removal while referenced. Native version 1 can retain these records without inventing a new schema. |
| `video-workspace.ts` | There is no visible media bin. Bind the minimum V31 list/thumbnail/size/place/remove UI; preserve existing local import behavior. Current preview uses an opaque black full-size canvas, but setting `currentTime` and immediately reading that canvas can return the previous decoded frame. D03 must await the requested source frame and compose it explicitly. |
| `cad-viewport.ts` (C56), parametric/imported views | Both editors own the same viewport type; the imported view supplies an aggregate preview containing every source body. The renderer uses `alpha:false`, an opaque background and no capture API. C35 needs a typed live capture capability and a transparent render pass. Do not infer alpha from background color or use a global canvas lookup. |
| `app/app-shell.ts` | Host `open` is scoped to its own workspace; `commit` currently returns no acknowledgment. The shell owns epochs, revision identities, pending-input flushing, replacement permission and storage acknowledgments. Add a narrow transfer route here; do not let a source view directly replace another view's document. Hidden views may be stale and must not be used as the target document store. |

## Typed transfer boundary — D01

Proposed names and discriminants are the implementation contract. The route determines the only allowed source and destination; runtime validation rejects fabricated combinations as well as malformed pixels.

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
type TransferResult =
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
| V02 / V31 prerequisite — current `video-timeline.ts` and new `video/media-bin-adapter.ts` | Bin-only generated PNG import; explicit placement (default 3 seconds) and unreferenced removal. Existing `Media.id` keys `bytes`; native encode maps it to asset `media-${id}`. Preserve all unplaced assets on clip deletion. Bin UI remains accessible with an empty timeline. | Unplaced asset native round trip; no resize/clip on import; place/remove/undo; reject referenced removal; deleting last clip retains its source. |
| C35 `cad/cad-viewport-capture.ts` — SHELL | Typed live C56 capture port + size + committed preview/document stamp and camera stamp → straight-alpha sRGB `ViewportCapture`. D04 consumes it. This is a bounded extension of C56, not completion of planned C31. | Real Chrome transparent offscreen capture, all imported bodies, camera, orientation, color, context failure and state restoration. |
| D03 `bridge/video-source-adapter.ts` — SHELL | Typed frame-readiness/compositor port + source/playhead stamp + abort signal → full project-resolution transfer. No DOM query or blind display-canvas read. | Distinct adjacent video-frame fixture, pending seek, fades/title, stale seek and decode failure. |
| D04 `bridge/cad-source-adapter.ts` — SHELL | Live typed C35 port + source stamp/label/size + abort signal → validated CAD transfer; no hidden viewport registry. | Stale geometry, same-geometry new document identity, camera change, lost context, cancellation. |
| D05 `bridge/destination-adapter.ts` — SHELL | Validated transfer + explicit current target snapshot and caller-issued IDs → candidate new Image document **or** generated PNG/media pair for a bin edit. No live mutation, UI navigation, storage writes or hidden global state. Image uses `imageContent`; Video uses current media/bytes/native mapping. | Independent decoded PNG pixels/alpha/size; Image raw-layer native round trip; encode failure leaves both candidates unapplied. |
| A-D-Bridge `bridge/workspace-bridge.ts` + narrow app/editor wiring — SHELL assembly | Coordinate source/target readiness, capture, materialization, cancellation and shell-authorized compare-and-apply. The shell remains the only owner of state replacement and history. | Controlled async races/storage failures first, then full production browser workflows. |

For D05, PNG must preserve the straight RGBA bytes, including low alpha. There is no reusable PNG encoder in the current source or dependency set. A Canvas put/read/toBlob path is not an assumed byte-exact codec because of premultiplication. Spike a small bounded PNG encoder using local byte assembly and browser `CompressionStream('deflate')`, with CRC/chunk/scanline policy isolated as a helper brick if needed; verify it with an independent decoder and known fixtures before selecting it. If unavailable, report the capability gap. Adding a dependency or changing this codec contract needs parent review; never substitute JPEG or an opaque matte silently.

## Source and destination lifecycle

The proposed host addition is `transfer(intent: TransferIntent): Promise<TransferResult>`, scoped to the mounted source workspace. A narrow optional editor bridge port provides synchronous `prepare(role)` readiness, a view-revision getter, and source `capture({intent, stamp, signal})`. `prepare` may report a pending edit but must not mutate previews. Existing `flush()` commits ordinary pending fields first; a blocked gesture/modal stays editable. Capture takes only the explicitly stamped committed snapshot and view state. D05 receives the target value from the shell, never a hidden view's cached `current` variable.

1. Reject unavailable directions, active dialog/capture/export or unresolved recovery. Flush ordinary source input, call its readiness port, and record source ID/identity/epoch plus view revision. For Video, pause first and freeze the requested time; pausing changes playback only, not document history.
2. Prepare the destination before reading its snapshot. Flush any mounted target editor's pending input and reject unfinished gestures. Record target identity/epoch or absence. Do not mount or render it merely to force pending state into a snapshot.
3. Capture into owned bytes, validate D01, then materialize a candidate with D05. After every await, reject a changed source/document/view, changed target, disposed shell or aborted request. A workspace switch or new transfer intent aborts the old request; late callbacks cannot navigate back or apply data.
4. For a new Image (or absent Video), call the existing shared replacement guard and validate the candidate through its adapter. Recheck all source and target tokens **after** asynchronous backup/consent and immediately before replacement. For existing Video, validate the bin-only candidate and apply exactly one compare-and-swap history edit using its current identity. The shared apply operation must acknowledge success rather than treating a void/stale `commit` as success.
5. Only an acknowledged application switches workspace and reports success. Keep prior source state and handles. Begin normal target recovery/Recent persistence and retain ordinary dirty/unload warnings; failed target backup is not described as saved. Release resources in `finally`.

The proposed C35 port is internal to the CAD shell; its live Three.js capabilities never cross D01. `read()` fails when there is no ready committed solid, and grants C35 access only for the guarded capture call. C35 clones the camera state, reads the expected identities before and after rendering, and returns owned pixels. Both CAD assemblies supply the document identity; C56 increments `viewRevision` for committed preview, camera, framing or appearance changes. A plane/unit change invalidates capture even if physical triangles are unchanged.

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

CAD capture defaults to the current drawing-buffer pixel dimensions, displayed explicitly; keep aspect locked so another size changes resolution rather than framing. Reject an over-budget default with a request for a smaller size. Use the same committed camera/material/solid preview, including every imported body's triangles. Render with transparent clear color to an offscreen target, excluding grid, selection and manipulators. Establish antialiased edge alpha with a tested multisample target or bounded supersampling; unsupported/budget-exceeding capture fails visibly. Correct readback row order, output color space and premultiplied-to-straight alpha explicitly. Restore renderer target, clear/background, viewport/scissor, camera and overlay visibility even on error. A screenshot of the existing opaque viewport and background color-keying cannot satisfy C35. CAD owner confirmed both current views expose a suitable local viewport seam and prefers committed preview identity plus camera snapshot/stale rejection. The concrete port replaces the old `viewport:object`/numeric revision placeholder; it does not duplicate CAD's geometry or sketch-frame contract.

D03 waits for a decoded frame matching the requested source time, using media readiness/seek and frame callbacks where available, with abort and a finite timeout. It invokes the same full-resolution composition path as Video preview, including its black letterbox/fade background and titles. Output alpha is therefore opaque. A frame from before a seek must never masquerade as the current frame. The current HTML media pipeline does not establish frame-exact demux guarantees; test the actual supported browser and report seek limitations. The current Video editor also has no correction stage: original V-XWS-002 requires a title **and correction**, so that full verification stays open until the planned correction path exists and passes the same capture test.

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

Planned verification commands: focused `node --import tsx --test` suites for each new brick and existing Image/Video/CAD/shared tests; a dedicated bridge Playwright fixture with deferred ports for races; then coordinated full-app production browser tests and `tsc --noEmit`. Test source files, measured results and evidence paths are recorded only after they exist. No source code, dependencies, native formats or shared `dist` were changed while preparing this plan.
