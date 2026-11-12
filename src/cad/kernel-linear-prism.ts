/**
 * PURPOSE    Construct one validated B-rep prism from a polygon or a region with holes.
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
import type { ProfileRegion, ProfileLoop } from './sketch-regions.ts';
/** A bare polygon is the original C59 request; a region adds holes (C64 orientation: CCW outer, CW holes). */
export type LinearPrismRequest={session:KernelSession;depth:number}&({polygon:readonly(readonly[number,number])[]}|{region:ProfileRegion});
export function buildLinearPrism(request:LinearPrismRequest):ReturnType<KernelSession['retain']>{
  const {session,depth}=request,region:ProfileRegion='region'in request?request.region:{outer:{kind:'polygon',points:request.polygon.map(p=>[p[0],p[1]])},holes:[]};
  const fail=(message:string):never=>{throw Object.assign(new Error(message),{name:'ExtrusionError'});};
  if(session.isClosed())throw Object.assign(new Error('The CAD kernel session is closed. Rebuild before creating a solid.'),{name:'DisposedSessionError'});
  const oc=session.library,temporary=new Set<{delete():void}>();let faulted=false;
  const own=<T extends{delete():void}>(value:T):T=>{temporary.add(value);return value;};
  try{
    const wireOf=(loop:ProfileLoop,hole:boolean)=>{
      const wireBuilder=own(new oc.BRepBuilderAPI_MakeWire());
      if(loop.kind==='circle'){
        // A clockwise (−Z axis) circle bounds a hole; counterclockwise bounds the outer face.
        const axis=own(new oc.gp_Ax2(own(new oc.gp_Pnt(loop.center[0],loop.center[1],0)),own(new oc.gp_Dir(0,0,hole?-1:1))));
        const builder=own(new oc.BRepBuilderAPI_MakeEdge(own(new oc.gp_Circ(axis,loop.radius))));wireBuilder.Add(own(builder.Edge()));
      }else for(let i=0;i<loop.points.length;i++){
        const a=loop.points[i]!,b=loop.points[(i+1)%loop.points.length]!;
        const pa=own(new oc.gp_Pnt(a[0],a[1],0)),pb=own(new oc.gp_Pnt(b[0],b[1],0));
        const builder=own(new oc.BRepBuilderAPI_MakeEdge(pa,pb));wireBuilder.Add(own(builder.Edge()));
      }
      if(!wireBuilder.IsDone())fail(`Extrude: ${hole?'a hole':'the outline'} could not be connected into a wire.`);
      return own(wireBuilder.Wire());
    };
    const faceBuilder=own(new oc.BRepBuilderAPI_MakeFace(wireOf(region.outer,false),true));
    if(!faceBuilder.IsDone())fail('Extrude: the sketch did not form a planar face.');
    for(const hole of region.holes)faceBuilder.Add(wireOf(hole,true));
    if(!faceBuilder.IsDone())fail('Extrude: a hole could not be added to the face.');
    const face=own(faceBuilder.Face()),vector=own(new oc.gp_Vec(0,0,depth)),builder=own(new oc.BRepPrimAPI_MakePrism(face,vector,false,true));
    if(!builder.IsDone())fail('Extrude: OpenCascade could not construct this solid.');
    const shape=own(builder.Shape()),check=own(new oc.BRepCheck_Analyzer(shape,true,false));
    if(!check.IsValid())fail('Extrude: OpenCascade reported an invalid solid. Edit the sketch or depth.');
    const token=session.retain(shape);temporary.delete(shape);return token;
  }catch(cause){
    faulted=(typeof WebAssembly.Exception==='function'&&cause instanceof WebAssembly.Exception)||cause instanceof WebAssembly.RuntimeError||typeof cause==='number';throw cause;
  }finally{if(!faulted)for(const object of [...temporary].reverse())object.delete();}
}
