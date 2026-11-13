/**
 * PURPOSE    Turn a solved sketch into one extrudable region: an outer boundary plus holes.
 * KIND       CORE
 * CONTRACT   IN: finite solved segments/circles and positive tolerance. Construction geometry
 *            is ignored. Each connected group of segments must be one simple closed loop (C53
 *            rules); each circle is its own loop.
 *            OUT: {outer, holes}; the outer loop contains every other loop, polygons are CCW for
 *            the outer boundary and CW for holes, circles keep center/radius.
 *            RAISES: ProfileError for no loop, open/branched outlines, several outer boundaries,
 *            holes that touch/cross the boundary or each other, or holes nested in holes.
 * GUARANTEES Pure and deterministic; no mutation; same answer for any entity order.
 * TUNING     Separation checks use the document linear tolerance.
 * DECISIONS  D1: Require strictly separated loops. Alternative: boolean-merge touching
 *            loops; rejected because the kernel would build a different part than drawn.
 *            Revisit if: sketch trim/region selection (C11/C15) lands.
 * LIMITS     One region per sketch; islands inside holes and arcs are not supported.
 * TESTBENCH  src/cad/sketch-regions.test.ts -- run with: node --import tsx --test src/cad/sketch-regions.test.ts
 */
import { linearProfile } from './linear-profile.ts';
import type { SketchEntity } from './editable-cad-content.ts';

type P = readonly [number, number];
export type ProfileLoop = { kind: 'polygon'; points: [number, number][] } | { kind: 'circle'; center: [number, number]; radius: number };
export type ProfileRegion = { outer: ProfileLoop; holes: ProfileLoop[] };

const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'ProfileError' }); };
const area = (l: ProfileLoop) => l.kind === 'circle' ? Math.PI * l.radius ** 2 : Math.abs(l.points.reduce((s, p, i) => { const q = l.points[(i + 1) % l.points.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
function segmentDistance(p: P, a: P, b: P) {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function inside(p: P, polygon: readonly P[]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
function crosses(a: P, b: P, c: P, d: P, tolerance: number) {
  const cross = (o: P, p: P, q: P) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  if (x * y < 0 && z * w < 0) return true;
  return Math.min(segmentDistance(c, a, b), segmentDistance(d, a, b), segmentDistance(a, c, d), segmentDistance(b, c, d)) <= tolerance;
}
/** True when `inner` lies strictly inside `outer` with at least `tolerance` clearance. */
function contains(outer: ProfileLoop, inner: ProfileLoop, tolerance: number): boolean {
  if (outer.kind === 'circle') {
    if (inner.kind === 'circle') return Math.hypot(inner.center[0] - outer.center[0], inner.center[1] - outer.center[1]) + inner.radius < outer.radius - tolerance;
    return inner.points.every(p => Math.hypot(p[0] - outer.center[0], p[1] - outer.center[1]) < outer.radius - tolerance);
  }
  const edges = outer.points.map((p, i) => [p, outer.points[(i + 1) % outer.points.length]!] as const);
  if (inner.kind === 'circle') return inside(inner.center, outer.points) && edges.every(([a, b]) => segmentDistance(inner.center, a, b) > inner.radius + tolerance);
  if (!inner.points.every(p => inside(p, outer.points))) return false;
  return inner.points.every((c, i) => edges.every(([a, b]) => !crosses(a, b, c, inner.points[(i + 1) % inner.points.length]!, tolerance)));
}
function disjoint(a: ProfileLoop, b: ProfileLoop, tolerance: number): boolean {
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) > a.radius + b.radius + tolerance;
  if (a.kind === 'circle' || b.kind === 'circle') {
    const c = (a.kind === 'circle' ? a : b) as Extract<ProfileLoop, { kind: 'circle' }>, poly = (a.kind === 'circle' ? b : a) as Extract<ProfileLoop, { kind: 'polygon' }>;
    return !inside(c.center, poly.points) && poly.points.every((p, i) => segmentDistance(c.center, p, poly.points[(i + 1) % poly.points.length]!) > c.radius + tolerance);
  }
  const pa = a.points, pb = (b as Extract<ProfileLoop, { kind: 'polygon' }>).points;
  if (inside(pa[0]!, pb) || inside(pb[0]!, pa)) return false;
  return pa.every((p, i) => pb.every((q, j) => !crosses(p, pa[(i + 1) % pa.length]!, q, pb[(j + 1) % pb.length]!, tolerance)));
}

/** Every closed loop in the sketch (each circle, and each connected group of segments), without nesting rules. */
export function sketchLoops({ entities, tolerance }: { entities: readonly SketchEntity[]; tolerance: number }): ProfileLoop[] {
  if (!Number.isFinite(tolerance) || tolerance <= 0) fail('The document tolerance must be positive.');
  const loops: ProfileLoop[] = [];
  for (const e of entities) if (e.kind === 'circle' && !e.construction) {
    if (![...e.center, e.radius].every(Number.isFinite) || e.radius <= tolerance) fail('The profile contains a collapsed circle.');
    loops.push({ kind: 'circle', center: [e.center[0], e.center[1]], radius: e.radius });
  }
  // Group segments into connected components by shared endpoints, then validate each as one loop.
  const segments = entities.filter((e): e is Extract<SketchEntity, { kind: 'segment' }> => e.kind === 'segment' && !e.construction);
  const parent = segments.map((_, i) => i), find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]!));
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i]!, b = segments[j]!;
    if ([a.a, a.b].some(p => [b.a, b.b].some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance))) parent[find(i)] = find(j);
  }
  const groups = new Map<number, typeof segments>();
  segments.forEach((s, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), s]));
  for (const group of groups.values()) loops.push({ kind: 'polygon', points: linearProfile({ entities: group, tolerance }) });
  return loops;
}

export function sketchRegions({ entities, tolerance }: { entities: readonly SketchEntity[]; tolerance: number }): ProfileRegion {
  const loops = sketchLoops({ entities, tolerance });
  if (!loops.length) fail('Extrude needs a closed profile: draw a closed outline or a circle.');
  loops.sort((a, b) => area(b) - area(a));
  const [outer, ...holes] = loops as [ProfileLoop, ...ProfileLoop[]];
  for (const hole of holes) if (!contains(outer, hole, tolerance)) fail('Every other loop must sit fully inside the outer outline (as a hole) without touching it. Only one outer outline is supported.');
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) if (!disjoint(holes[i]!, holes[j]!, tolerance)) fail('Holes must not touch, overlap or sit inside each other.');
  return { outer, holes: holes.map(h => h.kind === 'polygon' ? { kind: 'polygon', points: [h.points[0]!, ...h.points.slice(1).reverse()] } : h) };
}
