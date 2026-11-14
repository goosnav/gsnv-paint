/**
 * PURPOSE    Apply cut, fillet and chamfer features to a retained B-rep solid.
 * KIND       SHELL
 * CONTRACT   IN: live C01 session, a retained solid token and one operation:
 *            cut {loops (C64 loops), top z, depth or null for through all} — each loop is extruded downward
 *            from just above the top and subtracted; edges {kind:'fillet'|'chamfer', set, size} — rounds or
 *            bevels every edge in the set (vertical, top, bottom or all), classified by geometry.
 *            OUT: a new retained token for one valid positive-volume solid; the input token is released.
 *            RAISES: FeatureError with a readable reason when OCCT cannot build or validate the result
 *            (for example a fillet larger than the edge allows); the input token stays valid in that case.
 * GUARANTEES Ordinary failures preserve the input; compounds never silently lose extra geometry.
 *            Native faults stop further native calls and require whole-worker termination.
 * TUNING     CLEARANCE=1 mm above/below the solid so cut tools never share faces with it.
 * DECISIONS  D1: Edge sets by geometry rather than picked edges: robust across rebuilds (no topological
 *            naming problem). Revisit if: per-edge picking (C30) lands.
 * LIMITS     XY-plane features only; cuts go downward from the top of the part.
 * TESTBENCH  src/cad/kernel-features.test.ts -- run with: node --import tsx --test src/cad/kernel-features.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
import type { ProfileLoop } from './sketch-regions.ts';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import type { EdgeSet } from './editable-cad-content.ts';

type Token = ReturnType<KernelSession['retain']>;
export type FeatureOp = { kind: 'cut'; loops: readonly ProfileLoop[]; top: number; bottom: number; depth: number | null } | { kind: 'fillet' | 'chamfer'; set: EdgeSet; size: number };
const CLEARANCE = 1;
// Allow floating-point integration noise, without introducing a physical minimum cut size.
const VOLUME_ROUNDOFF = 64 * Number.EPSILON;
const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'FeatureError' }); };
const nativeFault = (cause: unknown) => (typeof WebAssembly.Exception === 'function' && cause instanceof WebAssembly.Exception) || cause instanceof WebAssembly.RuntimeError || typeof cause === 'number';

export function applyFeature(session: KernelSession, token: Token, op: FeatureOp): Token {
  const oc = session.library, temp: { delete(): void }[] = [], own = <T extends { delete(): void }>(v: T): T => { temp.push(v); return v; };
  const tools: Token[] = [];
  let faulted = false;
  const volume = (shape: ReturnType<KernelSession['resolve']>) => {
    const properties = own(new oc.GProp_GProps());
    oc.BRepGProp.VolumeProperties(shape, properties, true, false, false); return properties.Mass();
  };
  try {
    const shape = session.resolve(token); let result: InstanceType<typeof oc.TopoDS_Shape>;
    if (op.kind === 'cut') {
      if (!op.loops.length) fail('The cut sketch has no closed profile.');
      const start = op.top + CLEARANCE, length = op.depth === null ? op.top - op.bottom + 2 * CLEARANCE : op.depth + CLEARANCE;
      if (!(length > 0)) fail('The cut depth must be positive.');
      result = shape;
      let before = volume(shape);
      for (const loop of op.loops) {
        const tool = buildLinearPrism({ session, region: { outer: loop, holes: [] }, depth: -length }); tools.push(tool);
        const trsf = own(new oc.gp_Trsf()); trsf.SetTranslation(own(new oc.gp_Vec(0, 0, start)));
        const moved = own(new oc.BRepBuilderAPI_Transform(session.resolve(tool), trsf, true, false));
        const cut = own(new oc.BRepAlgoAPI_Cut(result, own(moved.Shape())));
        if (!cut.IsDone()) fail('The cut could not be computed. Check that the profile overlaps the part.');
        result = own(cut.Shape());
        if (result.IsNull()) fail('The cut removed the whole solid. Use a smaller profile or a shallower depth.');
        const after = volume(result);
        if (!Number.isFinite(after) || after <= 0) fail('The cut left no valid solid. Use a smaller profile or a shallower depth.');
        if (!(before - after > Math.abs(before) * VOLUME_ROUNDOFF)) fail('A cut profile does not remove material. Move it so it overlaps the remaining part.');
        before = after;
      }
    } else {
      if (!(op.size > 0)) fail(`The ${op.kind} size must be positive.`);
      const box = own(new oc.Bnd_Box()); oc.BRepBndLib.Add(shape, box, false);
      const zMin = own(box.CornerMin()).Z(), zMax = own(box.CornerMax()).Z(), tol = 1e-4 * Math.max(1, zMax - zMin);
      const builder = own(op.kind === 'fillet' ? new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational as never) : new oc.BRepFilletAPI_MakeChamfer(shape));
      const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), seen: InstanceType<typeof oc.TopoDS_Shape>[] = [];
      let count = 0;
      for (; explorer.More(); explorer.Next()) {
        const current = own(explorer.Current()); if (seen.some(s => s.IsSame(current))) continue; seen.push(current);
        const edge = own(oc.TopoDS.Edge(current)), curve = own(new oc.BRepAdaptor_Curve(edge)), u0 = curve.FirstParameter(), u1 = curve.LastParameter();
        const [a, b, m] = [u0, u1, (u0 + u1) / 2].map(u => own(curve.Value(u)));
        const vertical = Math.abs(a!.X() - b!.X()) < tol && Math.abs(a!.Y() - b!.Y()) < tol && Math.abs(a!.Z() - b!.Z()) > tol;
        const at = (z: number) => [a!, b!, m!].every(p => Math.abs(p.Z() - z) < tol);
        const wanted = op.set === 'all' || (op.set === 'vertical' && vertical) || (op.set === 'top' && at(zMax)) || (op.set === 'bottom' && at(zMin));
        if (!wanted) continue;
        (builder as { Add(size: number, edge: unknown): void }).Add(op.size, edge); count++;
      }
      if (!count) fail(`There are no ${op.set} edges to ${op.kind === 'fillet' ? 'round' : 'chamfer'}.`);
      builder.Build();
      if (!builder.IsDone()) fail(`The ${op.kind} could not be built. Try a smaller size (it must fit within the shortest edge and the nearest face).`);
      result = own(builder.Shape());
    }
    if (result.IsNull()) fail(`The ${op.kind} left no solid.`);
    // OCCT features commonly return a compound even when it contains exactly one solid.
    // Reject any additional topology before extracting that solid for display and STEP.
    if (result.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_SOLID) {
      for (const kind of [oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_VERTEX]) {
        const loose = own(new oc.TopExp_Explorer(result, kind, oc.TopAbs_ShapeEnum.TopAbs_SOLID));
        if (loose.More()) fail(`The ${op.kind} left loose geometry outside its solid. Try a different size or profile.`);
      }
      const solids = own(new oc.TopExp_Explorer(result, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      if (!solids.More()) fail(`The ${op.kind} left no solid.`);
      const solid = own(solids.Current()); solids.Next();
      if (solids.More()) fail(`The ${op.kind} produced multiple solids. This part must remain a single connected solid.`);
      result = solid;
    }
    const check = own(new oc.BRepCheck_Analyzer(result, true, false));
    if (!check.IsValid()) fail(`The ${op.kind} produced an invalid solid. Try a smaller size or a different profile.`);
    const resultVolume = volume(result);
    if (!Number.isFinite(resultVolume) || resultVolume <= 0) fail(`The ${op.kind} left no valid positive-volume solid.`);
    const next = session.retain(result); temp.splice(temp.indexOf(result), 1);
    session.release(token); return next;
  } catch (cause) {
    faulted = nativeFault(cause) || session.isClosed();
    if (cause instanceof Error && cause.name === 'FeatureError') throw cause;
    throw Object.assign(new Error(`The ${op.kind} failed in the CAD kernel. Try a smaller size or simpler profile.`), { name: 'FeatureError', cause });
  } finally {
    if (!faulted) {
      for (const t of tools) session.release(t);
      // A cleanup fault must also stop cleanup immediately; the worker will be terminated.
      for (const object of temp.reverse()) object.delete();
    }
  }
}
