/**
 * PURPOSE    Execute a linear extrusion with OpenCascade.
 * KIND       SHELL
 * CONTRACT   IN: live C01 session, simple CCW polygon, finite signed nonzero depth.
 *            OUT: B-rep measurements plus triangle buffers; no native handles escape.
 *            RAISES: ExtrusionError for failed/invalid solid or missing triangulation.
 * GUARANTEES Native validity checked before publication; wrappers released on normal completion.
 * TUNING     Mesh deflection 0.1 mm, angular deflection 0.5 radians for viewport display only.
 * DECISIONS  D1: Measure the B-rep, not the display mesh. Alternative: mesh integration
 *            changes with tessellation. Revisit if: the kernel provides a better exact port.
 * LIMITS     One linear blind boss; unexpected native faults require worker termination.
 * TESTBENCH  src/cad/extrude-preview.test.ts -- run with: node --import tsx --test src/cad/extrude-preview.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
import { buildLinearPrism, type LinearPrismRequest } from './kernel-linear-prism.ts';
export type SolidPreview = { positions: Float32Array; indices: Uint32Array; volume: number; area: number; center: [number,number,number] };
export function extrudePreview(request: LinearPrismRequest | { session: KernelSession; token: ReturnType<KernelSession['retain']> }): SolidPreview {
  const {session}=request;
  const oc=session.library, owned:{delete():void}[]=[];
  const own=<T extends {delete():void}>(v:T):T=>{owned.push(v);return v;};
  const release=()=>{for(const object of owned.reverse())object.delete();session.release(token);};
  const fail=(message:string):never=>{release();throw Object.assign(new Error(message),{name:'ExtrusionError'});};
  const token='token' in request?request.token:buildLinearPrism(request),shape=session.resolve(token);
  const volumeProps=own(new oc.GProp_GProps()),areaProps=own(new oc.GProp_GProps());
  oc.BRepGProp.VolumeProperties(shape,volumeProps,true,false,false);oc.BRepGProp.SurfaceProperties(shape,areaProps,false,false);
  const massCenter=own(volumeProps.CentreOfMass()),volume=volumeProps.Mass(),area=areaProps.Mass();
  const center:[number,number,number]=[massCenter.X(),massCenter.Y(),massCenter.Z()];
  if(![volume,area,...center].every(Number.isFinite)||volume<=0)fail('Extrude: the result has no valid positive volume.');
  own(new oc.BRepMesh_IncrementalMesh(shape,0.1,false,0.5,false));
  const explorer=own(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  const positions:number[]=[],indices:number[]=[];
  while(explorer.More()){
    const current=own(explorer.Current()),f=own(oc.TopoDS.Face(current)),location=own(new oc.TopLoc_Location());
    const mesh=oc.BRep_Tool.Triangulation(f,location,0);
    if(!mesh)fail('Extrude: a face has no viewport triangulation.');own(mesh);
    const transform=own(location.Transformation()),offset=positions.length/3;
    for(let i=1;i<=mesh.NbNodes();i++){
      const point=own(mesh.Node(i)),world=own(point.Transformed(transform));positions.push(world.X(),world.Y(),world.Z());
    }
    const reversed=f.Orientation()===oc.TopAbs_Orientation.TopAbs_REVERSED;
    for(let i=1;i<=mesh.NbTriangles();i++){
      const triangle=own(mesh.Triangle(i)),a=triangle.Value(1)-1+offset,b=triangle.Value(2)-1+offset,c=triangle.Value(3)-1+offset;
      indices.push(a,reversed?c:b,reversed?b:c);
    }
    explorer.Next();
  }
  if(!indices.length||!positions.every(Number.isFinite))fail('Extrude: invalid viewport triangulation.');
  const result={positions:new Float32Array(positions),indices:new Uint32Array(indices),volume,area,center};
  if(!result.positions.every(Number.isFinite))fail('Extrude: this solid exceeds the viewport coordinate range.');release();return result;
}
