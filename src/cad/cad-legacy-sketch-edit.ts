/**
 * PURPOSE    Apply the legacy editable sketch-source actions.
 * KIND       CORE
 * CONTRACT   IN: C50 content, LegacySketchAction and optional cut sketch ID. OUT:
 *            owned C50-valid content with unchanged graph revision; other sketches unchanged.
 *            RAISES: CADEditError for bad targets, collisions or sizes; C50/C74/C07 propagate.
 * GUARANTEES Source expressions and canonical-mm numeric coordinates are preserved;
 *            controlled profiles survive replacement and cannot lose individual members.
 * TUNING     Document tolerance only.
 * DECISIONS  D1: Keep existing source semantics in one policy. Alternative: rewrite
 *            all geometry actions while adding profiles. Revisit if: full sketch editing replaces them.
 * LIMITS     Segment/circle actions; caller owns revision and transaction publication.
 * TESTBENCH  node --import tsx --test src/cad/cad-legacy-sketch-edit.test.ts
 */
import { editableCADContent, laterOf, type CADContent, type Sketch, type SketchEntity } from './editable-cad-content.ts';
import { cadExpressionPolicy } from './cad-expression-policy.ts';
import { makeLinearEntities } from './sketch-linear-primitives.ts';
export type LegacySketchAction =
  | { kind:'line';id:string;a:[number,number];b:[number,number] }
  | { kind:'rectangle';prefix:string;width:string;height:string;origin?:[number|string,number|string] }
  | { kind:'circle';prefix:string;diameter:string;center:[number|string,number|string] }
  | { kind:'edit-position';id:string;x:string;y:string } | { kind:'dimension';id:string;source:string }
  | { kind:'clear' } | { kind:'remove';ids:string[] }
  | { kind:'constraint';id:string;entity:string;axis:'horizontal'|'vertical' }
  | { kind:'remove-constraint';id:string }
  | { kind:'relation';id:string;relation:'parallel'|'perpendicular'|'equal'|'coincident';entities:[string,string] };
export function isLegacySketchAction(action:{kind:string}):action is LegacySketchAction{return ['line','rectangle','circle','edit-position','dimension','clear','remove','constraint','remove-constraint','relation'].includes(action.kind);}
export function editLegacySketch({content,action,sketch:target}:{content:CADContent;action:LegacySketchAction;sketch?:string|undefined}):CADContent {
  const fail = (message:string):never=>{throw Object.assign(new Error(message),{name:'CADEditError'});};
  const value = JSON.parse(JSON.stringify(content)) as CADContent, base = value.graph.features[0].definition.sketch;
  const cutSketch = target && target !== value.graph.features[0].id ? laterOf(value).find(f => f.id === target && f.kind === 'pocket') : undefined;
  if (target && target !== value.graph.features[0].id && !cutSketch) fail('That sketch no longer exists.');
  const sketch: Sketch = cutSketch && cutSketch.kind === 'pocket' ? cutSketch.definition.sketch : base, isBase = sketch === base;
  const allSketches = [base, ...laterOf(value).flatMap(f => f.kind === 'pocket' ? [f.definition.sketch] : [])];
  const ids = new Set([...value.graph.features, ...allSketches.flatMap(k => [...k.entities, ...k.constraints, ...k.dimensions, ...(k.profiles??[])])].map(item => item.id));
  const unique = (id: string) => { if (!id.trim() || ids.has(id)) fail(`ID ${id} is empty or already used.`); ids.add(id); return id; };
  const policy = (parameters:NonNullable<Parameters<typeof cadExpressionPolicy>[0]['parameters']>) => cadExpressionPolicy({units:value.units,variables:value.variables,linearMm:value.tolerance.linearMm,parameters});
  const length = (source:string,signed=false) => policy([{expression:{source,kind:'length'},range:signed?'nonzero':'positive'}]).values[0]!;
  const coordinate = (source: number | string) => {
    if (typeof source !== 'string' && (typeof source !== 'number' || !Number.isFinite(source))) fail('Position coordinates must be finite lengths.');
    const expression = { source: typeof source === 'number' ? `${source} mm` : source, kind: 'length' as const };
    return { expression, value: policy([{expression}]).values[0]! };
  };
  const placement = (input: [number | string, number | string]) => {
    if (!Array.isArray(input) || input.length !== 2) fail('A position needs two coordinates.');
    const x = coordinate(input[0]), y = coordinate(input[1]);
    return { point: [x.value, y.value] as [number,number], x: x.expression, y: y.expression };
  };
  if (action.kind === 'line') {
    if (![...action.a, ...action.b].every(Number.isFinite)) fail('Line coordinates must be finite.');
    const entities = makeLinearEntities({ tool: 'line', anchors: [action.a, action.b], ids: [unique(action.id)], construction: false, tolerance: value.tolerance });
    sketch.entities.push(...entities as typeof sketch.entities);
  } else if (action.kind === 'rectangle') {
    const width = length(action.width), height = length(action.height), position = placement(action.origin ?? [0,0]), origin = position.point;
    const entityIds = Array.from({ length: 4 }, (_, i) => unique(`${action.prefix}-edge-${i}`));
    // On the base sketch the rectangle replaces the outline (segments) and keeps circles as holes; cut sketches just add it.
    const controlled = new Set((sketch.profiles??[]).flatMap(p=>p.entityIds));
    const circles = new Set(sketch.entities.filter(e => !isBase || e.kind === 'circle' || controlled.has(e.id)).map(e => e.id)), kept = (ids: string[]) => ids.every(id => circles.has(id));
    const edges = makeLinearEntities({ tool: 'corner-rectangle', anchors: [origin as [number,number],[origin[0]!+width,origin[1]!+height]], ids: entityIds, construction: false, tolerance: value.tolerance }) as Extract<typeof sketch.entities[number], { kind: 'segment' }>[];
    sketch.entities = [...edges, ...sketch.entities.filter(e => circles.has(e.id))];
    sketch.constraints = [...entityIds.map((entity, i) => ({ id: unique(`${action.prefix}-axis-${i}`), kind: i % 2 === 0 ? 'horizontal' as const : 'vertical' as const, entityIds: [entity], pointRoles: [], inferred: true })),
      { id: unique(`${action.prefix}-origin`), kind: 'fix', entityIds: [entityIds[0]!], pointRoles: ['a'], inferred: true,
        position: { x: position.x, y: position.y, entityIds: [...entityIds] } }, ...sketch.constraints.filter(c => kept(c.entityIds) && (!c.position || kept(c.position.entityIds)))];
    sketch.dimensions = [...[action.width, action.height].map((source, i) => {
      const edge = edges[i]!;
      return { id: unique(`${action.prefix}-${i === 0 ? 'width' : 'height'}`), kind: 'linear' as const, entityIds: [edge.id], anchors: [[...edge.a],[...edge.b]] as [number,number][], value: { source, kind: 'length' as const }, label: (i === 0 ? [origin[0]! + width / 2,origin[1]! - 8] : [origin[0]! + width + 8,origin[1]! + height / 2]) as [number,number] };
    }), ...sketch.dimensions.filter(d => kept(d.entityIds))];
  } else if (action.kind === 'circle') {
    const diameter = length(action.diameter), position = placement(action.center), center = position.point;
    const id = unique(`${action.prefix}-circle`), radius = diameter / 2;
    if (!center.every(v => Number.isFinite(Math.abs(v) + radius))) fail('The circle is too large.');
    sketch.entities.push({ id, kind: 'circle', center: [center[0], center[1]], radius, construction: false });
    sketch.constraints.push({ id: unique(`${action.prefix}-center`), kind: 'fix', entityIds: [id], pointRoles: ['center'], inferred: true,
      position: { x: position.x, y: position.y, entityIds: [id] } });
    sketch.dimensions.push({ id: unique(`${action.prefix}-diameter`), kind: 'diameter', entityIds: [id], anchors: [[center[0] - radius, center[1]], [center[0] + radius, center[1]]], value: { source: action.diameter, kind: 'length' }, label: [center[0] + radius * 0.75 + 4, center[1] + radius * 0.75 + 4] });
  } else if (action.kind === 'edit-position') {
    const fixed = sketch.constraints.find(c => c.id === action.id && c.kind === 'fix' && c.position);
    if (!fixed?.position) fail('Select an existing controlled position.');
    const position = placement([action.x, action.y]);
    fixed!.position!.x = position.x; fixed!.position!.y = position.y;
  } else if (action.kind === 'dimension') {
    const target = sketch.dimensions.find(d => d.id === action.id); if (!target) fail('Select an existing dimension.');
    length(action.source); target!.value.source = action.source;
  } else if (action.kind === 'clear' || action.kind === 'remove') {
    const removed = new Set(action.kind === 'clear' ? sketch.entities.map(e => e.id) : action.ids);
    if ([...removed].some(id => !sketch.entities.some(e => e.id === id))) fail('Select existing sketch geometry to delete.');
    if(action.kind==='remove'&&(sketch.profiles??[]).some(p=>p.entityIds.some(id=>removed.has(id)))) fail('Detach or delete the entire profile before removing its members.');
    if(action.kind==='clear'&&sketch.profiles)sketch.profiles=[];
    sketch.entities = sketch.entities.filter(e => !removed.has(e.id));
    sketch.constraints = sketch.constraints.filter(c => c.entityIds.every(id => !removed.has(id)) && (!c.position || c.position.entityIds.every(id => !removed.has(id))));
    sketch.dimensions = sketch.dimensions.filter(d => d.entityIds.every(id => !removed.has(id)));
  } else if (action.kind === 'constraint') {
    if (!sketch.entities.some(e => e.id === action.entity && e.kind === 'segment')) fail('Select a line before adding a constraint.');
    if (sketch.constraints.some(c => c.entityIds[0] === action.entity && c.kind === action.axis)) fail('That constraint already exists.');
    sketch.constraints.push({ id: unique(action.id), kind: action.axis, entityIds: [action.entity], pointRoles: [], inferred: false });
  } else if (action.kind === 'relation') {
    const [a, b] = action.entities.map(id => sketch.entities.find(e => e.id === id)) as [SketchEntity | undefined, SketchEntity | undefined];
    if (!a || !b || a === b) fail('Select two different pieces of geometry.');
    if (action.relation !== 'coincident' && (a!.kind !== 'segment' || b!.kind !== 'segment')) fail('Select two lines.');
    if (sketch.constraints.some(c => c.kind === action.relation && c.entityIds.length === 2 && c.entityIds.every(id => action.entities.includes(id)))) fail('That constraint already exists.');
    let pointRoles: string[] = [];
    if (action.relation === 'coincident') {
      // Join the closest pair of points between the two entities.
      const points = (e: SketchEntity) => e.kind === 'circle' ? [['center', e.center] as const] : [['a', e.a] as const, ['b', e.b] as const];
      let best = Infinity;
      for (const [ra, pa] of points(a!)) for (const [rb, pb] of points(b!)) { const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); if (d < best) { best = d; pointRoles = [ra, rb]; } }
    }
    sketch.constraints.push({ id: unique(action.id), kind: action.relation, entityIds: [...action.entities], pointRoles, inferred: false });
  } else if (action.kind === 'remove-constraint') {
    if (!sketch.constraints.some(c => c.id === action.id)) fail('Select an existing constraint.');
    sketch.constraints = sketch.constraints.filter(c => c.id !== action.id);
  }
  return editableCADContent({operation:'read',value});
}
