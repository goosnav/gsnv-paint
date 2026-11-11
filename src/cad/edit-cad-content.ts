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
import type { CADContent } from './editable-cad-content.ts';
import { evaluateDimension } from './dimension-expressions.ts';
import { evaluateVariables } from './named-variables.ts';
import { makeLinearEntities } from './sketch-linear-primitives.ts';
export type CADAction =
  | { kind: 'line'; id: string; a: [number,number]; b: [number,number] }
  | { kind: 'rectangle'; prefix: string; width: string; height: string; origin?: [number,number] }
  | { kind: 'dimension'; id: string; source: string }
  | { kind: 'extrude'; id: string; depth: string }
  | { kind: 'remove-extrude' } | { kind: 'clear' }
  | { kind: 'remove'; ids: string[] }
  | { kind: 'constraint'; id: string; entity: string; axis: 'horizontal' | 'vertical' }
  | { kind: 'remove-constraint'; id: string };
export function editCADContent({ content, action }: { content: CADContent; action: CADAction }): CADContent {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'CADEditError' }); };
  if (content.graph.revision === Number.MAX_SAFE_INTEGER) fail('The revision limit was reached. This document cannot be edited.');
  const value = JSON.parse(JSON.stringify(content)) as CADContent, sketch = value.graph.features[0].definition.sketch;
  const ids = new Set([...value.graph.features, ...sketch.entities, ...sketch.constraints, ...sketch.dimensions].map(item => item.id));
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
    sketch.entities = makeLinearEntities({ tool: 'corner-rectangle', anchors: [origin as [number,number],[origin[0]!+width,origin[1]!+height]], ids: entityIds, construction: false, tolerance: value.tolerance }) as typeof sketch.entities;
    sketch.constraints = entityIds.map((entity, i) => ({ id: unique(`${action.prefix}-axis-${i}`), kind: i % 2 === 0 ? 'horizontal' : 'vertical', entityIds: [entity], pointRoles: [], inferred: true }));
    sketch.constraints.push({ id: unique(`${action.prefix}-origin`), kind: 'fix', entityIds: [entityIds[0]!], pointRoles: ['a'], inferred: true });
    sketch.dimensions = [action.width, action.height].map((source, i) => {
      const edge = sketch.entities[i]!;
      return { id: unique(`${action.prefix}-${i === 0 ? 'width' : 'height'}`), kind: 'linear', entityIds: [edge.id], anchors: [[...edge.a],[...edge.b]], value: { source, kind: 'length' }, label: i === 0 ? [width / 2,-8] : [width + 8,height / 2] };
    });
  } else if (action.kind === 'dimension') {
    const target = sketch.dimensions.find(d => d.id === action.id); if (!target) fail('Select an existing dimension.');
    length(action.source); target!.value.source = action.source;
  } else if (action.kind === 'extrude') {
    length(action.depth, true);
    const existing = value.graph.features[1];
    if (existing) existing.definition.extent.distance.source = action.depth;
    else value.graph.features.push({ id: unique(action.id), name: 'Extrude 1', kind: 'extrude', suppressed: false, dependsOn: [sketch.id],
      definition: { kind: 'extrude', operation: 'boss', sketchId: sketch.id, profileLoopIds: [], extent: { kind: 'blind', distance: { source: action.depth, kind: 'length' } }, targetBodyIds: [] } });
  } else if (action.kind === 'remove-extrude') value.graph.features.splice(1);
  else if (action.kind === 'clear' || action.kind === 'remove') {
    const removed = new Set(action.kind === 'clear' ? sketch.entities.map(e => e.id) : action.ids);
    if ([...removed].some(id => !sketch.entities.some(e => e.id === id))) fail('Select existing sketch geometry to delete.');
    sketch.entities = sketch.entities.filter(e => !removed.has(e.id));
    sketch.constraints = sketch.constraints.filter(c => c.entityIds.every(id => !removed.has(id)));
    sketch.dimensions = sketch.dimensions.filter(d => d.entityIds.every(id => !removed.has(id)));
  } else if (action.kind === 'constraint') {
    if (!sketch.entities.some(e => e.id === action.entity)) fail('Select a line before adding a constraint.');
    if (sketch.constraints.some(c => c.entityIds[0] === action.entity && c.kind === action.axis)) fail('That constraint already exists.');
    sketch.constraints.push({ id: unique(action.id), kind: action.axis, entityIds: [action.entity], pointRoles: [], inferred: false });
  } else if (action.kind === 'remove-constraint') {
    if (!sketch.constraints.some(c => c.id === action.id)) fail('Select an existing constraint.');
    sketch.constraints = sketch.constraints.filter(c => c.id !== action.id);
  }
  value.graph.rollback = value.graph.features.length; value.graph.revision++;
  return value;
}
