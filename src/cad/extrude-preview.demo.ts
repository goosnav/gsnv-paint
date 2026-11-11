import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { extrudePreview } from './extrude-preview.ts';
import type { KernelSession } from './kernel-runtime.ts';
const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const shapes=new Map<number,ReturnType<KernelSession['resolve']>>();let sequence=0;
const session:KernelSession={library,generation:1,isClosed:()=>false,retain(shape){const id=++sequence;shapes.set(id,shape);return{id,generation:1};},resolve(token){return shapes.get(token.id)!;},release(token){shapes.get(token.id)!.delete();shapes.delete(token.id);}};
const result=extrudePreview({session,polygon:[[0,0],[100,0],[100,60],[0,60]],depth:10});
console.log({volume:result.volume,area:result.area,center:result.center,triangles:result.indices.length/3});
