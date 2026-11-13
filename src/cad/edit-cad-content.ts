/**
 * PURPOSE    Apply source edits to the supported CAD document.
 * KIND       CORE
 * CONTRACT   IN: valid C50 content plus CADAction with caller-issued unique IDs.
 *            OUT: independently owned content, one revision increment, preserved expressions.
 *            RAISES: CADEditError for invalid targets, collisions, sizes or revision exhaustion.
 * GUARANTEES Pure, no mutation; failures preserve the input; dependent references are pruned.
 * TUNING     No tunable limits; geometry tolerance belongs to the document.
 * DECISIONS  D1: Keep source expressions instead of baked values. Alternative: numeric-only
 *            fields would lose parametric intent. Revisit if: the persisted schema changes.
 * LIMITS     C50 subset; C03/C04/C07 validation errors propagate. IDs must not be reused by callers.
 * TESTBENCH  src/cad/edit-cad-content.test.ts -- run with: node --import tsx --test src/cad/edit-cad-content.test.ts
 */
import { bossOf, laterOf, type CADContent, type EdgeSet, type Sketch, type SketchEntity } from './editable-cad-content.ts';
import { evaluateDimension } from './dimension-expressions.ts';
import { evaluateVariables } from './named-variables.ts';
import { makeLinearEntities } from './sketch-linear-primitives.ts';
export type CADAction =
  | { kind: 'line'; id: string; a: [number,number]; b: [number,number] }
  | { kind: 'rectangle'; prefix: string; width: string; height: string; origin?: [number,number] }
  | { kind: 'circle'; prefix: string; diameter: string; center: [number,number] }
  | { kind: 'dimension'; id: string; source: string }
  | { kind: 'extrude'; id: string; depth: string }
  | { kind: 'remove-extrude' } | { kind: 'clear' }
  | { kind: 'remove'; ids: string[] }
  | { kind: 'constraint'; id: string; entity: string; axis: 'horizontal' | 'vertical' }
  | { kind: 'remove-constraint'; id: string }
  | { kind: 'relation'; id: string; relation: 'parallel' | 'perpendicular' | 'equal' | 'coincident'; entities: [string, string] }
  | { kind: 'add-cut'; id: string } | { kind: 'cut-extent'; id: string; depth: string | null }
  | { kind: 'edge-feature'; id: string; feature: 'fillet' | 'chamfer'; edges: EdgeSet; size: string }
  | { kind: 'remove-feature'; id: string } | { kind: 'units'; units: 'mm' | 'inch' };
/** Sketch-editing actions may target a cut sketch by feature id; the base sketch is the default. */
export type CADEdit = { content: CADContent; action: CADAction; sketch?: string | undefined };
export function editCADContent({ content, action, sketch: target }: CADEdit): CADContent {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'CADEditError' }); };
  if (content.graph.revision === Number.MAX_SAFE_INTEGER) fail('The revision limit was reached. This document cannot be edited.');
  const value = JSON.parse(JSON.stringify(content)) as CADContent, base = value.graph.features[0].definition.sketch;
  const cutSketch = target && target !== value.graph.features[0].id ? laterOf(value).find(f => f.id === target && f.kind === 'pocket') : undefined;
  if (target && target !== value.graph.features[0].id && !cutSketch) fail('That sketch no longer exists.');
  const sketch: Sketch = cutSketch && cutSketch.kind === 'pocket' ? cutSketch.definition.sketch : base, isBase = sketch === base;
  const allSketches = [base, ...laterOf(value).flatMap(f => f.kind === 'pocket' ? [f.definition.sketch] : [])];
  const ids = new Set([...value.graph.features, ...allSketches.flatMap(k => [...k.entities, ...k.constraints, ...k.dimensions])].map(item => item.id));
  const unique = (id: string) => { if (!id.trim() || ids.has(id)) fail(`ID ${id} is empty or already used.`); ids.add(id); return id; };
  const length = (source: string, signed = false) => {
    const context = evaluateVariables({ variables: value.variables, units: value.units }).context;
    const result = evaluateDimension({ expression: { source, kind: 'length' }, context }).value;
    if ((signed ? Math.abs(result) : result) <= value.tolerance.linearMm) fail('The dimension must exceed the document tolerance.');
    return result;
  };
  if (action.kind === 'line') {
    if (![...action.a, ...action.b].every(Number.isFinite)) fail('Line coordinates must be finite.');
    const entities = makeLinearEntities({ tool: 'line', anchors: [action.a, action.b], ids: [unique(action.id)], construction: false, tolerance: value.tolerance });
    sketch.entities.push(...entities as typeof sketch.entities);
  } else if (action.kind === 'rectangle') {
    const width = length(action.width), height = length(action.height), origin = action.origin ?? [0,0];
    if (!origin.every(Number.isFinite)) fail('Rectangle origin must be finite.');
    const entityIds = Array.from({ length: 4 }, (_, i) => unique(`${action.prefix}-edge-${i}`));
    // On the base sketch the rectangle replaces the outline (segments) and keeps circles as holes; cut sketches just add it.
    const circles = new Set(sketch.entities.filter(e => !isBase || e.kind === 'circle').map(e => e.id)), kept = (ids: string[]) => ids.every(id => circles.has(id));
    const edges = makeLinearEntities({ tool: 'corner-rectangle', anchors: [origin as [number,number],[origin[0]!+width,origin[1]!+height]], ids: entityIds, construction: false, tolerance: value.tolerance }) as Extract<typeof sketch.entities[number], { kind: 'segment' }>[];
    sketch.entities = [...edges, ...sketch.entities.filter(e => circles.has(e.id))];
    sketch.constraints = [...entityIds.map((entity, i) => ({ id: unique(`${action.prefix}-axis-${i}`), kind: i % 2 === 0 ? 'horizontal' as const : 'vertical' as const, entityIds: [entity], pointRoles: [], inferred: true })),
      { id: unique(`${action.prefix}-origin`), kind: 'fix', entityIds: [entityIds[0]!], pointRoles: ['a'], inferred: true }, ...sketch.constraints.filter(c => kept(c.entityIds))];
    sketch.dimensions = [...[action.width, action.height].map((source, i) => {
      const edge = edges[i]!;
      return { id: unique(`${action.prefix}-${i === 0 ? 'width' : 'height'}`), kind: 'linear' as const, entityIds: [edge.id], anchors: [[...edge.a],[...edge.b]] as [number,number][], value: { source, kind: 'length' as const }, label: (i === 0 ? [origin[0]! + width / 2,origin[1]! - 8] : [origin[0]! + width + 8,origin[1]! + height / 2]) as [number,number] };
    }), ...sketch.dimensions.filter(d => kept(d.entityIds))];
  } else if (action.kind === 'circle') {
    const diameter = length(action.diameter), center = action.center;
    if (!center.every(Number.isFinite)) fail('Circle center must be finite.');
    const id = unique(`${action.prefix}-circle`), radius = diameter / 2;
    if (!center.every(v => Number.isFinite(Math.abs(v) + radius))) fail('The circle is too large.');
    sketch.entities.push({ id, kind: 'circle', center: [center[0], center[1]], radius, construction: false });
    sketch.constraints.push({ id: unique(`${action.prefix}-center`), kind: 'fix', entityIds: [id], pointRoles: ['center'], inferred: true });
    sketch.dimensions.push({ id: unique(`${action.prefix}-diameter`), kind: 'diameter', entityIds: [id], anchors: [[center[0] - radius, center[1]], [center[0] + radius, center[1]]], value: { source: action.diameter, kind: 'length' }, label: [center[0] + radius * 0.75 + 4, center[1] + radius * 0.75 + 4] });
  } else if (action.kind === 'dimension') {
    const target = sketch.dimensions.find(d => d.id === action.id); if (!target) fail('Select an existing dimension.');
    length(action.source); target!.value.source = action.source;
  } else if (action.kind === 'extrude') {
    length(action.depth, true);
    const existing = bossOf(value);
    if (existing) existing.definition.extent.distance.source = action.depth;
    else value.graph.features.splice(1, 0, { id: unique(action.id), name: 'Extrude 1', kind: 'extrude', suppressed: false, dependsOn: [sketch.id],
      definition: { kind: 'extrude', operation: 'boss', sketchId: sketch.id, profileLoopIds: [], extent: { kind: 'blind', distance: { source: action.depth, kind: 'length' } }, targetBodyIds: [] } });
  } else if (action.kind === 'remove-extrude') value.graph.features.splice(1);
  else if (action.kind === 'clear' || action.kind === 'remove') {
    const removed = new Set(action.kind === 'clear' ? sketch.entities.map(e => e.id) : action.ids);
    if ([...removed].some(id => !sketch.entities.some(e => e.id === id))) fail('Select existing sketch geometry to delete.');
    sketch.entities = sketch.entities.filter(e => !removed.has(e.id));
    sketch.constraints = sketch.constraints.filter(c => c.entityIds.every(id => !removed.has(id)));
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
  } else if (action.kind === 'add-cut') {
    if (!bossOf(value)) fail('Extrude the part before adding a cut.');
    const n = laterOf(value).filter(f => f.kind === 'pocket').length + 1, id = unique(action.id);
    value.graph.features.push({ id, name: `Cut ${n}`, kind: 'pocket', suppressed: false, dependsOn: [],
      definition: { kind: 'pocket', sketch: { id, name: `Cut sketch ${n}`, plane: 'XY', entities: [], constraints: [], dimensions: [], projected: [] }, extent: { kind: 'through' } } });
  } else if (action.kind === 'cut-extent') {
    const cut = laterOf(value).find(f => f.id === action.id && f.kind === 'pocket'); if (!cut || cut.kind !== 'pocket') fail('Select an existing cut.');
    if (action.depth === null) (cut as { definition: { extent: unknown } }).definition.extent = { kind: 'through' };
    else { length(action.depth, true); (cut as { definition: { extent: unknown } }).definition.extent = { kind: 'blind', distance: { source: action.depth, kind: 'length' } }; }
  } else if (action.kind === 'edge-feature') {
    if (!bossOf(value)) fail('Extrude the part before rounding or chamfering edges.');
    length(action.size, true);
    const existing = laterOf(value).find(f => f.id === action.id);
    if (existing) { if (existing.kind !== action.feature) fail('That feature is a different kind.'); Object.assign(existing.definition, { edges: action.edges, size: { source: action.size, kind: 'length' } }); }
    else { const n = laterOf(value).filter(f => f.kind === action.feature).length + 1; value.graph.features.push({ id: unique(action.id), name: `${action.feature === 'fillet' ? 'Fillet' : 'Chamfer'} ${n}`, kind: action.feature, suppressed: false, dependsOn: [], definition: { kind: action.feature, edges: action.edges, size: { source: action.size, kind: 'length' } } }); }
  } else if (action.kind === 'remove-feature') {
    const index = value.graph.features.findIndex((f, i) => i >= 2 && f.id === action.id); if (index < 0) fail('Select a cut, fillet or chamfer.');
    value.graph.features.splice(index, 1);
  } else if (action.kind === 'units') {
    if (!['mm', 'inch'].includes(action.units)) fail('Units are mm or inch.'); value.units = action.units;
  } else if (action.kind === 'remove-constraint') {
    if (!sketch.constraints.some(c => c.id === action.id)) fail('Select an existing constraint.');
    sketch.constraints = sketch.constraints.filter(c => c.id !== action.id);
  }
  value.graph.rollback = value.graph.features.length; value.graph.revision++;
  return value;
}
