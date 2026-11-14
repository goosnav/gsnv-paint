/**
 * PURPOSE    Execute one validated sketch-axis revolve recipe in OpenCascade.
 * KIND       SHELL
 * CONTRACT   IN: live C01 session and C79 profile result, canonical mm/radians.
 *            OUT: one retained, valid, nonempty single solid with finite positive
 *            native volume; caller consumes/releases its session token.
 *            RAISES: RevolveError for a tagged C77 rejection, unfinished builder,
 *            null/non-solid/invalid shape or nonpositive/nonfinite native volume;
 *            DisposedSessionError before native access for a closed session.
 * GUARANTEES Analytic profile, signed sweep, no target fusion or input mutation.
 *            Register every native wrapper immediately; reverse cleanup precedes
 *            retention. Only a deliberately originated ordinary error permits
 *            cleanup. Unknown/native/cleanup/retain faults propagate unchanged,
 *            with no further native calls; the owner must terminate the worker.
 * TUNING     None; source and profile policy belongs to C79, validity to the kernel.
 * DECISIONS  D1: Reuse C77's analytic face. Alternative: duplicate profile builders
 *            that may disagree with extrusion and exchange. Revisit if: the general
 *            analytic profile compiler replaces this bounded path.
 *            D2: Require exactly SOLID. Alternative: select a body from a compound,
 *            hiding failed or ambiguous geometry. Revisit if: multi-body revolve
 *            has an explicitly approved source and result contract.
 *            D3: Cleanup before retain with exact ordinary-error identity. Alternative:
 *            broad finally/name matching can call a damaged native session.
 *            Revisit if: the pinned kernel provides verified fault recovery.
 * LIMITS     Validated one-section +V boss only; no source evaluation, plane placement,
 *            face selection, policy repair, cuts, target consumption or main-thread use.
 * TESTBENCH  src/cad/kernel-revolve.test.ts -- run with: node --import tsx --test src/cad/kernel-revolve.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
import { buildKernelProfileFace } from './kernel-profile-face.ts';
import type { RevolveRecipeRequest, RevolveRecipeResult } from './revolve-recipe.ts';

export type KernelRevolveRequest = {
  session: KernelSession;
  recipe: RevolveRecipeResult<Extract<RevolveRecipeRequest, { operation: 'profile' }>>;
};

export function buildRevolvedSolid({ session, recipe }: KernelRevolveRequest): ReturnType<KernelSession['retain']> {
  if (session.isClosed()) {
    throw Object.assign(new Error('The CAD kernel session is closed. Rebuild before creating a revolved solid.'), { name: 'DisposedSessionError' });
  }
  const profile = buildKernelProfileFace({ session, region: { outer: recipe.profile, holes: [] } });
  if (!profile.ok) {
    throw Object.assign(new Error(`Revolve: the sketch could not form a planar face (${profile.reason}).`), { name: 'RevolveError' });
  }
  const temporary = new Set<{ delete(): void }>();
  const own = <T extends { delete(): void }>(value: T): T => { temporary.add(value); return value; };
  const face = own(profile.face), oc = session.library;
  const cleanup = () => { for (const object of [...temporary].reverse()) object.delete(); };
  let ordinary: Error | undefined, shape: ReturnType<KernelSession['resolve']>;
  const fail = (message: string): never => {
    ordinary = Object.assign(new Error(`Revolve: ${message}`), { name: 'RevolveError' });
    throw ordinary;
  };
  try {
    const origin = own(new oc.gp_Pnt(...recipe.axis.origin));
    const direction = own(new oc.gp_Dir(...recipe.axis.direction));
    const axis = own(new oc.gp_Ax1(origin, direction));
    const builder = own(new oc.BRepPrimAPI_MakeRevol(face, axis, recipe.angleRad, true));
    if (!builder.IsDone()) fail('OpenCascade could not complete this operation. Edit the sketch or angle.');
    shape = own(builder.Shape());
    if (shape.IsNull() || shape.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_SOLID) {
      fail('the operation must return exactly one nonempty solid.');
    }
    const check = own(new oc.BRepCheck_Analyzer(shape, true, false));
    if (!check.IsValid()) fail('OpenCascade reported an invalid solid. Edit the sketch or angle.');
    const properties = own(new oc.GProp_GProps());
    oc.BRepGProp.VolumeProperties(shape, properties, true, false, false);
    const volume = properties.Mass();
    if (!Number.isFinite(volume) || volume <= 0) fail('the operation returned no finite positive material volume.');
  } catch (cause) {
    // A forged error name, including one thrown by C77, does not authorize cleanup.
    if (ordinary && cause === ordinary) cleanup();
    throw cause;
  }
  temporary.delete(shape);
  cleanup();
  return session.retain(shape);
}
