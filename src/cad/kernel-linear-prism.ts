/**
 * PURPOSE    Construct one validated linear B-rep prism.
 * KIND       SHELL
 * CONTRACT   IN: live C01 session, C53 simple CCW polygon in mm, finite nonzero
 *            signed depth. OUT: C01-owned solid token; caller must release it.
 *            RAISES: ExtrusionError for failed wire/face/prism or invalid solid;
 *            DisposedSessionError for a closed session.
 * GUARANTEES No source mutation, mesh reconstruction or escaped temporary handles.
 * TUNING     None; geometry and tolerance are validated by the caller.
 * DECISIONS  D1: Retain one solid in C01. Alternative: duplicate builders for display
 *            and exchange could produce different parts. Revisit if: C24 replaces this subset.
 * LIMITS     One linear blind boss. Native faults propagate; terminate the worker
 *            without further native calls. Finite simple polygon is a precondition.
 * TESTBENCH  src/cad/kernel-linear-prism.test.ts -- run with: node --import tsx --test src/cad/kernel-linear-prism.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
export type LinearPrismRequest={session:KernelSession;polygon:readonly(readonly[number,number])[];depth:number};
export function buildLinearPrism({session,polygon,depth}:LinearPrismRequest):ReturnType<KernelSession['retain']>{
  const fail=(message:string):never=>{throw Object.assign(new Error(message),{name:'ExtrusionError'});};
  if(session.isClosed())throw Object.assign(new Error('The CAD kernel session is closed. Rebuild before creating a solid.'),{name:'DisposedSessionError'});
  const oc=session.library,temporary=new Set<{delete():void}>();let faulted=false;
  const own=<T extends{delete():void}>(value:T):T=>{temporary.add(value);return value;};
  try{
    const wireBuilder=own(new oc.BRepBuilderAPI_MakeWire());
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!;
      const pa=own(new oc.gp_Pnt(a[0],a[1],0)),pb=own(new oc.gp_Pnt(b[0],b[1],0));
      const builder=own(new oc.BRepBuilderAPI_MakeEdge(pa,pb));wireBuilder.Add(own(builder.Edge()));
    }
    if(!wireBuilder.IsDone())fail('Extrude: the outline could not be connected into a wire.');
    const wire=own(wireBuilder.Wire()),faceBuilder=own(new oc.BRepBuilderAPI_MakeFace(wire,true));
    if(!faceBuilder.IsDone())fail('Extrude: the sketch did not form a planar face.');
    const face=own(faceBuilder.Face()),vector=own(new oc.gp_Vec(0,0,depth)),builder=own(new oc.BRepPrimAPI_MakePrism(face,vector,false,true));
    if(!builder.IsDone())fail('Extrude: OpenCascade could not construct this solid.');
    const shape=own(builder.Shape()),check=own(new oc.BRepCheck_Analyzer(shape,true,false));
    if(!check.IsValid())fail('Extrude: OpenCascade reported an invalid solid. Edit the sketch or depth.');
    const token=session.retain(shape);temporary.delete(shape);return token;
  }catch(cause){
    faulted=(typeof WebAssembly.Exception==='function'&&cause instanceof WebAssembly.Exception)||cause instanceof WebAssembly.RuntimeError||typeof cause==='number';throw cause;
  }finally{if(!faulted)for(const object of [...temporary].reverse())object.delete();}
}
