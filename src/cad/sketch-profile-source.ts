/**
 * PURPOSE    Materialize preserved parametric profile sources.
 * KIND       CORE
 * CONTRACT   IN: exact ProfileSource, C03 context, positive document tolerance.
 *            OUT: owned segments and fixed entity IDs in supplied order.
 *            RAISES: SketchProfileSourceError for malformed, degenerate or oversized
 *            profile data; C03 expression errors propagate.
 * GUARANTEES No mutation, IDs, solver/kernel calls or I/O; center and regularity survive edits.
 * TUNING     MAX_SIDES=128 bounds editor allocations, not native kernel capability.
 * DECISIONS  D1: Preserve generator intent beside segments. Alternative: bake evaluated
 *            coordinates, losing center/size relations. Revisit if: general composite constraints land.
 * LIMITS     Positive widths/radii; fixed side count; free member editing requires explicit detach.
 * TESTBENCH  node --import tsx --test src/cad/sketch-profile-source.test.ts
 */
import { evaluateDimension, type DimensionRequest } from './dimension-expressions.ts';
import { makeLinearEntities } from './sketch-linear-primitives.ts';
type Length={source:string;kind:'length'};
export type ProfileSource={id:string;entityIds:string[];center:[Length,Length];construction:boolean}&(
  {kind:'center-rectangle';width:Length;height:Length}|{kind:'regular-polygon';sides:number;radius:Length;rotation:{source:string;kind:'angle'}});
type Segment={id:string;kind:'segment';a:[number,number];b:[number,number];construction:boolean};
const MAX_SIDES=128;
export function materializeSketchProfile({profile,context,tolerance}:{profile:ProfileSource;context:DimensionRequest['context'];tolerance:{linearMm:number;angularRad:number;relative:number}}):{entities:Segment[];fixedEntityIds:string[]} {
  const fail=(reason:string):never=>{throw Object.assign(new Error(`Profile: ${reason}`),{name:'SketchProfileSourceError'});};
  const record=(v:unknown,keys?:string)=>{
    if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)fail('expected a plain source record.');
    if(Object.values(Object.getOwnPropertyDescriptors(v!)).some(d=>!('value'in d)))fail('source fields cannot be accessors.');
    if(keys&&Object.keys(v!).sort().join(',')!==keys.split(' ').sort().join(','))fail('missing or unsupported fields.');
  };
  const array=(v:unknown,n?:number)=>{
    if(!Array.isArray(v)||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!('value'in d))||(n!==undefined&&v.length!==n))fail('invalid coordinate or member array.');
  };
  record(profile);
  if(profile.kind!=='center-rectangle'&&profile.kind!=='regular-polygon')fail('unsupported profile kind.');
  record(profile,`id kind entityIds center construction ${profile.kind==='center-rectangle'?'width height':'sides radius rotation'}`);
  if(typeof profile.id!=='string'||!profile.id.trim()||typeof profile.construction!=='boolean')fail('invalid ID or construction flag.');
  const count=profile.kind==='center-rectangle'?4:profile.sides;
  if(!Number.isInteger(count)||count<3||count>MAX_SIDES)fail(`a polygon needs 3–${MAX_SIDES} whole sides.`);
  array(profile.entityIds,count);array(profile.center,2);
  const ids=new Set<string>();for(const id of profile.entityIds){if(typeof id!=='string'||!id.trim()||id===profile.id||ids.has(id))fail('member IDs must be unique and distinct from the profile.');ids.add(id);}
  const value=(v:Length|{source:string;kind:'angle'},kind:'length'|'angle',positive=false)=>{
    record(v,'source kind');if(v.kind!==kind||typeof v.source!=='string')fail(`expected a ${kind} expression.`);
    const result=evaluateDimension({expression:v,context}).value;
    if(!Number.isFinite(result)||(positive&&result<=tolerance.linearMm))fail('dimensions must be finite and sizes must exceed tolerance.');return result;
  };
  const center:[number,number]=[value(profile.center[0],'length'),value(profile.center[1],'length')];
  let anchor:[number,number];
  if(profile.kind==='center-rectangle')anchor=[center[0]+value(profile.width,'length',true)/2,center[1]+value(profile.height,'length',true)/2];
  else{const radius=value(profile.radius,'length',true),angle=value(profile.rotation,'angle');anchor=[center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle)];}
  if(!anchor.every(Number.isFinite))fail('coordinates overflow their finite range.');
  try{
    const entities=makeLinearEntities({tool:profile.kind==='center-rectangle'?'center-rectangle':'polygon',anchors:[center,anchor],sides:count,ids:[...profile.entityIds],construction:profile.construction,tolerance});
    return{entities:entities.map(e=>{if(e.kind!=='segment')return fail('expected segment members.');return{...e,a:[...e.a],b:[...e.b]};}),fixedEntityIds:[...profile.entityIds]};
  }catch(cause){return fail(cause instanceof Error?cause.message:String(cause));}
}
