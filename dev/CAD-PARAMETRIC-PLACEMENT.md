# Parametric sketch placement contract

Status: core implementation and focused regression evidence complete, 2026-11-13. The earlier acceptance-plate volume test was partial evidence because it did not assert dependent positions. The parent owns the revised acceptance test with hole offsets and pocket centering after the length changes, plus its execution evidence.

## Persistent source

An existing `fix` constraint may additionally carry:

```ts
position: {
  x: { source: string; kind: 'length' };
  y: { source: string; kind: 'length' };
  entityIds: string[];
}
```

The constraint's existing `entityIds[0]` and `pointRoles[0]` identify its anchor: a circle center, or segment endpoint `a`/`b`. `position.entityIds` lists the source entities translated with that anchor. A newly created circle controls only itself; a newly created rectangle controls its four edges. Coordinate expressions allow zero and negative values. They must evaluate to finite lengths using the document's named-variable context.

Only fixed-point constraints may carry this record. Validation requires exact keys, existing controlled entities of the anchor's kind, the anchor entity in its group, no duplicate IDs, and no overlap between controlled groups. Circle groups contain exactly their anchor circle. Older constraints without `position` retain their existing fixed numeric coordinates. No persisted numeric seed or expression is silently discarded.

The sketch compiler evaluates the anchor coordinates on every rebuild and translates the controlled source seeds before compiling shared solver points. It then applies the existing fixed-point constraint. Translating the entire rectangle keeps its orientation stable even when its origin moves beyond its old bounds. The source expressions remain the authority; evaluated coordinates are disposable solver inputs.

Translation rejects overflow and precision-induced edge collapse before sending primitives to the native solver. This is separate from the finite expression check: a finite coordinate can still exceed the precision available to represent a small nearby edge.

Deleting a controlled entity prunes its associated positional constraint. Deleting the fixed-point constraint removes its coordinate control with it. Other constraints and dimensions continue through the normal edit and solve paths.

## Edit actions

These extend `CADAction`; the existing optional `sketch` argument selects the base or cut sketch for geometry and position edits.

```ts
{ kind: 'rectangle'; prefix: string; width: string; height: string;
  origin?: [number | string, number | string] }
{ kind: 'circle'; prefix: string; diameter: string;
  center: [number | string, number | string] }
{ kind: 'edit-position'; id: string; x: string; y: string }
{ kind: 'variable'; name: string; source: string;
  dimensionKind?: 'length' | 'angle' | 'scalar' }
{ kind: 'remove-variable'; name: string }
```

Numeric centers and origins retain the legacy meaning of canonical millimeters. Strings use the active document units and expression grammar. New circle and rectangle actions retain position sources even when their inputs are numeric, expressing those numeric inputs explicitly in millimeters.

`edit-position.id` identifies a fixed-point constraint with an existing position record. Both coordinates update atomically; invalid targets, kinds, unknown variables, nonfinite values or malformed expressions leave the input content unchanged.

`variable` creates or updates a named variable. New variables default to `length`; existing variables retain their kind unless `dimensionKind` is supplied. Names follow the existing identifier and reserved-name rules. Updates validate the variable graph and all dependent stored expressions before returning a new revision. A variable removal is rejected if any variable, dimension, feature parameter or position still references it. Source formulas are never replaced by evaluated numbers.

The `units` action binds position x/y expressions alongside variables, dimensions and feature parameters before changing the document unit setting. Existing physical placements are preserved, while newly typed bare numbers use the selected units.

## Parent integration

The parent owns the workspace and properties UI: named-variable controls, text inputs for source coordinates, position editing, displayed unit conversions, and the acceptance integration test. The placement implementer owns C50, C51, C52 and their matching unit tests.

The acceptance fixture defines named length variable `width = 100`, binds the base length to `width`, binds right-hole X coordinates to `width - 10`, and binds the pocket's X origin to `width / 2 - 10`. After changing only `width` to `120`, the test must assert right-hole centers at X = 110 mm and pocket origin at X = 50 mm (center X = 60 mm), in addition to the required volume, valid solid, persistence and STEP checks. The four centers remain 10 mm from their neighboring edges in both states.

## Required regression evidence

- Existing files without position records remain valid and retain their numeric geometry.
- Exact position-schema validation rejects malformed records, invalid groups, overlapping groups and non-length/nonfinite coordinates.
- Circle and rectangle placement formulas survive edits, save/reopen and unit switches.
- A changed named variable moves the real solved circle centers and rectangle origin, including a large movement that could otherwise reverse a rectangle.
- Position and variable edit errors are atomic; referenced variables cannot be removed.
- Parent integration asserts the acceptance plate's positions as well as its volume before claiming full acceptance.

## Focused evidence

Before implementation, the three focused test files had 13 passes and 8 expected failures demonstrating the missing position schema/actions/solver translation. The added precision-collapse regression also failed before the native-input guard.

After implementation, `node --import tsx --test src/cad/editable-cad-content.test.ts src/cad/edit-cad-content.test.ts src/cad/linear-sketch-program.test.ts src/cad/dimension-expressions.test.ts src/cad/named-variables.test.ts` passes 73/73. This includes the real PlaneGCS solver at width values 100, 120, 400 and -100 with unchanged persisted seeds, finite negative positions, endpoint-b anchoring, legacy numeric fixed points, schema rejection, dependency failures, feature-reference deletion checks, and mm/inch round trips.

The repository typecheck reports no errors in these modules. At this handoff, its remaining errors are in the concurrent `src/audio/audio-document.ts` work; no whole-repository typecheck success is claimed here.
