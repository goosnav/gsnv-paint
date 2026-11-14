# Module map: Image, Video, workspace transfer and distribution

Mode A only. This document fixes contracts; it creates no application modules, stubs, tests or build configuration. All listed bricks are **PLANNED** except the D20 working Image increment (I50–I53, IMAGE-APP), which is GREEN. Implementation is authorized only in the current phase after the main map is committed, under the user's BATCH instruction. GREEN is evidence, not user acceptance.

## Rules and component association

Each brick is one implementation file with one public entry point, at most three public symbols, one named request argument, a sibling testbench and a separate demo. The soft implementation limit is 200 lines; the hard limit is 300. Every listed dependency must already be GREEN in the authorized batch; unbuilt calls, widened contracts, surprise dependencies, failing checks, or exceeded limits halt the batch. Dependency injection does not erase a dependency: the lists below name actual collaborators. Boundary types defined here are contract vocabulary, not permission to create a type-only scaffolding package.

CORE returns deterministic values and never imports DOM, Canvas, WebGL, codecs, storage, file APIs, clocks or workers. SHELL translates platform I/O and reports errors; it does not decide pixel, selection, timeline or animation behavior. Integration assemblies, explicitly listed at the end, may wire many GREEN bricks but contain no business logic.

| Architectural component | Concrete ownership |
| --- | --- |
| ImageDocument | I05, I07, I08, I17, I20, I36; document/layer/text structure, versioned project records, clipboard edits |
| ImagePixels | I01–I04, I06, I09–I16, I18–I19, I21–I25; pure pixel, selection, transform and adjustment mathematics |
| ImageViewport | I26–I35, I37; view plans, raster I/O, Canvas and interaction adapters |
| VideoTimeline | V01–V16, V36; timeline state, time arithmetic, effects, animation, clipboard and playback/export plans |
| VideoMedia | V17–V24; capability checks, bounded reads, container/codec/audio/graphics adapters and media discovery |
| VideoPreviewExport | V25–V35; sinks, exports, preview, title rasterization and their controls |
| WorkspaceBridge | D01–D05; the three explicitly requested transfers |
| Distribution | D06–D21; asset rules, offline cache, static server, M1a launcher/runtime/ZIP responsibilities |

Cross-phase ports have concrete owners: `HistoryPort` is S01, `ProjectEnvelopePort` is S03, `ViewTransformPort` is S04, `NativeContainerPort` is S15, and `CadCapturePort` is C35. The assembly routes each committed `ImageChange` or `TimelineChange` through S01. Workspace format bricks produce `{project:ProjectEnvelope,assets:NativeAsset[]}`: only JSON-compatible metadata reaches S03; tiles and masks are distinct binary assets; S15 frames the native container. S13/S14 transfer native container bytes for real files/recovery. These are not undeclared calls inside a brick. Existing shared shell controls provide menu/shortcut dispatch, context menus, tooltip/status text, numeric controls, modal preview/commit/cancel and recovery. Media-specific adapters below supply exact commands and presentation data. Any different association discovered in the main map is a contract correction before implementation.

## Shared boundary vocabulary

Unless stated otherwise: IDs are nonempty opaque strings; dimensions are positive integers; coordinates and amounts are finite numbers; rectangles have nonnegative extent; colors are straight-alpha sRGB bytes `[r,g,b,a]`; pixel math uses explicit integer rounding specified by its testbench. Public records are immutable; returned deltas describe changed tiles/records rather than whole-document copies. Invalid input never partly mutates a document. Pixel and timeline policy stays deterministic across browser and headless tests.

- `PixelSurface = {width:number,height:number,tileSize:256,tiles:ReadonlyMap<TileKey,Uint8ClampedArray>}`; each present tile has 256×256×4 bytes; missing tiles are transparent; edge access clips to dimensions. `PixelPatch = {bounds:Rect,tiles:ReadonlyMap<TileKey,Uint8ClampedArray>}`. `CoverageMask = {width,height,tiles:ReadonlyMap<TileKey,Uint8Array>}` uses 0…255 coverage. `ImageChange = {label:string,forward:readonly ImageDelta[],inverse:readonly ImageDelta[],dirtyBounds:Rect[]}`.
- `ImageDocument = {format:'gsnv-image',version:1,id,revision:bigint,width,height,layers:readonly ImageLayer[],selection:CoverageMask,guides:readonly Guide[],grid:GridSettings,activeLayerId:string}`. `ImageLayer = {id,name,kind:'raster'|'text',visible:boolean,locked:boolean,alphaLocked:boolean,opacity:number,blend:BlendMode,pixels?:PixelSurface,text?:TextRun,mask?:CoverageMask}`. `BlendMode` is exactly normal/multiply/screen/overlay/darken/lighten/difference. Text raster caches are derived, not editable source.
- `TextRun = {text,fontFamily,fontSize,bold,italic,align:'left'|'center'|'right',color,transform:Affine2D}`. `Affine2D` is a six-number nonsingular affine matrix; resize operations separately support zero-area rejection. `Anchor` is one of nine compass/center anchors. `LayerCommand` is add/delete/duplicate/reorder/merge-down/flatten/visibility/lock/alpha-lock/opacity/blend/mask-set/mask-delete; payloads carry referenced IDs and exact values.
- `StrokeSample = {x,y,pressure:number,timeMs:number}`; pressure is 0…1 and sample time is monotonic. `BrushSettings = {kind:'pencil'|'brush'|'eraser'|'clone',size,hardness,opacity,flow,smoothing,pressureSize:boolean,pressureOpacity:boolean,color}`. `CloneSource = {source:PixelSurface,sourcePoint:Point,destinationPoint:Point,aligned:boolean}`. `SelectionCombine` is replace/add/subtract/intersect.
- `ImageToolIntent` is a discriminated record from the exact image tools in the user brief: begin/sample/end/cancel a brush or clone stroke; set clone source; pick foreground/background; flood/gradient; define shape/text; move/crop; selection gestures; transform handles; hand/zoom; set guide/grid. Each gesture carries document coordinates and any Shift/Ctrl modifiers; every drag has a corresponding absolute numeric command. Clipboard/paste/drop produces an imported image or image-layer payload, not a network request.
- `ImageForm = {family:'brush'|'shape'|'text'|'color'|'layers'|'selection'|'transform'|'adjustment'|'resize'|'export',fields:readonly FieldDescriptor[],previewId:string}`; `FormEvent = {tag:'preview'|'commit'|'cancel',previewId,values:Record<string,number|string|boolean>}`. Descriptor schemas restrict fields to the operations defined below, rather than accepting arbitrary executable commands.
- `FrameTime = {frame:bigint,rate:{num:bigint,den:bigint}}`; project fps is a positive rational; all timeline positions and durations are integer frames. `MediaRef = {id,name,kind:'video'|'audio'|'image',size:bigint,fingerprint:string,locatorId?:string,assetId?:string,metadata:MediaMetadata}`. `MediaMetadata = {durationFrames,width?,height?,sampleRate?,channels?,codec?,timeBase?}`; no original media bytes live in the timeline document.
- `VideoDocument = {format:'gsnv-video',version:1,id,revision:bigint,settings:ProjectSettings,media:readonly MediaRef[],tracks:readonly Track[],clips:readonly Clip[],markers:readonly Marker[],inFrame:bigint,outFrame:bigint|null}`. `Track = {id,kind:'video'|'audio',name,muted,solo,locked,hidden}`. `Clip = {id,trackId,sourceId,start,duration,sourceIn,speed:{num,den},linkId?:string,properties:ClipProperties,keyframes:readonly Keyframe[],transition?:Transition,title?:TitleSpec,solid?:RGBA}`. `TimelineChange` contains label plus reversible record deltas.
- `ClipProperties = {x,y,scaleX,scaleY,rotation,opacity,crop:{left,top,right,bottom},volume,fadeInFrames,fadeOutFrames,brightness,contrast,saturation,temperature,blur,blackAndWhite,chromaKey?:{color,tolerance,softness}}`. Speed must be 0.25…4. `Keyframe = {property:'x'|'y'|'scaleX'|'scaleY'|'rotation'|'opacity'|'volume',frame:bigint,value:number,interpolation:'linear'|'ease'}`.
- `Transition = {kind:'cross-dissolve'|'dip-black'|'dip-white'|'wipe'|'slide',durationFrames:bigint,direction:'left'|'right'|'up'|'down'}`. `TitleSpec = {text,fontFamily,fontSize,color,outline:{width,color},shadow:{x,y,blur,color},background:{enabled,color,padding},fadeInFrames,fadeOutFrames}`.
- `FramePlan = {frame,timestampUs:bigint,durationUs:bigint,layers:readonly RenderLayer[],audio:readonly AudioSpan[]}` contains already evaluated transforms, opacity, crops, transition clips and correction parameters. `AudioSpan = {sourceId,sourceStartSample,sampleCount,outputStartSample,gainEnvelope:Float32Array,speed}`. `AudioBlock = {sampleRate,channels:readonly Float32Array[],startSample:bigint}`.
- `CodecReport = {secureContext:boolean,worker:boolean,video:readonly CodecCapability[],audio:readonly CodecCapability[],reasons:readonly Diagnostic[]}` records tested exact configurations. `MediaLease` is an opaque File/FileSystemFileHandle-backed lease with a known size; `ReadWindow = {offset:bigint,length:number}` is bounded. `EncodedPacket = {streamId,codec,timestampUs,durationUs,key:boolean,data:Uint8Array,decoderConfig?:unknown}` has owned bytes; browser codec handles remain in SHELL.
- `RenderedFrame = {frame,timestampUs,durationUs,pixels:PixelSurface|OwnedVideoFrame}`; `OwnedVideoFrame` is an opaque shell resource with explicit ownership and close responsibility. `ExportJob = {id,format:'mp4'|'webm',videoConfig,audioConfig,range,quality,frames:AsyncIterable<RenderedFrame>,audio:AsyncIterable<AudioBlock>,sink:OutputSink,signal:AbortSignal,onProgress:(progress:Progress)=>void}`. Async iterables/callbacks are shell boundaries; CORE instead consumes finite values or explicit next-step requests.
- `Diagnostic = {code:string,message:string,subjectId?:string}`; `Progress = {jobId,completed:bigint,total:bigint,stage:string}`. An unavailable capability is an explicit diagnostic, never a success value. Cancellation releases owned buffers, workers/codecs and incomplete output without committing history.

## Phase 3 — Image bricks, leaves first

### I01 `image/pixel-tiles.ts` — CORE — PLANNED
Purpose: Hide sparse tile storage and reversible rectangular pixel edits.
IN: `PixelTileRequest{tag:'create'|'read'|'patch',size?,surface?,bounds?,pixels?}` with valid bounds and byte lengths.
OUT: `PixelTileResult{surface?,pixels?,change?:PixelPatch,inverse?:PixelPatch}`; transparent missing tiles and clipped edges are consistent.
RAISES: `PixelSizeError` for invalid dimensions/length; `PixelBoundsError` for invalid rectangles. DEPS: none.

### I02 `image/color.ts` — CORE — PLANNED
Purpose: Convert and manage the explicitly supported color representations.
IN: `ColorRequest{tag:'rgb'|'hsv'|'hex'|'swap'|'reset'|'palette'|'recent',value,state?:{foreground,background,palette,recent}}`; RGB bytes/HSV ranges/hex syntax must be valid.
OUT: `ColorResult{rgba,hsv,hex,state?}`; X swaps and D restores black/white; recent colors deduplicate deterministically.
RAISES: `ColorSyntaxError` or `ColorRangeError` for malformed/out-of-range input. DEPS: none.

### I03 `image/selection-raster.ts` — CORE — PLANNED
Purpose: Rasterize geometric selection coverage.
IN: `SelectionShapeRequest{size,shape:{tag:'rectangle'|'ellipse'|'freehand'|'polygon',points:Point[]}}` with enough finite points for its tag.
OUT: `CoverageMask` bounded to the image with fixed edge-coverage rules.
RAISES: `SelectionShapeError` for degenerate or insufficient geometry. DEPS: none.

### I04 `image/selection-algebra.ts` — CORE — PLANNED
Purpose: Combine and refine selection masks.
IN: `SelectionRequest{mask,tag:'combine'|'feather'|'grow'|'shrink'|'invert'|'all'|'none',other?,mode?:SelectionCombine,radius?}` with matching dimensions and nonnegative radius.
OUT: `{mask:CoverageMask,inverse:CoverageMask}`; replace/add/subtract/intersect and edge morphology have fixed byte rounding.
RAISES: `MaskSizeError` for mismatch; `SelectionRadiusError` for invalid radius. DEPS: none.

### I05 `image/layer-stack.ts` — CORE — PLANNED
Purpose: Change layer order and editable layer properties without compositing pixels.
IN: `LayerStackRequest{layers,activeLayerId,command:Exclude<LayerCommand,'merge-down'|'flatten'>}` with unique IDs and supplied pixels/text for additions.
OUT: `{layers,activeLayerId,change:ImageChange}`; locks/alpha locks/masks/visibility/opacity are preserved through duplicate and reorder.
RAISES: `LayerMissingError`, `LayerOrderError`, `LayerValueError`, `LayerLockedError` for invalid references/order/properties or forbidden edits. DEPS: none.

### I06 `image/composite.ts` — CORE — PLANNED
Purpose: Composite raster/text-cache layers and produce merge/flatten pixels.
IN: `CompositeRequest{layers:readonly ResolvedRasterLayer[],bounds,tag:'preview'|'merge-down'|'flatten',targetId?}`; all text layers have explicit raster caches, masks match, and the target exists.
OUT: `{pixels:PixelSurface,layerReplacement?:ImageLayer[]}` applying the seven blend modes, coverage and opacity deterministically.
RAISES: `CompositeBoundsError`, `UnresolvedTextError`, `MergeTargetError` for invalid bounds, missing cache or unavailable lower layer. DEPS: I01.

### I07 `image/document.ts` — CORE — PLANNED
Purpose: Validate image structure and create a document with the requested size/background.
IN: `ImageDocumentRequest{tag:'new'|'validate'|'apply',size?,background?:RGBA|'transparent',document?,deltas?:ImageDelta[],baseRevision?:bigint}`; apply requires baseRevision matching document.revision.
OUT: `{document:ImageDocument,change?:ImageChange}` with exactly valid layer references, bounds and selection size; failed apply is atomic.
RAISES: `ImageDocumentError` for malformed state; `ImageRevisionError` for a stale base; `ImageDeltaError` for invalid replacement data. DEPS: I01, I05.

### I08 `image/project-format.ts` — CORE — PLANNED
Purpose: Map editable image state to JSON metadata plus separate binary tile/mask assets.
IN: `ImageProjectRequest{tag:'encode',document:ImageDocument}|{tag:'decode',package:NativePackage}`; manifest metadata fits S03's 64 MiB JSON limit; S15 enforces the 2 GiB total container and 20,000-asset limits. A 4000×4000, 20-layer fixture with masks must fit without base64.
OUT: `{package?:NativePackage,document?:ImageDocument}` preserving tiles, structured text, masks, layer properties, selection, guides and grid. Metadata contains stable asset IDs and lengths; typed arrays/Maps never enter S03; revision is a decimal string in JSON. S15 carries the resulting binary assets without base64 inflation.
RAISES: `ImageFormatError`, `ImageVersionError`, `ImageTruncatedError`, `ImageResourceLimitError`; rejection never replaces the active document. DEPS: I07, S03.

### I09 `image/stroke-sampling.ts` — CORE — PLANNED
Purpose: Turn pointer samples into deterministic pressure-aware stroke dabs.
IN: `StrokeSamplingRequest{samples:readonly StrokeSample[],settings:BrushSettings,previous?:StrokeCarry}`; finite monotonic samples, size >0, unit-range settings.
OUT: `{dabs:readonly Dab[],carry:StrokeCarry}` with bounded spacing, optional smoothing and pressure-controlled size/opacity independent of display refresh.
RAISES: `StrokeSampleError` or `BrushSettingError` for invalid samples/settings. DEPS: none.

### I10 `image/brush-tip.ts` — CORE — PLANNED
Purpose: Produce a pencil or soft brush coverage stamp.
IN: `BrushTipRequest{kind:'pencil'|'brush'|'eraser'|'clone',size,hardness,opacity,flow,subpixelOffset}` with valid ranges.
OUT: `{bounds,coverage:Uint8Array}`; pencil has hard pixel edges and all other tips follow documented falloff/flow equations.
RAISES: `BrushTipError` for invalid size/ranges. DEPS: none.

### I11 `image/clone-source.ts` — CORE — PLANNED
Purpose: Resolve clone source pixels for a supplied destination dab.
IN: `CloneRequest{source:CloneSource,destinationBounds:Rect,strokeStart:Point}` referencing an immutable source snapshot.
OUT: `{pixels:PixelPatch,nextSourcePoint:Point}` using aligned/unaligned mapping and transparent out-of-bounds source coverage.
RAISES: `CloneSourceError` for invalid source/reference coordinates. DEPS: I01.

### I12 `image/stroke-paint.ts` — CORE — PLANNED
Purpose: Apply supplied stroke dabs as reversible selected/locked-alpha pixel changes.
IN: `StrokePaintRequest{target:PixelSurface,dabs:readonly Dab[],tips:readonly TipCoverage[],selection:CoverageMask,alphaLocked:boolean,color:RGBA,mode:'paint'|'erase'|'clone',clonePatches?:readonly PixelPatch[]}`; dabs/tips/source patches correspond exactly.
OUT: `{surface:PixelSurface,change:ImageChange}` with untouched unselected pixels and preserved destination alpha under alpha lock.
RAISES: `StrokeCoverageError`, `StrokeSourceError`, `MaskSizeError` for missing dab coverage/source or mismatched masks. DEPS: I01.

### I13 `image/flood-region.ts` — CORE — PLANNED
Purpose: Find tolerance-based contiguous or whole-image color regions for bucket, wand and select-by-color.
IN: `FloodRequest{sample:PixelSurface,point:Point,tolerance:number,contiguous:boolean}`; assembly supplies active-layer or all-layer composite sample explicitly.
OUT: `CoverageMask` with the documented RGBA-distance rule; bucket painting is a downstream selected pixel operation.
RAISES: `FloodPointError`, `FloodToleranceError` for outside seeds/invalid tolerance. DEPS: I01.

### I14 `image/gradient.ts` — CORE — PLANNED
Purpose: Generate selected linear/radial fill pixels.
IN: `GradientRequest{target,selection,kind:'solid'|'linear'|'radial',start:Point,end:Point,foreground:RGBA,background:RGBA,alphaLocked:boolean}`; selection matches target.
OUT: `{surface:PixelSurface,change:ImageChange}` with fixed interpolation and clipped selected coverage.
RAISES: `GradientGeometryError` for a zero-length non-solid gradient; `MaskSizeError` for mismatch. DEPS: I01.

### I15 `image/shape-outline.ts` — CORE — PLANNED
Purpose: Describe only the requested raster shape geometry.
IN: `ShapeRequest{kind:'line'|'rectangle'|'rounded-rectangle'|'ellipse'|'polygon',points:Point[],cornerRadius:number,strokeWidth:number,stroke:RGBA,fill:RGBA|null}` with tag-appropriate finite points and nonnegative widths/radius.
OUT: `RasterShapePlan{contours:readonly Contour[],strokeWidth,stroke,fill,bounds}` with deterministic curve subdivision and closed filled boundaries.
RAISES: `ShapeGeometryError` or `ShapeStyleError` for malformed/degenerate input. DEPS: none.

### I16 `image/shape-paint.ts` — CORE — PLANNED
Purpose: Rasterize a supplied shape plan into selected layer pixels.
IN: `ShapePaintRequest{target,selection,plan:RasterShapePlan,alphaLocked:boolean}` with matching dimensions and a validated plan.
OUT: `{surface:PixelSurface,change:ImageChange}` using fixed coverage rules and fill-before-stroke ordering.
RAISES: `ShapePlanError`, `MaskSizeError` for invalid contours/masks. DEPS: I01.

### I17 `image/text-model.ts` — CORE — PLANNED
Purpose: Keep image text editable until explicit rasterization.
IN: `TextRequest{tag:'create'|'edit'|'rasterize',layer?:ImageLayer,run?:TextRun,raster?:PixelSurface}`; rasterize requires a completed text raster and an unlocked text layer.
OUT: `{layer:ImageLayer,change:ImageChange}`; only rasterize changes kind from text to raster.
RAISES: `TextValueError`, `TextLayerError`, `LayerLockedError`, `TextRasterMissingError`. DEPS: none.

### I18 `image/affine-transform.ts` — CORE — PLANNED
Purpose: Resolve selection/layer transform handles and typed transforms into one affine plan.
IN: `TransformRequest{bounds,pivot,tag:'move'|'scale'|'rotate'|'skew'|'flip-horizontal'|'flip-vertical',values:TransformValues,constrain:boolean}` with finite values and nonzero scale.
OUT: `TransformPlan{forward:Affine2D,inverse:Affine2D,bounds,pivot}`; Shift and typed inputs resolve through identical constraints.
RAISES: `TransformSingularError`, `TransformValueError` for singular/out-of-range input. DEPS: none.

### I19 `image/resample.ts` — CORE — PLANNED
Purpose: Sample pixels for image resizing and free transforms.
IN: `ResampleRequest{source:PixelSurface,targetSize,transform:TransformPlan,method:'nearest'|'bilinear'|'bicubic',selection?:CoverageMask}` with bounded dimensions and invertible transform.
OUT: `PixelSurface` with documented premultiplied sampling/unpremultiplication and edge policy; unchanged regions remain exact.
RAISES: `ResampleSizeError`, `ResampleTransformError`, `MaskSizeError`. DEPS: I01.

### I20 `image/canvas-bounds.ts` — CORE — PLANNED
Purpose: Plan crop and anchored canvas resize across layers, masks, text and guides.
IN: `CanvasBoundsRequest{document:ImageDocument,tag:'crop'|'canvas-resize',rect?:Rect,size?,anchor?:Anchor,background?:RGBA}` with nonempty output bounds.
OUT: `ImageChange` containing translated/clipped layer bounds, masks, selection and guides; the assembly applies resulting pixel work through I01/I19.
RAISES: `CanvasBoundsError` for invalid/empty dimensions; `CanvasAnchorError` for missing resize anchor. DEPS: none.

### I21 `image/point-adjustments.ts` — CORE — PLANNED
Purpose: Apply pointwise brightness/contrast, HSL, color balance, invert, desaturate, threshold and posterize.
IN: `PointAdjustmentRequest{pixels:PixelPatch,selection:CoverageMask,operation:BrightnessContrast|Hsl|ColorBalance|Invert|Desaturate|Threshold|Posterize}` with exact operation-specific numeric fields/ranges documented in its contract test cases.
OUT: `PixelPatch` with unchanged alpha unless explicitly requested by another brick and deterministic byte rounding.
RAISES: `AdjustmentValueError`, `MaskSizeError` for invalid numeric values or coverage. DEPS: I02.

### I22 `image/tone-curves.ts` — CORE — PLANNED
Purpose: Generate and apply levels/curves lookup tables.
IN: `ToneRequest{pixels,selection,operation:{tag:'levels',black,white,gamma,outputBlack,outputWhite}|{tag:'curves',channel:'rgb'|'r'|'g'|'b',points:readonly Point[]}}`; levels order and curve x coordinates are strictly valid.
OUT: `{pixels:PixelPatch,lut:Uint8Array}`; LUT endpoints, interpolation and clipping are deterministic.
RAISES: `LevelsRangeError`, `CurvePointError`, `MaskSizeError`. DEPS: none.

### I23 `image/convolution.ts` — CORE — PLANNED
Purpose: Apply Gaussian blur or sharpen with bounded tile halos.
IN: `ConvolutionRequest{source:PixelSurface,bounds,selection,operation:{tag:'gaussian-blur',radius:number}|{tag:'sharpen',amount:number,radius:number}}` with nonnegative bounded radius/amount.
OUT: `PixelPatch` equal to full-image processing over requested bounds; fixed border/alpha rules prevent seams.
RAISES: `FilterRadiusError`, `FilterBoundsError`, `MaskSizeError`. DEPS: I01.

### I24 `image/noise-pixelate.ts` — CORE — PLANNED
Purpose: Apply seeded noise or anchored pixelation.
IN: `NoisePixelateRequest{source,bounds,selection,operation:{tag:'noise',amount,seed:bigint,monochrome:boolean}|{tag:'pixelate',cellSize:number,anchor:Point}}` with valid ranges.
OUT: `PixelPatch`; identical seed and input produce exact output regardless of tile processing order.
RAISES: `NoiseAmountError`, `PixelateSizeError`, `MaskSizeError`. DEPS: I01.

### I25 `image/color-transparency.ts` — CORE — PLANNED
Purpose: Turn a chosen color into transparency with tolerance and edge softness.
IN: `ColorTransparencyRequest{source,bounds,selection,color:RGBA,tolerance:number,softness:number}` with unit-range tolerance/softness.
OUT: `PixelPatch` with documented alpha falloff and edge-color treatment, leaving other pixels exact.
RAISES: `TransparencyRangeError`, `MaskSizeError`. DEPS: I01.

### I26 `image/view-plan.ts` — CORE — PLANNED
Purpose: Resolve rulers, guides, grid, snapping and high-zoom pixel grid into a view plan.
IN: `ImageViewRequest{documentSize,view:ViewTransform,guides,grid,pointer?:Point,snap:boolean}`; zoom is 0.01…64.
OUT: `ImageViewPlan{rulers,guideSegments,gridSegments,pixelGridSegments,snappedPoint?,visibleBounds}`; wheel anchoring and space-pan use S04's shared transform.
RAISES: `ImageViewRangeError`, `GridSettingError` for invalid zoom/grid. DEPS: S04.

### I27 `image/text-raster-adapter.ts` — SHELL — PLANNED
Purpose: Rasterize a validated text run through browser font/Canvas APIs.
IN: `TextRasterRequest{run:TextRun,bounds,resolution:number}`; font availability is explicitly reported.
OUT: `Promise<{pixels:PixelSurface,actualFont:string,warnings:Diagnostic[]}>`; no text-model mutation occurs here.
RAISES: `FontUnavailableError`, `TextCanvasError`, `TextReadbackError` on missing capability/resource failure. DEPS: I01.

### I28 `image/codec-adapter.ts` — SHELL — PLANNED
Purpose: Decode PNG/JPEG/WebP/GIF/BMP and encode PNG/JPEG/WebP using browser codecs.
IN: `ImageCodecRequest{tag:'decode',file:Blob}|{tag:'encode',pixels:PixelSurface,format:'png'|'jpeg'|'webp',quality:number}`; decode uses the first displayed GIF frame and reports animated input explicitly.
OUT: `Promise<{pixels?:PixelSurface,blob?:Blob,metadata,warnings:Diagnostic[]}>`; PNG alpha survives and JPEG quality is passed explicitly.
RAISES: `ImageDecodeError`, `ImageEncodeUnavailableError`, `ImageQualityError`, `ImageResourceLimitError`. DEPS: I01.

### I29 `image/transfer-input-adapter.ts` — SHELL — PLANNED
Purpose: Translate clipboard, file selection and drag/drop into local image inputs.
IN: `ImageInputRequest{tag:'read',source:'clipboard'|'drop'|'file',eventOrHandle:LocalInputHandle}|{tag:'write-clipboard',items:readonly Blob[]}` granted by a user gesture.
OUT: `Promise<{items:readonly Blob[],origin:string,written?:boolean}>`; files are read locally without upload; system clipboard writes mirror copied pixels as PNG while the assembly keeps the explicit structured I36 payload for editable in-app paste.
RAISES: `ClipboardDeniedError`, `FilePermissionError`, `ImageInputUnsupportedError`, `InputCancelled`. DEPS: none.

### I30 `image/canvas-adapter.ts` — SHELL — PLANNED
Purpose: Present supplied composite patches and image overlays without deciding pixel content.
IN: `ImageCanvasRequest{canvas:CanvasHandle,patches:readonly PixelPatch[],view:ImageViewPlan,overlays:readonly Overlay[],signal}`; patches belong to the active revision.
OUT: `{presentedRevision,dirtyRects,dispose:()=>void}`; stale worker revisions are discarded by the shared job/session boundary.
RAISES: `CanvasUnavailableError`, `CanvasContextLostError`, `CanvasAllocationError`. DEPS: none.

### I31 `image/tool-controls-adapter.ts` — SHELL — PLANNED
Purpose: Bind brush/shape/color/text controls to typed previews and committed commands.
IN: `ImageControlsRequest{host:HTMLElement,forms:readonly ImageForm[],toolDescriptors:readonly ToolDescriptor[],emit:(event:FormEvent|ImageToolIntent)=>void}` restricted to brush/shape/color/text families.
OUT: `{update,dispose}` bindings with icon, shortcut tooltip, next-click status, typed drag equivalents and live modal previews.
RAISES: `ImageControlDescriptorError` for missing/unknown fields/tool metadata. DEPS: none.

### I32 `image/layers-adapter.ts` — SHELL — PLANNED
Purpose: Present the layer stack and emit exact layer/context-menu intents.
IN: `ImageLayersRequest{host,layers,activeLayerId,emit:(command:LayerCommand)=>void}`.
OUT: `{update,dispose}` bindings for add/delete/duplicate/reorder/merge/flatten, visibility/locks/alpha-lock, opacity, masks and seven blend modes.
RAISES: `LayerBindingError` for missing host/invalid descriptor IDs. DEPS: none.

### I33 `image/selection-transform-adapter.ts` — SHELL — PLANNED
Purpose: Bind selection tools, transform handles, move/crop and numeric transform controls.
IN: `SelectionControlsRequest{host,view:ImageViewPlan,bounds,forms,emit:(event:ImageToolIntent|FormEvent)=>void}` restricted to selection/transform/crop families.
OUT: `{update,dispose}` bindings; handle movement and typed values produce the same intent payload and selection combination mode.
RAISES: `SelectionBindingError` for incomplete control/handle descriptors. DEPS: none.

### I34 `image/adjustment-dialog-adapter.ts` — SHELL — PLANNED
Purpose: Bind requested adjustments, filters, image/canvas resize and export options to shared preview dialogs.
IN: `ImageDialogRequest{host,form:ImageForm,preview:PixelSurface,emit:(event:FormEvent)=>void}` restricted to adjustment/resize/export descriptors.
OUT: `{updatePreview,dispose}` bindings; OK/Enter commits the supplied preview transaction and Esc/Cancel discards it through S01's assembly connection.
RAISES: `ImageDialogDescriptorError` for unknown fields or missing preview identity. DEPS: none.

### I35 `image/pointer-adapter.ts` — SHELL — PLANNED
Purpose: Convert pointer/pen/wheel events into document-space tool samples.
IN: `ImagePointerRequest{canvas,view:ViewTransform,tool,emit:(intent:ImageToolIntent)=>void}` with pointer-capture lifecycle ownership.
OUT: `{update,dispose}`; pressure and coalesced samples are preserved; wheel/Space-drag/context menu and cancellation use shared policies.
RAISES: `PointerCaptureError`, `ViewTransformError` on browser capture failure or unusable transform. DEPS: S04.

### I36 `image/clipboard.ts` — CORE — PLANNED
Purpose: Define image copy/cut/paste/delete/select-all semantics independently of browser clipboard I/O.
IN: `ImageClipboardRequest{document,tag:'copy'|'cut'|'paste'|'delete'|'select-all',clipboard?:ImageClipboardPayload,placement?:Point,newLayerId?:string}`; the active unlocked layer is the editing target; an empty selection means its whole content for copy/cut.
OUT: `{clipboard?:ImageClipboardPayload,change?:ImageChange}`; payload preserves selected pixels/coverage or selected editable text, cut/delete clears only selected coverage, and paste creates a new selected layer with the supplied unique ID/placement. `ImageClipboardPayload={version:1,bounds:Rect,pixels?:PixelSurface,text?:TextRun,coverage:CoverageMask}`; no original document references remain mutable.
RAISES: `ClipboardPayloadError`, `ClipboardLayerIdError`, `LayerLockedError`, `ClipboardBoundsError`. DEPS: I01, I03.

### I37 `image/pixel-worker-adapter.ts` — SHELL — PLANNED
Purpose: Transport bounded pixel-operation jobs and cancellation across a worker boundary.
IN: `PixelWorkerRequest{tag:'run'|'cancel'|'dispose',jobId,revision,operation?:PixelOperationRequest,transferables?:ArrayBuffer[]}`; operation tags name the exact I03/I04/I06/I09–I16/I18–I25 entry contracts.
OUT: `Promise<{jobId,revision,result?:PixelOperationResult,cancelled:boolean}>`; buffer ownership and worker failure are explicit; a stale result never applies itself to the active document.
RAISES: `PixelWorkerUnavailableError`, `PixelWorkerProtocolError`, `PixelWorkerCrashedError`, `PixelWorkerCancelled`. DEPS: none; the worker entry assembly only wires the explicitly listed GREEN CORE handlers.

## Working Image increment (D20)

D20 delivers a usable paint-style Image workspace before the full I01–I37 layer/selection/adjustment roster, in the same way D16 delivered the working CAD path. I01–I37 remain PLANNED and keep their contracts; the bricks below are a single-layer subset behind the same workspace adapter seam. Evidence and limits are in [IMAGE-WORKFLOW.md](IMAGE-WORKFLOW.md). No brick is human-ACCEPTED.

### I50 `image/raster-ops.ts` — CORE — GREEN
Purpose: Draw and transform straight-alpha RGBA rasters for the Image workspace.
IN: `Raster{width,height,data:Uint8ClampedArray}` plus `PaintOp` (stroke, rectangle, ellipse, fill, clear, blit) or `TransformOp` (flip, rotate, invert, crop, resize, canvas); colours are byte RGBA, points are document pixels.
OUT: `paintRaster` mutates the caller-owned working raster and returns the changed rectangle or null; `transformRaster` returns a new raster. Aliased deterministic pixels; flood fill is iterative scanline with 4-connectivity.
RAISES: `RangeError` for invalid sizes (over 4096² pixels), colours, rectangles, tool sizes or nonfinite points.
DEPS: none.

### I51 `image/image-content.ts` — CORE — GREEN
Purpose: Represent immutable layered Image documents with exact native serialization.
IN: `new{width,height,fill}`, `raster{value,layerId}`, `update{previous,layerId,raster}`, `layers{previous,width,height,layers,activeLayerId}`, `selection{previous,mask}`, `encode{value}` or `decode{content,assets}`; pixels at most 4096², 1–100 layers.
OUT: `ImageContent{width,height,layers,activeLayerId,selection}` with shared 256-pixel tiles; unchanged selection coverage returns the same snapshot. Native `rgba8-layers-v2` records carry layer parameters/raw RGBA assets and optional gray8 selection coverage. Both earlier layouts migrate with null selection. Updated pixels and same-size layers retain selection; resized layers clear it. Encode owns every output byte.
RAISES: `RangeError` for invalid documents/rasters; `ImageContentError` for malformed, duplicate/missing or unknown-layout native content. Bounds are derived from coverage, never trusted.
DEPS: I50, I54, I58.

### I52 `image/image-tool-input.ts` — CORE — GREEN
Purpose: Interpret Image canvas pointer input as paint intents.
IN: tool state, pointer event in document pixels (button 0 primary, 2 secondary, Shift), current rectangular selection and floating flag.
OUT: owned state plus one intent: incremental stroke segments and one stroke end; shape preview/commit with Shift square/circle/45°; fill/pick/text clicks; marquee or move/lift of the selection; cancel.
RAISES: `TypeError` for unknown tools or nonfinite points.
DEPS: none.

### I53 `image/image-palette.ts` — SHELL — GREEN
Purpose: Render the Image workspace colour and tool-option panel.
IN: panel root and change callback; `update({primary,secondary,size,style,info,enabled})`.
OUT: swatch palette (click primary, right-click secondary), native colour inputs, swap, size choices and shape style; all changes route through the callback; dispose removes listeners.
RAISES: `TypeError` for a missing root or callback.
DEPS: none.

### I54 `image/image-composite.ts` — CORE — GREEN
Purpose: Composite image layers with blend modes and apply selection masks.
IN: `{width,height,layers:[{raster,visible,opacity,blend}],rect,out}`; `maskedMerge({target,base,mask,rect})`.
OUT: straight-alpha source-over composite with the seven W3C separable blend modes; masked merge restores base outside the selection, interpolating soft mask values.
RAISES: `RangeError` for mismatched sizes, unknown blend modes or invalid opacity.
DEPS: none.

### I55 `image/image-adjust.ts` — CORE — GREEN
Purpose: Apply Photoshop/GIMP-style adjustments and filters to an RGBA raster region.
IN: Raster, `AdjustOp` (brightness/contrast, hue/saturation, levels, curves, colour balance, desaturate, invert, sepia, posterize, threshold, Gaussian blur, unsharp mask, noise, pixelate, find edges, emboss) and an optional rectangle.
OUT: the raster mutated inside the rectangle only; neighbourhood filters read an unmodified copy; blur and pixelate average premultiplied colour.
RAISES: `RangeError` for unknown operations or out-of-range parameters.
DEPS: I50.

### I56 `image/image-brush.ts` — CORE — GREEN
Purpose: Soft-brush strokes, gradient fills and mask-based selections.
IN: per-stroke coverage buffers, dab/line/spray/smudge requests, coverage modes (paint, erase, clone, filter), gradient endpoints, mask shapes (rectangle, ellipse, polygon), magic-wand seeds.
OUT: coverage accumulation capped by stroke opacity; base→result blending for the dirty rectangle; 0/255 selection masks, combinations (replace/add/subtract/intersect) and bounds.
RAISES: `RangeError` for invalid dabs, sizes or buffers.
DEPS: I50.

### I57 `image/image-layers-panel.ts` — SHELL — GREEN
Purpose: Render the Image Layers panel and report layer actions.
IN: root, callback; `update({layers,activeLayerId,thumbnails,enabled})`.
OUT: top-first list with visibility, thumbnail, name and opacity/blend summary; new/duplicate/delete/up/down/merge actions; blend select; opacity trackbar plus number box.
RAISES: `TypeError` for a missing root or callback.
DEPS: I54.

### I58 `image/image-selection-state.ts` — CORE — GREEN
Purpose: Produce an owned canonical selection snapshot.
IN: `{width,height,mask:Uint8Array|null}` with positive integer sizes, at most 16,777,216 pixels and exact ordinary-buffer coverage length.
OUT: frozen `ImageSelection{mask,bounds}` with owned byte copy and minimal nonzero bounds, or null for empty coverage. Partial byte coverage is preserved.
RAISES: `RangeError` for invalid sizes, mask type/length or detached/shared memory.
DEPS: none.

I51 is now layered (each layer's tiles shared between snapshots; layer stack edits reuse tiles; both prior layouts still decode). The selection persistence and typed-view corrections pass the explicit gates in [IMAGE-ACCEPTANCE.md](IMAGE-ACCEPTANCE.md). I52 supports 18 tools with Shift/Ctrl selection modes and a Ctrl-click clone source. I53 shows per-tool options, each numeric option as an XP trackbar plus a typed number box.

IMAGE-APP (`src/image/image-workspace.ts`) is the assembly: it wires I50–I53 to S07 file access, S11 dialogs and the A-SHELL host (history, recovery, files). Each completed stroke, shape, fill, text, move, paste, selection or image command commits one history entry; drags and floating selections stay outside history. View settings expose effective pixel zoom and screen-pixel offsets, preview around the viewport center, and cancel without changing history. Browser codecs provide PNG export and PNG/JPEG/GIF/WebP/BMP import.

## Working Video increment (D26)

The full Phase 4 plan below (multi-track, keyframes, WebCodecs, muxers) stays the long-term target. The owner asked for a basic editor first, so two bricks ship now:

### VW1 `video/video-timeline.ts` — CORE — GREEN
Purpose: One sequence track of clips (video or still) plus titles; trim, split, move, delete, fades, volume, frame size; locate a sequence time; native encode/decode.
IN: `videoTimeline({operation:'new'|'edit'|'locate'|'encode'|'decode'})`. OUT: frozen `VideoContent`, a located clip `{index,clip,media,offset,source,fade}`, or `{content,assets}`.
RAISES: `VideoEditError`, `VideoContentError`. TESTBENCH: `video-timeline.test.ts`.

### VW2 `video/video-workspace.ts` — SHELL — provisional GREEN
Purpose: WorkspaceAdapter for `gsnv-video`: canvas preview, transport, timeline, clip/title/export panel, Web Audio gain per clip, MediaRecorder export.
TESTBENCH: `video-workspace.browser.spec.ts`. Detail: [VIDEO-WORKFLOW.md](VIDEO-WORKFLOW.md).

## Phase 4 — Video bricks, leaves first

### V01 `video/time-project.ts` — CORE — PLANNED
Purpose: Resolve rational time arithmetic and requested project presets.
IN: `VideoTimeRequest{tag:'preset'|'convert'|'range',preset?:'16:9-1080'|'9:16-1080'|'1:1-1080'|'16:9-4k'|'9:16-4k'|'1:1-4k',rate,frame?,sampleRate?,range?}`.
OUT: `{settings?:ProjectSettings,timeUs?:bigint,sample?:bigint,range?:FrameRange}` with explicit rounding and exact rate preservation.
RAISES: `FrameRateError`, `FrameRangeError`, `ProjectPresetError` for invalid rates/ranges/presets. DEPS: none.

### V02 `video/document.ts` — CORE — PLANNED
Purpose: Validate video state and apply atomic timeline/media record deltas.
IN: `VideoDocumentRequest{tag:'new'|'validate'|'apply',settings?,document?,deltas?:TimelineDelta[],baseRevision?}` with distinct IDs and matching revision.
OUT: `{document:VideoDocument,change?:TimelineChange}`; clips reference existing compatible tracks/media, source extents and links remain valid.
RAISES: `VideoDocumentError`, `VideoReferenceError`, `TimelineRevisionError`, `TimelineExtentError`. DEPS: V01.

### V03 `video/tracks.ts` — CORE — PLANNED
Purpose: Change tracks and resolve mute/solo/hide/lock eligibility.
IN: `TrackRequest{tracks,command:{tag:'add'|'delete'|'reorder'|'rename'|'mute'|'solo'|'lock'|'hide',trackId?,value?},clipIdsByTrack}`; nonempty-track deletion requires an explicit clip deletion plan.
OUT: `{tracks,eligibility:ReadonlyMap<string,{audio:boolean,video:boolean,editable:boolean}>,change:TimelineChange}`.
RAISES: `TrackMissingError`, `TrackNotEmptyError`, `TrackValueError`. DEPS: none.

### V04 `video/clip-edits.ts` — CORE — PLANNED
Purpose: Plan reversible clip placement, trim, split, move, ripple delete and linked selection edits.
IN: `ClipEditRequest{document,command:{tag:'place'|'trim-start'|'trim-end'|'split'|'move'|'delete'|'ripple-delete'|'link'|'unlink'|'detach-audio',clipIds,frame?,sourceId?,trackId?},snapFrame?:bigint}` with unlocked targets and compatible tracks.
OUT: `TimelineChange`; linked audio/video stay aligned until unlinked and detach creates a referenced audio clip without copying media.
RAISES: `ClipMissingError`, `TrackLockedError`, `ClipExtentError`, `ClipLinkError`, `TrackCompatibilityError`. DEPS: V01.

### V05 `video/keyframes.ts` — CORE — PLANNED
Purpose: Edit and evaluate linear/ease keyframes on the permitted properties.
IN: `KeyframeRequest{tag:'edit'|'evaluate',keyframes,property,frame,value?,interpolation?,edit?:'set'|'delete'}` with unique property/frame pairs.
OUT: `{keyframes?,value?:number,change?:TimelineChange}`; interpolation and hold-outside-range behavior are deterministic.
RAISES: `KeyframePropertyError`, `KeyframeValueError`, `KeyframeOrderError`. DEPS: none.

### V06 `video/clip-properties.ts` — CORE — PLANNED
Purpose: Apply typed clip transform, opacity, crop, speed, volume and fade changes.
IN: `ClipPropertyRequest{clip,values:Partial<ClipProperties>&{speed?:Rational},sourceExtent}`; only documented fields and speeds 0.25…4 are accepted.
OUT: `{clip,change:TimelineChange}` with validated crop/opacity/fade/source extent and explicit speed-to-duration mapping.
RAISES: `ClipPropertyError`, `SpeedRangeError`, `CropRangeError`, `FadeRangeError`. DEPS: V01.

### V07 `video/transitions.ts` — CORE — PLANNED
Purpose: Attach/edit/remove the five transitions and evaluate their per-frame mix/clip/transform instructions.
IN: `TransitionRequest{tag:'edit',clips:readonly Clip[],incomingId,outgoingId,action:'set'|'remove',transition?:Transition,trackLocked:boolean}|{tag:'evaluate',transition:Transition,offsetFrame:bigint,canvasSize}` with compatible neighboring clips and sufficient source overlap.
OUT: `{change?:TimelineChange,plan?:TransitionPlan}`; edits preserve valid duration/source handles, while evaluation returns incoming/outgoing weights, optional dip background, clips and transforms.
RAISES: `TransitionDurationError`, `TransitionRangeError`, `TransitionDirectionError`, `TransitionClipError`, `TrackLockedError`. DEPS: none.

### V08 `video/titles-solids.ts` — CORE — PLANNED
Purpose: Keep title styles and solid-color clips editable and plan title fades.
IN: `TitleSolidRequest{tag:'title'|'solid'|'evaluate',title?:TitleSpec,color?:RGBA,frame?,duration?}` with valid style dimensions and fade lengths.
OUT: `{title?:TitleSpec,solid?:RGBA,opacity?:number,layout:TitleLayoutSpec}`; font/outline/shadow/box values remain source data.
RAISES: `TitleStyleError`, `TitleFadeError`, `SolidColorError`. DEPS: none.

### V09 `video/correction-plan.ts` — CORE — PLANNED
Purpose: Translate video correction controls into deterministic pixel-operation parameters.
IN: `VideoCorrectionRequest{brightness,contrast,saturation,temperature,blur,blackAndWhite}` within documented control ranges.
OUT: `VideoCorrectionPlan{colorMatrix:readonly number[],blurRadius:number}` with explicit ordering and color-space rules.
RAISES: `VideoCorrectionRangeError`. DEPS: none.

### V10 `video/chroma-key.ts` — CORE — PLANNED
Purpose: Compute chroma-key alpha with supplied tolerance and softness.
IN: `ChromaKeyRequest{pixels:PixelPatch,key:RGBA,tolerance:number,softness:number}` with unit-range values.
OUT: `PixelPatch` with deterministic alpha and edge-color treatment; no frame scheduling or GPU calls.
RAISES: `ChromaKeyRangeError`, `ChromaKeyPixelsError`. DEPS: none.

### V11 `video/audio-samples.ts` — CORE — PLANNED
Purpose: Produce deterministic mixed audio blocks and waveform summaries.
IN: `AudioSamplesRequest{tag:'mix',inputs:readonly AudioMixInput[],outputSampleRate,outputStartSample,count}|{tag:'waveform',block:AudioBlock,bucketSamples:number}`; gains/speeds are already evaluated values.
OUT: `{block?:AudioBlock,waveform?:readonly {min:number,max:number}[]}`; clip fades/gain envelopes apply per sample, output is bounded and source intervals explicit.
RAISES: `AudioSampleRateError`, `AudioChannelError`, `AudioRangeError`, `WaveformBucketError`. DEPS: none.

### V12 `video/frame-plan.ts` — CORE — PLANNED
Purpose: Schedule clip source frames, animated values, transitions and audio spans for one output frame.
IN: `FramePlanRequest{document:VideoDocument,frame:bigint,trackEligibility,outputSampleRate}` within full/in-out bounds.
OUT: `FramePlan`; absolute timestamps derive from rational project time and evaluation never consults wall time.
RAISES: `FramePlanReferenceError`, `FramePlanRangeError`, `SourceFrameUnavailableError`. DEPS: V01, V05, V07.

### V13 `video/playback-policy.ts` — CORE — PLANNED
Purpose: Decide audio-clock-aligned presentation and preview scale under load.
IN: `PlaybackPolicyRequest{state:PlaybackState,action:'play'|'pause'|'tick'|'shuttle'|'step'|'seek',audioTimeUs:bigint,nowUs:bigint,queueDepth:number,renderCostUs:number,direction?:-1|0|1,rate?:number,targetFrame?:bigint}`.
OUT: `{state:PlaybackState,frame:bigint,previewScale:number,present:boolean,releaseBeforeUs:bigint}`; reduce preview resolution before dropping frames, never change export settings.
RAISES: `PlaybackClockError`, `PlaybackRateError`, `PlaybackSeekError`. DEPS: V01.

### V14 `video/timeline-view.ts` — CORE — PLANNED
Purpose: Resolve timeline zoom, hit targets, trim handles, markers and snapping.
IN: `TimelineViewRequest{document,view:{pixelsPerFrame,scrollFrame,trackHeights},pointer?,snap:boolean,snapTolerancePx:number}`.
OUT: `TimelineViewPlan{clipRects,trackRects,markerPositions,playheadX,hit?:TimelineHit,snapFrame?:bigint}` with frame-exact drag/typed equivalence.
RAISES: `TimelineViewError`, `TimelineSnapError`. DEPS: V01.

### V15 `video/range-markers.ts` — CORE — PLANNED
Purpose: Edit markers and in/out ranges and resolve transport navigation targets.
IN: `RangeMarkerRequest{document,playhead,command:{tag:'set-in'|'set-out'|'marker-add'|'marker-edit'|'marker-delete'|'home'|'end'|'step',id?,label?,frame?,direction?}}`.
OUT: `{change?:TimelineChange,targetFrame?:bigint}`; one-frame arrows and timeline start/end are exact.
RAISES: `MarkerMissingError`, `MarkerRangeError`, `InOutRangeError`. DEPS: V01.

### V16 `video/project-format.ts` — CORE — PLANNED
Purpose: Preserve editable video JSON metadata, external source identities and generated media assets.
IN: `VideoProjectRequest{tag:'encode',document:VideoDocument,generatedAssets:readonly NativeAsset[]}|{tag:'decode',package:NativePackage}` with separate metadata/asset limits.
OUT: `{package?:NativePackage,document?:VideoDocument,requiredMedia?:readonly MediaRef[],generatedAssets?:readonly NativeAsset[]}`; bigint frame/rational/revision fields use validated decimal strings in JSON. Browser handles/original external media bytes are not serialized; generated stills from Image remain binary package assets so they reopen. Every MediaRef.assetId must resolve uniquely to generatedAssets; decode returns these assets explicitly, while requiredMedia lists external sources without assetId. Missing external sources require visible local relink.
RAISES: `VideoFormatError`, `VideoVersionError`, `VideoResourceLimitError`, `VideoTruncatedError`. DEPS: V02, S03.

### V17 `video/codec-capability-adapter.ts` — SHELL — PLANNED
Purpose: Probe exact native decode/encode configurations before media use or export.
IN: `CodecProbeRequest{videoConfigs:readonly VideoCodecConfig[],audioConfigs:readonly AudioCodecConfig[]}` including required resolution/rate.
OUT: `Promise<CodecReport>`; unsupported APIs/configurations produce diagnostic capability entries rather than a fabricated successful probe.
RAISES: `CodecProbeError` for unexpected platform failures; ordinary unsupported capability is a report. DEPS: none.

### V18 `video/file-reader-adapter.ts` — SHELL — PLANNED
Purpose: Read bounded ranges from user-selected media in place.
IN: `MediaReadRequest{tag:'open'|'read'|'close',source?:File|FileSystemFileHandle,lease?:MediaLease,window?:ReadWindow,signal}`; read windows never exceed the configured bounded read size.
OUT: `Promise<{lease?:MediaLease,bytes?:Uint8Array}>`; no whole-file read, upload or hidden copy to memory/OPFS.
RAISES: `MediaPermissionError`, `MediaMissingError`, `MediaReadBoundsError`, `MediaReadCancelled`, `MediaReadError`. DEPS: none.

### V19 `video/demux-worker-adapter.ts` — SHELL — PLANNED
Purpose: Demux and seek media through a proven WASM container library in a worker.
IN: `DemuxRequest{tag:'open'|'packets'|'seek'|'close',lease:MediaLease,streamId?,timeUs?,packetLimit?,signal}`; worker owns container handles and bounded queues.
OUT: `Promise<{streams?:readonly StreamDescriptor[],packets?:readonly EncodedPacket[],eof?:boolean}>` with original timestamps and seek priming metadata.
RAISES: `DemuxFormatError`, `DemuxCorruptError`, `DemuxSeekError`, `DemuxWorkerError`, `DemuxCancelled`. DEPS: V18, pinned `@libav.js/variant-webcodecs` external library.

### V20 `video/mux-worker-adapter.ts` — SHELL — PLANNED
Purpose: Wrap encoded native packets in MP4 or WebM using the proven WASM muxer.
IN: `MuxRequest{tag:'open'|'packet'|'finish'|'cancel',jobId,format?:'mp4'|'webm',streams?:readonly StreamDescriptor[],packet?:EncodedPacket}` with valid stream configuration and monotonic timestamps.
OUT: `Promise<{chunks:readonly OutputChunk[],complete:boolean}>`; retained decoder configuration and trailer/index data yield a valid container.
RAISES: `MuxConfigurationError`, `MuxTimestampError`, `MuxWriteError`, `MuxWorkerError`, `MuxCancelled`. DEPS: pinned `@libav.js/variant-webcodecs` external library.

### V21 `video/webcodecs-adapter.ts` — SHELL — PLANNED
Purpose: Translate native encoder/decoder resources into bounded frame/packet/audio I/O.
IN: `CodecSessionRequest{tag:'open'|'decode'|'encode'|'flush'|'close'|'cancel',sessionId,config?,packet?:EncodedPacket,frame?:OwnedVideoFrame,audio?:AudioBlock,signal}` after a successful exact capability probe.
OUT: `Promise<CodecSessionResult{frames?,audio?,packets?,queueDepth}>`; explicit ownership closes transferred frames and cancellation releases codec resources.
RAISES: `CodecUnsupportedError`, `CodecConfigurationError`, `CodecDecodeError`, `CodecEncodeError`, `CodecCancelled`. DEPS: V17.

### V22 `video/audio-device-adapter.ts` — SHELL — PLANNED
Purpose: Present supplied PCM through Web Audio and expose its actual playback clock.
IN: `AudioDeviceRequest{tag:'open'|'enqueue'|'pause'|'resume'|'flush'|'close',block?:AudioBlock,sessionId}`; opening/resuming follows browser user-gesture rules.
OUT: `Promise<{audioTimeUs:bigint,queuedSamples:bigint,underruns:number}>`; worklet resources and device buffers remain shell-owned.
RAISES: `AudioPermissionError`, `AudioDeviceUnavailableError`, `AudioDeviceLostError`, `AudioQueueError`. DEPS: none.

### V23 `video/frame-compositor-adapter.ts` — SHELL — PLANNED
Purpose: Render supplied frame plans with decoded sources and precomputed effect parameters.
IN: `VideoRenderRequest{plan:FramePlan,sources:ReadonlyMap<string,OwnedVideoFrame|PixelSurface>,scale:number,corrections:ReadonlyMap<string,VideoCorrectionPlan>,titles:ReadonlyMap<string,ResolvedTitleRaster>,signal}`.
OUT: `Promise<RenderedFrame>` using Canvas/WebGL while retaining the requested output timestamp; shader conformance is compared against CORE golden pixels.
RAISES: `VideoGraphicsUnavailableError`, `VideoContextLostError`, `VideoSourceMissingError`, `VideoRenderCancelled`. DEPS: none.

### V24 `video/media-discovery-adapter.ts` — SHELL — PLANNED
Purpose: Discover selected media metadata and representative thumbnails without loading whole files.
IN: `MediaDiscoveryRequest{source:File|FileSystemFileHandle,kindHint?:'video'|'audio'|'image',signal}`.
OUT: `Promise<{media:MediaRef,lease:MediaLease,thumbnail?:PixelSurface,audioSampleBlocks?:AsyncIterable<AudioBlock>}>`; the assembly passes sample blocks to V11 for waveform summaries.
RAISES: `MediaUnsupportedError`, `MediaMetadataError`, `MediaThumbnailError`, `MediaDiscoveryCancelled`. DEPS: V18, V19, V21.

### V25 `video/output-sink-adapter.ts` — SHELL — PLANNED
Purpose: Write export chunks to a chosen real file or explicit download fallback.
IN: `OutputSinkRequest{tag:'open'|'write'|'finish'|'abort',sinkId,handle?:FileSystemFileHandle,chunk?:OutputChunk,mime?,filename?}`; seekable writes require matching sink capability.
OUT: `Promise<{sink:OutputSink,bytesWritten:bigint,complete:boolean}>`; cancellation does not label incomplete output successful.
RAISES: `OutputPermissionError`, `OutputQuotaError`, `OutputSeekUnsupportedError`, `OutputWriteError`, `OutputCancelled`. DEPS: none.

### V26 `video/encode-export-adapter.ts` — SHELL — PLANNED
Purpose: Consume already scheduled video/audio streams and produce a native-coded MP4/WebM export.
IN: `ExportJob` with matching range/configuration, a previously probed encoder and bounded source streams.
OUT: `Promise<ExportReceipt>` plus live `job.onProgress(Progress)` events during frame/audio encoding, muxing and finalization; MP4 is H.264+AAC and WebM uses supported WebM codecs; flush/trailer completion precedes success.
RAISES: `ExportCodecUnavailableError`, `ExportStreamError`, `ExportEncodeError`, `ExportCancelled`, `ExportWriteError`. DEPS: V20, V21, V25.

### V27 `video/wav-format.ts` — CORE — PLANNED
Purpose: Serialize the chosen timeline audio range as uncompressed WAV chunks.
IN: `WavRequest{tag:'header'|'samples'|'finish',sampleRate,channels,totalSamples:bigint,block?:AudioBlock,format:'pcm16'|'float32'}` with internally consistent declared length.
OUT: `readonly Uint8Array[]` preserving sample count and deterministic sample conversion.
RAISES: `WavChannelError`, `WavLengthError`, `WavRangeError` including RIFF size overflow. DEPS: none.

### V28 `video/gif-adapter.ts` — SHELL — PLANNED
Purpose: Encode supplied scheduled frames as animated GIF using an audited maintained library.
IN: `GifExportRequest{frames:AsyncIterable<RenderedFrame>,width,height,loop:number,sink:OutputSink,signal}`; frame delay quantization policy is explicit in the contract before implementation.
OUT: `Promise<ExportReceipt>` with actual encoded delays/duration; color palette and GIF limitations are surfaced in export options.
RAISES: `GifFrameError`, `GifEncodeError`, `GifWriteError`, `GifCancelled`. DEPS: V25, external GIF encoder pinned and license-audited at this brick's contract gate.

### V29 `video/frame-png-adapter.ts` — SHELL — PLANNED
Purpose: Export an already rendered current frame as PNG.
IN: `FramePngRequest{pixels:PixelSurface,filename:string}`; pixels correspond to the requested current project frame.
OUT: `Promise<{blob:Blob,filename:string}>` with project frame dimensions and no timing substitution.
RAISES: `FramePngEncodeError`, `FramePngUnavailableError`. DEPS: I28.

### V30 `video/timeline-controls-adapter.ts` — SHELL — PLANNED
Purpose: Bind tracks/clips/markers/ranges and timeline pointer/keyboard actions.
IN: `TimelineControlsRequest{host,plan:TimelineViewPlan,selection,emit:(intent:TimelineIntent)=>void}`; intent tags are exactly V03/V04/V14/V15 actions.
OUT: `{update,dispose}`; drag edges/bin placement, S split, snapping toggle, typed placement/trim and context menus produce equivalent commands.
RAISES: `TimelineBindingError` for missing descriptor or target identity. DEPS: none.

### V31 `video/media-bin-adapter.ts` — SHELL — PLANNED
Purpose: Present media thumbnails/relink state and emit local import/place/remove intents.
IN: `MediaBinRequest{host,media,thumbnails,missingIds,emit:(intent:MediaBinIntent)=>void}`.
OUT: `{update,dispose}`; file handles remain external resources and unavailable sources are visibly flagged.
RAISES: `MediaBinBindingError` for inconsistent IDs. DEPS: none.
Bounded working prerequisite: `video/video-media-bin.ts` and the current
V-TIMELINE import/place/remove operations are GREEN under [the transfer
contract](CROSS-WORKSPACE.md). They preserve unplaced media, expose thumbnails
and explicit placement/removal, and persist through native reopen/undo. This
does not complete source relinking, large-file read-in-place or multitrack work.

### V32 `video/clip-controls-adapter.ts` — SHELL — PLANNED
Purpose: Bind clip/title/solid/correction/transition/keyframe controls to numeric commands and live previews.
IN: `ClipControlsRequest{host,clip,forms:readonly VideoForm[],previewId,emit:(event:VideoFormEvent)=>void}` with fields restricted to V05–V10.
OUT: `{update,dispose}`; all drag-set values have typed fields, and all modal operations expose preview/commit/cancel.
RAISES: `VideoControlDescriptorError` for unsupported fields or absent preview identity. DEPS: none.

### V33 `video/transport-export-adapter.ts` — SHELL — PLANNED
Purpose: Bind transport and export controls with capability reasons, progress and cancel.
IN: `TransportControlsRequest{host,playbackState,codecReport,progress?,emit:(intent:TransportIntent|ExportIntent)=>void}`.
OUT: `{update,dispose}`; Space, J/K/L, arrows, I/O, Home/End and range/full export controls expose the requested actions; unavailable MP4 is visibly unavailable.
RAISES: `TransportBindingError`, `ExportDescriptorError`. DEPS: none.

### V34 `video/preview-adapter.ts` — SHELL — PLANNED
Purpose: Present supplied predecoded frames/audio according to CORE playback decisions.
IN: `PreviewRequest{tag:'start'|'tick'|'pause'|'seek'|'stop',state:PlaybackState,decodedSources,framePlans,correctionPlans,titleRasters,audioBlocks,clockSample,signal}` with bounded queues and matching revisions.
OUT: `Promise<{state:PlaybackState,frame:bigint,previewScale:number,statistics:PreviewStatistics}>`; presentation reports actual missed frames/underruns.
RAISES: `PreviewSourceMissingError`, `PreviewDeviceError`, `PreviewCancelled`. DEPS: V13, V22, V23.

### V35 `video/title-raster-adapter.ts` — SHELL — PLANNED
Purpose: Render the supplied title layout/style through browser font and Canvas APIs.
IN: `VideoTitleRasterRequest{layout:TitleLayoutSpec,title:TitleSpec,resolution:number}`; layout supplies resolved bounds, baseline, outline/shadow/box geometry and font values.
OUT: `Promise<ResolvedTitleRaster{pixels:PixelSurface,actualFont:string,warnings:Diagnostic[]}>`; the editable title remains in V08-owned source records.
RAISES: `TitleFontUnavailableError`, `TitleCanvasError`, `TitleReadbackError`. DEPS: none.

### V36 `video/clipboard.ts` — CORE — PLANNED
Purpose: Define timeline copy/cut/paste/delete/select-all with explicit clip/link identity remapping.
IN: `VideoClipboardRequest{document,tag:'copy'|'cut'|'paste'|'delete'|'select-all',selectedClipIds,clipboard?:TimelineClipboardPayload,pasteFrame?:bigint,targetTrackMap?:ReadonlyMap<string,string>,newIds?:ReadonlyMap<string,string>}`; supplied new IDs are unique and target tracks are unlocked/compatible.
OUT: `{clipboard?:TimelineClipboardPayload,selection?:readonly string[],change?:TimelineChange}`; selected linked groups are copied with relative start offsets, trims/properties/keyframes/transitions and media references. Paste remaps clip/link IDs and positions the earliest clip at pasteFrame; cut/delete removes selected clips without ripple. `TimelineClipboardPayload={version:1,originFrame:bigint,clips:readonly Clip[],media:readonly MediaRef[],trackKinds:ReadonlyMap<string,'video'|'audio'>}`.
RAISES: `TimelineClipboardError`, `ClipboardIdMapError`, `ClipboardMediaError`, `TrackLockedError`, `TrackCompatibilityError`. DEPS: V01, V04.

## Phase 5 — Cross-workspace and distribution bricks

### D01 `bridge/transfer-contract.ts` — CORE — GREEN
Purpose: Validate only the three authorized cross-workspace transfer directions.
IN: The closed version-1 `TransferRaster` union in [CROSS-WORKSPACE.md](CROSS-WORKSPACE.md): source document/epoch/identity/view stamp, label and contiguous straight-alpha sRGB RGBA8; maximum 16,777,216 pixels.
OUT: Owned validated raster for exactly Image→Video bin, Video frame→Image or transparent CAD viewport→Image; input bytes unchanged and unaliased.
RAISES: `BridgeDirectionError`, `BridgeRasterError`, `CadTransparencyError` for unsupported direction, malformed allocation/stamp/frame/color/alpha or invalid CAD policy. DEPS: none.

### D02 `bridge/image-source.ts` — CORE — GREEN
Purpose: Produce a flattened still of the current image document for the Video bin.
IN: `{value:ImageContent,source:ImageStamp,label:string}` with committed tile-backed layers.
OUT: D01 `image-to-video-bin` raster at original resolution with visibility, opacity and supported blends; editable source layers remain unchanged.
RAISES: `BridgeCompositeError`; D01 validation errors propagate. DEPS: I51, I54, D01.

### D03 `bridge/video-source-adapter.ts` — SHELL — GREEN
Purpose: Decode the requested committed Video frame into an Image transfer raster.
IN: `{document,value:VideoContent,time,source:VideoStamp,label,isCurrent,signal?}`; committed supported timeline and exact playhead identity.
OUT: `Promise<TransferRaster>` at project resolution through a private decoder and the same letterbox/fade/title renderer as preview; all local URLs/listeners/timeouts released.
RAISES: `BridgeFrameReadbackError`, `BridgeFrameRevisionError`, abort. DEPS: D01; current V-TIMELINE and video-frame-renderer (bounded working pipeline).
The broader correction/multitrack pipeline remains unimplemented. The excluded trimmed-end frame and unknown-duration WebM regressions now pass 38 focused unit tests and four real Chrome cases, including preview and independently decoded native Image pixels. [VIDEO-BOUNDARY-REPAIR.md](VIDEO-BOUNDARY-REPAIR.md) records the repair and its limits; the parent owns the combined candidate gate. XWS-002 remains incomplete.

### D04 `bridge/cad-source-adapter.ts` — SHELL — GREEN
Purpose: Capture the CAD viewport with transparent background for Image.
IN: `{viewport:CadCapturePort,title:()=>string,dialog,transfer?}`; explicit C35 source and shared dialog/transfer ports, no hidden registry.
OUT: `{bridge,ready,send}`; bridge captures a `Promise<TransferRaster>` with zero background alpha and preserved antialiased edges. The size dialog presents aspect-locked dimensions; commit rechecks cached source/camera identity.
RAISES: `StaleCaptureError`; C35 capture/context/readback and D01 validation errors, abort. DEPS: C35, D01 (shared dialog/bridge structural type ports only).

### D05 `bridge/destination-adapter.ts` — SHELL — GREEN
Purpose: Materialize a validated transfer as a new Image document or a generated still in the Video bin.
IN: `{transfer:TransferRaster,target?:AppDocument,newId,mediaId,signal?}` validated by D01 immediately before the typed internal seam.
OUT: `Promise<BridgeDelivery>`: fresh editable one-layer Image candidate, or Video bin append candidate plus empty initial document when absent. Generated stills preserve exact straight RGBA through PNG and the existing native `media-${id}` mapping. No live apply, storage, file write, navigation or handle reuse.
RAISES: `BridgeDeliveryError`, PNG/format errors, abort. DEPS: I51; current V-TIMELINE; png-encode.
The shell/coordinator owns exact-source and target identity checks, durable replacement backup, history and acknowledged apply. Bounded prerequisites, helper contracts, demonstrations and full-app verification are in [CROSS-WORKSPACE.md](CROSS-WORKSPACE.md); no future media pipeline is marked complete by this refinement.

### D06 `distribution/asset-policy.ts` — CORE — PLANNED
Purpose: Verify the complete static asset manifest and deployment constraints.
IN: `AssetPolicyRequest{files:readonly {path:string,size:bigint,sha256:string}[],headers:ReadonlyMap<string,string>,requiredAssets:string[]}`.
OUT: `AssetReport{manifest,failures:Diagnostic[]}`; every file is strictly below 26,214,400 bytes and required local assets/COOP/COEP/CORP headers are included.
RAISES: `AssetManifestError` for duplicate/unsafe paths or invalid hashes; ordinary limit failures are explicit report entries. DEPS: none.

### D07 `distribution/static_server.py` — SHELL — PLANNED
Purpose: Serve only the built static files on an atomically bound loopback port with isolation headers.
IN: `StaticServerRequest{asset_root:Path,preferred_port:int,runtime_state_path:Path}`; root is the packaged build and state is in external application data.
OUT: `StaticServerHandle{url,pid,stop}` plus atomically published loopback URL; GET/HEAD serve whitelisted files, paths never escape root, readiness checks retrieve a static asset.
RAISES: `StaticRootError`, `StaticBindError`, `StaticStateWriteError`; unsupported methods return 405, unsafe paths 400/404. DEPS: none.

### D08 `distribution/offline-cache-adapter.ts` — SHELL — PLANNED
Purpose: Install/update a complete hashed service-worker asset cache and serve it offline.
IN: `OfflineCacheRequest{manifest:AssetManifest,tag:'install'|'activate'|'fetch'|'remove-obsolete',request?:Request}`; all URLs are same-origin static assets.
OUT: `Promise<OfflineCacheResult{activeVersion,complete,response?}>`; failed install preserves the previous complete version and never caches user documents as static assets.
RAISES: `OfflineAssetMissingError`, `OfflineIntegrityError`, `OfflineQuotaError`, `OfflineCacheUnavailableError`. DEPS: none.

### D09 `distribution/launcher_manifest.go` — CORE — PLANNED
Purpose: Validate stable launcher identity, platform mapping and adjacent-app paths.
IN: `LauncherManifestRequest{manifestBytes:Uint8Array,platform:'macos'|'windows'|'linux',architecture:'x64'|'arm64',imagePath:string}`.
OUT: `LauncherPlan{releaseRoot,appRoot,appId,displayName,pythonVersion,entryModule,readyAsset,startupTimeout,toolPath,dataDirectoryName}` following manifest schema version 1.
RAISES: `LaunchManifestError`, `LaunchRootError`, `LaunchPlatformError` for malformed values, missing relative relationship or unsupported target. DEPS: none.

### D10 `distribution/runtime_plan.go` — CORE — PLANNED
Purpose: Compute immutable runtime identity and bounded bootstrap recovery decisions.
IN: `RuntimePlanRequest{manifest:LauncherPlan,pyprojectBytes,lockBytes,existing:RuntimeInventory,attempt:number,failureCode?:string}`; inventory contains verified readiness and lock ownership data.
OUT: `RuntimePlan{fingerprint,environmentPath,actions:readonly RuntimeAction[],retryDelayMs?:number}`; source/static changes do not change the fingerprint; only transient network/TLS failures retry at bounded intervals.
RAISES: `RuntimeInventoryError`, `DependencyLockError`, `RuntimeAttemptError`. DEPS: none.

### D11 `distribution/runtime_bootstrap_adapter.go` — SHELL — PLANNED
Purpose: Prepare managed Python before Python exists on the host, using bundled uv from the native Go supervisor.
IN: `BootstrapRequest{plan:RuntimePlan,launcher:LauncherPlan,appData:string,toolSha256:string}`; the Go adapter verifies bundled uv integrity before launching it with explicit argv.
OUT: `BootstrapReceipt{environmentPath,pythonPath,fingerprint,ready:bool,diagnostics}`; locked/no-dev/managed-Python/no-build installation precedes bounded validation under the newly managed interpreter and atomic READY publication. Only afterward does the launcher assembly run app/launcher/bootstrap.py and D07 under that interpreter; no system Python, Node or frontend toolchain is required.
RAISES: `BOOT-INTEGRITY`, `BOOT-NETWORK`, `BOOT-TLS`, `BOOT-PERMISSION`, `BOOT-DISK`, `BOOT-LOCK`, `DEP-LOCK`, `DEP-PLATFORM`; prior ready environments survive failure. DEPS: pinned bundled uv executable.

### D12 `distribution/browser-open-adapter.go` — SHELL — PLANNED
Purpose: Open the local setup/application URL in the native default browser and expose a visible fallback.
IN: `BrowserOpenRequest{url:string,platform,logDirectory:string}`; URL must be HTTP and loopback only.
OUT: `BrowserOpenReceipt{opened:boolean,fallbackPath?:string}`; fallback contains the exact URL without secrets if opening fails.
RAISES: `LAUNCH-BROWSER`, `BrowserUrlError`, `BrowserFallbackWriteError`. DEPS: none.

### D13 `distribution/setup-status-adapter.go` — SHELL — PLANNED
Purpose: Serve the supervisor's setup/status page and display bootstrap progress/errors.
IN: `SetupStatusRequest{tag:'start'|'publish'|'redirect'|'stop',stage?,diagnostic?,applicationUrl?}`; strings are sanitized and application URL is validated loopback.
OUT: `SetupStatusHandle{url,publish,stop}`; setup is visible before downloads; no document API or application state-changing endpoint is introduced.
RAISES: `SetupBindError`, `SetupWriteError`, `SetupRedirectError`. DEPS: none.

### D14 `distribution/process-lifecycle-adapter.go` — SHELL — PLANNED
Purpose: Own the launch lock, supervise the static server child and reuse healthy local instances.
IN: `LifecycleRequest{tag:'acquire'|'spawn'|'wait-ready'|'reuse'|'stop',appData,executable?,argv?,runtimeStatePath,readyAsset,timeoutSeconds}`; children use explicit argv and only owned processes may be terminated.
OUT: `LifecycleReceipt{owned:boolean,pid?,url?,ready:boolean,exitCode?}` with atomic lock/state handling and sanitized captured logs.
RAISES: `BOOT-LOCK`, `APP-START`, `APP-READY`, `APP-CRASH`, `LifecycleStateError`. DEPS: none.

### D15 `distribution/launcher_status.go` — CORE — PLANNED
Purpose: Map launcher/bootstrap outcomes to stable user-visible diagnostics and permitted recovery actions.
IN: `LaunchStatusRequest{stage,code?,detail?:SanitizedDetail,retryCount:number,hasPreviousRuntime:boolean}`.
OUT: `LaunchStatus{code,summary,recovery:'retry'|'reopen'|'inspect-log'|'none',logHint,terminal:boolean}`; the full stable M1a error-code set is preserved without raw traceback-only output.
RAISES: `LaunchStatusCodeError` for an unmapped code; unknown exceptions must be classified by the boundary before presentation. DEPS: none.

### D16 `distribution/macos-image-adapter.py` — SHELL — PLANNED
Purpose: Build one universal macOS launcher bundle from stable supervisor sources and original app icon.
IN: `MacImageRequest{supervisor_source,product_identity,icon_icns,output_path,toolchain}`; no mutable app payload is embedded.
OUT: `LauncherImageReceipt{target:'macos-universal',path,sha256,contained_architectures:['x64','arm64']}`; Info.plist and executable mode are verified.
RAISES: `MacImageBuildError`, `MacImageArchitectureError`, `MacImagePayloadError`, `MacImageIconError`. DEPS: external pinned Go toolchain, external universal-binary packaging tool.

### D17 `distribution/windows-image-adapter.py` — SHELL — PLANNED
Purpose: Build separate x64/ARM64 Windows GUI-subsystem launchers with original icons.
IN: `WindowsImageRequest{supervisor_source,product_identity,architecture:'x64'|'arm64',icon_ico,resource_object,output_path,toolchain}`; resource architecture must match.
OUT: `LauncherImageReceipt{target,path,sha256}`; no console subsystem or embedded mutable application files.
RAISES: `WindowsImageBuildError`, `WindowsImageResourceError`, `WindowsImagePayloadError`. DEPS: external pinned Go toolchain, external architecture-matched resource compiler.

### D18 `distribution/linux-image-adapter.py` — SHELL — PLANNED
Purpose: Build x86_64/ARM64 Type 2 AppImages with stable supervisor and original icon.
IN: `LinuxImageRequest{supervisor_source,product_identity,architecture:'x64'|'arm64',icon_png,output_path,toolchain}`.
OUT: `LauncherImageReceipt{target,path,sha256}`; AppRun resolves the adjacent release root from APPIMAGE, executable bits and desktop entry are verified.
RAISES: `LinuxImageBuildError`, `LinuxImageTypeError`, `LinuxImagePayloadError`, `LinuxImageModeError`. DEPS: external pinned Go toolchain, external pinned appimagetool.

### D19 `distribution/release-inventory.ts` — CORE — PLANNED
Purpose: Validate universal ZIP contents, notices, immutable launcher hashes and evidence completeness.
IN: `ReleaseInventoryRequest{files:readonly ReleaseFile[],launcherReceipts,priorLauncherHashes?,allowedImageChangeReason?,licenses:readonly LicenseRecord[],smokeEvidence:readonly PlatformEvidence[]}`.
OUT: `ReleaseInventoryReport{whitelist,failures,untestedTargets,candidateEligible:boolean}`; candidate requires all five images and six native architecture GUI smoke results, not cross-compilation alone.
RAISES: `ReleaseInventoryError` for ambiguous/malformed records; missing evidence and prohibited payloads are explicit failures. DEPS: none.

### D20 `distribution/zip-package-adapter.py` — SHELL — PLANNED
Purpose: Assemble the universal ZIP from an explicit already-validated whitelist.
IN: `ZipPackageRequest{staging_root,whitelist:readonly ReleaseFile[],output_path,product_name}`; five launcher images, README.txt, LICENSE.txt and app/ are the only visible root entries.
OUT: `PackageReceipt{path,sha256,entries,executable_modes}`; extraction preserves launcher structure/modes and contains no private dev docs, credentials, logs, caches or user projects.
RAISES: `PackageMissingFileError`, `PackagePathError`, `PackageModeError`, `PackageWriteError`. DEPS: none.

### D21 `distribution/asset-inventory-adapter.ts` — SHELL — PLANNED
Purpose: Read built files and emit hash/size facts for deployment and offline policy checks.
IN: `AssetInventoryRequest{buildRoot:string}`; symlinks escaping the build root are rejected.
OUT: `Promise<readonly {path:string,size:bigint,sha256:string}[]>`; facts use actual uncompressed file sizes and complete byte hashes.
RAISES: `AssetReadError`, `AssetSymlinkError`, `AssetHashError`. DEPS: none.

## Assemblies and cumulative seam ladder — wiring only

These are not bricks, do not evade the brick size/dependency rules, and contain no image/timeline/launcher policy. Build assemblies only when their participants are GREEN in the authorized phase; no stub interfaces stand in for unbuilt participants. Each rung re-runs earlier seams.

1. **A-I-Pixels:** I01/I02/I03/I04/I06 plus each newly GREEN paint/filter brick. Golden RGBA buffers cover clipping, integer rounding, alpha, masks and tile boundaries. I09 → I10 → I12 and I11 → I12 are real-data seams; supplied dabs/tips/clone patches are not mock collaborator implementations.
2. **A-I-Document:** I05/I07/I08/I17/I20/I36 with S01/S03/S15. Reversible tile/record deltas pass 100-step undo/redo and binary project round-trip tests. Merge/flatten resolve text through I27 before I06. S03 receives metadata only; a 20-layer image's raw pixel assets never pass through the 64 MiB JSON envelope. S13/S14 own file/recovery transport of S15 containers.
3. **A-I-Viewport:** I26–I35 with S04 and shared command/preview/recovery/file adapters. The command registry wires exact image intents to the responsible CORE brick, then sends resulting deltas through I07 and S01. Shape outlines, transforms and resize plans are computed by their listed CORE owners. No command semantics live in the registry.
4. **A-I-Golden:** I37's worker assembly wires the implemented pixel handlers. The scripted tool/layer/selection/adjustment sequence produces the independently specified pixel-exact fixture; serialize/reopen/re-render matches exactly. A separate real browser performance run exercises 4000×4000 with 20 layers; platform text rasterization is tested separately and does not silently redefine the deterministic pixel golden.
5. **A-V-Timeline:** V01–V16/V36 with S01/S03/S15. Each edit/keyframe/range/clipboard operation is reversible; rational frame/sample boundary seams eliminate drift and preserve clip links until explicit unlink. Video JSON encodes frame integers as decimal strings and generated stills as separately referenced binary assets.
6. **A-V-Media:** V17–V24. Real bounded file reads feed WASM demux, native decoder and thumbnail/compositor; waveform blocks feed V11. Reopen checks original file identities and prompts for local relink/permission where required. Still images use I28 to supply decoded pixels; no unexpected whole-video reads are permitted.
7. **A-V-Preview:** V12/V13/V22/V23/V34/V35 and the timeline/bin/transport controls. Wire frame plans and predecoded sources; test audio-clock alignment and resolution reduction before frame loss. V35 produces title raster input from V08's layout/style plan, including outline/shadow/background without deciding style values.
8. **A-V-Export:** V12/V20/V21/V25/V26, plus V27/V28/V29 for WAV/GIF/PNG. Real packets must round-trip through an independent decoder/probe. The three-clip dissolve/title/volume-keyframe fixture checks MP4 dimensions, duration and A/V sync within one project frame. Codec absence is **UNAVAILABLE**, never pass. Export ranges, progress and cancellation have separate seams.
9. **A-D-Bridge:** D01–D05 plus participating Image/Video/CAD capture owners. Test pixel transfer, revision identity, transparent CAD background and destination undo without modifying source documents.
10. **A-D-Static:** D21 → D06 → D08 with D07. Verify every deployed asset below the current limit, no runtime third-party request, complete offline reload, `crossOriginIsolated` in window/worker and recovery after incomplete cache update.
11. **A-D-Launcher:** D09/D10/D11/D12/D13/D14/D15 with D07. The native Go entry assembly runs immediately without Python/Node, wires setup/browser/runtime plans, and uses bundled uv to obtain managed Python. Only the ready interpreter runs the Python bootstrap assembly and static server. All runtime policy bricks D09/D10/D15 are Go. Assemblies only wire these operations, never document behavior. Reuse, readiness, runtime failure classification and source-only changes have real seam tests.
12. **A-D-Package:** D16/D17/D18 + D19/D20. Cross-build evidence and native smoke evidence are distinct. The release remains below `CANDIDATE_FOR_ACCEPTANCE` until the universal ZIP and all required native clean-system matrix cases pass; only the user can accept it.

## Build order and explicit verification gates

- **Phase 3:** I01–I37 in listed order. Independent high-risk I08/I19/I23/I28 spikes may be scheduled earlier only after their dependencies are GREEN; production calls still follow this acyclic order. Every implemented brick runs its sibling testbench and demo, then the method checker; real shell smoke checks are separate from fake-backed adapter tests.
- **Phase 4:** V01–V36 in listed order. V17–V21 capability/demux/mux/codec spike may run before timeline implementation because their dependencies are internal to that set and already GREEN Image support is available; an unavailable required native codec is reported immediately. V24, V26 and V34 each have at most three actual brick/external-library dependencies. UI callbacks connect through the named assemblies, not concealed business-service imports.
- **Phase 5:** D01–D21 in listed order; D21 may be built earlier as an independent leaf. Cross-phase S01/S03/S04/C35 and required Image/Video participants must be GREEN before the dependent bridge/integration runs.
- Test IDs are assigned by the system verification matrix to these named contracts. At phase close, report each requirement as PASS/FAIL/UNTESTED/UNAVAILABLE with exact command/output and actual browser/OS. Passing a contract map audit establishes planning coverage only, not product behavior.

## Decisions and bounded unresolved details

- Sparse tile deltas avoid 100 complete 4000×4000×20-layer history snapshots. Tile size is a tuning constant with border-equivalence tests. Algorithm changes must preserve specified golden pixels or receive a contract change.
- Project image/text state remains editable; imported GIF uses its first displayed frame because Image has no animation timeline in scope. Video sources remain read-in-place references; reopening may require renewed browser permission or explicit relink, which must be shown visibly.
- Native WebCodecs plus the proven libav.js WASM container layer satisfies the requested architecture. Exact artifacts, sources/notices and LGPL obligations must be pinned before the V19/V20 implementation gate. No silent JS-only muxer substitution or software-codec fallback is authorized by this map.
- V28's maintained GIF encoder selection and exact frame-delay quantization require a documented decision before CONTRACTED; the map does not claim an unselected library works. Unsupported native MP4/AAC on a target remains an explicit capability limitation and acceptance failure/unavailable check.
- Constant-rate speed changes use explicit source-frame/sample remapping; pitch preservation is not requested. If preserving pitch becomes necessary, that is a contract question rather than an implicit extra feature.
- The M1a skill's default private-doc rule is overridden by the user asking to put this specification in the code repo. Its generic state-changing GUI quit/API example is overridden by the user's static-only application backend; shutdown remains supervisor/process lifecycle responsibility. Setup/status orchestration contains no application business logic or document API.
- Native target smoke coverage cannot be inferred from this Linux host. M1a still requires Windows x64/ARM64, macOS Intel/Apple Silicon and Linux x86_64/ARM64 evidence. No unavailable target or codec check becomes a pass.
