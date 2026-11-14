/**
 * PURPOSE    Construct one validated B-rep prism from a polygon or a region with holes.
 * KIND       SHELL
 * CONTRACT   IN: live C01 session, C53 simple CCW polygon or C64 region in mm,
 *            finite nonzero signed depth. OUT: C01-owned solid token after all
 *            temporary cleanup succeeds; caller must release it.
 *            RAISES: ExtrusionError for failed wire/face/prism or invalid solid;
 *            DisposedSessionError for a closed session.
 * GUARANTEES No source mutation, mesh reconstruction or escaped temporary handles
 *            on normal completion. Unexpected/native/cleanup faults stop all
 *            further native calls and propagate unchanged for worker termination.
 * TUNING     None; geometry and tolerance are validated by the caller.
 * DECISIONS  D1: Retain one solid in C01. Alternative: duplicate builders for display
 *            and exchange could produce different parts. Revisit if: C24 replaces this subset.
 *            D2: Share analytic C77 face construction. Alternative: copy face builders
 *            into every solid operation, risking differing hole/curve behavior.
 *            Revisit if: the general analytic profile compiler replaces C64.
 *            D3: Clean up only an error originated by this call. Alternative: match
 *            error names, which could allow unsafe calls after an unknown fault.
 *            Revisit if: verified native recovery becomes available.
 * LIMITS     One linear blind boss. Native faults propagate; terminate the worker
 *            without further native calls. Finite simple polygon is a precondition.
 * TESTBENCH  node --import tsx --test src/cad/kernel-linear-prism.test.ts src/cad/kernel-prism-characterization.test.ts src/cad/kernel-prism-ownership.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
import type { ProfileRegion } from './sketch-regions.ts';
import { buildKernelProfileFace } from './kernel-profile-face.ts';

/** A bare polygon preserves C59's original request; a C64 region additionally supplies holes. */
export type LinearPrismRequest = { session: KernelSession; depth: number } &
  ({ polygon: readonly (readonly [number, number])[] } | { region: ProfileRegion });

export function buildLinearPrism(request: LinearPrismRequest): ReturnType<KernelSession['retain']> {
  const { session, depth } = request;
  if (session.isClosed()) {
    throw Object.assign(new Error('The CAD kernel session is closed. Rebuild before creating a solid.'), { name: 'DisposedSessionError' });
  }
  const region: ProfileRegion = 'region' in request ? request.region : {
    outer: { kind: 'polygon', points: request.polygon.map(p => [p[0], p[1]]) }, holes: [],
  };
  const profile = buildKernelProfileFace({ session, region });
  if (!profile.ok) {
    const messages = {
      'outline-wire': 'Extrude: the outline could not be connected into a wire.',
      'hole-wire': 'Extrude: a hole could not be connected into a wire.',
      'outer-face': 'Extrude: the sketch did not form a planar face.',
      'hole-face': 'Extrude: a hole could not be added to the face.',
    };
    throw Object.assign(new Error(messages[profile.reason]), { name: 'ExtrusionError' });
  }
  const temporary = new Set<{ delete(): void }>();
  const own = <T extends { delete(): void }>(value: T): T => { temporary.add(value); return value; };
  const face = own(profile.face), oc = session.library;
  const cleanup = () => { for (const object of [...temporary].reverse()) object.delete(); };
  let ordinary: Error | undefined, shape: ReturnType<KernelSession['resolve']>;
  const fail = (message: string): never => {
    ordinary = Object.assign(new Error(message), { name: 'ExtrusionError' });
    throw ordinary;
  };
  try {
    const vector = own(new oc.gp_Vec(0, 0, depth));
    const builder = own(new oc.BRepPrimAPI_MakePrism(face, vector, false, true));
    if (!builder.IsDone()) fail('Extrude: OpenCascade could not construct this solid.');
    shape = own(builder.Shape());
    const check = own(new oc.BRepCheck_Analyzer(shape, true, false));
    if (!check.IsValid()) fail('Extrude: OpenCascade reported an invalid solid. Edit the sketch or depth.');
  } catch (cause) {
    // Only this exact deliberate rejection permits more native calls.
    if (ordinary && cause === ordinary) cleanup();
    throw cause;
  }
  temporary.delete(shape);
  cleanup();
  return session.retain(shape);
}
