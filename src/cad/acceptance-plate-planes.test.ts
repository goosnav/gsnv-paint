import test from 'node:test';
import assert from 'node:assert/strict';
import {make_gcs_wrapper} from '@salusoft89/planegcs';
import {fileURLToPath} from 'node:url';
import {editableCADContent} from './editable-cad-content.ts';
import {editCADContent,type CADAction} from './edit-cad-content.ts';
import {buildPart} from './part-builder.ts';
import {kernelFixture} from './kernel-test-fixture.ts';
import {stepExchange} from './step-exchange.ts';
import type {SolverSession} from './solver-runtime.ts';
test('unchanged 120 mm acceptance plate retains holes, pocket and physical world placement on all default planes',async()=>{
 const f=await kernelFixture(),gcs=await make_gcs_wrapper(fileURLToPath(new URL('../../node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm',import.meta.url)));
 const solver:SolverSession={generation:1,engine:gcs,dof:()=>gcs.gcs.dof(),snapshot:()=>gcs.sketch_index.get_primitives(),isClosed:()=>false};
 let content=editableCADContent({operation:'new'});const edit=(action:CADAction,sketch?:string)=>{content=editCADContent({content,action,sketch});};
 edit({kind:'variable',name:'width',source:'120'});edit({kind:'rectangle',prefix:'plate',width:'width',height:'60'});edit({kind:'extrude',id:'boss',depth:'10'});edit({kind:'edge-feature',id:'corners',feature:'fillet',edges:'vertical',size:'5'});edit({kind:'add-cut',id:'holes'});
 for(const [i,center] of ([['10','10'],['width - 10','10'],['width - 10','50'],['10','50']] as [string,string][]).entries())edit({kind:'circle',prefix:`hole${i}`,diameter:'6',center},'holes');
 edit({kind:'add-cut',id:'pocket'});edit({kind:'rectangle',prefix:'pocket-profile',width:'20',height:'20',origin:['width / 2 - 10','20']},'pocket');edit({kind:'cut-extent',id:'pocket',depth:'5'});
 const through=(120*60-(4-Math.PI)*25-4*Math.PI*9)*10,volume=through-2000,cz=(through*5-2000*7.5)/volume;
 const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} vs ${b}`);
 try{for(const plane of ['XY','XZ','YZ'] as const){edit({kind:'plane',plane});
  const map=(p:number[])=>plane==='XY'?p:plane==='XZ'?[p[0]!,-p[2]!,p[1]!]:[p[2]!,p[0]!,p[1]!];
  const check=(token:Parameters<typeof f.measure>[0])=>{const m=f.measure(token);near(m.volume,volume);m.center.forEach((v,i)=>near(v,map([60,30,cz])[i]!));
   const corners=[map([50,20,5]),map([70,40,10])];for(const wanted of corners)assert.ok(m.vertices.some(v=>v.every((n,i)=>Math.abs(n-wanted[i]!)<1e-6)),'actual pocket corner is in the expected world position');
   const lo=plane==='XY'?[0,0,0]:plane==='XZ'?[0,-10,0]:[0,0,0],hi=plane==='XY'?[120,60,10]:plane==='XZ'?[120,0,60]:[10,120,60];
   for(let i=0;i<3;i++){near(Math.min(...m.vertices.map(p=>p[i]!)),lo[i]!);near(Math.max(...m.vertices.map(p=>p[i]!)),hi[i]!);}
  };
  for(const units of ['mm','inch','mm'] as const){if(content.units!==units)edit({kind:'units',units});const part=await buildPart({content:editableCADContent({operation:'read',value:JSON.parse(JSON.stringify(content))}),solver,kernel:async()=>f.session});assert.ok(part.token);assert.equal(part.dof,0);check(part.token);assert.equal(f.retained.size,1);
   const centers=part.sketches.holes!.map(e=>e.kind==='circle'?e.center:null);assert.deepEqual(centers,[[10,10],[110,10],[110,50],[10,50]]);
   const bytes=stepExchange({action:'export',session:f.session,units,bodies:{shapes:[{bodyId:'plate',token:part.token}],topology:[],operands:[],diagnostics:[]}}).file!.bytes;f.session.release(part.token);const bodies=stepExchange({action:'import',session:f.session,units,bytes}).bodies!;assert.equal(bodies.shapes.length,1);check(bodies.shapes[0]!.token);f.session.release(bodies.shapes[0]!.token);assert.equal(f.retained.size,0);
  }
 }}finally{f.close();gcs.destroy_gcs_module();}
});
