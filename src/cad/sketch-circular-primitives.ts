/**
 * PURPOSE    Construct circular sketch geometry.
 * KIND       CORE
 * CONTRACT   IN: CircularRequest with finite mm anchors, unique nonempty IDs,
 *            explicit construction flag and positive finite document tolerance.
 *            Circle: center/radius point. Three-point arc: start/through/end.
 *            Center arc: center/start/end for the shortest signed sweep (pi tie
 *            is CCW), or center/start/through/end to select either longer sweep.
 *            Center-arc through/end points specify rays at the start radius.
 *            Tangent arc: start/end and forward tangent. Slot: two cap centers
 *            plus width. OUT: owned analytic entities in supplied ID order;
 *            slot order is segment/arc/segment/arc around a CCW boundary.
 *            Radii, distinct anchors and slot-center distance exceed linearMm;
 *            arc sweep and its gap to a full turn exceed angularRad.
 *            Reconstructed anchors meet max(linearMm,relative*local extent):
 *            three-point span, tangent chord, center-arc radius or slot width.
 *            Tangent direction meets angularRad, independent of translation.
 *            RAISES: AnchorCountError, IdCountError, CollinearArcError,
 *            InvalidRadiusError, ImpossibleTangentError, DegenerateGeometryError.
 * GUARANTEES Pure, deterministic, no I/O, implicit IDs, input mutation or solver.
 * TUNING     Caller linear/angular tolerances define collapsed geometry; no global epsilon.
 * DECISIONS  D1: Keep an optional through anchor for center arcs. Alternative: always
 *            take the shortest sweep loses pointer direction and major arcs.
 *            Revisit if: the tool controller supplies a different approved direction port.
 *            D2: Translate/scale circumcenter inputs before products. Alternative:
 *            squared world coordinates overflow or lose local precision.
 *            Revisit if: an approved robust-predicate library replaces this construction.
 *            D3: Check reconstruction using local dimensions. Alternative: scaling by
 *            world coordinates or remote arc centers hides lost shallow-arc anchors.
 *            Revisit if: the document adopts a different approved tolerance policy.
 * LIMITS     Valid tool tags, finite anchor tuples, positive tolerances and unique
 *            IDs are caller preconditions. Canonical mm; no snapping, constraints,
 *            dimensions, UI or project migration. Floating-point joins use document
 *            tolerance. Full circles use circle entities, never full-turn arcs.
 * TESTBENCH  src/cad/sketch-circular-primitives.test.ts -- run with: node --import tsx --test src/cad/sketch-circular-primitives.test.ts
 */
type Vec2=readonly [number,number];
export type CircularEntity=Readonly<{id:string;construction:boolean}> & (
  | Readonly<{kind:'circle';center:Vec2;radius:number}>
  | Readonly<{kind:'arc';center:Vec2;radius:number;startRad:number;sweepRad:number}>
  | Readonly<{kind:'segment';a:Vec2;b:Vec2}>
);
export type CircularRequest=Readonly<{
  tool:'circle'|'arc-three-point'|'arc-center-point'|'arc-tangent'|'slot';
  anchors:readonly Vec2[];tangent?:Vec2;widthMm?:number;construction:boolean;ids:readonly string[];
  tolerance:Readonly<{linearMm:number;angularRad:number;relative:number}>;
}>;
export function makeCircularEntities({tool,anchors,tangent,widthMm,construction,ids,tolerance}:CircularRequest):CircularEntity[]{
  const tau=2*Math.PI;
  const fail=(name:string,message:string):never=>{throw Object.assign(new Error(message),{name});};
  const count=tool==='arc-three-point'||tool==='arc-center-point'?3:2;
  if(anchors.length!==count&&!(tool==='arc-center-point'&&anchors.length===4))fail('AnchorCountError',tool+' has an incorrect anchor count; use '+count+(tool==='arc-center-point'?' or 4':'')+' anchors.');
  const needed=tool==='slot'?4:1;
  if(ids.length!==needed)fail('IdCountError',tool+' needs exactly '+needed+' entity IDs.');
  const zero=(value:number)=>value===0?0:value;
  const point=(value:Vec2):[number,number]=>{
    if(!value.every(Number.isFinite))fail('DegenerateGeometryError','The resulting sketch coordinates exceed the finite geometry range.');
    return [zero(value[0]),zero(value[1])];
  };
  const radius=(value:number)=>{
    if(!Number.isFinite(value)||value<=tolerance.linearMm)fail('InvalidRadiusError','The radius must be finite, positive and exceed '+tolerance.linearMm+' mm.');
    return value;
  };
  const separation=(a:Vec2,b:Vec2)=>{
    const distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(!Number.isFinite(distance)||distance<=tolerance.linearMm)fail('DegenerateGeometryError','Distinct sketch anchors must be finite and separated by more than '+tolerance.linearMm+' mm.');
    return distance;
  };
  const direction=(center:Vec2,target:Vec2)=>{
    separation(center,target);return zero(Math.atan2(target[1]-center[1],target[0]-center[0]));
  };
  const ccw=(angle:number)=>{const remainder=angle%tau;return zero(remainder<0?remainder+tau:remainder);};
  const gap=(angle:number)=>Math.min(ccw(angle),tau-ccw(angle));
  const at=(center:Vec2,r:number,angle:number)=>point([center[0]+r*Math.cos(angle),center[1]+r*Math.sin(angle)]);
  const signedTurn=(from:Vec2,to:Vec2)=>{
    const a=Math.max(Math.abs(from[0]),Math.abs(from[1])),b=Math.max(Math.abs(to[0]),Math.abs(to[1]));
    const x=from[0]/a,y=from[1]/a,u=to[0]/b,v=to[1]/b;
    // Equal-and-opposite rays must choose +pi, independent of atan2 subtraction rounding.
    return Math.atan2(zero(x*v-y*u),x*u+y*v);
  };
  const swept=(start:number,end:number,through:number)=>{
    const delta=ccw(end-start);
    if(gap(through-start)<=tolerance.angularRad||gap(through-end)<=tolerance.angularRad)fail('DegenerateGeometryError','The through direction must differ from both arc endpoints.');
    return ccw(through-start)<delta?delta:delta-tau;
  };
  const arc=(id:string,center:Vec2,r:number,startRad:number,sweepRad:number):Extract<CircularEntity,{kind:'arc'}>=>{
    radius(r);point(center);const amount=Math.abs(sweepRad);
    if(!Number.isFinite(startRad)||!Number.isFinite(amount)||amount<=tolerance.angularRad||tau-amount<=tolerance.angularRad)fail('DegenerateGeometryError','An arc needs a resolvable sweep below one full turn; use a circle for a closed curve.');
    separation(at(center,r,startRad),at(center,r,startRad+sweepRad));
    // Endpoints alone do not detect overflowing interior cardinal extrema.
    for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2])if(ccw((angle-startRad)*Math.sign(sweepRad))<=amount)at(center,r,angle);
    return{id,kind:'arc',center:point(center),radius:r,startRad:zero(startRad),sweepRad:zero(sweepRad),construction};
  };
  const checked=(curve:Extract<CircularEntity,{kind:'arc'}>,samples:readonly (readonly [number,Vec2])[],extent:number)=>{
    const bound=Math.max(tolerance.linearMm,tolerance.relative*extent);
    for(const [angle,target] of samples){
      const p=at(curve.center,curve.radius,angle);
      if(Math.hypot(p[0]-target[0],p[1]-target[1])>bound)fail('DegenerateGeometryError','This arc cannot retain its anchors within the document tolerance; increase its curvature or move it closer to the sketch origin.');
    }
    return curve;
  };
  const a=anchors[0]!,b=anchors[1]!;
  if(tool==='circle'){
    const r=radius(Math.hypot(b[0]-a[0],b[1]-a[1]));
    point([a[0]-r,a[1]-r]);point([a[0]+r,a[1]+r]);
    return[{id:ids[0]!,kind:'circle',center:point(a),radius:r,construction}];
  }
  if(tool==='arc-center-point'){
    const last=anchors.at(-1)!,r=radius(Math.hypot(b[0]-a[0],b[1]-a[1])),start=direction(a,b),end=direction(a,last);
    const sweep=anchors.length===4?swept(start,end,direction(a,anchors[2]!)):signedTurn([b[0]-a[0],b[1]-a[1]],[last[0]-a[0],last[1]-a[1]]);
    const projected=(target:Vec2):Vec2=>{const length=separation(a,target);return point([a[0]+((target[0]-a[0])/length)*r,a[1]+((target[1]-a[1])/length)*r]);};
    const samples:[number,Vec2][]=[[start,b],[start+sweep,projected(last)]];
    if(anchors.length===4)samples.push([direction(a,anchors[2]!),projected(anchors[2]!)]);
    return[checked(arc(ids[0]!,a,r,start,sweep),samples,r)];
  }
  if(tool==='arc-three-point'){
    const end=anchors[2]!,extent=Math.max(separation(a,b),separation(b,end),separation(end,a));
    const dx=b[0]-a[0],dy=b[1]-a[1],ex=end[0]-a[0],ey=end[1]-a[1],scale=Math.max(Math.abs(dx),Math.abs(dy),Math.abs(ex),Math.abs(ey));
    const x=dx/scale,y=dy/scale,u=ex/scale,v=ey/scale,cross=x*v-y*u;
    if(Math.abs(cross)/Math.hypot(u,v)<=tolerance.linearMm/scale)fail('CollinearArcError','The three points are collinear within the document tolerance; choose a point away from the chord.');
    const p=x*x+y*y,q=u*u+v*v;
    const offset:Vec2=[((p*v-q*y)/(2*cross))*scale,((x*q-u*p)/(2*cross))*scale];
    const r=radius(Math.hypot(...offset)),center=point([a[0]+offset[0],a[1]+offset[1]]);
    const start=direction(center,a),finish=direction(center,end),through=direction(center,b);
    const result=arc(ids[0]!,center,r,start,swept(start,finish,through));
    return[checked(result,[[start,a],[start+result.sweepRad,end],[through,b]],extent)];
  }
  const distance=separation(a,b),dx=b[0]-a[0],dy=b[1]-a[1];
  if(tool==='arc-tangent'){
    if(!tangent||!tangent.every(Number.isFinite)||Math.max(Math.abs(tangent[0]),Math.abs(tangent[1]))===0)fail('ImpossibleTangentError','A tangent arc needs a finite nonzero forward tangent direction.');
    const t=tangent!,scale=Math.max(Math.abs(t[0]),Math.abs(t[1])),size=Math.hypot(t[0]/scale,t[1]/scale);
    const nx=-t[1]/scale/size,ny=t[0]/scale/size,chordScale=Math.max(Math.abs(dx),Math.abs(dy)),x=dx/chordScale,y=dy/chordScale;
    const projection=x*nx+y*ny;
    if(Math.abs(projection)/Math.hypot(x,y)<=tolerance.angularRad)fail('ImpossibleTangentError','The endpoint lies along the tangent; choose an endpoint to either side to form a circular arc.');
    const signedRadius=((x*x+y*y)/(2*projection))*chordScale,r=radius(Math.abs(signedRadius));
    const sign=Math.sign(signedRadius),center=point([a[0]+nx*signedRadius,a[1]+ny*signedRadius]);
    // The rounded world center must not replace the explicitly supplied tangent.
    const start=zero(Math.atan2(-ny*sign,-nx*sign)),delta=ccw(direction(center,b)-start);
    const result=arc(ids[0]!,center,r,start,signedRadius>0?delta:delta-tau);
    if(Math.abs(signedTurn(t,[-Math.sin(start)*sign,Math.cos(start)*sign]))>tolerance.angularRad)fail('DegenerateGeometryError','This arc cannot retain the supplied tangent within the document angular tolerance.');
    return[checked(result,[[start,a],[start+result.sweepRad,b]],distance)];
  }
  const r=radius(widthMm===undefined?NaN:widthMm/2),nx=-dy/distance,ny=dx/distance,theta=Math.atan2(dy,dx);
  const aLow=point([a[0]-nx*r,a[1]-ny*r]),bLow=point([b[0]-nx*r,b[1]-ny*r]);
  const aHigh=point([a[0]+nx*r,a[1]+ny*r]),bHigh=point([b[0]+nx*r,b[1]+ny*r]);
  separation(aLow,bLow);separation(aHigh,bHigh);
  const capB=arc(ids[1]!,b,r,theta-Math.PI/2,Math.PI),capA=arc(ids[3]!,a,r,theta+Math.PI/2,Math.PI);
  return[
    {id:ids[0]!,kind:'segment',a:aLow,b:bLow,construction},
    checked(capB,[[capB.startRad,bLow],[capB.startRad+capB.sweepRad,bHigh]],2*r),
    {id:ids[2]!,kind:'segment',a:bHigh,b:aHigh,construction},
    checked(capA,[[capA.startRad,aHigh],[capA.startRad+capA.sweepRad,aLow]],2*r),
  ];
}
