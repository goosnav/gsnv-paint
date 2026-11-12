/**
 * PURPOSE    Interpret CAD sketch pointer input.
 * KIND       CORE
 * CONTRACT   IN: tool/anchor/selection state, finite mm event, endpoints, positive snap
 *            tolerance. OUT: owned state plus line/rectangle/select/none intent.
 *            Two clicks commit (circle: center then a point on the circle); move previews;
 *            Escape cancels; Shift aligns lines.
 *            RAISES: TypeError for invalid finite coordinates/tolerance.
 * GUARANTEES Pure, no IDs or side effects; selected IDs remain unique.
 * TUNING     Caller converts screen snap distance to document millimetres.
 * DECISIONS  D1: Commit on clicks rather than drag release for deliberate CAD placement.
 *            Alternative: freehand drag; Revisit if: the tool's interaction contract changes.
 * LIMITS     Selection, line, corner rectangle and center circle; no arcs or constraint policy.
 * TESTBENCH  src/cad/cad-tool-input.test.ts -- run with: node --import tsx --test src/cad/cad-tool-input.test.ts
 */
export type CADToolState={tool:'select'|'line'|'rectangle'|'circle';anchor:[number,number]|null;cursor:[number,number]|null;selected:string[]};
type Intent={kind:'none'}|{kind:'select'}|{kind:'line';a:[number,number];b:[number,number]}|{kind:'rectangle';origin:[number,number];width:number;height:number}|{kind:'circle';center:[number,number];radius:number};
type Request={state:CADToolState;event:{kind:'click'|'move';point:[number,number];hit:string|null;ctrl:boolean;shift:boolean}|{kind:'cancel'}|{kind:'tool';tool:CADToolState['tool']};endpoints:readonly(readonly[number,number])[];tolerance:number};
export function cadToolInput(request:Request):{state:CADToolState;intent:Intent}{
 const {event,endpoints,tolerance}=request;
 if(!Number.isFinite(tolerance)||tolerance<=0||endpoints.some(p=>!p.every(Number.isFinite))||('point'in event&&!event.point.every(Number.isFinite)))throw new TypeError('Tool coordinates and tolerance must be finite; tolerance must be positive.');
 const state:CADToolState={...request.state,anchor:request.state.anchor?[...request.state.anchor]:null,cursor:request.state.cursor?[...request.state.cursor]:null,selected:[...request.state.selected]};
 const none={kind:'none'} as const;
 if(event.kind==='cancel'||event.kind==='tool'){state.anchor=null;state.cursor=null;if(event.kind==='tool')state.tool=event.tool;return{state,intent:none};}
 let p:[number,number]=[...event.point];const nearby=endpoints.map(v=>({v,d:Math.hypot(v[0]-p[0],v[1]-p[1])})).filter(v=>v.d<=tolerance).sort((a,b)=>a.d-b.d)[0];
 if(nearby)p=[...nearby.v];
 if(event.shift&&state.anchor&&state.tool==='line'){const a=state.anchor;if(Math.abs(p[0]-a[0])>=Math.abs(p[1]-a[1]))p[1]=a[1];else p[0]=a[0];}
 state.cursor=p;if(event.kind==='move')return{state,intent:none};
 if(state.tool==='select'){
   if(!event.hit){if(!event.ctrl)state.selected=[];}else if(event.ctrl)state.selected=state.selected.includes(event.hit)?state.selected.filter(id=>id!==event.hit):[...state.selected,event.hit];else state.selected=[event.hit];
   return{state,intent:{kind:'select'}};
 }
 if(!state.anchor){state.anchor=p;return{state,intent:none};}
 const a=state.anchor;state.anchor=null;
 if(state.tool==='line')return{state,intent:{kind:'line',a,b:p}};
 if(state.tool==='circle')return{state,intent:{kind:'circle',center:a,radius:Math.hypot(p[0]-a[0],p[1]-a[1])}};
 return{state,intent:{kind:'rectangle',origin:[Math.min(a[0],p[0]),Math.min(a[1],p[1])],width:Math.abs(p[0]-a[0]),height:Math.abs(p[1]-a[1])}};
}
