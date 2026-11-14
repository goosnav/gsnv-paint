import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import init from 'replicad-opencascadejs';
import { stepExchange, type STEPRequest, type STEPResult } from './step-exchange.ts';
import { kernelRuntime, type KernelSession } from './kernel-runtime.ts';

const STEP_BYTES = new TextEncoder().encode('ISO-10303-21;\nEND-ISO-10303-21;\n');
function fixture() {
  const allocated:Native[]=[], files=new Map<string,Uint8Array>(), retained=new Map<number,Shape>();
  const faults={write:new Error('virtual disk full'),read:new Error('virtual write failed')};
  const state={read:'done',write:'done',transfer:'done',roots:2,transferred:2,entityError:0,unknownEntity:0,transferFailures:0,valid:[true,true],volumes:[24,30],extras:'',closed:false,writeFailure:false,readFailure:false,emptyWrite:false,unitFailure:false,restoreFailure:false,nativeFault:false,unit:'CM',unitChanges:[] as string[],units:[] as number[],local:[] as number[],system:[] as number[],transferCalls:0};
  class Native {deleted=false;constructor(){allocated.push(this);}delete(){assert.equal(this.deleted,false);this.deleted=true;}}
  class Shape extends Native {constructor(public index=-1){super();}IsNull(){return false;}ShapeType(){return this.index<0?'compound':'solid';}IsSame(other:Shape){return this.index===other.index;}}
  class Properties extends Native {mass=0;Mass(){return this.mass;}}
  class Entities extends Native {values:Native[]=[];Append(value:Native){this.values.push(value);}}
  const library={
    STEPControl_Writer:class extends Native {
      Model(){return Object.assign(new Native(),{SetLocalLengthUnit:(v:number)=>state.local.push(v),SetWriteLengthUnit:(v:number)=>state.units.push(v)});}
      Transfer(){state.transferCalls++;if(state.nativeFault)throw new WebAssembly.RuntimeError('native fault');return state.transfer;}
      Write(path:string){if(state.writeFailure)throw faults.write;files.set(path,state.emptyWrite?new Uint8Array():STEP_BYTES.slice());return state.write;}
    },
    STEPControl_Reader:class extends Native {
      ReadFile(){return state.read;}NbRootsForTransfer(){return state.roots;}TransferRoots(){return state.transferred;}
      SetSystemLengthUnit(v:number){state.system.push(v);}OneShape(){return new Shape();}
      StepModel(){return Object.assign(new Native(),{NbEntities:()=>2,IsErrorEntity:(index:number)=>index===state.entityError,IsUnknownEntity:(index:number)=>index===state.unknownEntity,Value:()=>new Native()});}
      GetStatsTransfer(entities:Entities){assert.equal(entities.values.length,2);return{nbMapped:2,nbWithResult:2-state.transferFailures,nbWithFail:state.transferFailures};}
    },
    NCollection_HSequence_handle_Standard_Transient:Entities,
    BRepCheck_Analyzer:class extends Native {constructor(private shape:Shape){super();}IsValid(){return state.valid[this.shape.index]??false;}},
    GProp_GProps:Properties,BRepGProp:{VolumeProperties(shape:Shape,p:Properties){p.mass=state.volumes[shape.index]??0;}},
    TopExp_Explorer:class extends Native {
      at=0;count:number;
      constructor(_shape:Shape,kind:string){super();this.count=kind==='solid'?state.valid.length:state.extras===kind?1:0;}
      More(){return this.at<this.count;}Next(){this.at++;}Current(){return new Shape(this.at);}
    },
    Message_ProgressRange:Native,
    Interface_Static:{CVal:()=>state.unit,SetCVal(_name:string,value:string){if((value==='CM'&&state.restoreFailure)||(value!=='CM'&&state.unitFailure))return false;state.unit=value;state.unitChanges.push(value);return true;}},
    IFSelect_ReturnStatus:{IFSelect_RetDone:'done'},STEPControl_StepModelType:{STEPControl_ManifoldSolidBrep:'brep'},
    TopAbs_ShapeEnum:{TopAbs_SOLID:'solid',TopAbs_SHAPE:'shape',TopAbs_SHELL:'shell',TopAbs_FACE:'face',TopAbs_WIRE:'wire',TopAbs_EDGE:'edge',TopAbs_VERTEX:'vertex'},
    FS:{writeFile(path:string,bytes:Uint8Array){if(state.readFailure)throw faults.read;files.set(path,bytes.slice());},readFile(path:string){return files.get(path)!;},readdir(){return['.','..',...[...files.keys()].map(path=>path.slice(1))];},unlink(path:string){assert.ok(files.has(path));files.delete(path);}},
  };
  let issued=0;
  const session={generation:1,library,isClosed:()=>state.closed,
    retain(shape:Shape){const token={id:++issued,generation:1};retained.set(token.id,shape);return token;},
    resolve(token:{id:number;generation:number}){const shape=retained.get(token.id);if(state.closed||token.generation!==1||!shape)throw Object.assign(new Error('Stale or foreign shape token.'),{name:'DisposedSessionError'});return shape;},
    release(token:{id:number}){retained.get(token.id)!.delete();retained.delete(token.id);},
  } as unknown as KernelSession;
  const body=(index=0)=>({shapes:[{bodyId:'plate',token:session.retain(new Shape(index) as never)}],topology:[],operands:[],diagnostics:[]});
  const cleaned=()=>{assert.equal(files.size,0);assert.equal(state.unit,'CM');assert.ok(allocated.every(v=>v.deleted||[...retained.values()].includes(v as Shape)),'temporaries released');};
  return {state,session,body,cleaned,retained,allocated,faults};
}
const named=(name:string)=>(cause:unknown)=>{assert.ok(cause instanceof Error);assert.equal(cause.name,name);assert.ok(cause.message.length>15);return true;};

test('C37 export golden uses declared units and returns owned bytes without consuming input tokens',()=>{
  const f=fixture(),bodies=f.body(),before=structuredClone(bodies);
  const output=stepExchange({action:'export',session:f.session,bodies,units:'inch'});
  assert.deepEqual(output,{bodies:null,file:{name:'part.step',mime:'model/step',bytes:STEP_BYTES,diagnostics:[]}});
  assert.deepEqual(bodies,before);assert.deepEqual(f.state.units,[25.4]);assert.deepEqual(f.state.local,[1]);assert.equal(f.retained.size,1);f.cleaned();
  assert.deepEqual(f.state.unitChanges,['INCH','CM']);
  output.file!.bytes.fill(0);assert.equal(STEP_BYTES[0],73);
});
test('C37 import golden publishes all valid solids only after canonical-mm transfer',()=>{
  const f=fixture(),bytes=STEP_BYTES.slice();
  assert.deepEqual(stepExchange({action:'import',session:f.session,bytes,units:'inch'}),{file:null,bodies:{shapes:[{bodyId:'step-solid-1',token:{id:1,generation:1}},{bodyId:'step-solid-2',token:{id:2,generation:1}}],topology:[],operands:[],diagnostics:[]}});
  assert.deepEqual(bytes,STEP_BYTES);assert.deepEqual(f.state.system,[1]);f.cleaned();
});
test('C37 closed sessions and stale tokens fail before exchange',()=>{
  const f=fixture();f.state.closed=true;
  assert.throws(()=>stepExchange({action:'import',session:f.session,bytes:STEP_BYTES,units:'mm'}),named('DisposedSessionError'));
  f.state.closed=false;const bodies=f.body();f.session.release(bodies.shapes[0]!.token);
  assert.throws(()=>stepExchange({action:'export',session:f.session,bodies,units:'mm'}),named('DisposedSessionError'));f.cleaned();
});
test('C37 rejects empty, unreadable and invalid-unit import requests',()=>{
  for(const scenario of ['empty','read','filesystem','units']){
    const f=fixture();if(scenario==='read')f.state.read='failed';if(scenario==='filesystem')f.state.readFailure=true;
    const request={action:'import',session:f.session,bytes:scenario==='empty'?new Uint8Array():STEP_BYTES,units:scenario==='units'?'m':'mm'} as STEPRequest;
    assert.throws(()=>stepExchange(request),scenario==='filesystem'?cause=>cause===f.faults.read:named('STEPReadError'));assert.equal(f.retained.size,0);f.cleaned();
  }
});
test('C37 refuses zero or partial root transfer without publishing any body',()=>{
  for(const [roots,transferred]of [[0,0],[2,0],[2,1]]){
    const f=fixture();f.state.roots=roots!;f.state.transferred=transferred!;
    assert.throws(()=>stepExchange({action:'import',session:f.session,bytes:STEP_BYTES,units:'mm'}),named('STEPTransferError'));assert.equal(f.retained.size,0);f.cleaned();
  }
});
test('C37 refuses erroneous/unknown entities and per-entity translation failures even when every root transfers',()=>{
  for(const scenario of ['load','unknown','translation']){
    const f=fixture();if(scenario==='load')f.state.entityError=2;if(scenario==='unknown')f.state.unknownEntity=2;if(scenario==='translation')f.state.transferFailures=1;
    assert.throws(()=>stepExchange({action:'import',session:f.session,bytes:STEP_BYTES,units:'mm'}),named(scenario==='translation'?'STEPTransferError':'STEPReadError'));
    assert.equal(f.retained.size,0);f.cleaned();
  }
});
test('C37 rejects invalid, zero-volume, reversed, nonfinite, nonsolid and mixed imports atomically',()=>{
  for(const scenario of ['invalid','zero','reversed','nonfinite','no-solids','mixed','empty-shell','empty-wire']){
    const f=fixture();if(scenario==='invalid')f.state.valid[1]=false;
    if(scenario==='zero')f.state.volumes[1]=0;if(scenario==='reversed')f.state.volumes[1]=-1;if(scenario==='nonfinite')f.state.volumes[1]=Infinity;
    if(scenario==='no-solids')f.state.valid=[];if(scenario==='mixed')f.state.extras='face';if(scenario==='empty-shell')f.state.extras='shell';if(scenario==='empty-wire')f.state.extras='wire';
    assert.throws(()=>stepExchange({action:'import',session:f.session,bytes:STEP_BYTES,units:'mm'}),named('InvalidImportedSolidError'));assert.equal(f.retained.size,0);f.cleaned();
  }
});
test('C37 validates export solids and transfer statuses without mutating originals',()=>{
  for(const scenario of ['empty','invalid','zero','units','transfer','duplicate-id','empty-id','unit-setting']){
    const f=fixture(),bodies=f.body();if(scenario==='empty')bodies.shapes=[];if(scenario==='invalid')f.state.valid[0]=false;if(scenario==='zero')f.state.volumes[0]=0;if(scenario==='transfer')f.state.transfer='failed';
    if(scenario==='duplicate-id')bodies.shapes.push(bodies.shapes[0]!);if(scenario==='empty-id')bodies.shapes[0]!.bodyId='';if(scenario==='unit-setting')f.state.unitFailure=true;
    assert.throws(()=>stepExchange({action:'export',session:f.session,bodies,units:scenario==='units'?'m':'mm'} as STEPRequest),named('STEPTransferError'));f.cleaned();
  }
});
test('C37 deliberate write rejections clean up; unknown write failures propagate without cleanup',()=>{
  for(const scenario of ['status','exception','empty']){
    const f=fixture();if(scenario==='status')f.state.write='failed';if(scenario==='exception')f.state.writeFailure=true;if(scenario==='empty')f.state.emptyWrite=true;
    assert.throws(()=>stepExchange({action:'export',session:f.session,bodies:f.body(),units:'mm'}),scenario==='exception'?cause=>cause===f.faults.write:named('STEPWriteError'));
    if(scenario==='exception'){assert.ok(f.allocated.every(v=>!v.deleted));assert.equal(f.state.unit,'MM');}else f.cleaned();
  }
});
test('C37 restore failures are explicit; native faults avoid unsafe native cleanup',()=>{
  const f=fixture();f.state.restoreFailure=true;
  assert.throws(()=>stepExchange({action:'export',session:f.session,bodies:f.body(),units:'inch'}),named('STEPTransferError'));
  const native=fixture();native.state.nativeFault=true;
  assert.throws(()=>stepExchange({action:'export',session:native.session,bodies:native.body(),units:'mm'}),{name:'RuntimeError',message:'native fault'});
  assert.ok(native.allocated.every(v=>!v.deleted));
});
test('C37 real C01/OpenCascade: dispose source, import mm/inch STEP, preserve curved solids and multiple bodies',async()=>{
  const saved=new Map(['location','importScripts','__C37_INIT'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const origin='https://step.test';
  const hooks=registerHooks({resolve(s,c,n){return s.startsWith(origin)?{url:s,shortCircuit:true}:n(s,c);},load(u,c,n){return u.startsWith(origin)?{format:'module',shortCircuit:true,source:'export default ()=>globalThis.__C37_INIT();'}:n(u,c);}});
  Object.defineProperty(globalThis,'location',{configurable:true,value:new URL(origin)});
  Object.defineProperty(globalThis,'importScripts',{configurable:true,value:()=>{}});
  Object.defineProperty(globalThis,'__C37_INIT',{configurable:true,value:()=>init({wasmBinary:readFileSyncBytes,print:()=>{}})});
  const readFileSyncBytes=await readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
  let session:KernelSession|undefined;
  try{
    const opened=await kernelRuntime({action:'open',config:{moduleUrl:`${origin}/occt.js`,wasmUrl:`${origin}/occt.wasm`,mode:'single',tolerance:{linearMm:1e-7,angularRad:1e-9,relative:1e-9}}});session=opened.session!;const oc=session.library;
    for(const units of ['mm','inch','mm'] as const){
      const box=new oc.BRepPrimAPI_MakeBox(100,60,10),cylinder=new oc.BRepPrimAPI_MakeCylinder(5,20);
      const boxToken=session.retain(box.Shape()),cylinderToken=session.retain(cylinder.Shape());box.delete();cylinder.delete();
      const bodies={shapes:[{bodyId:'plate',token:boxToken},{bodyId:'cylinder',token:cylinderToken}],topology:[],operands:[],diagnostics:[]};
      const written=stepExchange({action:'export',session,bodies,units}).file!;
      const text=new TextDecoder().decode(written.bytes);assert.match(text,/ISO-10303-21;/);assert.match(text,/MANIFOLD_SOLID_BREP/);
      if(units==='inch')assert.match(text,/CONVERSION_BASED_UNIT\('INCH'/);else assert.match(text,/SI_UNIT\(.MILLI.,.METRE.\)/);
      session.release(boxToken);session.release(cylinderToken);
      const imported:NonNullable<STEPResult['bodies']>=stepExchange({action:'import',session,bytes:written.bytes,units:units==='mm'?'inch':'mm'}).bodies!;
      assert.equal(imported.shapes.length,2);const volumes:number[]=[];
      for(const body of imported.shapes){const shape=session.resolve(body.token),check=new oc.BRepCheck_Analyzer(shape,true,false),props=new oc.GProp_GProps();assert.ok(check.IsValid());oc.BRepGProp.VolumeProperties(shape,props,true,false,false);volumes.push(props.Mass());check.delete();props.delete();session.release(body.token);}
      volumes.sort((a,b)=>a-b);assert.ok(Math.abs(volumes[0]!-Math.PI*25*20)<1e-6);assert.ok(Math.abs(volumes[1]!-60000)<1e-6);
    }
    // One assembly root contains two solids. A root count alone misses a damaged child.
    const compound=new oc.TopoDS_Compound(),builder=new oc.TopoDS_Builder(),first=new oc.BRepPrimAPI_MakeBox(10,20,30),second=new oc.BRepPrimAPI_MakeBox(5,6,7);
    const firstShape=first.Shape(),secondShape=second.Shape();builder.MakeCompound(compound);builder.Add(compound,firstShape);builder.Add(compound,secondShape);
    const writer=new oc.STEPControl_Writer(),progress=new oc.Message_ProgressRange(),path='/assembly-test.step';
    let assembly:string;
    try{
      assert.equal(writer.Transfer(compound,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress),oc.IFSelect_ReturnStatus.IFSelect_RetDone);
      assert.equal(writer.Write(path),oc.IFSelect_ReturnStatus.IFSelect_RetDone);assembly=new TextDecoder().decode(oc.FS.readFile(path));
    }finally{oc.FS.unlink(path);progress.delete();writer.delete();secondShape.delete();firstShape.delete();second.delete();first.delete();builder.delete();compound.delete();}
    const validAssembly=stepExchange({action:'import',session,bytes:new TextEncoder().encode(assembly),units:'mm'}).bodies!;
    assert.equal(validAssembly.shapes.length,2);
    const assemblyVolumes=validAssembly.shapes.map(body=>{const props=new oc.GProp_GProps();oc.BRepGProp.VolumeProperties(session!.resolve(body.token),props,true,false,false);const volume=props.Mass();props.delete();session!.release(body.token);return volume;}).sort((a,b)=>a-b);
    assert.ok(Math.abs(assemblyVolumes[0]!-210)<1e-7);assert.ok(Math.abs(assemblyVolumes[1]!-6000)<1e-7);
    let solidCount=0;const damaged=assembly.replace(/(MANIFOLD_SOLID_BREP\('[^']*',)#\d+(\))/g,(full,before,after)=>++solidCount===2?`${before}#99999${after}`:full);
    assert.equal(solidCount,2);assert.notEqual(damaged,assembly);
    assert.throws(()=>stepExchange({action:'import',session:session!,bytes:new TextEncoder().encode(damaged),units:'mm'}),named('STEPReadError'));
    let shellCount=0;const emptyShell=assembly.replace(/CLOSED_SHELL\('[^']*',\(#[\d,#]+\)\)/g,full=>++shellCount===2?"CLOSED_SHELL('',())":full);
    assert.equal(shellCount,2);assert.notEqual(emptyShell,assembly);
    assert.throws(()=>stepExchange({action:'import',session:session!,bytes:new TextEncoder().encode(emptyShell),units:'mm'}),named('InvalidImportedSolidError'));
    assert.throws(()=>stepExchange({action:'import',session:session!,bytes:new TextEncoder().encode('not a STEP file'),units:'mm'}),named('STEPReadError'));
    await kernelRuntime({action:'close',session});assert.throws(()=>stepExchange({action:'import',session:session!,bytes:STEP_BYTES,units:'mm'}),named('DisposedSessionError'));
  }finally{if(session&&!session.isClosed())await kernelRuntime({action:'close',session});hooks.deregister();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}
});
