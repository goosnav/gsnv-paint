import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCircularEntities,type CircularRequest,type CircularEntity} from './sketch-circular-primitives.ts';
import {evaluateDimension} from './dimension-expressions.ts';
type Vec2=readonly [number,number];
type Arc=Extract<CircularEntity,{kind:'arc'}>;
const tolerance={linearMm:1e-7,angularRad:1e-9,relative:1e-10};
const request=(tool:CircularRequest['tool'],anchors:readonly Vec2[],extra:Partial<CircularRequest>={}):CircularRequest=>({
  tool,anchors,construction:false,ids:tool==='slot'?['e0','e1','e2','e3']:['e0'],tolerance,...extra,
});
const near=(a:number,b:number,bound=1e-9)=>assert.ok(Math.abs(a-b)<=bound,a+' differs from '+b);
const nearPoint=(a:Vec2,b:Vec2,bound=1e-9)=>{near(a[0],b[0],bound);near(a[1],b[1],bound);};
const arc=(r:CircularRequest):Arc=>{const e=makeCircularEntities(r)[0]!;assert.equal(e.kind,'arc');return e as Arc;};
const at=(a:Arc,fraction:number):Vec2=>[a.center[0]+a.radius*Math.cos(a.startRad+a.sweepRad*fraction),a.center[1]+a.radius*Math.sin(a.startRad+a.sweepRad*fraction)];
const reject=(r:CircularRequest,name:string)=>assert.throws(()=>makeCircularEntities(r),(e:unknown)=>{assert.ok(e instanceof Error);assert.equal(e.name,name);assert.ok(e.message.length>name.length);return true;});

test('C08 golden circle preserves radius, identity and construction',()=>{
  assert.deepEqual(makeCircularEntities(request('circle',[[0,0],[10,0]],{construction:true})),[
    {id:'e0',kind:'circle',center:[0,0],radius:10,construction:true},
  ]);
});
test('C08 golden three-point semicircle passes through all three anchors in drawing order',()=>{
  assert.deepEqual(makeCircularEntities(request('arc-three-point',[[0,0],[10,10],[20,0]])),[
    {id:'e0',kind:'arc',center:[10,0],radius:10,startRad:Math.PI,sweepRad:-Math.PI,construction:false},
  ]);
});
test('C08 golden center arc projects end direction to start radius',()=>{
  assert.deepEqual(makeCircularEntities(request('arc-center-point',[[0,0],[10,0],[0,20]])),[
    {id:'e0',kind:'arc',center:[0,0],radius:10,startRad:0,sweepRad:Math.PI/2,construction:false},
  ]);
  near(arc(request('arc-center-point',[[0,0],[10,0],[0,-20]])).sweepRad,-Math.PI/2);
  near(arc(request('arc-center-point',[[0,0],[10,0],[-20,0]])).sweepRad,Math.PI);
});
test('C08 rotated antipodal center arcs keep the counterclockwise tie',()=>{
  for(const center of [[0,0],[7,-3]] as const)for(const vector of [[-10,-2],[-2,10],[10,2],[2,-10],[-10,2],[2,10],[10,-2],[-2,-10]] as const){
    const start:Vec2=[center[0]+vector[0],center[1]+vector[1]],end:Vec2=[center[0]-vector[0],center[1]-vector[1]];
    const a=arc(request('arc-center-point',[center,start,end]));
    near(a.sweepRad,Math.PI);nearPoint(at(a,0),start);nearPoint(at(a,1),end);
    nearPoint(at(a,.5),[center[0]-vector[1],center[1]+vector[0]]);
  }
});
test('C08 explicit through points retain clockwise and major arcs',()=>{
  const three=arc(request('arc-three-point',[[10,0],[-10,0],[0,10]]));
  const center=arc(request('arc-center-point',[[0,0],[10,0],[-30,0],[0,20]]));
  for(const a of [three,center]){nearPoint(a.center,[0,0]);near(a.radius,10);near(a.startRad,0);near(a.sweepRad,-3*Math.PI/2);nearPoint(at(a,2/3),[-10,0]);}
  const ccw=arc(request('arc-center-point',[[0,0],[10,0],[-30,0],[0,-20]]));near(ccw.sweepRad,3*Math.PI/2);
});
test('C08 golden tangent arc follows the forward tangent, including a major sweep',()=>{
  assert.deepEqual(makeCircularEntities(request('arc-tangent',[[0,0],[10,10]],{tangent:[5,0]})),[
    {id:'e0',kind:'arc',center:[0,10],radius:10,startRad:-Math.PI/2,sweepRad:Math.PI/2,construction:false},
  ]);
  const major=arc(request('arc-tangent',[[0,0],[-10,10]],{tangent:[5,0]}));
  near(major.sweepRad,3*Math.PI/2);nearPoint(at(major,0),[0,0]);nearPoint(at(major,1),[-10,10]);
  const clockwise=arc(request('arc-tangent',[[0,0],[10,-10]],{tangent:[5,0]}));near(clockwise.sweepRad,-Math.PI/2);
});
test('C08 golden slot is a closed pair of parallel sides and radius-4 semicircles',()=>{
  assert.deepEqual(makeCircularEntities(request('slot',[[0,0],[20,0]],{widthMm:8})),[
    {id:'e0',kind:'segment',a:[0,-4],b:[20,-4],construction:false},
    {id:'e1',kind:'arc',center:[20,0],radius:4,startRad:-Math.PI/2,sweepRad:Math.PI,construction:false},
    {id:'e2',kind:'segment',a:[20,4],b:[0,4],construction:false},
    {id:'e3',kind:'arc',center:[0,0],radius:4,startRad:Math.PI/2,sweepRad:Math.PI,construction:false},
  ]);
});
test('C08 three-point arcs preserve radius, center and signed sweep under translation/rotation/scaling',()=>{
  for(let i=0;i<32;i++)for(const radius of [0.25,10,1000])for(const direction of [-1,1]){
    const center:Vec2=[-12,7],angles=[i*.27,i*.27+direction*1.7,i*.27+direction*5.3];
    const points=angles.map(angle=>[center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle)] as Vec2);
    const result=arc(request('arc-three-point',points));nearPoint(result.center,center,1e-8);near(result.radius,radius,1e-8);near(result.sweepRad,direction*5.3,1e-8);
    nearPoint(at(result,0),points[0]!,1e-8);nearPoint(at(result,1.7/5.3),points[1]!,1e-8);nearPoint(at(result,1),points[2]!,1e-8);
  }
});
test('C08 tangent arcs preserve a forward unit tangent after rotations and vector rescaling',()=>{
  for(let i=0;i<48;i++)for(const magnitude of [1e-200,1,1e200])for(const sign of [-1,1]){
    const angle=i*.31,t:Vec2=[Math.cos(angle),Math.sin(angle)],n:Vec2=[-t[1],t[0]],start:Vec2=[7,-3];
    const end:Vec2=[start[0]+10*t[0]+sign*10*n[0],start[1]+10*t[1]+sign*10*n[1]];
    const a=arc(request('arc-tangent',[start,end],{tangent:[t[0]*magnitude,t[1]*magnitude]}));
    const forward:Vec2=[-Math.sin(a.startRad)*Math.sign(a.sweepRad),Math.cos(a.startRad)*Math.sign(a.sweepRad)];
    nearPoint(forward,t);near(a.radius,10);near(a.sweepRad,sign*Math.PI/2);nearPoint(at(a,0),start);nearPoint(at(a,1),end);
  }
});
test('C08 shallow arcs cannot silently lose their supplied anchors',()=>{
  for(const translation of [0,1e6]){
    const start:Vec2=[translation,translation],end:Vec2=[translation+100,translation];
    reject(request('arc-three-point',[start,[translation+50,translation+1e-6],end]),'DegenerateGeometryError');
    reject(request('arc-tangent',[start,[translation+100,translation+1e-6]],{tangent:[1,0]}),'DegenerateGeometryError');
  }
  for(const sagitta of [1e-4,1e-3]){
    const a=arc(request('arc-three-point',[[0,0],[50,sagitta],[100,0]]));
    nearPoint(at(a,0),[0,0],tolerance.linearMm);nearPoint(at(a,.5),[50,sagitta],tolerance.linearMm);nearPoint(at(a,1),[100,0],tolerance.linearMm);
    const t=arc(request('arc-tangent',[[0,0],[100,sagitta]],{tangent:[1,0]}));
    nearPoint(at(t,0),[0,0],tolerance.linearMm);nearPoint(at(t,1),[100,sagitta],tolerance.linearMm);
  }
});
test('C08 relative reconstruction tolerance uses local span, never the distant center or world origin',()=>{
  for(const translation of [0,1e6]){
    const points:Vec2[]=[[translation,translation],[translation+50,translation+1e-6],[translation+100,translation]];
    reject(request('arc-three-point',points),'DegenerateGeometryError');
    const relaxed={...tolerance,relative:1e-8},a=arc(request('arc-three-point',points,{tolerance:relaxed}));
    for(let i=0;i<3;i++)nearPoint(at(a,i/2),points[i]!,100*relaxed.relative);
  }
});
test('C08 tangent direction survives translation of small resolvable arcs',()=>{
  for(const translation of [0,1e4,1e6])for(const sign of [-1,1]){
    const start:Vec2=[translation,translation],end:Vec2=[translation+1e-4,translation+sign*2e-4],tangent:Vec2=[2,sign];
    const a=arc(request('arc-tangent',[start,end],{tangent}));
    nearPoint(at(a,0),start,tolerance.linearMm);nearPoint(at(a,1),end,tolerance.linearMm);
    const forward:Vec2=[-Math.sin(a.startRad)*Math.sign(a.sweepRad),Math.cos(a.startRad)*Math.sign(a.sweepRad)];
    near(Math.atan2(forward[0]*tangent[1]-forward[1]*tangent[0],forward[0]*tangent[0]+forward[1]*tangent[1]),0,tolerance.angularRad);
  }
});
test('C08 rotated/reversed slots retain connected tangent joins and a counterclockwise outline',()=>{
  for(let i=0;i<48;i++){
    const theta=i*.3,first:Vec2=[-5,7],second:Vec2=[first[0]+20*Math.cos(theta),first[1]+20*Math.sin(theta)];
    const entities=makeCircularEntities(request('slot',[first,second],{widthMm:8}));
    const sides=entities.filter((e):e is Extract<CircularEntity,{kind:'segment'}>=>e.kind==='segment');
    const arcs=entities.filter((e):e is Arc=>e.kind==='arc');
    assert.equal(sides.length,2);assert.equal(arcs.length,2);
    nearPoint(sides[0]!.b,at(arcs[0]!,0));nearPoint(at(arcs[0]!,1),sides[1]!.a);
    nearPoint(sides[1]!.b,at(arcs[1]!,0));nearPoint(at(arcs[1]!,1),sides[0]!.a);
    for(let k=0;k<2;k++){
      const side=sides[k]!,cap=arcs[k]!;near(cap.radius,4);near(cap.sweepRad,Math.PI);
      near(Math.hypot(side.b[0]-side.a[0],side.b[1]-side.a[1]),20);
      const dx=(side.b[0]-side.a[0])/20,dy=(side.b[1]-side.a[1])/20;
      near(dx,-Math.sin(cap.startRad));near(dy,Math.cos(cap.startRad));
    }
  }
});
test('C08 every tool enforces its exact anchor and ID counts',()=>{
  const cases:[CircularRequest['tool'],Vec2[],Partial<CircularRequest>][]=[
    ['circle',[[0,0],[10,0]],{}],['arc-three-point',[[0,0],[10,10],[20,0]],{}],
    ['arc-center-point',[[0,0],[10,0],[0,10]],{}],['arc-tangent',[[0,0],[10,10]],{tangent:[1,0]}],['slot',[[0,0],[20,0]],{widthMm:8}],
  ];
  for(const [tool,points,extra] of cases){
    const r=request(tool,points,extra);reject({...r,anchors:points.slice(1)},'AnchorCountError');
    reject({...r,anchors:tool==='arc-center-point'?[...points,[1,1],[2,2]]:[...points,[1,1]]},'AnchorCountError');
    reject({...r,ids:[]},'IdCountError');reject({...r,ids:[...r.ids,'extra']},'IdCountError');
    assert.ok(makeCircularEntities({...r,construction:true}).every(e=>e.construction));
  }
});
test('C08 radii must be finite, positive and larger than document resolution',()=>{
  for(const radius of [0,1e-8,1e-7])reject(request('circle',[[0,0],[radius,0]]),'InvalidRadiusError');
  assert.equal(makeCircularEntities(request('circle',[[0,0],[2e-7,0]])).length,1);
  for(const widthMm of [-1,0,1e-7,2e-7,NaN,Infinity])reject(request('slot',[[0,0],[20,0]],{widthMm}),'InvalidRadiusError');
  reject(request('slot',[[0,0],[20,0]]),'InvalidRadiusError');
  reject(request('arc-center-point',[[0,0],[0,0],[0,10]]),'InvalidRadiusError');
  reject(request('circle',[[-1e308,0],[1e308,0]]),'InvalidRadiusError');
});
test('C08 collinear and near-collinear three-point arcs are rejected using physical tolerance',()=>{
  for(const dy of [0,1e-9,1e-7])reject(request('arc-three-point',[[0,0],[10,dy],[20,0]]),'CollinearArcError');
  const result=arc(request('arc-three-point',[[0,0],[10,1e-4],[20,0]]));assert.ok(Number.isFinite(result.radius));assert.ok(result.sweepRad<0);
});
test('C08 a missing, zero or chord-parallel forward tangent cannot form a circular arc',()=>{
  reject(request('arc-tangent',[[0,0],[10,10]]),'ImpossibleTangentError');
  for(const tangent of [[0,0],[NaN,0],[Infinity,0]] as const)reject(request('arc-tangent',[[0,0],[10,10]],{tangent}),'ImpossibleTangentError');
  for(const end of [[10,0],[-10,0]] as const)reject(request('arc-tangent',[[0,0],end],{tangent:[1,0]}),'ImpossibleTangentError');
});
test('C08 repeated anchors and unresolved through/end directions fail visibly',()=>{
  for(const points of [[[0,0],[0,0],[20,0]],[[0,0],[10,10],[0,0]],[[0,0],[10,10],[10,10]]] as const)reject(request('arc-three-point',points),'DegenerateGeometryError');
  reject(request('arc-tangent',[[1,2],[1,2]],{tangent:[1,0]}),'DegenerateGeometryError');
  reject(request('slot',[[0,0],[1e-7,0]],{widthMm:8}),'DegenerateGeometryError');
  reject(request('arc-center-point',[[0,0],[10,0],[0,0]]),'DegenerateGeometryError');
  reject(request('arc-center-point',[[0,0],[10,0],[20,0],[0,10]]),'DegenerateGeometryError');
  reject(request('arc-center-point',[[0,0],[10,0],[0,20],[0,10]]),'DegenerateGeometryError');
});
test('C08 zero/full-turn and below-resolution arc sweeps use angular tolerance',()=>{
  for(const angle of [0,1e-10,-1e-10])reject(request('arc-center-point',[[0,0],[10,0],[10*Math.cos(angle),10*Math.sin(angle)]]),'DegenerateGeometryError');
  reject(request('arc-center-point',[[0,0],[10,0],[-10,0],[10,0]]),'DegenerateGeometryError');
  assert.ok(arc(request('arc-center-point',[[0,0],[10,0],[10*Math.cos(1e-6),10*Math.sin(1e-6)]])).sweepRad>0);
});
test('C08 scaled circumcenters avoid square overflow on finite large geometry',()=>{
  const a=arc(request('arc-three-point',[[1e150,0],[-1e150,0],[0,1e150]]));
  nearPoint(a.center,[0,0],1e135);near(a.radius,1e150,1e135);near(a.sweepRad,-3*Math.PI/2);
  nearPoint(at(a,1),[0,1e150],1e135);
});
test('C08 nonrepresentable resulting extents fail instead of returning unusable geometry',()=>{
  reject(request('circle',[[1e308,0],[0,0]]),'DegenerateGeometryError');
  reject(request('slot',[[1e308,0],[1e308,10]],{widthMm:1.6e308}),'DegenerateGeometryError');
});
test('C08 outputs own their arrays; frozen input and repeated calls are unchanged',()=>{
  const r=request('slot',[[0,0],[20,0]],{widthMm:8});r.anchors.forEach(Object.freeze);Object.freeze(r.anchors);Object.freeze(r.ids);Object.freeze(r.tolerance);Object.freeze(r);
  const before=structuredClone(r),first=makeCircularEntities(r),original=structuredClone(first);
  const cap=first[1] as Arc;(cap.center as [number,number])[0]=99;assert.deepEqual(r,before);
  assert.deepEqual(makeCircularEntities(r),original);const side=first[0] as Extract<CircularEntity,{kind:'segment'}>;assert.deepEqual(side.b,[20,-4]);
  const circleRequest=request('circle',[[2,3],[12,3]]),circle=makeCircularEntities(circleRequest)[0]!;assert.ok(circle.kind==='circle');
  (circle.center as [number,number])[0]=100;assert.deepEqual(circleRequest.anchors[0],[2,3]);
});
test('C08 real C03 seam creates a circle and slot from inch-document length expressions',()=>{
  const context={units:'inch' as const,variables:{}};
  const radius=evaluateDimension({expression:{source:'1',kind:'length'},context}).value;
  assert.deepEqual(makeCircularEntities(request('circle',[[0,0],[radius,0]])),[{id:'e0',kind:'circle',center:[0,0],radius:25.4,construction:false}]);
  const widthMm=evaluateDimension({expression:{source:'8mm',kind:'length'},context}).value;
  assert.equal((makeCircularEntities(request('slot',[[0,0],[20,0]],{widthMm}))[1] as Arc).radius,4);
});
