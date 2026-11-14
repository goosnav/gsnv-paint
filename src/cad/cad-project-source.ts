/**
 * PURPOSE    Validate persisted CAD sources without losing their embedded STEP bytes.
 * KIND       CORE
 * CONTRACT   IN: read/decode/encode/import/units requests from CAD-STEP-IMPORT.md.
 *            OUT: owned parametric or single fixed STEP source, or native content/assets.
 *            RAISES: CADSourceError for malformed/unsupported import sources, invalid
 *            asset references, source limits, unit requests or revision exhaustion.
 * GUARANTEES Pure, deterministic, immutable; exact source bytes and every solid persist.
 * TUNING     MAX_STEP_BYTES=64 MiB bounds a single embedded STEP source before parsing.
 * DECISIONS  D1: Keep STEP in the native binary asset table. Alternative: JSON base64
 *            increases size and changes the native contract. Revisit if: S15 changes.
 * LIMITS     One identity-placed import, no mixed feature graphs. Geometry validity is
 *            established by C37 in a worker. Existing C50 validation errors propagate.
 * TESTBENCH  src/cad/cad-project-source.test.ts -- run with: node --import tsx --test src/cad/cad-project-source.test.ts
 */
import { editableCADContent, type CADContent } from './editable-cad-content.ts';
type Asset = { id: string; mime: 'model/step'; name: string; bytes: Uint8Array };
type Imported = Omit<CADContent, 'graph'|'assets'|'variables'> & { variables: []; assets: [Asset]; graph: {
  revision: number; rollback: 1; features: [{ id:string; name:string; kind:'import'; dependsOn:[]; suppressed:false; definition:{assetId:string;placement:number[]} }];
} };
export type CADSource = CADContent | Imported;
type NativeAsset = { readonly id:string; readonly mime:string; readonly bytes:Uint8Array };
type Encoded = { content: CADContent | (Omit<Imported,'assets'> & {assets:{id:string;mime:'model/step';name:string;byteLength:number}[]}); assets:NativeAsset[] };
type Request = {operation:'read';value:unknown} | {operation:'decode';content:unknown;assets:readonly NativeAsset[]} |
  {operation:'encode';source:CADSource} | {operation:'import';name:string;bytes:Uint8Array;units:'mm'|'inch';featureId:string;assetId:string} |
  {operation:'units';source:CADSource;units:'mm'|'inch'};
const MAX_STEP_BYTES=64*1024*1024;
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function bad(where:string,reason:string):never{throw Object.assign(new Error(`${where}: ${reason}`),{name:'CADSourceError'});}
function record(v:unknown,fields:string,where:string):Record<string,unknown>{
  if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)bad(where,'expected a plain record');
  const descriptors=Object.getOwnPropertyDescriptors(v);
  if(Reflect.ownKeys(v).length!==fields.split(' ').length||Object.keys(descriptors).sort().join(' ')!==fields.split(' ').sort().join(' ')||Object.values(descriptors).some(d=>!d.enumerable||!('value' in d)))bad(where,'missing or unsupported fields');
  return v as Record<string,unknown>;
}
const text=(v:unknown,where:string)=>{if(typeof v!=='string'||!v.trim())bad(where,'expected nonempty text');return v as string;};
const empty=(v:unknown,where:string)=>{if(!Array.isArray(v)||v.length)bad(where,'must be empty in an imported STEP project');};
function ownedBytes(value:unknown):Uint8Array{
  if(!(value instanceof Uint8Array)||!value.byteLength||value.byteLength>MAX_STEP_BYTES)bad('STEP source','choose a nonempty file of at most 64 MiB');
  return new Uint8Array(value as Uint8Array);
}
function header(value:unknown){
  const v=record(value,'units tolerance variables graph assets appearance drawing','CAD');
  const graph=record(v.graph,'features rollback revision','graph');
  if(!Array.isArray(graph.features)||!graph.features.length)bad('features','expected a CAD source feature');
  const first=record(graph.features[0],'id name kind dependsOn suppressed definition','first feature');
  return {v,graph,first};
}
function read(value:unknown):CADSource{
  const {v,graph,first}=header(value);
  if(first.kind!=='import')return editableCADContent({operation:'read',value});
  const defaults=editableCADContent({operation:'new'});
  try{editableCADContent({operation:'read',value:{...defaults,units:v.units,tolerance:v.tolerance,appearance:v.appearance}});}catch(cause){bad('import settings',cause instanceof Error?cause.message:String(cause));}
  empty(v.variables,'variables');empty(first.dependsOn,'dependencies');
  if(v.drawing!==null||first.suppressed!==false||(graph.features as unknown[]).length!==1||graph.rollback!==1)bad('import feature','expected one active imported source, no drawing or rollback');
  if(!Number.isSafeInteger(graph.revision)||(graph.revision as number)<0)bad('revision','expected a nonnegative safe integer');
  const featureId=text(first.id,'feature ID'),name=text(first.name,'feature name'),definition=record(first.definition,'assetId placement','import definition');
  if(!Array.isArray(definition.placement)||definition.placement.length!==16||IDENTITY.some((v,i)=>definition.placement instanceof Array&&definition.placement[i]!==v))bad('placement','only the identity matrix is supported');
  if(!Array.isArray(v.assets)||v.assets.length!==1)bad('assets','expected exactly one embedded STEP source');
  const asset=record(v.assets[0],'id mime name bytes','STEP asset'),assetId=text(asset.id,'asset ID');text(asset.name,'asset name');
  if(assetId===featureId||definition.assetId!==assetId||asset.mime!=='model/step')bad('asset reference','the import must reference its distinct model/step asset');
  return {...defaults,variables:[],units:v.units as 'mm'|'inch',tolerance:{...v.tolerance as CADContent['tolerance']},
    graph:{revision:graph.revision as number,rollback:1,features:[{id:featureId,name,kind:'import',dependsOn:[],suppressed:false,definition:{assetId,placement:[...IDENTITY]}}]},
    assets:[{id:assetId,name:asset.name as string,mime:'model/step',bytes:ownedBytes(asset.bytes)}]};
}
export const isSTEPSource=(source:CADSource):source is Imported=>source.graph.features[0].kind==='import';
export function cadProjectSource<T extends Request>(request:T):T extends {operation:'encode'}?Encoded:CADSource{
  const execute=():CADSource|Encoded=>{
    if(request.operation==='read')return read(request.value);
    if(request.operation==='import')return read({...editableCADContent({operation:'new'}),units:request.units,
      graph:{revision:0,rollback:1,features:[{id:request.featureId,name:request.name,kind:'import',dependsOn:[],suppressed:false,definition:{assetId:request.assetId,placement:IDENTITY}}]},
      assets:[{id:request.assetId,mime:'model/step',name:request.name,bytes:request.bytes}]});
    if(request.operation==='decode'){
      const {v,first}=header(request.content);
      if(!Array.isArray(request.assets))bad('native assets','expected an asset list');
      if(first.kind!=='import'){if(request.assets.length)bad('native assets','parametric projects have no embedded STEP assets');return read(request.content);}
      if(!Array.isArray(v.assets)||v.assets.length!==1||request.assets.length!==1)bad('native assets','expected exactly the referenced STEP source');
      const ref=record(v.assets[0],'id mime name byteLength','asset metadata'),asset=record(request.assets[0],'id mime bytes','native asset');
      if(ref.id!==asset.id||ref.mime!==asset.mime||!(asset.bytes instanceof Uint8Array)||ref.byteLength!==asset.bytes.byteLength)bad('native asset','ID, MIME and exact byte length must match its metadata');
      return read({...v,assets:[{id:ref.id,name:ref.name,mime:ref.mime,bytes:asset.bytes}]});
    }
    const source=read(request.source);
    if(request.operation==='units'){
      if(!isSTEPSource(source)||!['mm','inch'].includes(request.units))bad('units','use an imported source and choose mm or inch');
      if(source.units===request.units)return source;
      if(source.graph.revision===Number.MAX_SAFE_INTEGER)bad('revision','save a copy before the revision counter is exhausted');
      return {...source,units:request.units,graph:{...source.graph,revision:source.graph.revision+1}};
    }
    if(!isSTEPSource(source))return {content:source,assets:[]};
    const {bytes,...metadata}=source.assets[0];
    return {content:{...source,assets:[{...metadata,byteLength:bytes.byteLength}]},assets:[{id:metadata.id,mime:metadata.mime,bytes}]};
  };
  return execute() as T extends {operation:'encode'}?Encoded:CADSource;
}
