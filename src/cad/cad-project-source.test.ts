import test from 'node:test';
import assert from 'node:assert/strict';
import { cadProjectSource, isSTEPSource } from './cad-project-source.ts';
import { editableCADContent } from './editable-cad-content.ts';

const source = () => cadProjectSource({ operation: 'import', name: 'plate.step', bytes: new Uint8Array([73,83,79]), units: 'mm', featureId: 'import-1', assetId: 'step-1' });
const failure = { name: 'CADSourceError' };
test('C66 legacy parametric files retain their exact native JSON and no assets', () => {
  const content = editableCADContent({ operation: 'new' });
  assert.deepEqual(cadProjectSource({ operation: 'decode', content, assets: [] }), content);
  assert.deepEqual(cadProjectSource({ operation: 'encode', source: content }), { content, assets: [] });
  assert.equal(isSTEPSource(content), false);
  assert.throws(() => cadProjectSource({ operation: 'decode', content, assets: [{ id: 'stray', mime: 'model/step', bytes: new Uint8Array([1]) }] }), failure);
});
test('C66 literal imported native source roundtrips exact metadata and independently owned bytes', () => {
  const bytes = Buffer.from([73,83,79]), value = cadProjectSource({ operation: 'import', name: 'plate.step', bytes, units: 'inch', featureId: 'import-1', assetId: 'step-1' });
  assert.ok(isSTEPSource(value)); bytes.fill(0); assert.deepEqual([...value.assets[0].bytes], [73,83,79]);
  assert.deepEqual(value.graph.features, [{ id: 'import-1', name: 'plate.step', kind: 'import', dependsOn: [], suppressed: false, definition: { assetId: 'step-1', placement: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] } }]);
  const encoded = cadProjectSource({ operation: 'encode', source: value });
  assert.deepEqual((encoded.content as any).assets, [{ id: 'step-1', name: 'plate.step', mime: 'model/step', byteLength: 3 }]);
  assert.equal(JSON.stringify(encoded.content).includes('bytes'), false);
  const decoded = cadProjectSource({ operation: 'decode', ...encoded }); assert.deepEqual(decoded, value);
  encoded.assets[0]!.bytes.fill(0); assert.deepEqual([...value.assets[0].bytes], [73,83,79]);
  assert.ok(isSTEPSource(decoded)); assert.deepEqual([...decoded.assets[0].bytes], [73,83,79]);
  const read = cadProjectSource({ operation: 'read', value }); assert.ok(isSTEPSource(read)); read.assets[0].bytes.fill(8); assert.equal(value.assets[0].bytes[0], 73);
});
test('C66 exact imported schema rejects unsupported geometry, metadata and asset relationships', () => {
  const changes = [
    (v:any) => v.extra = true, (v:any) => delete v.drawing, (v:any) => v.units = 'cm',
    (v:any) => v.tolerance.linearMm = Infinity, (v:any) => v.variables.push({name:'x'}),
    (v:any) => v.graph.features.push(structuredClone(v.graph.features[0])), (v:any) => v.graph.rollback = 0,
    (v:any) => v.graph.revision = -1, (v:any) => v.graph.features[0].suppressed = true,
    (v:any) => v.graph.features[0].dependsOn.push('other'), (v:any) => v.graph.features[0].definition.placement[3] = 1,
    (v:any) => v.graph.features[0].definition.extra = true, (v:any) => v.graph.features[0].definition.assetId = 'missing',
    (v:any) => v.assets[0].id = 'import-1', (v:any) => v.assets[0].name = '', (v:any) => v.assets[0].mime = 'image/png',
    (v:any) => v.assets[0].bytes = [], (v:any) => v.assets.push(structuredClone(v.assets[0])),
    (v:any) => v.appearance.mode = 'wireframe', (v:any) => v.drawing = {},
  ];
  for (const change of changes) { const v = structuredClone(source()); change(v); assert.throws(() => cadProjectSource({ operation: 'read', value: v }), failure); }
  const accessor = source(); Object.defineProperty(accessor, 'units', { enumerable: true, get() { throw new Error('accessor ran'); } });
  assert.throws(() => cadProjectSource({ operation: 'read', value: accessor }), failure);
  for (const change of [
    (p:any) => p.assets.length = 0, (p:any) => p.assets.push(structuredClone(p.assets[0])),
    (p:any) => p.assets[0].id = 'other', (p:any) => p.assets[0].mime = 'text/plain',
    (p:any) => p.content.assets[0].byteLength = 4, (p:any) => p.content.assets[0].extra = true,
    (p:any) => p.assets[0].extra = true,
  ]) { const p = cadProjectSource({ operation: 'encode', source: source() }); change(p); assert.throws(() => cadProjectSource({ operation: 'decode', ...p }), failure); }
});
test('C66 source size limits, immutable unit changes and revision exhaustion are atomic', () => {
  const value = source(), before = structuredClone(value);
  assert.ok(isSTEPSource(value));
  const inch = cadProjectSource({ operation: 'units', source: value, units: 'inch' });
  assert.ok(isSTEPSource(inch)); assert.equal(inch.units, 'inch'); assert.equal(inch.graph.revision, 1);
  assert.deepEqual(inch.assets, value.assets); assert.deepEqual(value, before);
  assert.equal(cadProjectSource({ operation: 'units', source: inch, units: 'inch' }).graph.revision, 1);
  assert.deepEqual(cadProjectSource({ operation: 'units', source: inch, units: 'mm' }).assets, value.assets);
  const exhausted = { ...value, graph: { ...value.graph, revision: Number.MAX_SAFE_INTEGER } };
  assert.throws(() => cadProjectSource({ operation: 'units', source: exhausted, units: 'inch' }), failure);
  assert.equal(exhausted.graph.revision, Number.MAX_SAFE_INTEGER);
  assert.throws(() => cadProjectSource({ operation: 'units', source: editableCADContent({operation:'new'}), units: 'inch' }), failure);
  for (const bytes of [new Uint8Array(), new Uint8Array(64*1024*1024+1)]) assert.throws(() => cadProjectSource({ operation: 'import', name: 'plate.step', bytes, units:'mm',featureId:'f',assetId:'a' }), failure);
});
