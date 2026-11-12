/** CAD-APP worker assembly. Native engines, sessions and handles never leave this worker. */
import { kernelRuntime, type KernelSession } from './kernel-runtime.ts';
import { solverRuntime, type SolverSession } from './solver-runtime.ts';
import { editableCADContent } from './editable-cad-content.ts';
import { evaluateVariables } from './named-variables.ts';
import { evaluateDimension } from './dimension-expressions.ts';
import { linearSketchProgram } from './linear-sketch-program.ts';
import { sketchRegions } from './sketch-regions.ts';
import { extrudePreview } from './extrude-preview.ts';
import type { CADProtocol, CADBuild } from './cad-worker-client.ts';
const port=globalThis as unknown as {onmessage:(event:MessageEvent<CADProtocol['request']>)=>void;postMessage(reply:CADProtocol['reply']):void};
let kernel:KernelSession|null=null,solver:SolverSession|null=null;
async function rebuild(request:CADProtocol['request']):Promise<CADBuild>{
 const content=editableCADContent({operation:'read',value:request.content}),sketch=content.graph.features[0].definition.sketch;
 if(!solver){const loaded=await solverRuntime({action:'open',moduleUrl:request.assets.solverModule,wasmUrl:request.assets.solverWasm});solver=loaded.session;if(!solver)throw new Error(loaded.diagnostics.map(d=>d.message).join(' '));}
 const context=evaluateVariables({variables:content.variables,units:content.units}).context;
 const program=linearSketchProgram({sketch,context,tolerance:content.tolerance.linearMm});
 solver.engine.clear_data();solver.engine.push_primitives_and_params(program.primitives);
 const status=solver.engine.solve(),dof=solver.dof(),conflicts=solver.engine.get_gcs_conflicting_constraints();
 if(status!==0||conflicts.length||dof<0)throw new Error(`Sketch: constraints could not be satisfied${conflicts.length?` (${conflicts.join(', ')})`:''}. Remove a conflicting constraint or change a dimension.`);
 solver.engine.apply_solution();
 const entities=program.accept(solver.snapshot()),extrusion=content.graph.features[1];
 if(!extrusion)return{entities,dof,solid:null};
 try{
  const region=sketchRegions({entities,tolerance:content.tolerance.linearMm}),depth=evaluateDimension({expression:extrusion.definition.extent.distance,context}).value;
  if(Math.abs(depth)<=content.tolerance.linearMm)throw new Error('Depth must be nonzero and exceed the document tolerance.');
  if(!kernel){const loaded=await kernelRuntime({action:'open',config:{moduleUrl:request.assets.kernelModule,wasmUrl:request.assets.kernelWasm,mode:'single',tolerance:content.tolerance}});kernel=loaded.session;if(!kernel)throw new Error(loaded.status.diagnostics.map(d=>d.message).join(' '));}
  return{entities,dof,solid:extrudePreview({session:kernel,region,depth})};
 }catch(cause){throw new Error(`Extrude: ${cause instanceof Error?cause.message:String(cause)}`);}
}
port.onmessage=event=>{void rebuild(event.data).then(value=>port.postMessage({id:event.data.id,ok:true,value}),cause=>port.postMessage({id:event.data.id,ok:false,message:cause instanceof Error?cause.message:String(cause)}));};
