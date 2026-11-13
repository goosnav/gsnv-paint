/** CAD-APP worker assembly. Native engines, sessions and handles never leave this worker. */
import { kernelRuntime, type KernelSession } from './kernel-runtime.ts';
import { solverRuntime, type SolverSession } from './solver-runtime.ts';
import { editableCADContent } from './editable-cad-content.ts';
import { extrudePreview } from './extrude-preview.ts';
import { buildPart } from './part-builder.ts';
import type { CADProtocol, CADBuild } from './cad-worker-client.ts';
const port=globalThis as unknown as {onmessage:(event:MessageEvent<CADProtocol['request']>)=>void;postMessage(reply:CADProtocol['reply']):void};
let kernel:KernelSession|null=null,solver:SolverSession|null=null;
async function rebuild(request:CADProtocol['request']):Promise<CADBuild>{
 const content=editableCADContent({operation:'read',value:request.content});
 if(!solver){const loaded=await solverRuntime({action:'open',moduleUrl:request.assets.solverModule,wasmUrl:request.assets.solverWasm});solver=loaded.session;if(!solver)throw new Error(loaded.diagnostics.map(d=>d.message).join(' '));}
 const kernelSession=async()=>{if(!kernel){const loaded=await kernelRuntime({action:'open',config:{moduleUrl:request.assets.kernelModule,wasmUrl:request.assets.kernelWasm,mode:'single',tolerance:content.tolerance}});kernel=loaded.session;if(!kernel)throw new Error(loaded.status.diagnostics.map(d=>d.message).join(' '));}return kernel;};
 const part=await buildPart({content,solver,kernel:kernelSession}),entities=part.sketches[content.graph.features[0].id]!;
 return{entities,sketches:part.sketches,dof:part.dof,solid:part.token&&part.session?extrudePreview({session:part.session,token:part.token}):null};
}
port.onmessage=event=>{void rebuild(event.data).then(value=>port.postMessage({id:event.data.id,ok:true,value}),cause=>port.postMessage({id:event.data.id,ok:false,message:cause instanceof Error?cause.message:String(cause)}));};
