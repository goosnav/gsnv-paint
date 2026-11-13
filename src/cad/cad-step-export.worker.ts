/** STEP-APP assembly: a fresh worker rebuilds the requested source and exports its B-rep. */
import {kernelRuntime} from './kernel-runtime.ts';
import {solverRuntime} from './solver-runtime.ts';
import {editableCADContent,bossOf} from './editable-cad-content.ts';
import {buildPart} from './part-builder.ts';
import {stepExchange} from './step-exchange.ts';
import type {CADProtocol} from './cad-worker-client.ts';
type Request=Pick<CADProtocol['request'],'content'|'assets'>;
const port=globalThis as unknown as {onmessage:((event:MessageEvent<Request>)=>void)|null;postMessage(value:unknown,transfer?:Transferable[]):void};
async function exportSource(request:Request){
 const content=editableCADContent({operation:'read',value:request.content}),boss=bossOf(content);
 if(!boss)throw new Error('Create an extrusion before exporting STEP.');
 const opened=await solverRuntime({action:'open',moduleUrl:request.assets.solverModule,wasmUrl:request.assets.solverWasm}),solver=opened.session;
 if(!solver)throw new Error(opened.diagnostics.map(d=>d.message).join(' '));
 const part=await buildPart({content,solver,kernel:async()=>{const loaded=await kernelRuntime({action:'open',config:{moduleUrl:request.assets.kernelModule,wasmUrl:request.assets.kernelWasm,mode:'single',tolerance:content.tolerance}});if(!loaded.session)throw new Error(loaded.status.diagnostics.map(d=>d.message).join(' '));return loaded.session;}});
 const session=part.session!,token=part.token!;
 const file=stepExchange({action:'export',session,units:content.units,bodies:{shapes:[{bodyId:boss.id,token}],topology:[],operands:[],diagnostics:[]}}).file!;
 session.release(token);return file;
}
port.onmessage=event=>{
 port.onmessage=null;
 void exportSource(event.data).then(file=>port.postMessage({ok:true,file},[file.bytes.buffer as ArrayBuffer]),cause=>port.postMessage({ok:false,message:cause instanceof Error?cause.message:'The CAD kernel could not export this part. Edit the sketch or depth and retry.'}));
};
