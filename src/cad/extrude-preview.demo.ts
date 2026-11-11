import { readFile } from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import { extrudePreview } from './extrude-preview.ts';
import type { KernelSession } from './kernel-runtime.ts';
const library=await init({wasmBinary:await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const result=extrudePreview({session:{library} as KernelSession,polygon:[[0,0],[100,0],[100,60],[0,60]],depth:10});
console.log({volume:result.volume,area:result.area,center:result.center,triangles:result.indices.length/3});
