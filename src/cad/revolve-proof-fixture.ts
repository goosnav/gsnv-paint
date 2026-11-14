/**
 * Test-only native API proof for CAD-NEXT-INCREMENT gate 3.
 * This is not a production executor or a persisted feature contract. The limited
 * proof domain is one simple polygon/circle in local XY, in the nonnegative U
 * half-plane, revolved about +V. Axis-touching polygons are allowed; circles must
 * clear the axis. The future production contract must be separately reviewed.
 * Known ordinary rejections clean temporary handles; unknown/native faults stop
 * all native calls. A cleanup fault also stops immediately, with no token published.
 */
import type {KernelSession} from './kernel-runtime.ts';
import {sketchRegions,type ProfileLoop} from './sketch-regions.ts';
export function revolveProof({session,profile,angle,axis=[0,1,0]}:{session:KernelSession;profile:ProfileLoop;angle:number;axis?:[number,number,number]}):ReturnType<KernelSession['retain']> {
 const reject=(message:string):never=>{throw Object.assign(new Error(`Revolve proof: ${message}`),{name:'RevolveProofError'});};
 if(!Number.isFinite(angle)||Math.abs(angle)<=1e-9||Math.abs(angle)>2*Math.PI)reject('angle must exceed angular tolerance and be at most one turn.');
 if(axis.length!==3||axis.some((v,i)=>v!==[0,1,0][i]))reject('axis must be the nonzero local +V direction in this proof.');
 if(profile.kind==='polygon'&&profile.points.some(p=>!p.every(Number.isFinite)||p[0]<0))reject('the profile must not cross the axis.');
 if(profile.kind==='circle'&&(![...profile.center,profile.radius].every(Number.isFinite)||profile.center[0]-profile.radius<=1e-7))reject('a circular profile must clear the axis.');
 const entities=profile.kind==='circle'?[{...profile,id:'circle',construction:false}]:profile.points.map((a,i)=>({id:`edge-${i}`,kind:'segment' as const,a,b:profile.points[(i+1)%profile.points.length]!,construction:false}));
 const region=sketchRegions({entities,tolerance:1e-7});
 if(session.isClosed())reject('kernel session is closed.');
 const oc=session.library,temporary=new Set<{delete():void}>();let ordinary:Error|undefined;
 const fail=(message:string):never=>{ordinary=Object.assign(new Error(`Revolve proof: ${message}`),{name:'RevolveProofError'});throw ordinary;};
 const own=<T extends{delete():void}>(v:T):T=>{temporary.add(v);return v;};
 const clean=()=>{for(const object of [...temporary].reverse())object.delete();temporary.clear();};
 let result:ReturnType<KernelSession['resolve']>;
 try{
  const wire=own(new oc.BRepBuilderAPI_MakeWire()),loop=region.outer;
  if(loop.kind==='circle'){
   const placement=own(new oc.gp_Ax2(own(new oc.gp_Pnt(...loop.center,0)),own(new oc.gp_Dir(0,0,1))));
   const edge=own(new oc.BRepBuilderAPI_MakeEdge(own(new oc.gp_Circ(placement,loop.radius))));wire.Add(own(edge.Edge()));
  }else for(let i=0;i<loop.points.length;i++){
   const a=loop.points[i]!,b=loop.points[(i+1)%loop.points.length]!;
   const edge=own(new oc.BRepBuilderAPI_MakeEdge(own(new oc.gp_Pnt(a[0],a[1],0)),own(new oc.gp_Pnt(b[0],b[1],0))));wire.Add(own(edge.Edge()));
  }
  if(!wire.IsDone())fail('wire construction failed.');
  const face=own(new oc.BRepBuilderAPI_MakeFace(own(wire.Wire()),true));if(!face.IsDone())fail('face construction failed.');
  const direction=own(new oc.gp_Ax1(own(new oc.gp_Pnt(0,0,0)),own(new oc.gp_Dir(...axis))));
  const builder=own(new oc.BRepPrimAPI_MakeRevol(own(face.Face()),direction,angle,true));
  if(!builder.IsDone())fail('native operation did not complete.');
  result=own(builder.Shape());
  if(result.IsNull()||result.ShapeType()!==oc.TopAbs_ShapeEnum.TopAbs_SOLID)fail('operation must return exactly one nonempty solid.');
  const check=own(new oc.BRepCheck_Analyzer(result,true,false));if(!check.IsValid())fail('native operation returned an invalid solid.');
  const mass=own(new oc.GProp_GProps());oc.BRepGProp.VolumeProperties(result,mass,true,false,false);
  if(!Number.isFinite(mass.Mass())||mass.Mass()<=0)fail('native operation returned no positive material volume.');
 }catch(cause){if(cause===ordinary)clean();throw cause;}
 temporary.delete(result);clean();return session.retain(result);
}
/** Independent native bounds and face count, including analytic curve extrema. */
export function proofBounds(session:KernelSession,token:ReturnType<KernelSession['retain']>):{min:number[];max:number[];faces:number} {
 const oc=session.library,shape=session.resolve(token),box=new oc.Bnd_Box(),faces=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
 try{oc.BRepBndLib.AddOptimal(shape,box,false,false);let count=0;for(;faces.More();faces.Next())count++;
  return{min:[box.GetXMin(),box.GetYMin(),box.GetZMin()],max:[box.GetXMax(),box.GetYMax(),box.GetZMax()],faces:count};
 }finally{faces.delete();box.delete();}
}
