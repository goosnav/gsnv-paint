/**
 * PURPOSE    Construct one analytic planar face from a validated sketch region.
 * KIND       SHELL
 * CONTRACT   IN: live C01 session and canonical-mm C64 region, simple CCW outer
 *            polygon/circle and validated disjoint CW holes.
 *            OUT: tagged success with one caller-owned face after other wrappers
 *            are deleted, or tagged wire/face rejection after complete cleanup.
 *            RAISES: DisposedSessionError before native access for a closed session.
 * GUARANTEES No retention, region inference, source mutation or geometry repair.
 *            Unknown/native/cleanup exceptions propagate unchanged with no more
 *            native calls; the caller must terminate that worker.
 * TUNING     None; validation and document tolerances belong to the caller.
 * DECISIONS  D1: Return tagged ordinary rejection. Alternative: classify thrown
 *            error names, which can misidentify native faults as recoverable.
 *            Revisit if: verified native recovery becomes available.
 *            D2: Preserve C59's analytic circle axes and wire construction.
 *            Alternative: sampled contours lose exact curvature and STEP data.
 *            Revisit if: the general analytic profile compiler replaces C64.
 * LIMITS     Polygon/circle regions only; valid finite closed input is required.
 *            Output ownership transfers only after successful reverse cleanup.
 * TESTBENCH  src/cad/kernel-profile-face.test.ts -- run with: node --import tsx --test src/cad/kernel-profile-face.test.ts
 */
import type { TopoDS_Face, TopoDS_Wire } from 'replicad-opencascadejs';
import type { KernelSession } from './kernel-runtime.ts';
import type { ProfileRegion } from './sketch-regions.ts';

export type KernelProfileFaceRequest = { session: KernelSession; region: ProfileRegion };
export type KernelProfileFaceResult =
  | { ok: true; face: TopoDS_Face }
  | { ok: false; reason: 'outline-wire' | 'hole-wire' | 'outer-face' | 'hole-face' };

type WireResult = { ok: true; wire: TopoDS_Wire } | { ok: false; reason: 'outline-wire' | 'hole-wire' };

export function buildKernelProfileFace({ session, region }: KernelProfileFaceRequest): KernelProfileFaceResult {
  if (session.isClosed()) {
    throw Object.assign(new Error('The CAD kernel session is closed. Rebuild before creating a face.'), { name: 'DisposedSessionError' });
  }
  const oc = session.library, temporary = new Set<{ delete(): void }>();
  const own = <T extends { delete(): void }>(value: T): T => { temporary.add(value); return value; };
  const wireOf = (loop: ProfileRegion['outer'], hole: boolean): WireResult => {
    const builder = own(new oc.BRepBuilderAPI_MakeWire());
    if (loop.kind === 'circle') {
      const center = own(new oc.gp_Pnt(loop.center[0], loop.center[1], 0));
      // Inner circles use −Z so their boundary subtracts area from the face.
      const direction = own(new oc.gp_Dir(0, 0, hole ? -1 : 1));
      const axis = own(new oc.gp_Ax2(center, direction));
      const circle = own(new oc.gp_Circ(axis, loop.radius));
      const edgeBuilder = own(new oc.BRepBuilderAPI_MakeEdge(circle));
      const edge = own(edgeBuilder.Edge());
      builder.Add(edge);
    } else {
      for (let i = 0; i < loop.points.length; i++) {
        const a = loop.points[i]!, b = loop.points[(i + 1) % loop.points.length]!;
        const start = own(new oc.gp_Pnt(a[0], a[1], 0));
        const end = own(new oc.gp_Pnt(b[0], b[1], 0));
        const edgeBuilder = own(new oc.BRepBuilderAPI_MakeEdge(start, end));
        const edge = own(edgeBuilder.Edge());
        builder.Add(edge);
      }
    }
    if (!builder.IsDone()) return { ok: false, reason: hole ? 'hole-wire' : 'outline-wire' };
    return { ok: true, wire: own(builder.Wire()) };
  };
  const build = (): KernelProfileFaceResult => {
    const outline = wireOf(region.outer, false);
    if (!outline.ok) return outline;
    const builder = own(new oc.BRepBuilderAPI_MakeFace(outline.wire, true));
    if (!builder.IsDone()) return { ok: false, reason: 'outer-face' };
    for (const loop of region.holes) {
      const hole = wireOf(loop, true);
      if (!hole.ok) return hole;
      builder.Add(hole.wire);
    }
    if (!builder.IsDone()) return { ok: false, reason: 'hole-face' };
    return { ok: true, face: own(builder.Face()) };
  };
  // No finally: an unexpected native exception forbids even native deletions.
  const result = build();
  if (result.ok) temporary.delete(result.face);
  for (const object of [...temporary].reverse()) object.delete();
  return result;
}
