# Graphical Paint free transform

Owner request: select pixels and resize them graphically, as in familiar image
editors. Replace the modal-first interaction with on-canvas handles, retaining
precise numeric control. BATCH authorization applies to this increment.

## Contract before implementation

- **XFORM-01 / IMAGE-XFORM CORE:** pure transform geometry for move, eight resize
  handles and rotation. Resize anchors the opposite edge/corner; Shift or Keep
  proportions constrains aspect ratio, Shift snaps rotation to 15 degrees.
  Positive dimensions and the existing raster allocation bounds are enforced.
- **XFORM-02 / IMAGE-XFORM-VIEW SHELL:** selection/floating pixels show handles;
  Ctrl+T or Free transform activates them for the selection or entire layer.
  Pointer/touch dragging previews resize, move and rotation; constant screen-size
  handles remain usable while zoomed. Inline X/Y/width/height/angle controls provide
  typed equivalents, with Apply/Cancel and Enter/Esc. View UI never paints pixels.
- **XFORM-03 / IMAGE-APP:** retain the original lifted pixels throughout preview;
  compose their visual transform with the current zoom/pan. Rasterize once on
  apply using the existing affineRaster CORE. Apply is one history entry; Cancel
  restores pixels and selection without a history entry. Save/export flushes the
  visible result. Undo/redo, switching tools/documents, zoom and resize cannot
  leave a stale overlay or commit to a different revision.

## Verification

Geometry tests: anchored resize, rotated resize, aspect lock, move, rotation snap,
invalid/oversized bounds. UI tests: handles appear after selection, drag-to-enlarge
with pixel output, non-destructive preview/cancel, one-step undo/redo, numeric
resize, move/rotation, zoom-aware handles and touch input. Project/export paths
must include only committed output. Other browsers and physical iPad are untested
unless actually exercised. Existing bilinear alpha sampling is retained; no warp,
perspective or new interpolation algorithm is introduced.

Status: provisional GREEN. See [checkpoint evidence](PAINT-OPEN-NAVIGATION-EVIDENCE.md).

Small-selection refinement: automatically displayed handles must not intercept
ordinary selection gestures on a tiny image. Below 48 screen pixels on either
axis, show the selection outline and expose handles when Free transform/Ctrl+T is
explicitly activated. Larger selections keep direct handles. Existing pixel-exact
selection goldens remain the oracle; do not update them to accommodate UI changes.
