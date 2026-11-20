import { test } from 'node:test'; import assert from 'node:assert/strict';
import { imageContent, ImageContentError, TILE, type LayerMeta } from './image-content.ts';
import { createRaster, paintRaster } from './raster-ops.ts';
import { nativeContainer } from '../shared/native-container.ts';

const meta = (id: string, extra: Partial<LayerMeta> = {}): LayerMeta => ({ id, name: id, visible: true, opacity: 1, blend: 'normal', ...extra });

test('I-CONTENT imports and reopens a native project above the former 16M limit with exact edge pixels', () => {
  const width = 4097, height = 4096, raster = createRaster(width, height, [0, 0, 0, 0]);
  raster.data.set([12, 34, 56, 255]);
  raster.data.set([78, 90, 123, 0], raster.data.length - 4);
  const original = imageContent({ operation: 'layers', previous: null, width, height,
    layers: [{ meta: meta('scan'), raster }], activeLayerId: 'scan' });
  const encoded = imageContent({ operation: 'encode', value: original });
  const saved = nativeContainer({ op: 'encode', package: {
    project: { id: 'large-scan', title: 'Large scan', format: 'gsnv-image', version: 1, content: encoded.content },
    assets: encoded.assets.map(asset => ({ ...asset, mime: 'application/octet-stream' })),
  } });
  const opened = nativeContainer({ op: 'decode', parts: saved.parts });
  const decoded = imageContent({ operation: 'decode', content: opened.project.content, assets: opened.assets });
  assert.deepEqual([decoded.width, decoded.height, decoded.activeLayerId], [width, height, 'scan']);
  const first = decoded.layers[0]!.tiles[0]!, last = decoded.layers[0]!.tiles.at(-1)!;
  assert.deepEqual([...first.subarray(0, 4)], [12, 34, 56, 255]);
  assert.deepEqual([...last.subarray(last.length - 4)], [78, 90, 123, 0]);
  for (const [w, h] of [[8193, 8192], [16385, 1]]) {
    assert.throws(() => imageContent({ operation: 'new', width: w!, height: h!, fill: [0, 0, 0, 0] }), RangeError);
    assert.throws(() => imageContent({ operation: 'decode', content: { ...encoded.content, width: w, height: h }, assets: [] }), ImageContentError);
  }
});

test('I-CONTENT new documents have one opaque Background layer with clipped edge tiles', () => {
  const doc = imageContent({ operation: 'new', width: TILE + 10, height: 3, fill: [255, 255, 255, 255] });
  assert.deepEqual(doc.layers.map(l => [l.id, l.name, l.visible, l.opacity, l.blend]), [['background', 'Background', true, 1, 'normal']]);
  assert.equal(doc.layers[0]!.tiles.length, 2); assert.equal(doc.layers[0]!.tiles[1]!.length, 10 * 3 * 4); assert.ok(Object.isFrozen(doc));
  assert.throws(() => imageContent({ operation: 'new', width: 0, height: 1, fill: [0, 0, 0, 0] }), RangeError);
});

test('I-CONTENT layer updates share untouched tiles; stack edits reuse pixels without copies', () => {
  const doc = imageContent({ operation: 'new', width: TILE * 2, height: TILE, fill: [255, 255, 255, 255] }), raster = imageContent({ operation: 'raster', value: doc, layerId: 'background' });
  paintRaster(raster, { kind: 'stroke', points: [[TILE + 5, 5]], size: 1, color: [0, 0, 0, 255], tip: 'square' });
  const next = imageContent({ operation: 'update', previous: doc, layerId: 'background', raster });
  assert.equal(next.layers[0]!.tiles[0], doc.layers[0]!.tiles[0]); assert.notEqual(next.layers[0]!.tiles[1], doc.layers[0]!.tiles[1]);
  raster.data.fill(7); assert.equal(next.layers[0]!.tiles[1]![0], 255, 'snapshots do not alias the working raster');
  const stacked = imageContent({ operation: 'layers', previous: next, width: next.width, height: next.height, activeLayerId: 'copy', layers: [
    { meta: meta('background') }, { meta: meta('copy', { name: 'Copy', opacity: 0.5, blend: 'multiply' }), from: 'background' }, { meta: meta('new'), raster: createRaster(TILE * 2, TILE, [0, 0, 0, 0]) }] });
  assert.equal(stacked.layers[1]!.tiles[1], next.layers[0]!.tiles[1]); assert.equal(stacked.activeLayerId, 'copy'); assert.equal(stacked.layers[2]!.tiles[0]![3], 0);
  assert.throws(() => imageContent({ operation: 'layers', previous: next, width: 10, height: 10, activeLayerId: 'background', layers: [{ meta: meta('background') }] }), RangeError);
  assert.throws(() => imageContent({ operation: 'layers', previous: next, width: next.width, height: next.height, activeLayerId: 'x', layers: [{ meta: meta('background') }] }), RangeError);
  assert.throws(() => imageContent({ operation: 'layers', previous: next, width: next.width, height: next.height, activeLayerId: 'background', layers: [{ meta: meta('background', { blend: 'hue' as never }) }] }), RangeError);
  assert.throws(() => imageContent({ operation: 'update', previous: doc, layerId: 'nope', raster }), RangeError);
});

test('I-CONTENT dirty updates cross tile boundaries without changing pixels outside the declared region', () => {
  const width = TILE * 2 + 5, height = TILE + 3;
  const original = imageContent({ operation: 'new', width, height, fill: [31, 41, 59, 0] });
  const raster = imageContent({ operation: 'raster', value: original, layerId: 'background' });
  const dirty = { x: TILE - 1, y: TILE - 1, width: 4, height: 4 };
  for (let y = dirty.y; y < dirty.y + dirty.height; y++) for (let x = dirty.x; x < dirty.x + dirty.width; x++) raster.data.set([2, 7, 9, 255], (y * width + x) * 4);
  raster.data.set([99, 98, 97, 96], 0); // A separate preview outside this commit must not leak into the snapshot.
  const changed = imageContent({ operation: 'update', previous: original, layerId: 'background', raster, dirty });
  assert.notEqual(changed, original);
  for (let i = 0; i < original.layers[0]!.tiles.length; i++) {
    if ([0, 1, 3, 4].includes(i)) assert.notEqual(changed.layers[0]!.tiles[i], original.layers[0]!.tiles[i]);
    else assert.equal(changed.layers[0]!.tiles[i], original.layers[0]!.tiles[i]);
  }
  const pixels = imageContent({ operation: 'raster', value: changed, layerId: 'background' }).data;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const expected = x >= dirty.x && x < dirty.x + dirty.width && y >= dirty.y && y < dirty.y + dirty.height ? [2, 7, 9, 255] : [31, 41, 59, 0];
    const index = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) assert.equal(pixels[index + c], expected[c]);
  }
  raster.data.fill(13);
  assert.deepEqual([...changed.layers[0]!.tiles[4]!.subarray(0, 4)], [2, 7, 9, 255], 'changed tiles must own their bytes');
  assert.deepEqual([...original.layers[0]!.tiles[4]!.subarray(0, 4)], [31, 41, 59, 0], 'undo pixels must remain exact');
});

test('I-CONTENT dirty updates clip safely and unchanged or empty updates retain snapshot identity', () => {
  const original = imageContent({ operation: 'new', width: 4, height: 3, fill: [1, 2, 3, 4] });
  const raster = imageContent({ operation: 'raster', value: original, layerId: 'background' });
  assert.equal(imageContent({ operation: 'update', previous: original, layerId: 'background', raster }), original);
  assert.equal(imageContent({ operation: 'update', previous: original, layerId: 'background', raster, dirty: { x: 1, y: 1, width: 2, height: 2 } }), original);
  raster.data.fill(77);
  for (const dirty of [{ x: 1, y: 1, width: 0, height: 1 }, { x: 1, y: 1, width: 1, height: 0 }, { x: -5, y: -5, width: 2, height: 2 }, { x: 4, y: 0, width: 2, height: 2 }])
    assert.equal(imageContent({ operation: 'update', previous: original, layerId: 'background', raster, dirty }), original);
  const clipped = imageContent({ operation: 'update', previous: original, layerId: 'background', raster, dirty: { x: -3, y: -2, width: 5, height: 4 } });
  const pixels = imageContent({ operation: 'raster', value: clipped, layerId: 'background' }).data;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) assert.deepEqual([...pixels.subarray((y * 4 + x) * 4, (y * 4 + x + 1) * 4)], x < 2 && y < 2 ? [77, 77, 77, 77] : [1, 2, 3, 4]);
  for (const dirty of [null, { x: 0.5, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: -1, height: 1 },
    { x: NaN, y: 0, width: 1, height: 1 }, { x: 0, y: Infinity, width: 1, height: 1 }, { x: Number.MAX_SAFE_INTEGER, y: 0, width: 1, height: 1 }])
    assert.throws(() => imageContent({ operation: 'update', previous: original, layerId: 'background', raster, dirty: dirty as never }), RangeError);
  assert.throws(() => imageContent({ operation: 'update', previous: original, layerId: 'missing', raster, dirty: { x: 0, y: 0, width: 0, height: 0 } }), RangeError);
});

test('I-CONTENT native encode/decode is byte exact per layer and still opens single-layer projects', () => {
  const base = imageContent({ operation: 'new', width: 3, height: 2, fill: [1, 2, 3, 4] });
  const doc = imageContent({ operation: 'layers', previous: base, width: 3, height: 2, activeLayerId: 'top', layers: [{ meta: meta('background') }, { meta: meta('top', { name: 'Top', visible: false, opacity: 0.25, blend: 'screen' }), raster: createRaster(3, 2, [9, 8, 7, 6]) }] });
  const encoded = imageContent({ operation: 'encode', value: doc });
  assert.equal(encoded.content.encoding, 'rgba8-layers-v3'); assert.deepEqual(encoded.assets.map(a => a.id), ['pixels-0', 'pixels-1']); assert.deepEqual([...encoded.assets[1]!.bytes.slice(0, 4)], [9, 8, 7, 6]);
  const decoded = imageContent({ operation: 'decode', content: JSON.parse(JSON.stringify(encoded.content)), assets: encoded.assets.map(a => ({ id: a.id, bytes: a.bytes.slice() })) });
  assert.deepEqual(decoded, doc);
  const legacy = imageContent({ operation: 'decode', content: { width: 3, height: 2, encoding: 'rgba8', asset: 'pixels' }, assets: [{ id: 'pixels', bytes: new Uint8Array(24).fill(5) }] });
  assert.deepEqual(legacy.layers.map(l => l.name), ['Background']); assert.equal(legacy.layers[0]!.tiles[0]![0], 5);
  for (const content of [null, [], { ...encoded.content, extra: 1 }, { ...encoded.content, width: 0 }, { ...encoded.content, layers: [{ ...encoded.content.layers[0], blend: 'hue' }] }, { ...encoded.content, activeLayerId: 'missing' }])
    assert.throws(() => imageContent({ operation: 'decode', content, assets: encoded.assets }), ImageContentError);
  assert.throws(() => imageContent({ operation: 'decode', content: encoded.content, assets: [encoded.assets[0]!] }), ImageContentError);
});

test('I51 selection is owned, retained by pixel/layer edits, cleared by resize, and encoded exactly', () => {
  const before = imageContent({ operation: 'new', width: 3, height: 2, fill: [9, 8, 7, 0] });
  const mask = new Uint8Array([0, 1, 128, 0, 255, 0]);
  const selected = imageContent({ operation: 'selection', previous: before, mask });
  assert.equal(before.selection, null); assert.deepEqual([...selected.selection!.mask], [0, 1, 128, 0, 255, 0]);
  mask.fill(0); assert.equal(selected.selection!.mask[1], 1);
  assert.equal(imageContent({ operation: 'selection', previous: selected, mask: selected.selection!.mask.slice() }), selected, 'unchanged coverage is a no-op history snapshot');
  assert.equal(imageContent({ operation: 'selection', previous: before, mask: new Uint8Array(6) }), before, 'empty and null selections are the same state');
  const raster = imageContent({ operation: 'raster', value: selected, layerId: 'background' }); raster.data[0] = 30;
  const painted = imageContent({ operation: 'update', previous: selected, layerId: 'background', raster });
  assert.equal(painted.selection, selected.selection);
  const stacked = imageContent({ operation: 'layers', previous: painted, width: 3, height: 2, activeLayerId: 'background', layers: [{ meta: meta('background', { opacity: 0.5 }) }] });
  assert.equal(stacked.selection, selected.selection);
  const encoded = imageContent({ operation: 'encode', value: stacked });
  assert.deepEqual(encoded.content, { width: 3, height: 2, encoding: 'rgba8-layers-v3', policy:{mode:'pixel-art',palette:null}, activeLayerId: 'background',
    layers: [{ id: 'background', name: 'background', visible: true, opacity: 0.5, blend: 'normal', asset: 'pixels-0' }], selection: { encoding: 'gray8', asset: 'selection' } });
  assert.deepEqual(encoded.assets.map(a => [a.id, [...a.bytes]]), [
    ['pixels-0', [30, 8, 7, 0, 9, 8, 7, 0, 9, 8, 7, 0, 9, 8, 7, 0, 9, 8, 7, 0, 9, 8, 7, 0]], ['selection', [0, 1, 128, 0, 255, 0]],
  ]);
  assert.deepEqual(imageContent({ operation: 'decode', ...encoded }), stacked);
  encoded.assets[1]!.bytes.fill(0); assert.equal(stacked.selection!.mask[1], 1);
  const resized = imageContent({ operation: 'layers', previous: selected, width: 2, height: 2, activeLayerId: 'background', layers: [{ meta: meta('background'), raster: createRaster(2, 2, [0, 0, 0, 0]) }] });
  assert.equal(resized.selection, null);
  assert.equal(imageContent({ operation: 'selection', previous: selected, mask: new Uint8Array(6) }).selection, null);
  assert.throws(() => imageContent({ operation: 'selection', previous: selected, mask: new Uint8Array(5) }), RangeError);
});

test('I51 legacy layers migrate with no selection and malformed v2 selection assets fail atomically', () => {
  const value = imageContent({ operation: 'new', width: 2, height: 1, fill: [1, 2, 3, 4] });
  const encoded = imageContent({ operation: 'encode', value: imageContent({ operation: 'selection', previous: value, mask: new Uint8Array([0, 255]) }) });
  const { selection: _selection, policy: _policy, ...fields } = encoded.content;
  const legacy = imageContent({ operation: 'decode', content: { ...fields, encoding: 'rgba8-layers' }, assets: encoded.assets.slice(0, 1) });
  assert.deepEqual(legacy, value);
  for (const selection of [{ encoding: 'other', asset: 'selection' }, { encoding: 'gray8', asset: 'pixels-0' }, { encoding: 'gray8', asset: 'missing' }, { encoding: 'gray8', asset: 'selection', bounds: {} }, 'selection'])
    assert.throws(() => imageContent({ operation: 'decode', content: { ...encoded.content, selection }, assets: encoded.assets }), ImageContentError);
  for (const assets of [encoded.assets.slice(0, 1), [...encoded.assets, encoded.assets[1]!], [encoded.assets[0]!, { id: 'selection', bytes: new Uint8Array(3) }]])
    assert.throws(() => imageContent({ operation: 'decode', content: encoded.content, assets }), ImageContentError);
  assert.throws(() => imageContent({ operation: 'decode', content: { ...encoded.content, encoding: 'rgba8-layers-v4' }, assets: encoded.assets }), ImageContentError);
  assert.deepEqual(imageContent({ operation: 'decode', ...encoded }).selection!.bounds, { x: 1, y: 0, width: 1, height: 1 });
});

test('PU-05 document policy survives all edits and v3 serialization while legacy pixels stay exact', () => {
 const policy={mode:'smooth' as const,palette:{colours:[[0,0,0],[255,255,255]] as const,dither:'bayer' as const}};
 const original=imageContent({operation:'new',width:2,height:1,fill:[23,45,67,128],policy});
 assert.deepEqual(original.policy,policy);
 const edited=imageContent({operation:'update',previous:original,layerId:'background',raster:createRaster(2,1,[4,3,2,9])});
 const resized=imageContent({operation:'layers',previous:edited,width:1,height:1,layers:[{meta:meta('background'),raster:createRaster(1,1,[4,3,2,9])}],activeLayerId:'background'});
 assert.deepEqual(resized.policy,policy);
 const encoded=imageContent({operation:'encode',value:original});assert.equal(encoded.content.encoding,'rgba8-layers-v3');
 assert.deepEqual(imageContent({operation:'decode',...encoded}),original);
 const {policy: ignored,...v2}=encoded.content;
 const migrated=imageContent({operation:'decode',content:{...v2,encoding:'rgba8-layers-v2'},assets:encoded.assets});
 assert.deepEqual(migrated.policy,{mode:'pixel-art',palette:null});
 assert.deepEqual([...imageContent({operation:'raster',value:migrated,layerId:'background'}).data],[23,45,67,128,23,45,67,128]);
 const changed=imageContent({operation:'policy',previous:original,policy:{mode:'pixel-art',palette:null}});
 assert.equal(changed.layers[0]!.tiles[0],original.layers[0]!.tiles[0]);
 for(const bad of [null,{mode:'gaussian',palette:null},{...policy,extra:true},{mode:'smooth',palette:{colours:[[300,0,0]],dither:'bayer'}}])
  assert.throws(()=>imageContent({operation:'decode',content:{...encoded.content,policy:bad},assets:encoded.assets}),ImageContentError);
});
