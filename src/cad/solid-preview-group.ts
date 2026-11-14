/**
 * PURPOSE    Combine complete solid previews without discarding bodies.
 * KIND       CORE
 * CONTRACT   IN: nonempty ordered unique-ID C54 previews. OUT: owned aggregate
 *            triangles and ordered per-body canonical-mm B-rep measurements.
 *            RAISES: SolidPreviewError for malformed buffers/measurements, duplicates,
 *            arithmetic overflow or a group exceeding the documented resource bound.
 * GUARANTEES Pure, deterministic, no mutation or boolean union; every triangle remains.
 * TUNING     MAX_VERTICES and MAX_TRIANGLES are each 5,000,000, checked before allocation.
 * DECISIONS  D1: Concatenate solids for display. Alternative: fuse bodies, which changes
 *            topology and overlap volume. Revisit if: explicit boolean editing is added.
 * LIMITS     Aggregate volume is the sum of bodies, including overlap; no topology IDs.
 * TESTBENCH  src/cad/solid-preview-group.test.ts -- run with: node --import tsx --test src/cad/solid-preview-group.test.ts
 */
import type { SolidPreview } from './extrude-preview.ts';
export type SolidGroup={solid:SolidPreview;bodies:{id:string;volume:number;area:number;center:[number,number,number]}[]};
export function combineSolidPreviews(bodies:readonly {id:string;solid:SolidPreview}[]):SolidGroup{
  const MAX_VERTICES=5_000_000,MAX_TRIANGLES=5_000_000;
  const fail=(reason:string):never=>{throw Object.assign(new Error(`Solid preview: ${reason}`),{name:'SolidPreviewError'});};
  if(!Array.isArray(bodies)||!bodies.length)fail('expected at least one complete body');
  let vertices=0,triangles=0,volume=0,area=0;const ids=new Set<string>();
  for(const body of bodies){
    if(!body||typeof body.id!=='string'||!body.id.trim()||ids.has(body.id))fail('body IDs must be unique nonempty text');ids.add(body.id);
    const v=body.solid;
    if(!v||!(v.positions instanceof Float32Array)||!(v.indices instanceof Uint32Array)||!v.positions.length||v.positions.length%3||!v.indices.length||v.indices.length%3)fail('expected complete position and triangle buffers');
    vertices+=v.positions.length/3;triangles+=v.indices.length/3;
    if(vertices>MAX_VERTICES||triangles>MAX_TRIANGLES)fail('the model exceeds 5,000,000 preview vertices or triangles');
    if(!v.positions.every(Number.isFinite)||!v.indices.every(i=>i<v.positions.length/3)||!Number.isFinite(v.volume)||v.volume<=0||!Number.isFinite(v.area)||v.area<0||!Array.isArray(v.center)||v.center.length!==3||![...v.center].every(Number.isFinite))fail('invalid geometry or B-rep measurements');
    volume+=v.volume;area+=v.area;
  }
  if(!Number.isFinite(volume)||!Number.isFinite(area))fail('aggregate measurements overflow');
  const positions=new Float32Array(vertices*3),indices=new Uint32Array(triangles*3),center:[number,number,number]=[0,0,0];let offset=0,indexOffset=0;
  for(const {solid:v} of bodies){
    positions.set(v.positions,offset*3);for(const index of v.indices)indices[indexOffset++]=index+offset;offset+=v.positions.length/3;
    for(const axis of [0,1,2] as const)center[axis]+=v.center[axis]*(v.volume/volume);
  }
  if(!center.every(Number.isFinite))fail('aggregate center overflows');
  return{solid:{positions,indices,volume,area,center},bodies:bodies.map(({id,solid:v})=>({id,volume:v.volume,area:v.area,center:[...v.center]}))};
}
