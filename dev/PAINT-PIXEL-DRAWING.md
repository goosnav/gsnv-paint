# Crisp Paint drawing

Owner request (2026-11-14): hard, visibly discrete drawing pixels without a fuzzy
antialiased rim; optional larger brush pixels on a full-size canvas. Existing
BATCH authorization applies. The prior clipboard/text increment is deployed as
c712f09; this is a separate bounded increment.

## ConOps and requirements

- **PIX-01:** Brush defaults to Hard pixels. Brush and Eraser expose Hard pixels
  and Smooth edges; Pencil stays hard. At 100% opacity, a hard stroke's coverage
  is exactly 0 or 1, including single-pixel marks and long diagonal strokes.
  Smooth preserves the existing hardness/flow implementation and soft brushes.
  Deliberately reduced opacity still blends; no automatic palette reduction.
- **PIX-02:** Pencil and hard Brush/Eraser expose Pixel size, integer 1–32 canvas
  pixels, with slider and typed control. Blocks align to the document origin.
  Size remains stroke diameter in canvas pixels, rounded to the nearest whole
  number of blocks (at least one). Interpolate the path in block coordinates
  without gaps. Clip at canvas/selection edges; no full-image pixelation. Hide
  smooth-only controls in hard mode and pixel-size controls in smooth mode.
- **PIX-03:** Image Free transform offers Pixels (nearest) and Smooth (bilinear),
  defaults to Pixels, and uses the chosen sampler on Apply/Save. Preserve the
  original raster throughout preview; changing the sampler is not a history edit.
  Default affineRaster API behavior remains bilinear for existing callers.
  Enlarged pixel previews/canvas use crisp nearest-neighbor display, including
  fractional zoom; changing view zoom does not alter stored pixels.
- **PIX-04:** Preserve selection clipping, one entry per stroke, opacity, Cancel,
  Undo/Redo, PNG and native round-trip. Existing files retain their original pixels.
  Rectangle/ellipse/line already use aliased CORE rasterization. Text, imported
  photos, gradients, airbrush, blur and smudge are not silently thresholded.

## Mode A amendment and sequence

1. **I62 image/pixel-stroke.ts — CORE:** `pixelStroke({cov,points,size,pixelSize,tip})`
   writes only binary coverage into the caller's matching image-sized Float32Array;
   returns clipped dirty bounds or null. Size integer 1–500; pixelSize integer 1–32;
   tip round/square; points finite and bounded to safe document coordinates.
   Reject invalid buffers/parameters before mutation. Bound traversal to the
   canvas plus brush footprint even for distant endpoints. No DOM or pixel colors.
   Dependencies: I50 raster size/types, I56 coverage type only. No imported solver
   or browser library. Implement tests first, then brick and checker.
2. Carve the already-tested transformRaster/affineRaster operations out of I50
   into **I63 raster-transform.ts — CORE**, keeping its existing two-entry API
   and moving the unchanged transform goldens into its sibling testbench. I50
   retains createRaster, paintRaster and clip. This resolves the existing five
   entry-point limit without changing drawing behavior. Add optional nearest/bilinear sampling; exact source
   RGBA for nearest, including alpha; invalid sampler rejected. Retain existing
   bilinear goldens. Amend I53 numeric/choice presentation and I61 sampler controls.
3. IMAGE-APP composes I62 with existing coverage/selection/history application,
   uses the selected transform sampler for pasted/lifted pixels and preview,
   and keeps the tool hint and brush footprint accurate.

## Verification

I62: explicit pixel goldens, round/square, 1px diagonal continuity, block alignment,
partial edge blocks, off-canvas bounded traversal, invalid inputs/no mutation.
I63: nearest source-color preservation under scaling/rotation and default-bilinear
compatibility. I53/I61: labelled controls, typed/clamped values, option visibility,
callback routing and disposal. Production browser: default opaque black-on-white
stroke contains only black/white; transparent-layer alpha only 0/255; coarse cells
uniform; selection/undo/reopen exact; smooth mode still produces fractional edges;
nearest transform/export preserves source colors; zoomed screenshots have crisp
edges. Retain existing golden tests and explicitly select Smooth only in tests
whose stated fixture is the previous soft brush. Run build, focused and full
regressions, static-host check and deployment dry run; push with green evidence.
Native macOS/Safari and physical iPad remain untested unless actually exercised.

Owner clarification: pixel rendering is a view preference as well as a brush
choice. Add Canvas rendering to View → View settings: Sharp pixels (nearest)
and Smooth (interpolated). Default Sharp pixels. Preview live, Cancel restores
it, OK retains it for the workspace, and neither mode changes document pixels
or history. Soft pixels already in an image remain visible as distinct pixels
in sharp view; no automatic thresholding of existing artwork.

I63 contract: transformRaster returns an owned raster for existing flip, rotate,
crop, resize, canvas and invert operations; affineRaster returns an owned raster
scaled in percent and rotated in degrees. Nearest copies source RGBA, bilinear
remains the API default. Reject invalid raster, nonfinite/nonpositive scales,
unknown samplers and output exceeding the shared raster limit with RangeError.
Dependencies: I50 createRaster, paintRaster, clip and types. No I/O. Existing
transform pixel goldens characterize the extraction; retain their assertions.
