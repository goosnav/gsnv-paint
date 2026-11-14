/**
 * PURPOSE    Apply CAD model-source edits.
 * KIND       CORE
 * CONTRACT   IN: C50 content and ModelAction. OUT: owned C50-valid content with
 *            unchanged revision; expressions, physical units and inherited planes preserved.
 *            RAISES: CADEditError for bad targets/IDs/ranges/names/units/planes;
 *            C50/C74 errors propagate. Invalid dependent expressions reject the whole edit.
 * GUARANTEES No mutation, native work or hidden publication; referenced variables cannot disappear.
 * TUNING     Source tolerance and existing C50 feature bounds only.
 * DECISIONS  D1: One source inventory for edits and unit binding. Alternative: per-field
 *            conversion misses new parameters. Revisit if: a new source family is introduced.
 * LIMITS     Current extrude/cut/edge subset; caller owns transaction/revision increment.
 * TESTBENCH  node --import tsx --test src/cad/cad-model-edit.test.ts
 */
import { editableCADContent, bossOf, laterOf, type CADContent, type EdgeSet } from './editable-cad-content.ts';
import { cadExpressionPolicy } from './cad-expression-policy.ts';
export type ModelAction =
  | { kind:'plane';plane:'XY'|'XZ'|'YZ' }
  | { kind:'variable';name:string;source:string;dimensionKind?:'length'|'angle'|'scalar' }
  | { kind:'remove-variable';name:string } | { kind:'extrude';id:string;depth:string } | { kind:'remove-extrude' }
  | { kind:'add-cut';id:string } | { kind:'cut-extent';id:string;depth:string|null }
  | { kind:'edge-feature';id:string;feature:'fillet'|'chamfer';edges:EdgeSet;size:string }
  | { kind:'remove-feature';id:string } | { kind:'units';units:'mm'|'inch' };
export function editCADModel({content,action}:{content:CADContent;action:ModelAction}):CADContent {
  const fail=(message:string):never=>{throw Object.assign(new Error(message),{name:'CADEditError'});};
  const value=structuredClone(content),base=value.graph.features[0].definition.sketch,sketch=base;
  const allSketches=[base,...laterOf(value).flatMap(f=>f.kind==='pocket'?[f.definition.sketch]:[])];
  const ids=new Set([...value.graph.features,...allSketches.flatMap(k=>[...k.entities,...k.constraints,...k.dimensions,...(k.profiles??[])])].map(v=>v.id));
  const unique=(id:string)=>{if(!id.trim()||ids.has(id))fail(`ID ${id} is empty or already used.`);ids.add(id);return id;};
  const policy=(parameters:NonNullable<Parameters<typeof cadExpressionPolicy>[0]['parameters']>,bindUnits=false)=>cadExpressionPolicy({units:value.units,variables:value.variables,linearMm:value.tolerance.linearMm,parameters,bindUnits});
  const length=(source:string,signed=false)=>policy([{expression:{source,kind:'length'},range:signed?'nonzero':'positive'}]).values[0]!;
  // One inventory keeps variable edits and unit changes aware of every persisted expression.
  const expressions = () => {
    type Parameter = { expression: CADContent['variables'][number]['expression']; range?: 'positive' | 'nonzero' };
    const result: Parameter[] = value.variables.map(v => ({ expression: v.expression }));
    for (const s of allSketches) {
      result.push(...s.dimensions.map(d => ({ expression: d.value, range: 'positive' as const })));
      for(const p of s.profiles??[]) {
        result.push(...p.center.map(expression=>({expression})));
        if(p.kind==='center-rectangle') result.push({expression:p.width,range:'positive'},{expression:p.height,range:'positive'});
        else result.push({expression:p.radius,range:'positive'},{expression:p.rotation});
      }
      for (const c of s.constraints) if (c.position) result.push({ expression: c.position.x }, { expression: c.position.y });
    }
    for (const feature of value.graph.features) {
      if (feature.kind === 'extrude') result.push({ expression: feature.definition.extent.distance, range: 'nonzero' });
      else if (feature.kind === 'pocket' && feature.definition.extent.kind === 'blind') result.push({ expression: feature.definition.extent.distance, range: 'nonzero' });
      else if (feature.kind === 'fillet' || feature.kind === 'chamfer') result.push({ expression: feature.definition.size, range: 'nonzero' });
    }
    return result;
  };
  const validateExpressions=()=>{policy(expressions());};
  if (action.kind === 'plane') {
    if (!['XY','XZ','YZ'].includes(action.plane)) fail('Choose the XY, XZ or YZ sketch plane.');
    for (const s of allSketches) s.plane = action.plane;
  } else if (action.kind === 'variable') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(action.name)) fail('Variable names must be identifiers starting with a letter or underscore.');
    const existing = value.variables.find(v => v.name === action.name), kind = action.dimensionKind ?? existing?.expression.kind ?? 'length';
    if (!['length', 'angle', 'scalar'].includes(kind)) fail('Choose length, angle or scalar for the variable kind.');
    const expression = { source: action.source, kind };
    if (existing) existing.expression = expression;
    else value.variables.push({ name: action.name, expression });
    validateExpressions();
  } else if (action.kind === 'remove-variable') {
    if (!value.variables.some(v => v.name === action.name)) fail('Select an existing variable.');
    value.variables = value.variables.filter(v => v.name !== action.name);
    validateExpressions();
  } else if (action.kind === 'extrude') {
    length(action.depth, true);
    const existing = bossOf(value);
    if (existing) existing.definition.extent.distance.source = action.depth;
    else value.graph.features.splice(1, 0, { id: unique(action.id), name: 'Extrude 1', kind: 'extrude', suppressed: false, dependsOn: [sketch.id],
      definition: { kind: 'extrude', operation: 'boss', sketchId: sketch.id, profileLoopIds: [], extent: { kind: 'blind', distance: { source: action.depth, kind: 'length' } }, targetBodyIds: [] } });
  } else if (action.kind === 'remove-extrude') value.graph.features.splice(1);
  else if (action.kind === 'add-cut') {
    if (!bossOf(value)) fail('Extrude the part before adding a cut.');
    const n = laterOf(value).filter(f => f.kind === 'pocket').length + 1, id = unique(action.id);
    value.graph.features.push({ id, name: `Cut ${n}`, kind: 'pocket', suppressed: false, dependsOn: [],
      definition: { kind: 'pocket', sketch: { id, name: `Cut sketch ${n}`, plane: base.plane, entities: [], constraints: [], dimensions: [], projected: [] }, extent: { kind: 'through' } } });
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
    if (!['mm', 'inch'].includes(action.units)) fail('Units are mm or inch.');
    if (value.units !== action.units) {
      const parameters=expressions(),bound=policy(parameters,true).boundSources!;
      parameters.forEach(({expression},i)=>{expression.source=bound[i]!;});
      value.units = action.units;
    }
  }
  value.graph.rollback=value.graph.features.length;
  return editableCADContent({operation:'read',value});
}
