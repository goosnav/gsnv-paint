import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {GcsWrapper,init_planegcs_module,SolveStatus} from '@salusoft89/planegcs';
import {sketchGeometryProgram,type SketchGeometryRequest} from './sketch-geometry-program.ts';
import {makeCircularEntities} from './sketch-circular-primitives.ts';
import {makeLinearEntities} from './sketch-linear-primitives.ts';
type Entity=SketchGeometryRequest['entities'][number];
const tolerance={linearMm:1e-7,angularRad:1e-9,relative:1e-10};
const run=(entities:readonly Entity[],reservedIds:readonly string[]=[])=>sketchGeometryProgram({entities,reservedIds,tolerance});
const circle:Entity={id:'c',kind:'circle',center:[4,5],radius:2,construction:false};
const arc:Entity={id:'a',kind:'arc',center:[0,0],radius:1,startRad:0,sweepRad:Math.PI/2,construction:false};
const line:Entity={id:'l',kind:'segment',a:[0,0],b:[10,0],construction:false};
const point:Entity={id:'p',kind:'point',p:[2,3],construction:false};
const bad=(entities:readonly Entity[],message?:RegExp)=>assert.throws(()=>run(entities),(error:unknown)=>{
  assert.ok(error instanceof Error);assert.equal(error.name,'SketchGeometryError');assert.ok(error.message.length>20);if(message)assert.match(error.message,message);return true;
});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=1e-7,`${a} differs from ${b}`);

test('C61 empty geometry has an exact empty program',()=>{
  assert.deepEqual(run([]),{primitives:[],sourceBySolverId:{},roles:{}});
});
test('C61 mixed geometry golden preserves identities, source roles and native dependency order',()=>{
  assert.deepEqual(run([point,line,circle,arc]),{
    primitives:[
      {id:'p',type:'point',x:2,y:3,fixed:false},
      {id:'l:a',type:'point',x:0,y:0,fixed:false},{id:'l:b',type:'point',x:10,y:0,fixed:false},
      {id:'c:center',type:'point',x:4,y:5,fixed:false},
      {id:'a:center',type:'point',x:0,y:0,fixed:false},{id:'a:start',type:'point',x:1,y:0,fixed:false},
      {id:'a:end',type:'point',x:6.123233995736766e-17,y:1,fixed:false},
      {id:'l',type:'line',p1_id:'l:a',p2_id:'l:b'},
      {id:'c',type:'circle',c_id:'c:center',radius:2},
      {id:'a',type:'arc',c_id:'a:center',start_id:'a:start',end_id:'a:end',radius:1,start_angle:0,end_angle:Math.PI/2},
      {id:'a:rules',type:'arc_rules',a_id:'a'},
    ],
    sourceBySolverId:{p:'p','l:a':'l','l:b':'l',l:'l','c:center':'c',c:'c','a:center':'a','a:start':'a','a:end':'a',a:'a','a:rules':'a'},
    roles:{p:{geometryId:'p',points:{p:'p'}},l:{geometryId:'l',points:{a:'l:a',b:'l:b'}},c:{geometryId:'c',points:{center:'c:center'}},a:{geometryId:'a',points:{center:'a:center',start:'a:start',end:'a:end'}}},
  });
});
test('C61 equal coordinates remain independent and construction geometry stays in the solver',()=>{
  const second:Entity={...line,id:'second',a:[10,0],b:[20,0],construction:true};
  const program=run([line,second]);
  assert.equal(program.primitives.filter(p=>p.type==='point').length,4);
  assert.notEqual(program.roles.l!.points.b,program.roles.second!.points.a);
  assert.equal(program.primitives.filter(p=>p.type==='line').length,2);
  assert.deepEqual(run([{...line,construction:true}]),run([line]));
  assert.ok(program.primitives.filter(p=>p.type==='point').every(p=>!p.fixed));
});
test('C61 generated IDs avoid reserved, later source and generated IDs',()=>{
  const entities:Entity[]=[line,{...circle,id:'l:a'},{...arc,id:'l:b'}];
  const reserved=['_l:a','l:b:rules','_l:b:rules','c:center'];
  const first=run(entities,reserved),second=run(entities,[...reserved].reverse());
  const ids=first.primitives.map(p=>p.id);
  assert.equal(new Set(ids).size,ids.length);assert.ok(reserved.every(id=>!ids.includes(id)));
  assert.deepEqual(first,second);assert.equal(first.roles.l!.points.a,'__l:a');
  assert.ok(entities.every(e=>ids.includes(e.id)));
  for(const primitive of first.primitives)assert.ok(entities.some(e=>e.id===first.sourceBySolverId[primitive.id]));
});
test('C61 special JavaScript property names remain owned source IDs',()=>{
  const program=run([{...line,id:'__proto__'},{...arc,id:'constructor'},{...point,id:'toString'}]);
  assert.equal(Object.getPrototypeOf(program.roles),Object.prototype);
  assert.equal(Object.getPrototypeOf(program.sourceBySolverId),Object.prototype);
  for(const id of ['__proto__','constructor','toString']){
    assert.ok(Object.hasOwn(program.roles,id));assert.equal(program.roles[id]!.geometryId,id);
    assert.ok(Object.hasOwn(program.sourceBySolverId,id));assert.equal(program.sourceBySolverId[id],id);
  }
});
test('C61 deterministic owned results do not mutate frozen source geometry',()=>{
  const input=structuredClone([point,line,circle,arc]);
  for(const entity of input){for(const value of Object.values(entity))if(Array.isArray(value))Object.freeze(value);Object.freeze(entity);}Object.freeze(input);
  const before=structuredClone(input),a=run(input),b=run(input);assert.deepEqual(a,b);
  const p=a.primitives.find(p=>p.type==='point')!;p.x=99;a.roles.p!.points.p='changed';a.sourceBySolverId.p='changed';
  assert.deepEqual(input,before);assert.deepEqual(run(input),b);
});
test('C61 malformed IDs and tolerance fail without returning a partial program',()=>{
  bad([line,{...line}]);bad([{...point,id:''}]);bad([{...point,id:'  '}]);
  assert.throws(()=>run([point],['']),{name:'SketchGeometryError'});
  for(const key of ['linearMm','angularRad','relative'] as const)for(const value of [0,-1,NaN,Infinity]){
    assert.throws(()=>sketchGeometryProgram({entities:[line],reservedIds:[],tolerance:{...tolerance,[key]:value}}),{name:'SketchGeometryError'});
  }
});
test('C61 malformed and nonfinite point coordinates or unknown entities are rejected',()=>{
  for(const p of [[0,NaN],[Infinity,1],[1],[1,2,3]])bad([{...point,p} as unknown as Entity]);
  bad([{...line,a:[NaN,0]}]);bad([{...circle,center:[0,Infinity]}]);
  bad([{id:'ellipse',kind:'ellipse',construction:false} as unknown as Entity]);
  bad([{...point,construction:'yes'} as unknown as Entity]);
});
test('C61 sparse coordinates and reserved IDs cannot bypass required-slot validation',()=>{
  for(const coordinates of [new Array(2),[,1],[0,,]]){
    bad([{...point,p:coordinates} as unknown as Entity],/finite/i);
    bad([{...line,a:coordinates} as unknown as Entity],/finite/i);
    bad([{...circle,center:coordinates} as unknown as Entity],/finite/i);
  }
  assert.throws(()=>run([point],new Array(1)),{name:'SketchGeometryError'});
});
test('C61 segment lengths and radii respect the physical resolution boundary',()=>{
  for(const length of [0,1e-8,1e-7])bad([{...line,b:[length,0]}]);
  assert.equal(run([{...line,b:[2e-7,0]}]).primitives.length,3);
  for(const radius of [-1,0,1e-8,1e-7,NaN,Infinity]){bad([{...circle,radius}]);bad([{...arc,radius}]);}
  assert.equal(run([{...circle,radius:2e-7}]).primitives.length,2);
  bad([{...line,a:[-1e308,0],b:[1e308,0]}]);
});
test('C61 arc angular boundaries and unrepresentable angle sums are rejected',()=>{
  for(const sweepRad of [0,1e-10,-1e-10,2*Math.PI,-2*Math.PI,2*Math.PI-1e-10,Infinity,NaN])bad([{...arc,sweepRad}]);
  bad([{...arc,startRad:Infinity}]);bad([{...arc,startRad:1e20}],/angle/i);
  bad([{...arc,radius:1e-6,sweepRad:1e-5}],/endpoint/i);
});
test('C61 derived extents are checked on the actual arc, including interior extrema',()=>{
  bad([{...circle,center:[1e308,0],radius:1e308}]);
  bad([{...arc,center:[1e308,0],radius:1e308,startRad:-Math.PI/2,sweepRad:Math.PI}],/finite/i);
  const inward=run([{...arc,center:[1e308,0],radius:1e308,startRad:Math.PI,sweepRad:Math.PI/2}]);
  assert.ok(inward.primitives.filter(p=>p.type==='point').every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});
test('C61 large representable angles retain direction while rejecting overflowing arc interiors',()=>{
  const source:Extract<Entity,{kind:'arc'}>={...arc,center:[1e308,0],radius:8e307,startRad:10000000000000010,sweepRad:2};
  assert.equal((source.startRad+source.sweepRad)-source.startRad,source.sweepRad);
  for(const angle of [source.startRad,source.startRad+source.sweepRad])assert.ok(Number.isFinite(source.center[0]+source.radius*Math.cos(angle)));
  bad([source],/finite/i);
  const inward=run([{...source,startRad:1e16}]);
  assert.ok(inward.primitives.filter(p=>p.type==='point').every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  const native=inward.primitives.find(p=>p.type==='arc')!;
  assert.equal(native.start_angle,1e16);assert.equal(native.end_angle,1e16+2);
});
test('C61 real primitive seams retain clockwise, major and slot arc directions',()=>{
  const inputs=[
    ...makeLinearEntities({tool:'corner-rectangle',anchors:[[0,0],[100,60]],construction:false,ids:['s0','s1','s2','s3'],tolerance}),
    ...makeCircularEntities({tool:'slot',anchors:[[10,10],[30,10]],widthMm:8,construction:false,ids:['slot0','slot1','slot2','slot3'],tolerance}),
  ];
  assert.equal(run(inputs).primitives.filter(p=>p.type==='arc_rules').length,2);
  for(let i=0;i<48;i++)for(const sweepRad of [Math.PI/2,-Math.PI/2,3*Math.PI/2,-3*Math.PI/2]){
    const source:Extract<Entity,{kind:'arc'}>={...arc,center:[7,-3],radius:10,startRad:i*.21,sweepRad};
    const program=run([source]);
    const curve=program.primitives.find(p=>p.type==='arc')!;assert.equal(curve.start_angle,source.startRad);assert.equal(curve.end_angle,source.startRad+sweepRad);
    for(const role of ['start','end'] as const){const point=program.primitives.find(p=>p.type==='point'&&p.id===program.roles.a!.points[role])!;assert.equal(point.type,'point');if(point.type!=='point')throw Error('point missing');const angle=role==='start'?source.startRad:source.startRad+sweepRad;near(point.x,7+10*Math.cos(angle));near(point.y,-3+10*Math.sin(angle));}
    assert.equal(program.primitives.at(-1)!.type,'arc_rules');
  }
});
test('C61 actual PlaneGCS consumes generated circles/arcs/slots and solves an edited radius',async()=>{
  const module=await init_planegcs_module({locateFile:()=>fileURLToPath(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm',import.meta.url))});
  const wrapper=new GcsWrapper(new module.GcsSystem(),module);
  try{
    const cases:{entities:Entity[];dof:number}[]=[{entities:[circle],dof:3}];
    for(const sweepRad of [Math.PI/2,-Math.PI/2,3*Math.PI/2,-3*Math.PI/2])cases.push({entities:[{...arc,radius:10,startRad:.4,sweepRad}],dof:5});
    cases.push({entities:makeCircularEntities({tool:'slot',anchors:[[0,0],[20,0]],widthMm:8,ids:['l0','a0','l1','a1'],construction:false,tolerance}),dof:18});
    for(const {entities,dof} of cases){
      const program=run(entities);wrapper.clear_data();wrapper.push_primitives_and_params(structuredClone(program.primitives));
      assert.equal(wrapper.solve(),SolveStatus.Success);assert.equal(wrapper.gcs.dof(),dof);assert.deepEqual(wrapper.get_gcs_conflicting_constraints(),[]);wrapper.apply_solution();
      const solved=wrapper.sketch_index.get_primitives();
      for(const source of program.primitives){const actual=solved.find(p=>p.id===source.id)!;assert.equal(actual.type,source.type);if(source.type==='arc'&&actual.type==='arc'){near(actual.radius,source.radius);near(actual.start_angle,source.start_angle);near(actual.end_angle,source.end_angle);}if(source.type==='point'&&actual.type==='point'){near(actual.x,source.x);near(actual.y,source.y);}}
    }
    const program=run([{...arc,radius:10}]);wrapper.clear_data();
    wrapper.push_primitives_and_params([...program.primitives,
      {id:'x',type:'coordinate_x',p_id:program.roles.a!.points.center!,x:0},
      {id:'y',type:'coordinate_y',p_id:program.roles.a!.points.center!,y:0},
      {id:'r',type:'arc_radius',a_id:'a',radius:12},
      {id:'s',type:'equal',param1:{o_id:'a',prop:'start_angle'},param2:0},
      {id:'e',type:'equal',param1:{o_id:'a',prop:'end_angle'},param2:Math.PI/2},
    ]);
    assert.equal(wrapper.solve(),SolveStatus.Success);assert.equal(wrapper.gcs.dof(),0);assert.deepEqual(wrapper.get_gcs_conflicting_constraints(),[]);wrapper.apply_solution();
    const solved=wrapper.sketch_index.get_primitives(),start=solved.find(p=>p.id===program.roles.a!.points.start),end=solved.find(p=>p.id===program.roles.a!.points.end);
    assert.ok(start?.type==='point'&&end?.type==='point');near(start.x,12);near(start.y,0);near(end.x,0);near(end.y,12);
  }finally{wrapper.destroy_gcs_module();}
});
