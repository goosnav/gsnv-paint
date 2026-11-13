# CAD: cuts, fillets, chamfers, units and constraints (provisional GREEN)

This is the owner's second-round CAD request (2026-11-12), recorded as [D25](DECISIONS.md#d25--cad-cuts-fillets-chamfers-units-and-relationship-constraints).

- **Cuts:** Solid > Cut (or Cut… in the Part panel) adds a cut feature with its own XY sketch. While it is active, the base outline shows dashed for reference, and the sketch tools, Circle dimensions and Rectangle dimensions draw the cut profile. Depth… switches between through all and a typed depth, cut downward from the top of the part. Any number of cuts can be added. Each runs in order, and each closed profile in a cut sketch is cut separately.
- **Fillets and chamfers:** Fillet… rounds and Chamfer… bevels a set of edges (vertical corners, top, bottom or all) with a radius or distance. Sets are chosen by geometry rather than by picking single edges, so they survive every rebuild.
- **Units:** the Part panel's Metric (mm) / Imperial (in) switch sets the document's units. Numbers typed without units use them, and the choice is remembered for new parts. The same commands are in the Solid menu.
- **Constraints:** with two items selected (Ctrl-click): Parallel, Perpendicular, Equal length and Coincident (joins the closest pair of points). These add to Horizontal, Vertical and Fixed point. When constraints contradict each other, the message names them in words, or names the most recently added constraint when the solver cannot pin them down.

## Implementation

| Module | Role |
|---|---|
| `editable-cad-content.ts` (C50) | Schema: cut features with their own sketch and through/blind extent; fillet/chamfer with edge set and size; constraint kinds parallel, perpendicular, equal and coincident (with point roles) |
| `edit-cad-content.ts` (C51) | Actions: add-cut, cut-extent, edge-feature, remove-feature, units, relation; sketch actions take an optional target sketch |
| `linear-sketch-program.ts` (C52) | PlaneGCS mapping: `parallel`, `perpendicular_ll`, `equal_length`, `p2p_coincident` |
| `sketch-regions.ts` (C64) | `sketchLoops`: every closed loop of a cut sketch |
| `kernel-features.ts` (C65, new) | OCCT boolean cut with a tool prism from above the top; `BRepFilletAPI_MakeFillet` / `MakeChamfer` on geometry-classified edges; validity checks; readable failures that keep the input solid |
| `part-builder.ts` (new) | One rebuild for display and STEP export: all sketches, boss, then cuts/fillets/chamfers in order; feature-named errors |

## Verification

- `kernel-features.test.ts` (real OpenCascade): through-cut −250π mm³ exactly, 20 × 20 × 4 pocket −1600 mm³ exactly, vertical fillet r = 5 removes (4 − π)·25·10 mm³, a top chamfer falls within ±10 % of its analytic estimate, an oversize fillet fails with the input solid intact.
- `linear-sketch-program.test.ts` (real PlaneGCS): perpendicular, equal and coincident hold to 1e-6 mm.
- CAD-APP browser test: plate, through cut, then 4 mm depth (exact volumes), fillet (exact), chamfer, delete, imperial default remembered for new parts, perpendicular and equal on drawn lines, and a readable contradiction message.

## Limits

Cuts and fillets are on the XY plane and edge sets only (no single-edge picking or face sketches), and a cut always starts at the top of the part. Dimensions on cut sketches use the same tools as the base sketch.
