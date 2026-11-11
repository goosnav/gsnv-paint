/** C59 illustration; automated geometry checks are in the sibling testbench. */
import init from 'replicad-opencascadejs';
import { readFile } from 'node:fs/promises';
import type { KernelSession } from './kernel-runtime.ts';
import { buildLinearPrism } from './kernel-linear-prism.ts';
const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const shapes=new Map<number,ReturnType<KernelSession['resolve']>>();let sequence=0;
const session:KernelSession={library,generation:1,isClosed:()=>false,retain(shape){const id=++sequence;shapes.set(id,shape);return{id,generation:1};},resolve(token){return shapes.get(token.id)!;},release(token){shapes.get(token.id)!.delete();shapes.delete(token.id);}};
const token=buildLinearPrism({session,polygon:[[0,0],[100,0],[100,60],[0,60]],depth:10});
const properties=new library.GProp_GProps();library.BRepGProp.VolumeProperties(session.resolve(token),properties,true,false,false);
console.log(JSON.stringify({retainedToken:token,volumeMm3:properties.Mass()},null,2));
properties.delete();session.release(token);console.log(`Retained shapes after release: ${shapes.size}`);
