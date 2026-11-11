/**
 * PURPOSE    Frame native project packages as validated binary containers.
 * KIND       CORE
 * CONTRACT   IN: encode a NativePackage or decode dense Uint8Array parts. Callers
 *            retain immutable reachable byte buffers throughout the result's use.
 *            OUT: segmented encoded bytes/total byteLength or a validated package.
 *            V1 is GSNVPK1\n, u32LE manifest length, canonical UTF-8 manifest
 *            {assets:[{crc32,id,length,mime}],project}, then ordered asset bytes.
 *            At most 20,000 assets, 64 MiB manifest, 2 GiB entire container inclusive.
 *            IDs are unique nonempty identifiers without slash, backslash, NUL,
 *            or the exact names . and ..; MIME strings are nonempty. Zero-byte
 *            assets are valid. CRC32 IEEE covers each exact asset's bytes.
 *            Decode accepts valid JSON key order/whitespace, rejects wrong schema,
 *            bad UTF-8, future magic, truncation, trailing bytes and bad checksums.
 *            RAISES: ContainerFormatError for malformed inputs/framing/schema/CRC;
 *            ContainerLimitError for declared or actual container limits.
 * GUARANTEES Deterministic, no I/O, no input mutation, no whole-payload flattening,
 *            no partial decode result. S03 preserves deep metadata and negative zero.
 * TUNING     MAX_ASSETS=20,000; MAX_MANIFEST_BYTES=64 MiB; MAX_TOTAL_BYTES=2 GiB.
 *            These are format limits; changing them requires a contract review.
 * DECISIONS  D1: Borrow immutable byte views; copy only assets split across parts.
 *            Alternative: flatten every package; rejected for peak memory cost.
 *            Revisit if: consumers cannot retain immutable byte ownership.
 *            D2: Memoize CRC by byte-view identity within one call. Alternative:
 *            hash repeated immutable assets again; rejected for avoidable work.
 *            Revisit if: byte ownership changes or measured memory cost dominates.
 *            D3: Embed S03 canonical project text. Alternative: JSON.stringify;
 *            rejected because it loses -0 and fails on valid deep metadata.
 *            Revisit if: the shared metadata format changes.
 * LIMITS     Propagates S03 ProjectFormatError. CRC detects damage, not authenticity.
 *            Domain schemas/references are validated by workspace codecs. A split
 *            asset needs one contiguous allocation; memory availability is external.
 * TESTBENCH  src/shared/native-container.test.ts -- run with: node --import tsx --test src/shared/native-container.test.ts
 */

import { projectFormat, type ProjectEnvelope } from './project-format.ts';
type NativeAsset = { readonly id: string; readonly mime: string; readonly bytes: Uint8Array };
type NativePackage = { readonly project: ProjectEnvelope; readonly assets: readonly NativeAsset[] };
type EncodeRequest = { op: 'encode'; package: NativePackage };
type DecodeRequest = { op: 'decode'; parts: readonly Uint8Array[] };
type ContainerRequest = EncodeRequest | DecodeRequest;
type EncodedContainer = { parts: readonly Uint8Array[]; byteLength: number };
type ContainerOutput<T extends ContainerRequest> = T extends EncodeRequest ? EncodedContainer : NativePackage;
export class ContainerFormatError extends Error { override name = 'ContainerFormatError'; }
export class ContainerLimitError extends Error { override name = 'ContainerLimitError'; }

const MAX_ASSETS = 20000;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAGIC = new Uint8Array([71, 83, 78, 86, 80, 75, 49, 10]);
const HEADER_BYTES = 12;
const CRC_POLYNOMIAL = 0xedb88320; // IEEE 802.3 reflected polynomial; fixed by v1.
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? CRC_POLYNOMIAL : 0);
  return crc >>> 0;
});
type AssetEntry = { id: string; mime: string; length: number; crc32: number };

function invalid(message: string): never { throw new ContainerFormatError(message); }
function limited(message: string): never { throw new ContainerLimitError(message); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) invalid('Container fields must be plain records.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key) || !descriptors[key]!.enumerable || !('value' in descriptors[key]!))) invalid('Container record has missing, extra or accessor fields.');
  return value as Record<string, unknown>;
}
function dense(value: unknown): unknown[] {
  if (!Array.isArray(value) || Reflect.ownKeys(value).length !== value.length + 1) invalid('Container lists must be dense arrays.');
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid('Container lists must contain indexed data values.');
  }
  return value;
}
function byteView(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) invalid('Container parts and assets must be Uint8Array bytes.');
  return value;
}
function names(value: Record<string, unknown>, ids: Set<string>): { id: string; mime: string } {
  const { id, mime } = value;
  if (typeof id !== 'string' || !id || /[\/\\\0]/.test(id) || id === '.' || id === '..') invalid('Asset ID must be a nonempty identifier, not a path.');
  if (ids.has(id)) invalid(`Duplicate asset ID: ${JSON.stringify(id)}.`);
  if (typeof mime !== 'string' || !mime) invalid('Asset MIME must be a nonempty string.');
  ids.add(id); return { id, mime };
}
function checkedTotal(bytes: number): number {
  if (bytes > MAX_TOTAL_BYTES) limited('Native container exceeds 2 GiB.');
  return bytes;
}
function assetList(value: unknown): unknown[] {
  const list = dense(value);
  if (list.length > MAX_ASSETS) limited('Native container exceeds 20,000 assets.');
  return list;
}
function checksumReader(): (bytes: Uint8Array) => number {
  const known = new Map<Uint8Array, number>();
  return bytes => {
    const cached = known.get(bytes); if (cached !== undefined) return cached;
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255]!;
    const result = (crc ^ 0xffffffff) >>> 0; known.set(bytes, result); return result;
  };
}
function manifestBytes(projectText: string, entries: readonly AssetEntry[]): Uint8Array {
  const chunks: string[] = []; const encoder = new TextEncoder(); let length = 0;
  const append = (text: string) => {
    length += encoder.encode(text).length;
    if (length > MAX_MANIFEST_BYTES) limited('Native manifest exceeds 64 MiB.');
    chunks.push(text);
  };
  const quoted = (text: string) => {
    if (text.length > MAX_MANIFEST_BYTES) limited('Native manifest exceeds 64 MiB.');
    append(JSON.stringify(text));
  };
  append('{"assets":[');
  entries.forEach((entry, index) => {
    append(`${index ? ',' : ''}{"crc32":${entry.crc32},"id":`); quoted(entry.id);
    append(`,"length":${entry.length},"mime":`); quoted(entry.mime); append('}');
  });
  append('],"project":'); append(projectText); append('}');
  return encoder.encode(chunks.join(''));
}
function encode(value: unknown): EncodedContainer {
  const source = record(value, ['project', 'assets']); const ids = new Set<string>();
  let total = HEADER_BYTES;
  const assets = assetList(source.assets).map(value => {
    const item = record(value, ['id', 'mime', 'bytes']); const name = names(item, ids); const bytes = byteView(item.bytes);
    total = checkedTotal(total + bytes.length); return { ...name, bytes };
  });
  const projectText = projectFormat({ op: 'encode', project: source.project as ProjectEnvelope });
  const checksum = checksumReader();
  const manifest = manifestBytes(projectText, assets.map(({ id, mime, bytes }) => ({ id, mime, length: bytes.length, crc32: checksum(bytes) })));
  total = checkedTotal(total + manifest.length);
  const header = new Uint8Array(HEADER_BYTES); header.set(MAGIC);
  new DataView(header.buffer).setUint32(MAGIC.length, manifest.length, true);
  return { parts: [header, manifest, ...assets.map(asset => asset.bytes)], byteLength: total };
}
function segmentReader(parts: readonly Uint8Array[], total: number): (count: number) => Uint8Array {
  let index = 0; let offset = 0; let remaining = total;
  return count => {
    if (count > remaining) invalid('Native container is truncated.');
    remaining -= count;
    if (!count) return new Uint8Array();
    while (offset === parts[index]!.length) { index++; offset = 0; }
    const first = parts[index]!;
    if (count <= first.length - offset) {
      // Preserve full-view identity so repeated immutable assets reuse their checksum.
      const result = offset === 0 && count === first.length ? first : first.subarray(offset, offset + count);
      offset += count; return result;
    }
    const result = new Uint8Array(count); let written = 0;
    while (written < count) {
      const part = parts[index]!; const size = Math.min(part.length - offset, count - written);
      result.set(part.subarray(offset, offset + size), written); written += size; offset += size;
      if (offset === part.length) { index++; offset = 0; }
    }
    return result;
  };
}
function decode(value: unknown): NativePackage {
  let total = 0;
  const parts = dense(value).map(value => { const part = byteView(value); total = checkedTotal(total + part.length); return part; });
  const read = segmentReader(parts, total); const header = read(HEADER_BYTES);
  if (!MAGIC.every((byte, index) => byte === header[index])) invalid('Unsupported native container magic or version.');
  const length = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(MAGIC.length, true);
  if (length > MAX_MANIFEST_BYTES) limited('Native manifest exceeds 64 MiB.');
  const bytes = read(length); let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { invalid('Native manifest must be valid UTF-8 JSON.'); }
  const manifest = record(parsed, ['project', 'assets']); const ids = new Set<string>(); let expected = HEADER_BYTES + length;
  const entries = assetList(manifest.assets).map(value => {
    const item = record(value, ['id', 'mime', 'length', 'crc32']); const name = names(item, ids);
    if (typeof item.length !== 'number' || !Number.isSafeInteger(item.length) || item.length < 0) invalid('Asset length must be a nonnegative safe integer.');
    if (typeof item.crc32 !== 'number' || !Number.isInteger(item.crc32) || item.crc32 < 0 || item.crc32 > 0xffffffff) invalid('Asset checksum must be an unsigned 32-bit integer.');
    expected = checkedTotal(expected + item.length); return { ...name, length: item.length, crc32: item.crc32 };
  });
  if (expected !== total) invalid(expected > total ? 'Native container is truncated.' : 'Native container has trailing bytes.');
  // Validation through S03 encode preserves parsed -0 and avoids recursive stringify.
  projectFormat({ op: 'encode', project: manifest.project as ProjectEnvelope });
  const checksum = checksumReader();
  const assets = entries.map(entry => {
    const bytes = read(entry.length);
    if (checksum(bytes) !== entry.crc32) invalid(`Asset checksum mismatch: ${JSON.stringify(entry.id)}.`);
    return { id: entry.id, mime: entry.mime, bytes };
  });
  return { project: manifest.project as ProjectEnvelope, assets };
}

export function nativeContainer<T extends ContainerRequest>(request: T): ContainerOutput<T> {
  if (!request || typeof request !== 'object') invalid('Native container request must name an operation.');
  const operation = Object.getOwnPropertyDescriptor(request, 'op');
  if (!operation?.enumerable || !('value' in operation)) invalid('Native operation must be an own data field.');
  if (operation.value === 'encode') { const fields = record(request, ['op', 'package']); return encode(fields.package) as ContainerOutput<T>; }
  if (operation.value === 'decode') { const fields = record(request, ['op', 'parts']); return decode(fields.parts) as ContainerOutput<T>; }
  return invalid('Unknown native container operation.');
}
