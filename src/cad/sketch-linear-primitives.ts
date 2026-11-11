/**
 * PURPOSE    Construct primitive linear sketch geometry.
 * KIND       CORE
 * CONTRACT   IN: LinearRequest with finite millimetre anchors, positive finite document
 *            tolerance, unique nonempty IDs and an explicit construction flag. Point uses
 *            one anchor; every other tool uses two. Corner rectangle uses opposite corners;
 *            center rectangle uses center then corner. Polygon uses center then first vertex,
 *            with integer sides >= 3 and counterclockwise vertex order in sketch coordinates.
 *            OUT: LinearEntity[] in supplied ID order; closed composites have exactly equal
 *            adjacent endpoints. All entities inherit construction. Results own their arrays.
 *            RAISES: AnchorCountError for wrong anchor count; InvalidPolygonError for missing,
 *            fractional or fewer than three sides; IdCountError for wrong entity ID count;
 *            DegenerateGeometryError for collapsed or nonfinite resulting geometry. A line
 *            or polygon edge must exceed tolerance.linearMm; rectangle width and height must
 *            each exceed it. Point has no minimum distance. No partial output or mutation.
 * GUARANTEES Pure and deterministic; no UI, solver, kernel, implicit IDs, I/O or global state.
 * TUNING     Geometry threshold is the caller's document tolerance.linearMm; no extra epsilon.
 * DECISIONS  D1: Emit primitive segments with exact shared endpoint values. Alternative:
 *            hidden rectangle/polygon objects would require every consumer to expand them.
 *            Revisit if the document's approved entity model adds composite entities.
 *            D2: A polygon's second anchor fixes its first vertex and circumradius.
 *            Alternative: an inscribed-edge anchor makes radius ambiguous to dimension tools.
 *            Revisit if the drawing interaction explicitly adds an inscribed mode.
 * LIMITS     Valid tool tags, finite anchor tuples, positive tolerance and unique IDs are
 *            caller preconditions. Does not add constraints, dimensions or infer snapping.
 *            Canonical mm only; dimension expressions are evaluated before this boundary.
 * TESTBENCH  src/cad/sketch-linear-primitives.test.ts -- run with: node --import tsx --test src/cad/sketch-linear-primitives.test.ts
 */
type Vec2 = readonly [number, number];
export type LinearEntity = Readonly<{ id: string; construction: boolean }> & (
  | Readonly<{ kind: 'point'; p: Vec2 }>
  | Readonly<{ kind: 'segment'; a: Vec2; b: Vec2 }>
);
export type LinearRequest = Readonly<{
  tool: 'point' | 'line' | 'corner-rectangle' | 'center-rectangle' | 'polygon';
  anchors: readonly Vec2[]; sides?: number; construction: boolean; ids: readonly string[];
  tolerance: Readonly<{ linearMm: number; angularRad: number; relative: number }>;
}>;

function fail(name: string, message: string): never {
  throw Object.assign(new Error(message), { name });
}
const copy = (point: Vec2): [number, number] => [point[0], point[1]];

export function makeLinearEntities({ tool, anchors, sides, construction, ids, tolerance }: LinearRequest): LinearEntity[] {
  const anchorCount = tool === 'point' ? 1 : 2;
  if (anchors.length !== anchorCount) fail('AnchorCountError', `${tool} needs exactly ${anchorCount} anchors; received ${anchors.length}.`);
  if (tool === 'polygon' && (sides === undefined || !Number.isInteger(sides) || sides < 3)) {
    fail('InvalidPolygonError', 'A regular polygon needs a whole-number side count of at least 3.');
  }
  const entityCount = tool === 'point' || tool === 'line' ? 1 : tool === 'polygon' ? sides! : 4;
  if (ids.length !== entityCount) fail('IdCountError', `${tool} needs exactly ${entityCount} entity IDs; received ${ids.length}.`);
  const first = anchors[0]!;
  if (tool === 'point') return [{ id: ids[0]!, kind: 'point', p: copy(first), construction }];
  const second = anchors[1]!;
  let vertices: Vec2[];
  if (tool === 'line') vertices = [first, second];
  else if (tool === 'polygon') {
    const dx = second[0] - first[0], dy = second[1] - first[1];
    vertices = [second];
    for (let i = 1; i < sides!; i++) {
      const angle = 2 * Math.PI * i / sides!, c = Math.cos(angle), s = Math.sin(angle);
      vertices.push([first[0] + dx * c - dy * s, first[1] + dx * s + dy * c]);
    }
  } else {
    // This form avoids overflowing 2 * center when the reflected corner is finite.
    const opposite: Vec2 = tool === 'center-rectangle'
      ? [first[0] + (first[0] - second[0]), first[1] + (first[1] - second[1])] : first;
    vertices = [opposite, [second[0], opposite[1]], second, [opposite[0], second[1]]];
  }
  return ids.map((id, i) => {
    const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (![...a, ...b, length].every(Number.isFinite) || length <= tolerance.linearMm) {
      fail('DegenerateGeometryError', `${tool} would create a collapsed or nonfinite edge. Each edge must exceed ${tolerance.linearMm} mm.`);
    }
    return { id, kind: 'segment', a: copy(a), b: copy(b), construction };
  });
}
