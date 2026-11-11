/** STEP-APP assembly: a fresh worker rebuilds the requested source and exports its B-rep. */
import {kernelRuntime} from './kernel-runtime.ts';
import {solverRuntime} from './solver-runtime.ts';
import {editableCADContent} from './editable-cad-content.ts';
import {evaluateVariables} from './named-variables.ts';
import {evaluateDimension} from './dimension-expressions.ts';
import {linearSketchProgram} from './linear-sketch-program.ts';
import {linearProfile} from './linear-profile.ts';
import {buildLinearPrism} from './kernel-linear-prism.ts';
import {stepExchange} from './step-exchange.ts';
import type {CADProtocol} from './cad-worker-client.ts';
type Request=Pick<CADProtocol['request'],'content'|'assets'>;
const port=globalThis as unknown as {onmessage:((event:MessageEvent<Request>)=>void)|null;postMessage(value:unknown,transfer?:Transferable[]):void};
async function exportSource(request:Request){
 const content=editableCADContent({operation:'read',value:request.content}),sketch=content.graph.features[0].definition.sketch,extrusion=content.graph.features[1];
 if(!extrusion)throw new Error('Create an extrusion before exporting STEP.');
 const context=evaluateVariables({variables:content.variables,units:content.units}).context;
 const opened=await solverRuntime({action:'open',moduleUrl:request.assets.solverModule,wasmUrl:request.assets.solverWasm}),solver=opened.session;
 if(!solver)throw new Error(opened.diagnostics.map(d=>d.message).join(' '));
 const program=linearSketchProgram({sketch,context,tolerance:content.tolerance.linearMm});
 solver.engine.clear_data();solver.engine.push_primitives_and_params(program.primitives);
 if(solver.engine.solve()!==0||solver.dof()<0||solver.engine.get_gcs_conflicting_constraints().length)throw new Error('Sketch constraints could not be satisfied. Fix the flagged sketch before exporting STEP.');
 solver.engine.apply_solution();
 const polygon=linearProfile({entities:program.accept(solver.snapshot()),tolerance:content.tolerance.linearMm});
 const depth=evaluateDimension({expression:extrusion.definition.extent.distance,context}).value;
 if(Math.abs(depth)<=content.tolerance.linearMm)throw new Error('Extrusion depth must exceed the document tolerance.');
 const loaded=await kernelRuntime({action:'open',config:{moduleUrl:request.assets.kernelModule,wasmUrl:request.assets.kernelWasm,mode:'single',tolerance:content.tolerance}}),session=loaded.session;
 if(!session)throw new Error(loaded.status.diagnostics.map(d=>d.message).join(' '));
 const token=buildLinearPrism({session,polygon,depth});
 const file=stepExchange({action:'export',session,units:content.units,bodies:{shapes:[{bodyId:extrusion.id,token}],topology:[],operands:[],diagnostics:[]}}).file!;
 session.release(token);return file;
}
port.onmessage=event=>{
 port.onmessage=null;
 void exportSource(event.data).then(file=>port.postMessage({ok:true,file},[file.bytes.buffer as ArrayBuffer]),cause=>port.postMessage({ok:false,message:cause instanceof Error?cause.message:'The CAD kernel could not export this part. Edit the sketch or depth and retry.'}));
};
