/**
 * PURPOSE    Exchange solid B-reps through OpenCascade's STEP translators.
 * KIND       SHELL
 * CONTRACT   IN: live worker-local C01 session; import bytes or export valid body
 *            tokens; mm/inch file units. Internal B-reps always use millimetres.
 *            OUT: imported solid tokens or owned STEP bytes, never both. Imported
 *            IDs are step-solid-1… in file traversal order; topology/operands are empty.
 *            The document owner retains the original import bytes and assigns feature IDs.
 *            RAISES: STEPReadError, STEPTransferError, STEPWriteError,
 *            InvalidImportedSolidError, DisposedSessionError.
 * GUARANTEES No network or host filesystem, no source mutation; failed imports publish
 *            no partial bodies. Normal completion releases temporary native wrappers/files.
 * TUNING     No geometric approximation: STEP carries analytic B-rep geometry.
 * DECISIONS  D1: Set model units and temporarily set/restore write.step.unit; the
 *            exposed Transfer overload copies that global into header parameters.
 *            Alternative: model-only settings mislabel inch coordinates as mm. Revisit if: the
 *            explicit DESTEP_Parameters overload becomes available in the binding.
 *            D2: Check every loaded entity and transfer result, then reject non-solid/
 *            partial imports. Root counts alone can hide a failed assembly child.
 *            Revisit if: the product explicitly adds surface or wire import.
 * LIMITS     One synchronous job per worker. Vendor native faults propagate and require
 *            whole-worker termination. STEP names/colors and parametric history are not imported.
 * TESTBENCH  src/cad/step-exchange.test.ts -- run with: node --import tsx --test src/cad/step-exchange.test.ts
 */
import type { KernelSession } from './kernel-runtime.ts';
type Token = Parameters<KernelSession['resolve']>[0];
type Diagnostic = { code:string; message:string; subjectIds:string[]; severity:'warning'|'error' };
type Bodies = { shapes:{bodyId:string;token:Token}[]; topology:readonly unknown[]; operands:readonly unknown[]; diagnostics:Diagnostic[] };
export type STEPRequest = {session:KernelSession;units:'mm'|'inch'} & (
  {action:'import';bytes:Uint8Array} | {action:'export';bodies:Bodies}
);
export type STEPResult = {bodies:Bodies|null;file:{name:string;mime:string;bytes:Uint8Array;diagnostics:Diagnostic[]}|null};
export function stepExchange(request:STEPRequest):STEPResult {
  const {session,units}=request,oc=session.library;
  const fail=(name:string,message:string):never=>{throw Object.assign(new Error(message),{name});};
  if(session.isClosed())fail('DisposedSessionError','The kernel session is closed. Rebuild before exchanging STEP.');
  let stage=request.action==='import'?'STEPReadError':'STEPTransferError',faulted=false,previousUnit:string|undefined;
  const temporary=new Set<{delete():void}>(),published:Token[]=[];
  const own=<T extends {delete():void}>(object:T):T=>{temporary.add(object);return object;};
  // The worker serializes synchronous calls; this private virtual path never touches the host filesystem.
  const path='/gsnv-step-exchange.step';
  const valid=(shape:ReturnType<KernelSession['resolve']>,error:string)=>{
    if(shape.IsNull()||shape.ShapeType()!==oc.TopAbs_ShapeEnum.TopAbs_SOLID)fail(error,'STEP exchange requires solid bodies, not surfaces or wires.');
    const check=own(new oc.BRepCheck_Analyzer(shape,true,false)),props=own(new oc.GProp_GProps());
    if(!check.IsValid())fail(error,'OpenCascade found an invalid STEP solid. Repair the geometry before importing it.');
    oc.BRepGProp.VolumeProperties(shape,props,true,false,false);
    if(!Number.isFinite(props.Mass())||props.Mass()<=0)fail(error,'STEP contains a solid with no finite, positive closed volume.');
  };
  try{
    if(!['mm','inch'].includes(units))fail(stage,'STEP document units must be millimetres or inches.');
    if(request.action==='export'){
      if(!request.bodies.shapes.length)fail(stage,'There are no solid bodies to export.');
      const ids=new Set<string>();
      const shapes=request.bodies.shapes.map(body=>{
        if(!body.bodyId||ids.has(body.bodyId))fail(stage,'STEP export needs unique, nonempty body IDs.');ids.add(body.bodyId);
        const shape=session.resolve(body.token);valid(shape,stage);return shape;
      });
      const writer=own(new oc.STEPControl_Writer()),model=own(writer.Model(false)),progress=own(new oc.Message_ProgressRange());
      previousUnit=oc.Interface_Static.CVal('write.step.unit');
      if(!oc.Interface_Static.SetCVal('write.step.unit',units==='inch'?'INCH':'MM'))fail(stage,'OpenCascade could not set the requested STEP unit.');
      model.SetLocalLengthUnit(1);model.SetWriteLengthUnit(units==='inch'?25.4:1);
      for(const shape of shapes)if(writer.Transfer(shape,oc.STEPControl_StepModelType.STEPControl_ManifoldSolidBrep,true,progress)!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)fail(stage,'OpenCascade could not transfer every solid to STEP. No file was exported.');
      stage='STEPWriteError';
      if(writer.Write(path)!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)fail(stage,'OpenCascade could not write the STEP file.');
      const bytes=oc.FS.readFile(path).slice();
      if(!bytes.length)fail(stage,'OpenCascade returned an empty STEP file.');
      return{bodies:null,file:{name:'part.step',mime:'model/step',bytes,diagnostics:[]}};
    }
    if(!(request.bytes instanceof Uint8Array)||!request.bytes.length)fail(stage,'Choose a nonempty STEP file to import.');
    oc.FS.writeFile(path,request.bytes);
    const reader=own(new oc.STEPControl_Reader());
    if(reader.ReadFile(path)!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)fail(stage,'OpenCascade could not read this STEP file. Check that it is complete and valid.');
    const model=own(reader.StepModel()),entities=own(new oc.NCollection_HSequence_handle_Standard_Transient());
    for(let index=1;index<=model.NbEntities();index++){
      if(model.IsErrorEntity(index)||model.IsUnknownEntity(index))fail(stage,`STEP entry ${index} is invalid or unsupported. Nothing was imported; repair or re-export the source file.`);
      const entity=own(model.Value(index));entities.Append(entity);entity.delete();temporary.delete(entity);
    }
    // Reading the file establishes its declared units; output geometry is canonical mm in every document.
    reader.SetSystemLengthUnit(1);stage='STEPTransferError';
    const roots=reader.NbRootsForTransfer();
    if(roots<1||reader.TransferRoots(own(new oc.Message_ProgressRange()))!==roots)fail(stage,'OpenCascade could not transfer every STEP root. Partial imports are not accepted.');
    const stats=reader.GetStatsTransfer(entities);
    if(stats.nbWithFail>0||stats.nbMapped<1||stats.nbWithResult!==stats.nbMapped)fail(stage,'OpenCascade reported an incomplete STEP entity translation. Nothing was imported; repair or re-export the source file.');
    stage='InvalidImportedSolidError';
    const combined=own(reader.OneShape());
    if(combined.IsNull())fail(stage,'The STEP file does not contain a solid.');
    for(const kind of [oc.TopAbs_ShapeEnum.TopAbs_SHELL,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_WIRE,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_VERTEX]){
      const free=own(new oc.TopExp_Explorer(combined,kind,oc.TopAbs_ShapeEnum.TopAbs_SOLID));
      if(free.More())fail(stage,'The STEP file contains surfaces or wires outside its solids. Nothing was imported.');
    }
    const explorer=own(new oc.TopExp_Explorer(combined,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    const solids:ReturnType<KernelSession['resolve']>[]=[];
    while(explorer.More()){
      const shape=own(explorer.Current());valid(shape,stage);
      if(!solids.some(previous=>previous.IsSame(shape)))solids.push(shape);
      explorer.Next();
    }
    if(!solids.length)fail(stage,'The STEP file does not contain any valid closed solids.');
    const shapes=solids.map((shape,index)=>{
      const token=session.retain(shape);temporary.delete(shape);published.push(token);return{bodyId:`step-solid-${index+1}`,token};
    });
    return{bodies:{shapes,topology:[],operands:[],diagnostics:[]},file:null};
  }catch(cause){
    faulted=(typeof WebAssembly.Exception==='function'&&cause instanceof WebAssembly.Exception)||cause instanceof WebAssembly.RuntimeError||typeof cause==='number';
    if(!faulted)for(const token of published)session.release(token);
    if(faulted||cause instanceof Error&&['STEPReadError','STEPTransferError','STEPWriteError','InvalidImportedSolidError','DisposedSessionError'].includes(cause.name))throw cause;
    return fail(stage,`STEP exchange failed: ${cause instanceof Error?cause.message:String(cause)}`);
  }finally{
    if(!faulted){
      for(const object of [...temporary].reverse())object.delete();
      try{oc.FS.unlink(path);}catch{/* A failed read/write may not have created the virtual file. */}
      if(previousUnit!==undefined&&!oc.Interface_Static.SetCVal('write.step.unit',previousUnit))fail('STEPTransferError','OpenCascade could not restore its STEP translator settings. Restart the CAD worker.');
    }
  }
}
