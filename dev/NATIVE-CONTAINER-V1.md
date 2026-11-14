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

`project` is the S03 common envelope with exactly `content`, `format`, `id`, `title` and `version`. The format is `gsnv-cad`, `gsnv-image`, `gsnv-photo`, `gsnv-video`, `gsnv-document`, `gsnv-slides`, `gsnv-audio`, `gsnv-spreadsheet` or `gsnv-code`; version is currently 1. Project ID is nonempty; title may be empty. Content contains finite JSON values and cannot contain unsafe object keys (`__proto__`, `prototype`, `constructor`), non-JSON values or cycles. Workspace codecs validate their own content and asset references after transport validation.

The encoder emits compact JSON with record keys sorted by UTF-16 code units. It embeds S03's canonical project text, preserving negative zero and deeply nested metadata. The decoder accepts ordinary JSON whitespace and key ordering, validates exact field sets, and requires valid UTF-8 without a byte-order mark. It preserves parsed negative zero through S03 validation. Future magic/version tags, malformed data, invalid checksums, truncation and trailing bytes produce errors before any package is returned.

## API and ownership

`nativeContainer({op:'encode', package:{project,assets}})` accepts assets shaped as `{id,mime,bytes:Uint8Array}` and returns `{parts:readonly Uint8Array[],byteLength}`. `nativeContainer({op:'decode',parts})` returns `{project,assets}`. Both are synchronous pure operations with no file access. File and recovery adapters own I/O.

Callers retain immutable ownership of all reachable input and output byte views while the result is in use. Encoding borrows asset views. Decoding borrows a view when an asset is contained in one part and allocates one contiguous byte array when an asset spans parts. It never flattens the complete container. CRC results are memoized by exact byte-view identity within a single call; distinct views of the same buffer are distinct inputs.

`ContainerFormatError` indicates malformed requests, schema, framing, lengths or checksums. `ContainerLimitError` indicates declared or actual container limits. S03's `ProjectFormatError` propagates for invalid common project metadata. Available runtime memory still limits allocations for a split asset; the logical 2 GiB boundary test does not establish a browser memory or performance guarantee.

## Verification

Run `node --import tsx --test src/shared/native-container.test.ts` from the repository root. The suite covers a literal complete-file golden, every split and truncated prefix of it, UTF-8 splits, corruption, schemas, counts and exact size boundaries, real S03 roundtrips, and deterministic properties across the original three format tags. Shared format/file/recovery tests cover the nine registered formats; each additional workspace tests its own native codec and editable reopen. The 2 GiB test uses repeated immutable views to verify logical framing without allocating a 2 GiB file. Run `node --import tsx src/shared/native-container.demo.ts` for a separate one-pixel transport demonstration.

## Browser file transport

S13 `projectFiles` connects this format to S07 file access. Save accepts a package and optional existing file handle; it encodes before writing and returns the file result only after native close, or after fallback download handoff. Open returns a validated package without changing a document. Workspace validation still runs before the assembly replaces its document. File names do not override the decoded format tag.

Native extensions match the format tags above, prefixed with a dot (for example `.gsnv-spreadsheet`), and are all transported as `application/octet-stream`. Suggested names derive from the document title: remove one matching extension, replace filesystem-invalid characters, trim trailing dots/spaces, bound the stem to 180 UTF-8 bytes without splitting a code point, protect reserved Windows device basenames, and append the native extension once. Empty stems use `Untitled`. This changes the suggested filename, not the document title. Tests of the naming rule are not an actual Windows smoke test.

S13 returns S07 transport failures/cancellation unchanged. Container framing/checksum failures use `project.format`; limits use `project.limit`; common metadata failures use `project.metadata`; invalid requests use `project.request`; unexpected codec exceptions use `project.codec`. A failure never yields a replacement package or a successful save result.

The application must capture an opened native handle in an operation-local FilePorts wrapper, then associate it only after container validation, domain validation and acceptance of that exact open result. Fallback open has no reusable native handle. Cancellation or rejected opens preserve the previous document/handle association.

Acquire a new save destination and any required write permission during the user action before lengthy serialization, then pass that handle to S13. A reusable handle does not necessarily carry write permission. Chrome documents that processing data before showing the save picker can exhaust the required [user activation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access). These sequencing obligations belong to the later app assembly; this component does not claim to verify native picker interaction or permission UI.

Run `node --import tsx --test src/shared/project-files.test.ts` for the real S03→S15→S07 transport seams with fake browser ports. Run `npm run test:browser -- src/shared/project-files.browser.spec.ts` for the actual browser fallback download/open/re-save and corrupt-file rejection. The separate `/dev/fixtures/project-files.html` demonstration explicitly uses a transport fixture, not an implemented image editor.

## Browser recovery transport

S14 `recoverySession` connects native packages to an asynchronous S08 `RecoveryPort`. Each request specifies `operation` (`save`, `recover` or `discard`), `workspace` and a safe integer `generation`; save also supplies an immutable package. Save encodes before storage and checks the package's format against the requested workspace. Recover decodes the committed container before returning a package, with the same workspace check. Missing recovery and successful discard return null. Neither operation changes a live document; domain validation still precedes replacement.

Save returns the package that S08 actually retained. An older or equal attempted generation can return a newer committed package. It must not be treated as acknowledgement that the attempted snapshot was saved. S14 does not flatten the container or store binary data in localStorage; S08 keeps payload segments as IndexedDB Blobs and stores only a generation/workspace journal hint in localStorage.

The caller binds S08's browser resources in an operation port and observes every successful record's generation before returning the result to S14. Track both the highest observed and highest issued generations, never lowering either on a late completion; issue the next generation above both. Observe the generation even when subsequent container or domain validation fails, so a higher corrupt record does not prevent a later valid save. Handle exhaustion at Number.MAX_SAFE_INTEGER explicitly. Serialize discard after pending saves to avoid a late save recreating discarded recovery. Complete application lifecycle coverage remains part of A-SHELL.

S08 diagnostic codes are preserved with operation/workspace context. Malformed port responses use `recovery.corrupt`; workspace mismatches use `recovery.workspace`. Container, size and common metadata failures use `recovery.format`, `recovery.limit` and `recovery.metadata`; malformed requests use `recovery.request`. Unexpected codec or port exceptions become `recovery.codec` or `recovery.transport`. Corrupt content remains stored for explicit user action and never yields a partial package.

Run `node --import tsx --test src/shared/recovery-session.test.ts` for the real S03→S15→S08→S15→S03 seam, including overlapping writes, simulated transaction interruption and corrupt content. Run `npm run test:browser -- src/shared/recovery-session.browser.spec.ts` for an actual Chrome page close/reopen/reload roundtrip, older-write rejection and persisted discard. The separate `/dev/fixtures/recovery-session.html` sample is a transport demonstration. It does not prove process-crash timing, eviction resistance, full application recovery or domain editability.

## Workspace content schemas

The common framing stays version 1. Workspace decoders enforce their own content schemas and reject unsupported data before replacing an open project. Native files preserve supported editable content and source assets; they do not serialize the shared undo stack.

| Format | Content and schema reference |
|---|---|
| `gsnv-cad` | Parametric expressions/sketch/features, or one non-parametric STEP source with exact embedded bytes; [CAD import schema](CAD-STEP-IMPORT.md) |
| `gsnv-image` | Raster layers, masks, selections and supported editable data; [image workflow](IMAGE-WORKFLOW.md) |
| `gsnv-photo` | Original photo bytes plus nondestructive development settings; [photo workflow](PHOTO-WORKFLOW.md) |
| `gsnv-video` | Media assets and supported timeline/clip/title properties; [video workflow](VIDEO-WORKFLOW.md) |
| `gsnv-document` | Editable document structure, page setup and embedded images; [authoring contracts](MODULE_MAP-AUTHORING.md) |
| `gsnv-slides` | Ordered slides, text/shape/image objects and embedded images; [slides schema](SLIDES-WORKFLOW.md) |
| `gsnv-audio` | Float32 PCM source assets and editable sequence ranges/envelopes; [audio schema](AUDIO-WORKFLOW.md) |
| `gsnv-spreadsheet` | Ordered sparse sheets, formula source, supported styles and layout; [workbook schema](SPREADSHEET-WORKFLOW.md) |
| `gsnv-code` | Ordered local UTF-8 files and chosen entry point; [code schema](CODE-WORKFLOW.md) |
