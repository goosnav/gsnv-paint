/**
 * PURPOSE    Validate the supported editable CAD document subset.
 * KIND       CORE
 * CONTRACT   IN: new request or read with untrusted JSON value. OUT: owned CADContent
 *            with one default-plane sketch and an optional blind extrusion or +V revolve boss, exact
 *            persisted keys. Circles carry center/radius, may be fixed by their center and
 *            dimensioned by diameter; H/V and linear dimensions target segments only.
 *            Fixed points may retain finite length-expression positions for disjoint groups.
 *            RAISES: CADContentError with field/reason for malformed or unsupported input.
 * GUARANTEES Pure, deterministic, no mutation; no native handles or silent data loss.
 * TUNING     New document tolerance: 1e-7 mm, 1e-9 rad, 1e-9 relative.
 * DECISIONS  D1: Reject unsupported features. Alternative: discard unknown content. Rejected to
 *            avoid data loss. Revisit if: a feature family is implemented; retain migration tests.
 * LIMITS     C50 subset only: no imports, suppressed features, rollback, drawing or custom appearance.
 *            Position sources are evaluated here; legacy dimensions keep their existing lazy validation.
 *            Revolve source is structurally validated only: [Sketch, Revolve], angle source,
 *            local +V root reference, no downstream features; C79 evaluates its meaning.
 * TESTBENCH  src/cad/editable-cad-content.test.ts -- run with: node --import tsx --test src/cad/editable-cad-content.test.ts
 */
import { cadExpressionPolicy } from './cad-expression-policy.ts';
import { manageSketchProfiles } from './sketch-profile-edit.ts';
import type { ProfileSource } from './sketch-profile-source.ts';
type DimensionValue = { source: string; kind: 'length' | 'angle' | 'scalar' };
type Segment = { id: string; kind: 'segment'; a: [number,number]; b: [number,number]; construction: boolean };
export type Circle = { id: string; kind: 'circle'; center: [number, number]; radius: number; construction: boolean };
export type SketchEntity = Segment | Circle;
export type ConstraintKind = 'horizontal' | 'vertical' | 'fix' | 'parallel' | 'perpendicular' | 'equal' | 'coincident';
export type SketchPosition = { x: { source: string; kind: 'length' }; y: { source: string; kind: 'length' }; entityIds: string[] };
type Constraint = { id: string; kind: ConstraintKind; entityIds: string[]; pointRoles: string[]; inferred: boolean; position?: SketchPosition };
type Dimension = { id: string; kind: 'linear' | 'aligned' | 'diameter'; entityIds: string[]; anchors: [number, number][]; value: DimensionValue; label: [number, number] };
export type Sketch = { id: string; name: string; plane: 'XY' | 'XZ' | 'YZ'; entities: SketchEntity[]; constraints: Constraint[]; dimensions: Dimension[]; projected: []; profiles?: ProfileSource[] };
type BaseFeature = { id: string; name: string; dependsOn: string[]; suppressed: false };
type SketchFeature = BaseFeature & { kind: 'sketch'; definition: { kind: 'sketch'; sketch: Sketch } };
type ExtrudeFeature = BaseFeature & { kind: 'extrude'; definition: { kind: 'extrude'; operation: 'boss'; sketchId: string; profileLoopIds: []; extent: { kind: 'blind'; distance: DimensionValue }; targetBodyIds: [] } };
type RevolveFeature = BaseFeature & { kind: 'revolve'; definition: {
  kind: 'revolve'; operation: 'boss'; sketchId: string; profileLoopIds: [];
  axis: { kind: 'sketch-axis'; sketchId: string; axis: 'v' };
  angle: { source: string; kind: 'angle' }; targetBodyIds: [];
} };
export type PocketFeature = BaseFeature & { kind: 'pocket'; definition: { kind: 'pocket'; sketch: Sketch; extent: { kind: 'blind'; distance: DimensionValue } | { kind: 'through' } } };
export type EdgeSet = 'vertical' | 'top' | 'bottom' | 'all';
export type EdgeFeature = BaseFeature & { kind: 'fillet' | 'chamfer'; definition: { kind: 'fillet' | 'chamfer'; edges: EdgeSet; size: DimensionValue } };
export type LaterFeature = PocketFeature | EdgeFeature;
type Frame = { origin: number[]; x: number[]; y: number[]; normal: number[] };
export type CADContent = {
  units: 'mm' | 'inch'; tolerance: { linearMm: number; angularRad: number; relative: number };
  variables: { name: string; expression: DimensionValue }[];
  graph: { features: [SketchFeature, ...(ExtrudeFeature | RevolveFeature | LaterFeature)[]]; rollback: number; revision: number };
  assets: []; appearance: { mode: 'shaded-edges'; bodyColors: Record<string, never>; faceColors: []; section: { enabled: false; frame: Frame; offsetMm: 0 } }; drawing: null;
};
/** The boss extrusion (second feature), when present. */
export const bossOf = (content: CADContent): ExtrudeFeature | undefined => { const f = content.graph.features[1]; return f?.kind === 'extrude' ? f : undefined; };
/** Cuts, fillets and chamfers that follow the boss, in order. */
export const laterOf = (content: CADContent): LaterFeature[] => content.graph.features.slice(2) as LaterFeature[];
export function editableCADContent(request: { operation: 'new' } | { operation: 'read'; value: unknown }): CADContent {
  const frame = { origin: [0,0,0], x: [1,0,0], y: [0,1,0], normal: [0,0,1] };
  const appearance: CADContent['appearance'] = { mode: 'shaded-edges', bodyColors: {}, faceColors: [], section: { enabled: false, frame, offsetMm: 0 } };
  if (request.operation === 'new') return {
    units: 'mm', tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 }, variables: [], assets: [], appearance, drawing: null,
    graph: { revision: 0, rollback: 1, features: [{ id: 'sketch-1', name: 'Sketch 1', kind: 'sketch', dependsOn: [], suppressed: false,
      definition: { kind: 'sketch', sketch: { id: 'sketch-1', name: 'Sketch 1', plane: 'XY', entities: [], constraints: [], dimensions: [], projected: [] } } }] },
  };
  const bad = (where: string, reason: string): never => { throw Object.assign(new Error(`${where}: ${reason}`), { name: 'CADContentError' }); };
  const keys = (v: unknown, expected: string, where: string) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) bad(where, 'expected a plain record');
    if (Object.keys(v!).sort().join(',') !== expected.split(' ').sort().join(',')) bad(where, 'missing or unsupported fields');
  };
  const array = (v: unknown, where: string): void => { if (!Array.isArray(v)) bad(where, 'expected an array'); };
  const empty = (v: unknown, where: string) => { array(v, where); if ((v as unknown[]).length) bad(where, 'not supported in this CAD build'); };
  const text = (v: unknown, where: string) => { if (typeof v !== 'string' || !v.trim()) bad(where, 'expected nonempty text'); };
  const vec = (v: unknown, where: string) => { if (!Array.isArray(v) || v.length !== 2 || !v.every(n => typeof n === 'number' && Number.isFinite(n))) bad(where, 'expected two finite coordinates'); };
  const dim = (v: DimensionValue, where: string, lengthOnly = false) => {
    keys(v, 'source kind', where); text(v.source, where);
    if (!(lengthOnly ? ['length'] : ['length','angle','scalar']).includes(v.kind)) bad(where, 'unsupported dimension kind');
  };
  const value = request.value as CADContent;
  keys(value, 'units tolerance variables graph assets appearance drawing', 'CAD');
  if (!['mm','inch'].includes(value.units)) bad('units', 'choose mm or inch');
  keys(value.tolerance, 'linearMm angularRad relative', 'tolerance');
  if (!Object.values(value.tolerance).every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)) bad('tolerance', 'values must be finite and positive');
  array(value.variables, 'variables'); const names = new Set<string>();
  for (const variable of value.variables) {
    keys(variable, 'name expression', 'variable'); text(variable.name, 'variable name');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name) || names.has(variable.name)) bad('variables', 'names must be unique identifiers');
    names.add(variable.name); dim(variable.expression, `variable ${variable.name}`);
  }
  empty(value.assets, 'assets'); if (value.drawing !== null) bad('drawing', 'not supported in this CAD build');
  // Canonical default appearance is the supported subset; accepting ignored settings would lose user intent.
  const equal = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k,v]) => Object.hasOwn(b,k) && equal(v,(b as Record<string,unknown>)[k]));
  };
  if (!equal(value.appearance, appearance)) bad('appearance', 'custom display settings are not supported in this CAD build');
  keys(value.graph, 'features rollback revision', 'graph'); array(value.graph.features, 'features');
  if (value.graph.features.length < 1 || value.graph.features.length > 64) bad('features', 'expected one sketch, an extrusion with up to 62 further features, or one revolve');
  if (!Number.isSafeInteger(value.graph.revision) || value.graph.revision < 0) bad('revision', 'expected a nonnegative safe integer');
  if (value.graph.rollback !== value.graph.features.length) bad('rollback', 'partial rollback is not supported in this CAD build');
  const ids = new Set<string>();
  const id = (v: unknown, where: string) => { text(v, where); if (ids.has(v as string)) bad(where, 'duplicate ID'); ids.add(v as string); };
  for (const feature of value.graph.features) {
    keys(feature, 'id name kind dependsOn suppressed definition', 'feature'); id(feature.id, 'feature ID'); text(feature.name, 'feature name'); array(feature.dependsOn, 'dependsOn');
    if (feature.suppressed !== false) bad(feature.name, 'suppression is not supported in this CAD build');
  }
  const first = value.graph.features[0];
  if (first.kind !== 'sketch') bad('first feature', 'expected a default-plane sketch');
  empty(first.dependsOn, 'sketch dependencies'); keys(first.definition, 'kind sketch', 'sketch definition');
  if (first.definition.kind !== 'sketch') bad('sketch definition', 'wrong kind');
  const sourceContext = () => cadExpressionPolicy({units:value.units,variables:value.variables,linearMm:value.tolerance.linearMm}).context;
  const checkSketch = (sketch: Sketch, owner: string) => {
    keys(sketch, `id name plane entities constraints dimensions projected${Object.hasOwn(sketch??{},'profiles')?' profiles':''}`, 'sketch');
    if (sketch.id !== owner) bad('sketch ID', 'must match feature ID'); text(sketch.name, 'sketch name');
    if (!['XY','XZ','YZ'].includes(sketch.plane) || sketch.plane !== first.definition.sketch.plane) bad('plane', 'choose XY, XZ or YZ; cut sketches must inherit the root plane');
    empty(sketch.projected, 'projected edges'); array(sketch.entities, 'entities'); const entities = new Set<string>();
    const kinds = new Map<string, SketchEntity['kind']>();
    for (const entity of sketch.entities) {
      if (entity?.kind === 'circle') {
        keys(entity, 'id kind center radius construction', 'entity'); id(entity.id, 'entity ID'); entities.add(entity.id); kinds.set(entity.id, 'circle');
        if (typeof entity.construction !== 'boolean') bad(entity.id, 'construction must be true or false');
        vec(entity.center, entity.id);
        if (typeof entity.radius !== 'number' || !Number.isFinite(entity.radius) || entity.radius <= value.tolerance.linearMm || !entity.center.every(v => Number.isFinite(Math.abs(v) + entity.radius))) bad(entity.id, 'collapsed or overflowing circle');
        continue;
      }
      keys(entity, 'id kind a b construction', 'entity'); id(entity.id, 'entity ID'); entities.add(entity.id); kinds.set(entity.id, 'segment');
      if (entity.kind !== 'segment' || typeof entity.construction !== 'boolean') bad(entity.id, 'only segments and circles are supported');
      vec(entity.a, entity.id); vec(entity.b, entity.id);
      const length = Math.hypot(entity.b[0] - entity.a[0], entity.b[1] - entity.a[1]);
      if (!Number.isFinite(length) || length <= value.tolerance.linearMm) bad(entity.id, 'collapsed or overflowing segment');
    }
    const target = (v: string[], where: string, kind: SketchEntity['kind'] = 'segment') => { if (!Array.isArray(v) || v.length !== 1 || kinds.get(v[0]!) !== kind) bad(where, `expected one existing ${kind}`); };
    const targetKind = (v: string[]) => Array.isArray(v) && v.length === 1 ? kinds.get(v[0]!) : undefined;
    array(sketch.constraints, 'constraints'); const controlled = new Set<string>();
    for (const c of sketch.constraints) {
      const positioned = Object.hasOwn(c ?? {}, 'position');
      keys(c, `id kind entityIds pointRoles inferred${positioned ? ' position' : ''}`, 'constraint'); id(c.id, 'constraint ID');
      if (!['horizontal','vertical','fix','parallel','perpendicular','equal','coincident'].includes(c.kind) || typeof c.inferred !== 'boolean') bad(c.id, 'unsupported constraint');
      if (positioned && c.kind !== 'fix') bad(c.id, 'only fixed points may control a position');
      if (['parallel','perpendicular','equal','coincident'].includes(c.kind)) {
        if (!Array.isArray(c.entityIds) || c.entityIds.length !== 2 || c.entityIds[0] === c.entityIds[1] || !c.entityIds.every(e => kinds.has(e))) bad(c.id, 'expected two different existing entities');
        if (c.kind !== 'coincident' && !c.entityIds.every(e => kinds.get(e) === 'segment')) bad(c.id, 'expected two segments');
        if (c.kind === 'coincident') { if (!Array.isArray(c.pointRoles) || c.pointRoles.length !== 2 || !c.pointRoles.every((r, i) => (kinds.get(c.entityIds[i]!) === 'circle' ? ['center'] : ['a','b']).includes(r))) bad(c.id, 'coincident needs one point role per entity'); }
        else empty(c.pointRoles, c.id);
        continue;
      }
      const circle = c.kind === 'fix' && targetKind(c.entityIds) === 'circle'; target(c.entityIds, c.id, circle ? 'circle' : 'segment');
      if (c.kind === 'fix') { if (!Array.isArray(c.pointRoles) || c.pointRoles.length !== 1 || !(circle ? ['center'] : ['a','b']).includes(c.pointRoles[0]!)) bad(c.id, circle ? 'circle fix needs its center' : 'fix needs endpoint a or b'); }
      else empty(c.pointRoles, c.id);
      if (positioned) {
        const p = c.position!; keys(p, 'x y entityIds', `${c.id} position`);
        dim(p.x, `${c.id} X`, true); dim(p.y, `${c.id} Y`, true); array(p.entityIds, `${c.id} position entities`);
        if (!p.entityIds.includes(c.entityIds[0]!) || (circle && p.entityIds.length !== 1)) bad(c.id, 'position group must include its anchor and a circle controls only itself');
        const group = new Set<string>();
        for (const entity of p.entityIds) {
          if (kinds.get(entity) !== (circle ? 'circle' : 'segment')) bad(c.id, 'position group must contain existing entities of the anchor kind');
          if (group.has(entity) || controlled.has(entity)) bad(c.id, 'position groups must not repeat or overlap entities');
          group.add(entity); controlled.add(entity);
        }
        try {
          cadExpressionPolicy({units:value.units,variables:value.variables,linearMm:value.tolerance.linearMm,parameters:[{expression:p.x},{expression:p.y}]});
        } catch (cause) { bad(c.id, `invalid position: ${cause instanceof Error ? cause.message : String(cause)}`); }
      }
    }
    array(sketch.dimensions, 'dimensions');
    for (const d of sketch.dimensions) {
      keys(d, 'id kind entityIds anchors value label', 'dimension'); id(d.id, 'dimension ID');
      if (!['linear','aligned','diameter'].includes(d.kind)) bad(d.id, 'only segment lengths and circle diameters are supported');
      target(d.entityIds, d.id, d.kind === 'diameter' ? 'circle' : 'segment');
      array(d.anchors, d.id); if (d.anchors.length !== 2) bad(d.id, 'expected two anchors'); d.anchors.forEach(v => vec(v,d.id)); vec(d.label,d.id); dim(d.value,d.id,true);
    }
    if(Object.hasOwn(sketch,'profiles')) {
      array(sketch.profiles,'profiles');
      try {
        manageSketchProfiles({sketch,usedIds:[...ids],context:sketch.profiles?.length?sourceContext():{units:value.units,variables:{}},tolerance:value.tolerance});
        for(const profile of sketch.profiles!) id(profile.id,'profile ID');
      } catch(cause) { bad('profiles',cause instanceof Error?cause.message:String(cause)); }
    }
  };
  checkSketch(first.definition.sketch, first.id);
  const solid = value.graph.features[1], extrusion = bossOf(value);
  if (solid?.kind === 'revolve') {
    if (value.graph.features.length !== 2) bad('revolve', 'must be the only feature after the root sketch');
    if (solid.dependsOn.length !== 1 || solid.dependsOn[0] !== first.id) bad('revolve dependencies', 'must reference the root sketch');
    const d = solid.definition; keys(d, 'kind operation sketchId profileLoopIds axis angle targetBodyIds', 'revolve definition');
    if (d.kind !== 'revolve' || d.operation !== 'boss' || d.sketchId !== first.id) bad('revolve', 'only a boss from the root sketch is supported');
    empty(d.profileLoopIds, 'revolve profile selection'); empty(d.targetBodyIds, 'revolve target bodies');
    keys(d.axis, 'kind sketchId axis', 'revolve axis');
    if (d.axis.kind !== 'sketch-axis' || d.axis.sketchId !== first.id || d.axis.axis !== 'v') bad('revolve axis', 'choose the root sketch vertical axis (+V)');
    dim(d.angle, 'revolve angle'); if (d.angle.kind !== 'angle') bad('revolve angle', 'expected an angle expression');
  } else if (solid) {
    if (solid.kind !== 'extrude' || solid.dependsOn.length !== 1 || solid.dependsOn[0] !== first.id) bad('extrusion', 'must depend on the sketch');
    const d = solid.definition as ExtrudeFeature['definition']; keys(d, 'kind operation sketchId profileLoopIds extent targetBodyIds', 'extrusion definition');
    if (d.kind !== 'extrude' || d.operation !== 'boss' || d.sketchId !== first.id) bad('extrusion', 'only a boss from the first sketch is supported');
    empty(d.profileLoopIds, 'profile selection'); empty(d.targetBodyIds, 'target bodies'); keys(d.extent, 'kind distance', 'extent');
    if (d.extent.kind !== 'blind') bad('extent', 'only blind extrusion is supported'); dim(d.extent.distance, 'depth', true);
  }
  for (const feature of laterOf(value)) {
    if (!extrusion) bad(feature.name, 'needs an extrusion first');
    if (feature.kind === 'pocket') {
      const d = feature.definition; keys(d, 'kind sketch extent', 'cut definition'); if (d.kind !== 'pocket') bad(feature.name, 'wrong kind');
      empty(feature.dependsOn, `${feature.name} dependencies`); checkSketch(d.sketch, feature.id);
      if (d.extent?.kind === 'through') keys(d.extent, 'kind', 'cut extent'); else { keys(d.extent, 'kind distance', 'cut extent'); if (d.extent.kind !== 'blind') bad(feature.name, 'cut extent is blind or through'); dim(d.extent.distance, `${feature.name} depth`, true); }
    } else if (feature.kind === 'fillet' || feature.kind === 'chamfer') {
      const d = feature.definition; keys(d, 'kind edges size', `${feature.kind} definition`); empty(feature.dependsOn, `${feature.name} dependencies`);
      if (d.kind !== feature.kind || !['vertical','top','bottom','all'].includes(d.edges)) bad(feature.name, 'edges are vertical, top, bottom or all'); dim(d.size, `${feature.name} size`, true);
    } else bad((feature as { name?: string }).name ?? 'feature', 'unsupported feature');
  }
  // Validation above rejects unsupported members before this ownership copy.
  return JSON.parse(JSON.stringify(value)) as CADContent;
}
