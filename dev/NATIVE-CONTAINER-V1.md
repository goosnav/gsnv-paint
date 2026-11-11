# Native binary container, version 1

S15 implements this shared transport. Each workspace supplies its own versioned metadata schema and binary asset meanings; those codecs remain part of their workspace phases. The shared container alone does not establish that geometry, pixels or a timeline can be edited.

## Byte layout

All offsets and lengths count bytes. The complete container is at most 2,147,483,648 bytes, including the header and manifest.

| Offset | Length | Contents |
| --- | --- | --- |
| 0 | 8 | ASCII `GSNVPK1` followed by LF (`47 53 4e 56 50 4b 31 0a`) |
| 8 | 4 | Unsigned 32-bit little-endian manifest byte length |
| 12 | Declared length | UTF-8 JSON manifest, at most 67,108,864 bytes |
| After manifest | Sum of asset lengths | Raw asset bytes in manifest order, without padding |

No trailing bytes are permitted. Empty assets consume zero bytes. Zero assets are also valid. Source parts may split anywhere, including inside the header, a UTF-8 character or an asset. Empty parts have no effect.

## Manifest schema

The root has exactly `assets` and `project`. An asset descriptor has exactly `crc32`, `id`, `length` and `mime`.

```json
{"assets":[{"crc32":459412726,"id":"tile-0","length":3,"mime":"application/octet-stream"}],"project":{"content":{"height":1,"width":1},"format":"gsnv-image","id":"p1","title":"Pixels","version":1}}
```

This example's manifest is 197 bytes. Its header is `47534e56504b310ac5000000` in hexadecimal. Appending the three bytes `00 ff 01` produces a complete 212-byte container. The literal golden test checks that complete output against an independent Python `struct`/`zlib` calculation.

`assets` is an ordered array of at most 20,000 descriptors. IDs are unique nonempty strings. They cannot contain `/`, `\` or NUL, or equal `.` or `..`; other strings remain opaque identifiers. MIME is a nonempty string. Neither field names a filesystem location. `length` is a nonnegative safe integer; declared lengths must also fit the complete-container limit. `crc32` is an integer from 0 through 4,294,967,295.

CRC32 is IEEE 802.3, reflected polynomial `0xEDB88320`, initial value `0xFFFFFFFF`, final XOR `0xFFFFFFFF`, stored as an unsigned decimal JSON number. It covers only the exact asset bytes. The empty payload has CRC 0; ASCII `123456789` has CRC `0xCBF43926` (3,421,780,262). CRC detects accidental damage; it is not an authenticity check.

`project` is the S03 common envelope with exactly `content`, `format`, `id`, `title` and `version`. The format is `gsnv-cad`, `gsnv-image` or `gsnv-video`; version is currently 1. Project ID is nonempty; title may be empty. Content contains finite JSON values and cannot contain unsafe object keys (`__proto__`, `prototype`, `constructor`), non-JSON values or cycles. Workspace codecs validate their own content and asset references after transport validation.

The encoder emits compact JSON with record keys sorted by UTF-16 code units. It embeds S03's canonical project text, preserving negative zero and deeply nested metadata. The decoder accepts ordinary JSON whitespace and key ordering, validates exact field sets, and requires valid UTF-8 without a byte-order mark. It preserves parsed negative zero through S03 validation. Future magic/version tags, malformed data, invalid checksums, truncation and trailing bytes produce errors before any package is returned.

## API and ownership

`nativeContainer({op:'encode', package:{project,assets}})` accepts assets shaped as `{id,mime,bytes:Uint8Array}` and returns `{parts:readonly Uint8Array[],byteLength}`. `nativeContainer({op:'decode',parts})` returns `{project,assets}`. Both are synchronous pure operations with no file access. File and recovery adapters own I/O.

Callers retain immutable ownership of all reachable input and output byte views while the result is in use. Encoding borrows asset views. Decoding borrows a view when an asset is contained in one part and allocates one contiguous byte array when an asset spans parts. It never flattens the complete container. CRC results are memoized by exact byte-view identity within a single call; distinct views of the same buffer are distinct inputs.

`ContainerFormatError` indicates malformed requests, schema, framing, lengths or checksums. `ContainerLimitError` indicates declared or actual container limits. S03's `ProjectFormatError` propagates for invalid common project metadata. Available runtime memory still limits allocations for a split asset; the logical 2 GiB boundary test does not establish a browser memory or performance guarantee.

## Verification

Run `node --import tsx --test src/shared/native-container.test.ts` from the repository root. The suite covers a literal complete-file golden, every split and truncated prefix of it, UTF-8 splits, corruption, schemas, counts and exact size boundaries, real S03 roundtrips, and deterministic properties across all three format tags. The 2 GiB test uses repeated immutable views to verify logical framing without allocating a 2 GiB file. Run `node --import tsx src/shared/native-container.demo.ts` for a separate one-pixel transport demonstration.
