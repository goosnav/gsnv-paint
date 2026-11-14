/** Test-only real-kernel ownership and independent geometry measurements. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import type { KernelSession } from './kernel-runtime.ts';
export async function kernelFixture() {
  const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),print:()=>{},printErr:()=>{}});
  const retained=new Map<number,ReturnType<KernelSession['resolve']>>();let issued=0;
  const session:KernelSession={generation:1,library,isClosed:()=>false,
    retain(shape){const id=++issued;retained.set(id,shape);return{id,generation:1};},
    resolve(token){assert.equal(token.generation,1);assert.ok(retained.has(token.id),'live retained token');return retained.get(token.id)!;},
    release(token){assert.ok(retained.has(token.id),'no double release');retained.get(token.id)!.delete();retained.delete(token.id);},
  };
  return{session,library,retained,measure(token:Parameters<KernelSession['resolve']>[0]){
    const shape=session.resolve(token),properties=new library.GProp_GProps(),surface=new library.GProp_GProps(),check=new library.BRepCheck_Analyzer(shape,true,false),ex=new library.TopExp_Explorer(shape,library.TopAbs_ShapeEnum.TopAbs_VERTEX,library.TopAbs_ShapeEnum.TopAbs_SHAPE),vertices:number[][]=[];
    try{
      assert.ok(check.IsValid());library.BRepGProp.VolumeProperties(shape,properties,true,false,false);library.BRepGProp.SurfaceProperties(shape,surface,true,false);
      const center=properties.CentreOfMass();const c=[center.X(),center.Y(),center.Z()];center.delete();
      for(;ex.More();ex.Next()){const current=ex.Current(),vertex=library.TopoDS.Vertex(current),point=library.BRep_Tool.Pnt(vertex);vertices.push([point.X(),point.Y(),point.Z()]);point.delete();vertex.delete();current.delete();}
      return{volume:properties.Mass(),area:surface.Mass(),center:c,vertices};
    }finally{ex.delete();check.delete();surface.delete();properties.delete();}
  },close(){for(const id of [...retained.keys()])session.release({id,generation:1});}};
}
