/**
 * PURPOSE    Translate analytic sketch geometry into PlaneGCS geometry.
 * KIND       CORE
 * CONTRACT   IN: SketchGeometryRequest with canonical mm/radians, explicit construction,
 *            nonempty unique entity IDs, reserved IDs and positive finite tolerance.
 *            OUT: owned vendor primitives, complete source map and source point roles.
 *            Geometry IDs retain source IDs; generated IDs avoid every reserved/source ID.
 *            Points precede curves, then one mandatory ArcRules per arc. Empty input works.
 *            Roles: point p; segment a/b; circle center; arc center/start/end. Source points
 *            remain independent even at equal coordinates. All native points start unfixed.
 *            Arc end angle is start+sweep, preserving signed order; no wrapping. Radius,
 *            segment length and arc endpoint separation exceed linearMm. Sweep and its
 *            gap to a full turn exceed angularRad; represented end-start matches sweep
 *            within angularRad. Derived coordinates and on-curve extrema stay finite.
 *            RAISES: SketchGeometryError for malformed IDs/tolerance, unsupported,
 *            nonfinite, collapsed or unrepresentable geometry.
 * GUARANTEES Pure, deterministic, no I/O, solver calls, snapping, input mutation or hidden constraints.
 * TUNING     Document linear/angular tolerances bound representability; no global epsilon.
 * DECISIONS  D1: Keep distinct source points. Alternative: merge equal coordinates;
 *            rejected because coincidence must remain explicit and deletable.
 *            Revisit if: the approved source model changes point ownership.
 *            D2: Retain signed angles. Alternative: wrap or reverse clockwise arcs;
 *            rejected because native PlaneGCS accepts signed source order directly.
 *            Revisit if: a future pinned solver changes its verified arc convention.
 *            D3: Check extrema from the trigonometric direction. Alternative: angle
 *            modulo 2π; rejected because large starts lose phase relative to sin/cos.
 *            Revisit if: source angles are restricted to a normalized interval.
 * LIMITS     Geometry mapping only. No relationship inference, dimension binding, fix,
 *            solution acceptance, UI or project migration. Construction is metadata
 *            in the source; its geometry still participates in solving. Source creation
 *            and its anchor residuals belong to C07/C08, not this mapper.
 * TESTBENCH  src/cad/sketch-geometry-program.test.ts -- run with: node --import tsx --test src/cad/sketch-geometry-program.test.ts
 */
import type {SketchPoint,SketchLine,SketchCircle,SketchArc,ArcRules} from '@salusoft89/planegcs';
import type {LinearEntity} from './sketch-linear-primitives.ts';
import type {CircularEntity} from './sketch-circular-primitives.ts';
type PointRole='p'|'a'|'b'|'center'|'start'|'end';
type NativeGeometry=SketchPoint|SketchLine|SketchCircle|SketchArc|ArcRules;
export type SketchGeometryRequest=Readonly<{
  entities:readonly (LinearEntity|CircularEntity)[];
  reservedIds:readonly string[];
  tolerance:Readonly<{linearMm:number;angularRad:number;relative:number}>;
}>;
export type SketchGeometryProgram={
  primitives:NativeGeometry[];
  sourceBySolverId:Record<string,string>;
  roles:Record<string,{geometryId:string;points:Partial<Record<PointRole,string>>}>;
};
export function sketchGeometryProgram(request:SketchGeometryRequest):SketchGeometryProgram{
  const fail=(message:string):never=>{throw Object.assign(new Error(message),{name:'SketchGeometryError'});};
  const {entities,reservedIds,tolerance}=request;
  if(!tolerance||!(['linearMm','angularRad','relative'] as const).every(key=>Number.isFinite(tolerance[key])&&tolerance[key]>0))fail('Sketch geometry requires positive finite document tolerances.');
  if(!Array.isArray(entities)||!Array.isArray(reservedIds))fail('Sketch geometry and reserved IDs must be arrays.');
  const validId=(id:unknown):id is string=>typeof id==='string'&&id.trim().length>0;
  const sources=new Set<string>();
  for(const entity of entities){
    if(!entity||!validId(entity.id)||sources.has(entity.id))fail('Sketch geometry requires unique nonempty source entity IDs.');
    sources.add(entity.id);
    if(typeof entity.construction!=='boolean')fail(`Entity ${entity.id} needs an explicit construction flag.`);
  }
  for(const id of reservedIds)if(!validId(id))fail('Reserved solver IDs must be nonempty strings.');
  const used=new Set([...sources,...reservedIds]),sourceMap=new Map<string,string>();
  const roles=new Map<string,SketchGeometryProgram['roles'][string]>();
  const points:SketchPoint[]=[],curves:(SketchLine|SketchCircle|SketchArc)[]=[],rules:ArcRules[]=[];
  const allocate=(hint:string)=>{let id=hint;while(used.has(id))id='_'+id;used.add(id);return id;};
  const finitePoint=(p:readonly number[],source:string)=>{
    if(!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1]))fail(`Entity ${source} needs two finite coordinates at every point.`);
  };
  const addPoint=(source:string,role:PointRole,p:readonly number[],id=allocate(`${source}:${role}`))=>{
    finitePoint(p,source);points.push({id,type:'point',x:p[0]!,y:p[1]!,fixed:false});
    sourceMap.set(id,source);roles.get(source)!.points[role]=id;return id;
  };
  const separated=(a:readonly number[],b:readonly number[],source:string,kind:string)=>{
    finitePoint(a,source);finitePoint(b,source);const distance=Math.hypot(b[0]!-a[0]!,b[1]!-a[1]!);
    if(!Number.isFinite(distance)||distance<=tolerance.linearMm)fail(`Entity ${source} has collapsed or nonfinite ${kind} separation.`);
  };
  const tau=2*Math.PI;
  const ccw=(angle:number)=>{const remainder=angle%tau;return remainder<0?remainder+tau:remainder;};
  for(const entity of entities){
    const {id}=entity;roles.set(id,{geometryId:id,points:{}});sourceMap.set(id,id);
    if(entity.kind==='point'){addPoint(id,'p',entity.p,id);continue;}
    if(entity.kind==='segment'){
      separated(entity.a,entity.b,id,'segment');
      curves.push({id,type:'line',p1_id:addPoint(id,'a',entity.a),p2_id:addPoint(id,'b',entity.b)});continue;
    }
    if(entity.kind!=='circle'&&entity.kind!=='arc')fail(`Entity ${id} has an unsupported sketch geometry kind.`);
    const {center,radius}=entity;finitePoint(center,id);
    if(!Number.isFinite(radius)||radius<=tolerance.linearMm)fail(`Entity ${id} needs a finite radius larger than the document tolerance.`);
    const c_id=addPoint(id,'center',center);
    if(entity.kind==='circle'){
      finitePoint([center[0]-radius,center[1]-radius],id);finitePoint([center[0]+radius,center[1]+radius],id);
      curves.push({id,type:'circle',c_id,radius});continue;
    }
    const {startRad,sweepRad}=entity,amount=Math.abs(sweepRad),endRad=startRad+sweepRad;
    if(!Number.isFinite(startRad)||!Number.isFinite(endRad)||!Number.isFinite(amount)||amount<=tolerance.angularRad||tau-amount<=tolerance.angularRad||Math.abs((endRad-startRad)-sweepRad)>tolerance.angularRad)fail(`Entity ${id} has an unresolved or unrepresentable arc angle; use a circle for a full turn.`);
    const at=(angle:number):[number,number]=>[center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle)];
    const start=at(startRad),end=at(endRad);separated(start,end,id,'arc endpoint');
    // Match endpoint trigonometry; modulo of a large source angle loses its phase.
    const phase=Math.atan2(Math.sin(startRad),Math.cos(startRad));
    for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2])if(ccw((angle-phase)*Math.sign(sweepRad))<=amount)finitePoint(at(angle),id);
    curves.push({id,type:'arc',c_id,radius,start_id:addPoint(id,'start',start),end_id:addPoint(id,'end',end),start_angle:startRad,end_angle:endRad});
    const ruleId=allocate(`${id}:rules`);rules.push({id:ruleId,type:'arc_rules',a_id:id});sourceMap.set(ruleId,id);
  }
  return{primitives:[...points,...curves,...rules],sourceBySolverId:Object.fromEntries(sourceMap),roles:Object.fromEntries(roles)};
}
