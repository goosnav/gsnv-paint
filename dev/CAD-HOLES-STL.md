# CAD circles, holes and STL — provisional GREEN

[D21](DECISIONS.md#d21--circles-holes-and-stl-in-the-working-cad-path) extends the working CAD path. A sketch may now contain one outline (rectangle or closed lines) or a circle as the outer boundary, plus any number of circles or closed outlines strictly inside it, which become holes when extruded. C64 computes the region; C59 builds the B-rep face with inner wires; C38 writes binary STL.

## Workflow

Sketch → Circle dimensions… creates a circle with a driving diameter and a fixed center (fully defined). The Circle tool (C) takes two clicks: center, then a point on the circle; the drawn diameter becomes an editable dimension. Diameters appear as ⌀ labels and as Part-panel buttons, and edit like other dimensions. Rectangle dimensions or the Rectangle tool replace the outline only, keeping holes. Solid → Export STL (3D printing) downloads a binary STL of the current solid.

## Verification — 2026-11-12

| Check | Result |
|---|---|
| `src/cad/sketch-regions.test.ts` | Containment, orientation, order independence; rejection of open, touching, crossing, separate and nested loops |
| `src/cad/kernel-linear-prism.test.ts` (real OCCT in Node) | Plate 100 × 60 × ±10 with Ø10, Ø16 and 20 × 20 holes: volume exact to 1e-6 mm³, also after STEP export and re-import; tube Ø20/Ø8 × 5 exact |
| `src/cad/linear-sketch-program.test.ts` (real PlaneGCS in Node) | Circle drawn at r = 3 solves to the driving diameter `2 * 7` with 0 DOF |
| `src/cad/stl-serialization.test.ts` | Golden 134-byte single-triangle file; counts, normals, scaling and rejection cases |
| CAD-APP browser test | UI-built plate with a dialog hole and a pointer-drawn hole: B-rep volume matches the analytic value; STL has 84 + 50n bytes and spans z = 0…10; undo restores the previous volume |
| `npm test` / `npm run test:browser` | 537 / 21 pass |

## Limits

One region per sketch (no separate bodies, islands inside holes, arcs or slots yet). Holes must not touch the outline or each other. STL uses the display triangulation (0.1 mm deflection), not a separate export tessellation. Cuts, fillets, other planes and multiple features remain planned.
