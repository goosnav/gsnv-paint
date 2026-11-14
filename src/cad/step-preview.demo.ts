import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { stepPreview } from './step-preview.ts';
import type { KernelSession } from './kernel-runtime.ts';
const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),print:()=>{}});
const retained=new Map<number,ReturnType<KernelSession['resolve']>>();let id=0;
const session:KernelSession={generation:1,library,isClosed:()=>false,retain(shape){retained.set(++id,shape);return{id,generation:1};},resolve(token){return retained.get(token.id)!;},release(token){retained.get(token.id)!.delete();retained.delete(token.id);}};
const output=stepPreview({session,bytes:new Uint8Array(await readFile(new URL('./fixtures/acceptance-plate-120mm.step',import.meta.url))),units:'mm'});
console.log({bodies:output.bodies,triangles:output.solid.indices.length/3,retainedTokens:retained.size});
