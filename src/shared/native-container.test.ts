import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { nativeContainer, ContainerFormatError, ContainerLimitError } from './native-container.ts';
import { projectFormat, ProjectFormatError, type ProjectEnvelope } from './project-format.ts';

const utf8 = new TextEncoder();
const project: ProjectEnvelope = { format: 'gsnv-image', version: 1, id: 'p1', title: 'Pixels', content: { width: 1, height: 1 } };
const asset = { id: 'tile-0', mime: 'application/octet-stream', bytes: new Uint8Array([0, 255, 1]) };
const manifest = '{"assets":[{"crc32":459412726,"id":"tile-0","length":3,"mime":"application/octet-stream"}],"project":{"content":{"height":1,"width":1},"format":"gsnv-image","id":"p1","title":"Pixels","version":1}}';
// Header/CRC independently calculated with Python struct/zlib before implementation.
const golden = new Uint8Array(Buffer.concat([Buffer.from('47534e56504b310ac5000000', 'hex'), Buffer.from(manifest), asset.bytes]));
const MAX_MANIFEST = 64 * 1024 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024 * 1024;
type Encoded = ReturnType<typeof nativeContainer<{ op: 'encode'; package: { project: ProjectEnvelope; assets: typeof asset[] } }>>;
const joined = (result: Encoded) => new Uint8Array(Buffer.concat(result.parts));
const invoke = (value: unknown) => nativeContainer(value as Parameters<typeof nativeContainer>[0]);
const descriptor = (bytes = asset.bytes, id = asset.id) => ({ id, mime: asset.mime, length: bytes.length, crc32: crc32(bytes) });
function wire(value: unknown, payload: readonly Uint8Array[] = []): Uint8Array[] {
  return wireText(JSON.stringify(value), payload);
}
function wireText(text: string, payload: readonly Uint8Array[] = []): Uint8Array[] {
  const bytes = utf8.encode(text); const header = new Uint8Array(12);
  header.set(utf8.encode('GSNVPK1\n')); new DataView(header.buffer).setUint32(8, bytes.length, true);
  return [header, bytes, ...payload];
}
const decode = (parts: readonly Uint8Array[]) => nativeContainer({ op: 'decode', parts });

test('S15 golden wire bytes and complete decoded package match independent fixture', () => {
  const encoded = nativeContainer({ op: 'encode', package: { project, assets: [asset] } });
  assert.equal(encoded.byteLength, 212); assert.deepEqual(joined(encoded), golden);
  assert.deepEqual(decode([golden]), { project, assets: [asset] });
});

test('S15 every split boundary, bytewise parts and empty parts preserve the golden', () => {
  for (let split = 0; split <= golden.length; split++) {
    assert.deepEqual(decode([new Uint8Array(), golden.subarray(0, split), new Uint8Array(), golden.subarray(split), new Uint8Array()]), { project, assets: [asset] });
  }
  assert.deepEqual(decode(Array.from(golden, byte => new Uint8Array([byte]))), { project, assets: [asset] });
});

test('S15 every truncated prefix and one trailing byte are rejected', () => {
  for (let length = 0; length < golden.length; length++) assert.throws(() => decode([golden.subarray(0, length)]), ContainerFormatError);
  assert.throws(() => decode([golden, new Uint8Array([0])]), ContainerFormatError);
  assert.throws(() => decode([]), ContainerFormatError);
});

test('S15 checks known IEEE CRC vectors and distinct subviews of one buffer', () => {
  const shared = new Uint8Array([9, 0, 255, 1, 8, 7]);
  const assets = [
    { ...asset, id: 'empty', bytes: new Uint8Array() },
    { ...asset, id: 'known', bytes: utf8.encode('123456789') },
    { ...asset, id: 'slice-a', bytes: shared.subarray(1, 4) },
    { ...asset, id: 'slice-b', bytes: shared.subarray(4) },
  ];
  const encoded = nativeContainer({ op: 'encode', package: { project, assets } });
  const bytes = joined(encoded); const length = new DataView(bytes.buffer).getUint32(8, true);
  const records = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length))).assets;
  assert.deepEqual(records.map((record: { crc32: number }) => record.crc32), [0, 3421780262, 459412726, crc32(shared.subarray(4))]);
  assert.deepEqual(decode(encoded.parts), { project, assets });
});

test('S15 zero assets differ from an empty asset; IDs and order remain opaque', () => {
  for (const assets of [[], [{ ...asset, bytes: new Uint8Array() }], ['constructor', ' A:B ', '😀', '...'].map(id => ({ ...asset, id }))]) {
    assert.deepEqual(decode(nativeContainer({ op: 'encode', package: { project, assets } }).parts), { project, assets });
  }
});

test('S15 valid noncanonical JSON order/whitespace is accepted', () => {
  assert.deepEqual(decode(wireText(JSON.stringify({ project, assets: [descriptor()] }, null, 2), [asset.bytes])), { project, assets: [asset] });
});

test('S15 Unicode metadata and identifiers survive byte splits inside UTF-8', () => {
  const sample = { project: { ...project, title: '🖌 café 日本語', content: { 'é': '🙂' } }, assets: [{ ...asset, id: '层🎨' }] };
  const bytes = joined(nativeContainer({ op: 'encode', package: sample }));
  assert.deepEqual(decode(Array.from(bytes, byte => new Uint8Array([byte]))), sample);
});

test('S15 damaged payload or manifest checksum is rejected before any result', () => {
  const damaged = Uint8Array.from(golden); damaged[damaged.length - 1] = 2;
  assert.throws(() => decode([damaged]), ContainerFormatError);
  assert.throws(() => decode(wire({ project, assets: [{ ...descriptor(), crc32: 459412727 }] }, [asset.bytes])), ContainerFormatError);
  assert.throws(() => decode(wire({ project, assets: [{ ...descriptor(), length: 2 }] }, [asset.bytes])), ContainerFormatError);
  assert.throws(() => decode(wire({ project, assets: [{ ...descriptor(), length: 4 }] }, [asset.bytes])), ContainerFormatError);
});

test('S15 rejects future or malformed magic and invalid manifest encodings', () => {
  for (let index = 0; index < 8; index++) {
    const bytes = Uint8Array.from(golden); bytes[index] = bytes[index]! ^ 1;
    assert.throws(() => decode([bytes]), ContainerFormatError);
  }
  for (const text of ['', '{', 'null', '[]', '{}', '\uFEFF{}']) assert.throws(() => decode(wireText(text)), ContainerFormatError);
  const invalid = wireText('{}'); invalid[1]![0] = 255;
  assert.throws(() => decode(invalid), ContainerFormatError);
});

test('S15 manifest and descriptor schemas are exact', () => {
  const broken = [
    { project }, { assets: [] }, { project, assets: {}, }, { project, assets: null },
    { project, assets: [], extra: true }, { project, assets: [null] },
    { project, assets: [{ id: 'a', mime: 'x', length: 0 }] },
    { project, assets: [{ ...descriptor(), extra: true }] },
  ];
  for (const value of broken) assert.throws(() => decode(wire(value, [asset.bytes])), ContainerFormatError);
});

test('S15 rejects negative, fractional, unsafe lengths and non-uint32 checksums', () => {
  for (const length of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '3', null]) {
    assert.throws(() => decode(wire({ project, assets: [{ ...descriptor(), length }] }, [asset.bytes])), ContainerFormatError);
  }
  for (const checksum of [-1, 2 ** 32, 0.5, '0', null]) {
    assert.throws(() => decode(wire({ project, assets: [{ ...descriptor(), crc32: checksum }] }, [asset.bytes])), ContainerFormatError);
  }
});

test('S15 IDs reject paths and duplicates; MIME and IDs must be nonempty strings', () => {
  for (const id of ['', '.', '..', 'a/b', 'a\\b', '\0', 1, null]) {
    assert.throws(() => invoke({ op: 'encode', package: { project, assets: [{ ...asset, id }] } }), ContainerFormatError);
    assert.throws(() => decode(wire({ project, assets: [{ ...descriptor(), id }] }, [asset.bytes])), ContainerFormatError);
  }
  for (const mime of ['', null, 1]) {
    assert.throws(() => invoke({ op: 'encode', package: { project, assets: [{ ...asset, mime }] } }), ContainerFormatError);
    assert.throws(() => decode(wire({ project, assets: [{ ...descriptor(), mime }] }, [asset.bytes])), ContainerFormatError);
  }
  assert.throws(() => nativeContainer({ op: 'encode', package: { project, assets: [asset, asset] } }), ContainerFormatError);
  assert.throws(() => decode(wire({ project, assets: [descriptor(), descriptor()] }, [asset.bytes, asset.bytes])), ContainerFormatError);
});

test('S15 rejects malformed requests, non-byte parts, sparse parts/assets and getters', () => {
  for (const value of [null, {}, { op: 'other' }, { op: 'encode', package: null }, { op: 'decode', parts: null }, { op: 'decode', parts: new Uint8Array(12) }]) assert.throws(() => invoke(value), ContainerFormatError);
  for (const bad of [[1, 2], new Uint16Array(4), new DataView(new ArrayBuffer(12)), null]) {
    assert.throws(() => invoke({ op: 'decode', parts: [bad] }), ContainerFormatError);
    assert.throws(() => invoke({ op: 'encode', package: { project, assets: [{ ...asset, bytes: bad }] } }), ContainerFormatError);
  }
  assert.throws(() => decode(new Array<Uint8Array>(1)), ContainerFormatError);
  assert.throws(() => nativeContainer({ op: 'encode', package: { project, assets: new Array<typeof asset>(1) } }), ContainerFormatError);
  const getter = { ...asset }; Object.defineProperty(getter, 'id', { get() { throw new Error('Accessor must not execute'); } });
  assert.throws(() => nativeContainer({ op: 'encode', package: { project, assets: [getter] } }), ContainerFormatError);
});

test('S15 operation accessors are rejected without execution', () => {
  let calls = 0;
  const accessor = { get op() { calls++; throw new Error('Operation accessor ran'); } };
  for (const request of [accessor, Object.create(accessor)]) {
    assert.throws(() => invoke(request), ContainerFormatError);
    assert.equal(calls, 0);
  }
});

test('S15 asset-count boundary accepts 20000 and rejects 20001 on both paths', () => {
  const empty = new Uint8Array(); const assets = Array.from({ length: 20000 }, (_, index) => ({ id: `a${index}`, mime: 'x', bytes: empty }));
  const encoded = nativeContainer({ op: 'encode', package: { project, assets } });
  assert.deepEqual(decode(encoded.parts), { project, assets });
  const extra = [...assets, { ...asset, id: 'extra', bytes: empty }];
  assert.throws(() => nativeContainer({ op: 'encode', package: { project, assets: extra } }), ContainerLimitError);
  assert.throws(() => decode(wire({ project, assets: extra.map(({ id, mime }) => ({ id, mime, length: 0, crc32: 0 })) })), ContainerLimitError);
});

test('S15 declared or actual excessive totals fail before checksum/allocation', () => {
  for (const length of [MAX_TOTAL, MAX_TOTAL + 1, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => decode(wire({ project, assets: [{ ...descriptor(), length }] })), ContainerLimitError);
  }
  const header = Uint8Array.from(golden.subarray(0, 12));
  for (const length of [MAX_MANIFEST + 1, 0xffffffff]) {
    new DataView(header.buffer).setUint32(8, length, true);
    assert.throws(() => decode([header]), ContainerLimitError);
  }
  const block = new Uint8Array(2 * 1024 * 1024);
  assert.throws(() => decode([...Array<Uint8Array>(1024).fill(block), new Uint8Array([0])]), ContainerLimitError);
  const assets = Array.from({ length: 1024 }, (_, index) => ({ ...asset, id: String(index), bytes: block }));
  assert.throws(() => nativeContainer({ op: 'encode', package: { project, assets } }), ContainerLimitError);
});

test('S15 inclusive 2 GiB total counts header and manifest using repeated immutable views', () => {
  const block = new Uint8Array(2 * 1024 * 1024); const final = new Uint8Array(block.length - 256 * 1024);
  const assets = Array.from({ length: 1024 }, (_, index) => ({ id: `a${index}`, mime: 'x', bytes: index === 1023 ? final : block }));
  const blockCrc = crc32(block); const lastCrc = crc32(final);
  const descriptors = assets.map(value => ({ id: value.id, mime: value.mime, length: value.bytes.length, crc32: value.bytes === block ? blockCrc : lastCrc }));
  const unpadded = { ...project, title: '' };
  const length = 12 + utf8.encode(JSON.stringify({ project: unpadded, assets: descriptors })).length + assets.reduce((sum, value) => sum + value.bytes.length, 0);
  const padded = { ...unpadded, title: 'x'.repeat(MAX_TOTAL - length) };
  const encoded = nativeContainer({ op: 'encode', package: { project: padded, assets } });
  assert.equal(encoded.byteLength, MAX_TOTAL);
  assert.equal(encoded.parts.reduce((sum, part) => sum + part.length, 0), MAX_TOTAL);
  const decoded = decode(encoded.parts); assert.equal(decoded.project.title, padded.title);
  assert.equal(decoded.assets.length, 1024);
  for (let index = 0; index < assets.length; index++) {
    assert.equal(decoded.assets[index]!.id, assets[index]!.id); assert.deepEqual(decoded.assets[index]!.bytes, assets[index]!.bytes);
  }
  assert.throws(() => nativeContainer({ op: 'encode', package: { project: { ...padded, title: padded.title + 'x' }, assets } }), ContainerLimitError);
});

test('S15 inclusive 64 MiB UTF-8 manifest boundary counts container metadata', () => {
  const empty = { ...project, title: '' };
  const overhead = utf8.encode(JSON.stringify({ project: empty, assets: [] })).length;
  const exact = { ...empty, title: 'a'.repeat(MAX_MANIFEST - overhead) };
  const encoded = nativeContainer({ op: 'encode', package: { project: exact, assets: [] } });
  assert.equal(encoded.byteLength, MAX_MANIFEST + 12);
  assert.equal(decode(encoded.parts).project.title.length, exact.title.length);
  assert.throws(() => nativeContainer({ op: 'encode', package: { project: { ...exact, title: exact.title + 'a' }, assets: [] } }), ContainerLimitError);
});

test('S15 propagates S03 errors for invalid project metadata without coercion', () => {
  for (const bad of [{ ...project, version: 2 }, { ...project, format: 'future' }, { ...project, content: { constructor: 1 } }]) {
    assert.throws(() => invoke({ op: 'encode', package: { project: bad, assets: [] } }), ProjectFormatError);
    assert.throws(() => decode(wire({ project: bad, assets: [] })), ProjectFormatError);
  }
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const content of [cycle, NaN, Infinity, undefined]) assert.throws(() => invoke({ op: 'encode', package: { project: { ...project, content }, assets: [] } }), ProjectFormatError);
});

test('S15 real S03 seam preserves negative zero and 15000-level metadata', () => {
  let content: ProjectEnvelope['content'] = -0;
  for (let depth = 0; depth < 15000; depth++) content = [content];
  const deep = { ...project, content }; const text = projectFormat({ op: 'encode', project: deep });
  const decoded = decode(nativeContainer({ op: 'encode', package: { project: projectFormat({ op: 'decode', text }), assets: [] } }).parts);
  assert.equal(projectFormat({ op: 'encode', project: decoded.project }), text);
  let leaf = decoded.project.content;
  for (let depth = 0; depth < 15000; depth++) { assert.ok(Array.isArray(leaf)); leaf = leaf[0]!; }
  assert.ok(Object.is(leaf, -0));
});

test('S15 deterministic roundtrip properties retain bytes, order and immutable inputs', () => {
  for (let seed = 0; seed < 80; seed++) {
    const assets = Array.from({ length: seed % 7 }, (_, index) => ({ id: `${seed}-${index}`, mime: 'image/raw', bytes: Uint8Array.from({ length: (seed * 17 + index) % 127 }, (_, offset) => (offset * 31 + seed) % 256) }));
    const sample = Object.freeze({ project: Object.freeze({ ...project, content: Object.freeze({ z: seed, a: -0 }), format: (['gsnv-cad', 'gsnv-image', 'gsnv-video'] as const)[seed % 3]! }), assets: Object.freeze(assets.map(value => Object.freeze(value))) });
    const original = assets.map(value => value.bytes.slice());
    const encoded = nativeContainer({ op: 'encode', package: sample }); const bytes = joined(encoded);
    const parts = []; for (let offset = 0; offset < bytes.length; offset += 13) parts.push(bytes.subarray(offset, offset + 13));
    const decoded = decode(Object.freeze(parts)); assert.deepEqual(decoded, sample);
    assert.deepEqual(joined(nativeContainer({ op: 'encode', package: decoded })), bytes);
    assets.forEach((value, index) => assert.deepEqual(value.bytes, original[index]));
    assert.deepEqual(joined(encoded), bytes);
  }
});
