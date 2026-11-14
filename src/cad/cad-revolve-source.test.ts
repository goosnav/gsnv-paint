import test from 'node:test';
import assert from 'node:assert/strict';
import { editableCADContent, bossOf, laterOf, type CADContent } from './editable-cad-content.ts';
import { editCADModel, type ModelAction } from './cad-model-edit.ts';
import { editCADContent, type CADAction } from './edit-cad-content.ts';
import { cadProjectSource, isSTEPSource } from './cad-project-source.ts';
import { cadExpressionPolicy } from './cad-expression-policy.ts';
import { revolveRecipe, type RevolveRecipeRequest } from './revolve-recipe.ts';
import { nativeContainer } from '../shared/native-container.ts';
import { history } from '../shared/history.ts';

const plain = () => editableCADContent({ operation: 'new' });
const definition = (angle = '360 deg'): RevolveRecipeRequest['source'] => ({
  kind: 'revolve', operation: 'boss', sketchId: 'sketch-1', profileLoopIds: [],
  axis: { kind: 'sketch-axis', sketchId: 'sketch-1', axis: 'v' }, angle: { source: angle, kind: 'angle' }, targetBodyIds: [],
});
const source = (angle = '360 deg'): CADContent => ({ ...plain(), graph: { revision: 7, rollback: 2,
  features: [plain().graph.features[0], { id: 'turned', name: 'Revolve 1', kind: 'revolve', suppressed: false, dependsOn: ['sketch-1'], definition: definition(angle) }],
} } as unknown as CADContent);
const edit = (content: CADContent, action: unknown) => editCADContent({ content, action: action as CADAction });
const turn = (content = plain(), angle = '360 deg', id = 'turned') => edit(content, { kind: 'revolve', id, axis: 'v', angle });
const parameters = (content: CADContent) => revolveRecipe({ operation: 'parameters',
  source: content.graph.features[1]!.definition as RevolveRecipeRequest['source'], sketchId: content.graph.features[0].id,
  context: cadExpressionPolicy({ units: content.units, variables: content.variables, linearMm: content.tolerance.linearMm }).context,
  tolerance: content.tolerance,
});
const roundtrip = (content: CADContent) => {
  const encoded = cadProjectSource({ operation: 'encode', source: content });
  const envelope = { format: 'gsnv-cad' as const, version: 1 as const, id: 'test-part', title: 'Turned part', content: encoded.content as never };
  const bytes = nativeContainer({ op: 'encode', package: { project: envelope, assets: encoded.assets } });
  const decoded = nativeContainer({ op: 'decode', parts: bytes.parts });
  assert.deepEqual(Object.keys(decoded.project).sort(), ['content', 'format', 'id', 'title', 'version']);
  assert.equal(decoded.project.format, 'gsnv-cad'); assert.equal(decoded.project.version, 1); assert.deepEqual(decoded.assets, []);
  return cadProjectSource({ operation: 'decode', content: decoded.project.content, assets: decoded.assets });
};
function unchanged(content: CADContent, action: unknown, reason: RegExp) {
  const snapshot = structuredClone(content), state = history({ op: 'create', value: content });
  assert.throws(() => edit(content, action), reason);
  assert.deepEqual(content, snapshot); assert.deepEqual(state.present, snapshot); assert.deepEqual(state.past, []);
}

test('revolve source is exact, owned and fully preserved through the existing native container', () => {
  const input = source('-90 deg'), read = editableCADContent({ operation: 'read', value: input });
  assert.deepEqual(read, input); assert.notEqual(read, input); assert.notEqual(read.graph.features, input.graph.features);
  assert.deepEqual(roundtrip(input), input); assert.equal(bossOf(read), undefined); assert.deepEqual(laterOf(read), []);
  assert.deepEqual(parameters(read), { axis: { origin: [0, 0, 0], direction: [0, 1, 0] }, angleRad: -Math.PI / 2 });
});

test('C50 rejects unsupported revolve schema, references, graph positions and global ID collisions', () => {
  const changes: ((value: any) => void)[] = [
    v => v.graph.features[1].definition.extra = true, v => delete v.graph.features[1].definition.angle,
    v => v.graph.features[1].definition.kind = 'extrude', v => v.graph.features[1].definition.operation = 'cut',
    v => v.graph.features[1].definition.sketchId = 'other', v => v.graph.features[1].dependsOn = [],
    v => v.graph.features[1].dependsOn = ['other'], v => v.graph.features[1].dependsOn.push('sketch-1'),
    v => v.graph.features[1].definition.axis = null, v => v.graph.features[1].definition.axis.axis = 'u',
    v => v.graph.features[1].definition.axis.axis = '-v', v => v.graph.features[1].definition.axis.kind = 'world',
    v => v.graph.features[1].definition.axis.sketchId = 'other', v => v.graph.features[1].definition.axis.origin = [0, 0, 0],
    v => v.graph.features[1].definition.angle = null, v => v.graph.features[1].definition.angle.kind = 'length',
    v => v.graph.features[1].definition.angle.source = '', v => v.graph.features[1].definition.angle.source = 90,
    v => v.graph.features[1].definition.angle.evaluated = 1, v => v.graph.features[1].definition.profileLoopIds.push('loop'),
    v => v.graph.features[1].definition.targetBodyIds.push('body'), v => v.graph.features[1].suppressed = true,
    v => v.graph.features[1].name = ' ', v => v.graph.features[1].id = 'sketch-1', v => v.graph.rollback = 1,
    v => v.graph.features[0] = v.graph.features[1],
    v => { v.graph.features.push({ ...structuredClone(v.graph.features[1]), id: 'second' }); v.graph.rollback = 3; },
    v => { const extruded = edit(plain(), { kind: 'extrude', id: 'boss', depth: '10' }); v.graph.features.splice(1, 0, extruded.graph.features[1]); v.graph.rollback = 3; },
  ];
  for (const change of changes) {
    const input = source(); change(input);
    assert.throws(() => editableCADContent({ operation: 'read', value: input }), { name: 'CADContentError' });
  }
});

test('C50 preserves unevaluated angle text so failed rebuilt features remain editable', () => {
  for (const angle of ['0', '361 deg', 'missingAngle', '1/0', '2 mm']) {
    const input = source(angle), read = editableCADContent({ operation: 'read', value: input });
    assert.deepEqual(read, input); assert.throws(() => parameters(read)); assert.deepEqual(roundtrip(read), read);
  }
});

test('C76 creates and edits one revolve with unchanged revision and retained identity/name/references', () => {
  const original = plain(), action = { kind: 'revolve', id: 'turned', axis: 'v', angle: '90 deg' } as ModelAction;
  const created = editCADModel({ content: original, action });
  assert.equal(created.graph.revision, original.graph.revision); assert.equal(created.graph.rollback, 2);
  assert.deepEqual(created.graph.features[1], { id: 'turned', name: 'Revolve 1', kind: 'revolve', dependsOn: ['sketch-1'], suppressed: false, definition: definition('90 deg') });
  created.graph.features[1]!.name = 'Turned sleeve';
  const updated = editCADModel({ content: created, action: { ...action, angle: '-90 deg' } as ModelAction });
  assert.equal(updated.graph.features[1]!.id, 'turned'); assert.equal(updated.graph.features[1]!.name, 'Turned sleeve');
  assert.deepEqual(updated.graph.features[1]!.dependsOn, ['sketch-1']); assert.equal(parameters(updated).angleRad, -Math.PI / 2);
  assert.equal(parameters(created).angleRad, Math.PI / 2); assert.deepEqual(original, plain());
});

test('C51 revolve create/edit/remove increments once and history restores exact source', () => {
  const initial = plain(), created = turn(initial), edited = turn(created, '-90 deg');
  assert.equal(created.graph.revision, 1); assert.equal(edited.graph.revision, 2);
  let state = history({ op: 'create', value: initial });
  state = history({ op: 'commit', history: state, value: created, label: 'Revolve' });
  state = history({ op: 'commit', history: state, value: edited, label: 'Edit revolve' });
  const undone = history({ op: 'undo', history: state }); assert.deepEqual(undone.present, created);
  assert.deepEqual(history({ op: 'redo', history: undone }).present, edited);
  const removed = edit(edited, { kind: 'remove-revolve', id: 'turned' });
  assert.equal(removed.graph.revision, 3); assert.equal(removed.graph.rollback, 1);
  assert.deepEqual(removed.graph.features, initial.graph.features);
});

test('revolve IDs and the +V axis reject invalid creation, mismatched edits and wrong removals atomically', () => {
  const sketch = edit(plain(), { kind: 'rectangle', prefix: 'r', width: '10', height: '12', origin: ['10', '0'] });
  const ids = ['sketch-1', ...sketch.graph.features[0].definition.sketch.entities.map(e => e.id), ...sketch.graph.features[0].definition.sketch.dimensions.map(d => d.id)];
  for (const id of ['', ' ', null, 5, ...ids]) unchanged(sketch, { kind: 'revolve', id, axis: 'v', angle: '90' }, /ID|used|empty/i);
  for (const axis of ['u', '-v', null, { kind: 'world' }]) unchanged(sketch, { kind: 'revolve', id: 'turned', axis, angle: '90' }, /axis|vertical|V/);
  const content = turn(sketch);
  unchanged(content, { kind: 'revolve', id: 'other', axis: 'v', angle: '90' }, /ID|existing|match/i);
  unchanged(content, { kind: 'remove-revolve', id: 'other' }, /ID|existing|match|select/i);
  unchanged(sketch, { kind: 'remove-revolve', id: 'turned' }, /revolve|select|existing/i);
  unchanged(edit(sketch, { kind: 'extrude', id: 'boss', depth: '10' }), { kind: 'remove-revolve', id: 'boss' }, /revolve|select|existing/i);
});

test('explicit replacement of a lone extrusion retains its ID and undo restores the extrusion exactly', () => {
  const original = edit(edit(plain(), { kind: 'rectangle', prefix: 'r', width: '10', height: '12', origin: ['10', '0'] }), { kind: 'extrude', id: 'boss', depth: '-8 mm' });
  const replacement = turn(original, '90 deg', 'boss');
  assert.equal(replacement.graph.features.length, 2); assert.equal(replacement.graph.features[1]!.id, 'boss');
  assert.equal(replacement.graph.features[1]!.name, 'Revolve 1'); assert.equal(replacement.graph.features[1]!.kind, 'revolve');
  assert.deepEqual(replacement.graph.features[0], original.graph.features[0]);
  const state = history({ op: 'commit', history: history({ op: 'create', value: original }), value: replacement, label: 'Replace extrusion with revolve' });
  assert.deepEqual(history({ op: 'undo', history: state }).present, original);
  unchanged(original, { kind: 'revolve', id: 'other', axis: 'v', angle: '90' }, /ID|existing|match/i);
  for (const action of [{ kind: 'add-cut', id: 'cut' }, { kind: 'edge-feature', id: 'fillet', feature: 'fillet', edges: 'vertical', size: '1' }, { kind: 'edge-feature', id: 'chamfer', feature: 'chamfer', edges: 'top', size: '1' }]) {
    unchanged(edit(original, action), { kind: 'revolve', id: 'boss', axis: 'v', angle: '90' }, /downstream|after|following|remove/i);
  }
});

test('unsupported downstream commands never reinterpret or delete a revolve graph', () => {
  const content = turn();
  for (const action of [{ kind: 'extrude', id: 'other', depth: '10' }, { kind: 'remove-extrude' }, { kind: 'add-cut', id: 'cut' },
    { kind: 'edge-feature', id: 'edge', feature: 'fillet', edges: 'all', size: '1' }, { kind: 'edge-feature', id: 'edge', feature: 'chamfer', edges: 'all', size: '1' },
    { kind: 'remove-feature', id: 'turned' }]) unchanged(content, action, /extrud|revolv|cut|fillet|chamfer|select/i);
});

test('angle expressions join variable validation and use angular, not linear, resolution', () => {
  const sketch = edit(plain(), { kind: 'variable', name: 'sweep', source: '180 deg', dimensionKind: 'angle' });
  const content = turn(sketch, 'sweep / 2'); assert.equal(parameters(content).angleRad, Math.PI / 2);
  const changed = edit(content, { kind: 'variable', name: 'sweep', source: '-360 deg' }); assert.equal(parameters(changed).angleRad, -Math.PI);
  for (const action of [{ kind: 'remove-variable', name: 'sweep' }, { kind: 'variable', name: 'sweep', source: '900 deg' },
    { kind: 'variable', name: 'sweep', source: '0 deg' }, { kind: 'variable', name: 'sweep', source: '10 mm', dimensionKind: 'length' },
    { kind: 'variable', name: 'sweep', source: '10', dimensionKind: 'scalar' }]) unchanged(content, action, /sweep|angle|resolution/i);
  const coarseLength = plain(); coarseLength.tolerance.linearMm = .01;
  assert.equal(parameters(turn(coarseLength, '0.000001 rad')).angleRad, .000001);
  for (const angle of ['0', '0.000000001 rad', '-0.000000001 rad', '361 deg', '-361 deg', '1/0', 'missing']) {
    unchanged(content, { kind: 'revolve', id: 'turned', axis: 'v', angle }, /angle|sweep|resolution|zero|missing/i);
  }
});

test('unit binding and default planes preserve angular meaning and sketch-relative source after native reopen', () => {
  for (const angle of ['90', '-90 deg', '1.5 rad', 'sweep / 2']) {
    let content = edit(plain(), { kind: 'variable', name: 'sweep', source: '180', dimensionKind: 'angle' });
    content = edit(content, { kind: 'variable', name: 'width', source: '10' });
    content = edit(content, { kind: 'rectangle', prefix: 'r', width: 'width', height: '12', origin: ['10', '0'] });
    content = turn(content, angle); const originalAngle = parameters(content).angleRad;
    for (const units of ['inch', 'mm'] as const) for (const plane of ['XZ', 'YZ', 'XY'] as const) {
      content = edit(content, { kind: 'units', units }); content = edit(content, { kind: 'plane', plane });
      const reopened = roundtrip(content); assert.ok(!isSTEPSource(reopened)); assert.deepEqual(reopened, content);
      assert.equal(parameters(reopened).angleRad, originalAngle);
      assert.deepEqual((reopened.graph.features[1]!.definition as RevolveRecipeRequest['source']).axis, definition().axis);
      const context = cadExpressionPolicy({ units, variables: reopened.variables, linearMm: reopened.tolerance.linearMm }).context;
      assert.equal(context.variables.width!.value, 10);
      assert.equal(reopened.graph.features[0].definition.sketch.plane, plane);
    }
  }
});

test('sketch geometry may fail rebuild without losing the editable revolve feature', () => {
  const initial = edit(plain(), { kind: 'rectangle', prefix: 'r', width: '10', height: '12', origin: ['10', '0'] }), content = turn(initial);
  const crossed = edit(content, { kind: 'rectangle', prefix: 'changed', width: '30', height: '12', origin: ['-10', '0'] });
  assert.deepEqual(crossed.graph.features[1], content.graph.features[1]); assert.deepEqual(roundtrip(crossed), crossed);
  const empty = edit(content, { kind: 'clear' }); assert.deepEqual(empty.graph.features[1], content.graph.features[1]);
  assert.deepEqual(roundtrip(empty), empty);
});

test('revision exhaustion rejects every revolve edit without touching source or history', () => {
  const content = source(); content.graph.revision = Number.MAX_SAFE_INTEGER;
  for (const action of [{ kind: 'revolve', id: 'turned', axis: 'v', angle: '90' }, { kind: 'remove-revolve', id: 'turned' }, { kind: 'plane', plane: 'XZ' }]) unchanged(content, action, /revision limit/i);
});

test('legacy sketch, extrusion and imported STEP sources keep their prior format and asset behavior', () => {
  const sketch = plain(), extruded = edit(sketch, { kind: 'extrude', id: 'boss', depth: '10' });
  for (const value of [sketch, extruded]) assert.deepEqual(roundtrip(value), value);
  const imported = cadProjectSource({ operation: 'import', name: 'part.step', bytes: new Uint8Array([73, 83, 79]), units: 'inch', featureId: 'imported', assetId: 'source' });
  assert.ok(isSTEPSource(imported)); const encoded = cadProjectSource({ operation: 'encode', source: imported });
  assert.deepEqual(cadProjectSource({ operation: 'decode', ...encoded }), imported); assert.equal(encoded.assets.length, 1);
});
