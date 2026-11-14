/**
 * PURPOSE    Place the completed local CAD part on its default world plane.
 * KIND       SHELL
 * CONTRACT   IN: live retained single solid and default plane. OUT: retained world solid;
 *            XY passes through, other successful transforms consume input exactly once.
 *            RAISES: PlaneTransformError for ordinary invalid results (input preserved),
 *            DisposedSessionError when closed; invalid token/default-plane errors propagate.
 * GUARANTEES Rigid right-handed transform only; no lost geometry, mesh substitute or mutation.
 *            Unexpected/native/cleanup faults stop native calls; terminate the worker.
 * TUNING     None; C70 fixes the exact basis convention.
 * DECISIONS  D1: Transform after all local features. Alternative: rotate only the boss,
 *            which breaks local cuts/edge sets. Revisit if: independent sketch frames land.
 * LIMITS     One solid, default origin planes. Caller never re-transforms world geometry.
 * TESTBENCH  node --import tsx --test src/cad/kernel-plane-transform.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
import { defaultPlaneFrame, type DefaultPlane } from './default-plane-frame.ts';
type Token=ReturnType<KernelSession['retain']>;
export function transformPartPlane({session,token,plane}:{session:KernelSession;token:Token;plane:DefaultPlane}):Token {
  const {localToWorld:m}=defaultPlaneFrame(plane);
  if(session.isClosed())throw Object.assign(new Error('The CAD kernel session is closed. Rebuild the part.'),{name:'DisposedSessionError'});
  const shape=session.resolve(token);if(plane==='XY')return token;
  const oc=session.library,temp=new Set<{delete():void}>(),own=<T extends{delete():void}>(v:T):T=>{temp.add(v);return v;};
  const cleanup=()=>{for(const v of [...temp].reverse()){v.delete();temp.delete(v);}};
  let ordinary:Error|undefined,result:ReturnType<KernelSession['resolve']>;
  const fail=(message:string):never=>{ordinary=Object.assign(new Error(message),{name:'PlaneTransformError'});throw ordinary;};
  try{
    const transform=own(new oc.gp_Trsf());
    transform.SetValues(m[0]!,m[4]!,m[8]!,0,m[1]!,m[5]!,m[9]!,0,m[2]!,m[6]!,m[10]!,0);
    const builder=own(new oc.BRepBuilderAPI_Transform(shape,transform,true,false));
    if(!builder.IsDone())fail('The part could not be placed on its sketch plane.');
    result=own(builder.Shape());
    if(result.IsNull()||result.ShapeType()!==oc.TopAbs_ShapeEnum.TopAbs_SOLID)fail('Plane placement did not preserve one solid.');
    const check=own(new oc.BRepCheck_Analyzer(result,true,false));if(!check.IsValid())fail('Plane placement produced invalid geometry.');
    const properties=own(new oc.GProp_GProps());oc.BRepGProp.VolumeProperties(result,properties,true,false,false);
    if(!Number.isFinite(properties.Mass())||properties.Mass()<=0)fail('Plane placement has no finite solid volume.');
  }catch(cause){if(cause===ordinary)cleanup();throw cause;}
  temp.delete(result);cleanup(); // A cleanup fault must not consume or publish a token.
  const output=session.retain(result);session.release(token);return output;
}
