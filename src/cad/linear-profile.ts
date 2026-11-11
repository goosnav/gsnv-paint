/**
 * PURPOSE    Order one closed linear sketch boundary for extrusion.
 * KIND       CORE
 * CONTRACT   IN: finite segments, positive tolerance. OUT: one simple counterclockwise
 *            polygon using every non-construction edge exactly once.
 *            RAISES: ProfileError for empty/open/branched/disconnected/crossing/degenerate input.
 * GUARANTEES Pure, no mutation; unsupported holes never become a filled solid.
 * TUNING     Tolerance supplied by the document controls endpoint matching.
 * DECISIONS  D1: Reject multiple loops. Alternative: guess holes by input order;
 *            unsafe for solid creation. Revisit if: C17 supplies nesting semantics.
 * LIMITS     Linear single-loop profiles only; endpoint clustering is bounded by tolerance.
 * TESTBENCH  src/cad/linear-profile.test.ts -- run with: node --import tsx --test src/cad/linear-profile.test.ts
 */
import type { LinearEntity } from './sketch-linear-primitives.ts';
export function linearProfile({entities,tolerance}: {entities: readonly LinearEntity[]; tolerance: number}): [number,number][] {
  const fail = (message:string):never=>{throw Object.assign(new Error(message),{name:'ProfileError'});};
  const vertices:[number,number][]=[], adjacency:number[][]=[], edges:[number,number][]=[];
  const vertex=(p:readonly [number,number])=>{
    const matches=vertices.flatMap((v,i)=>Math.hypot(p[0]-v[0],p[1]-v[1])<=tolerance?[i]:[]);
    if(matches.length>1)fail('Ambiguous endpoints: separate geometry farther than the tolerance.');
    if(matches.length)return matches[0]!;
    vertices.push([...p]);adjacency.push([]);return vertices.length-1;
  };
  for(const e of entities)if(e.kind==='segment'&&!e.construction){
    if(![...e.a,...e.b].every(Number.isFinite)||Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1])<=tolerance)fail('The profile contains a collapsed edge.');
    const a=vertex(e.a),b=vertex(e.b);if(a===b)fail('The profile contains a collapsed edge.');
    adjacency[a]!.push(edges.length);adjacency[b]!.push(edges.length);edges.push([a,b]);
  }
  if(edges.length<3)fail('Extrude needs a closed profile with at least three edges.');
  if(adjacency.some(a=>a.length!==2))fail('The sketch is open or branched. Connect each endpoint to exactly two edges.');
  const visited=new Set<number>(), loop:number[]=[];let at=edges[0]![0];const start=at;
  do{
    loop.push(at);const next=adjacency[at]!.find(i=>!visited.has(i));if(next===undefined)fail('The boundary does not form one closed loop.');
    visited.add(next!);const edge=edges[next!]!;at=edge[0]===at?edge[1]:edge[0];
  }while(at!==start&&loop.length<=edges.length);
  if(visited.size!==edges.length)fail('Only one closed profile is supported here. Remove disconnected loops or holes.');
  const points=loop.map(i=>vertices[i]!);
  const cross=(a:readonly number[],b:readonly number[],c:readonly number[]) => (b[0]!-a[0]!)*(c[1]!-a[1]!)-(b[1]!-a[1]!)*(c[0]!-a[0]!);
  const sign=(v:number,scale:number)=>Math.abs(v)<=tolerance*scale?0:Math.sign(v);
  const on=(a:number[],b:number[],c:number[])=>c[0]!>=Math.min(a[0]!,b[0]!)-tolerance&&c[0]!<=Math.max(a[0]!,b[0]!)+tolerance&&c[1]!>=Math.min(a[1]!,b[1]!)-tolerance&&c[1]!<=Math.max(a[1]!,b[1]!)+tolerance;
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    if(j===i+1||(i===0&&j===points.length-1))continue;
    const a=points[i]!,b=points[(i+1)%points.length]!,c=points[j]!,d=points[(j+1)%points.length]!;
    const ab=Math.hypot(b[0]-a[0],b[1]-a[1]),cd=Math.hypot(d[0]-c[0],d[1]-c[1]);
    const x=sign(cross(a,b,c),ab),y=sign(cross(a,b,d),ab),z=sign(cross(c,d,a),cd),w=sign(cross(c,d,b),cd);
    if((x*y<0&&z*w<0)||(x===0&&on(a,b,c))||(y===0&&on(a,b,d))||(z===0&&on(c,d,a))||(w===0&&on(c,d,b)))fail('The profile intersects itself. Trim crossing or overlapping edges.');
  }
  const area=points.reduce((sum,p,i)=>sum+cross(points[0]!,p,points[(i+1)%points.length]!),0)/2;
  if(!Number.isFinite(area)||Math.abs(area)<=tolerance*tolerance)fail('The profile has no usable area.');
  return area>0?points:[points[0]!,...points.slice(1).reverse()];
}
