# Module map — gsnv-paint

Mode A baseline. The system turns local editable documents into raster images, video and B-rep solids within one static app. Completion requires all owner requirements and golden outputs, plus actual distribution evidence. This map fixes contracts before implementation. No future source directories or stub files are created by the map.

## Map sections and build order

1. Phase 1: S01, S03, S02, S04, S05, S06, S07, S08, S09, S10, S11, S12, S15, S13, S14, then A-SHELL (dependencies precede consumers).
2. Phase 2: [CAD contracts](MODULE_MAP-CAD.md), in its listed topological order, then A-CAD.
3. Phases 3–5: [Image, Video and delivery contracts](MODULE_MAP-MEDIA.md), in listed phase/topological order.

All statuses start PLANNED. Every brick is one file, at most 300 implementation lines, three public symbols, five inputs (otherwise a named request), and three direct brick collaborators. Assemblies only wire dependencies and route effects; domain decisions remain in CORE. GREEN means tests/checker/demo pass, not human acceptance. Every brick gets a sibling testbench and a separate demo; paths are assigned when implementation begins.

Shared boundary types are declarations here, not code scaffolding. All numbers are finite unless an explicit type says otherwise. `Json` means null/boolean/finite number/string/array/string-keyed plain record, without cycles, prototypes or functions. IDs are nonempty strings. `Workspace` is `cad | image | video`. `Result<T>` is `{ok:true,value:T}` or `{ok:false,error:{code:string,message:string,details?:Json}}`. Errors never conceal a failed document mutation.

## Phase 1 boundary types

- `ProjectEnvelope = {format:'gsnv-cad'|'gsnv-image'|'gsnv-video',version:1,id:string,title:string,content:Json}`. Each workspace's content contract is versioned in its phase; the common codec preserves content bytes semantically and never pretends to validate domain geometry/pixels/timeline.
- `History<T> = {past:{label:string,value:T}[],present:T,future:{label:string,value:T}[],limit:number}`. `limit` is an integer ≥100. Jump offset is negative toward past and positive toward future; it must be between −past.length and future.length, inclusive. Values are immutable snapshots or immutable delta roots supplied by the owning domain.
- `HistoryRequest<T> = {op:'create',value:T,limit?:number} | {op:'commit',history:History<T>,label:string,value:T} | {op:'undo'|'redo',history:History<T>} | {op:'jump',history:History<T>,offset:integer}`.
- `DocumentSnapshot<T>={id:string,title:string,format:string,version:number,identity:string,value:T}`. Identity is a caller-supplied nonempty revision token, unique within the document's history; saved/undo dirty comparisons use token equality. `T` is any immutable domain value, including readonly maps, typed arrays and bigint. `Session<T> = {workspace:Workspace,documents:Partial<Record<Workspace,DocumentSnapshot<T>>>,histories:Partial<Record<Workspace,History<DocumentSnapshot<T>>>>,saved:Partial<Record<Workspace,string>>,dirty:Partial<Record<Workspace,boolean>>,message:string}`. An unopened workspace has no invented domain document. New/open supplies a real validated domain snapshot from its phase's factory/decoder. The root may use a tagged union of the built workspace types; it does not serialize the live history to JSON.
- `SessionEvent<T> = {type:'switch',workspace:Workspace} | {type:'open',workspace:Workspace,snapshot:DocumentSnapshot<T>,isSaved:boolean} | {type:'commit',workspace:Workspace,snapshot:DocumentSnapshot<T>,label:string} | {type:'undo'|'redo',workspace:Workspace} | {type:'saved',workspace:Workspace,documentId:string,identity:string} | {type:'status',message:string}`. Saved identity is the exact document revision actually written, so a later edit stays dirty. A saved completion with a different current documentId is ignored, preventing late saves from changing a replacement document. Open with isSaved=false creates a dirty new document; true establishes a saved baseline. `Effect = never`; this reducer produces an empty effect list; browser I/O is routed separately by the assembly.
- `View2D = {zoom:number,pan:{x:number,y:number}}`; screen and document points have x/y in explicit CSS-pixel/document units. Image zoom range is [0.01,64]; a caller supplies other positive ranges.
- `CommandEvent = {key:string,ctrl:boolean,meta:boolean,shift:boolean,alt:boolean,target:'text'|'view'|'dialog',workspace:Workspace,viewRole:'timeline'|'preview2d'|'canvas2d'|'cad3d'|'sketch2d'|'none'}`; command IDs are stable strings. Pointer buttons and wheel requests use separate numeric fields. `CommandContext={workspace:Workspace,target:'text'|'view'|'dialog',viewRole:CommandEvent['viewRole'],activeTool:string,status:string}`. `Gesture={type:'pointer',phase:'down'|'move'|'up'|'cancel',id:number,point:Point,button:0|1|2,ctrl:boolean,shift:boolean,pressure:number}|{type:'wheel',cursor:Point,factor:number}|{type:'pan',delta:Point}|{type:'context',point:Point,targetId:string|null}`. Pressure is normalized to [0,1]; pointer IDs identify capture lifetimes.
- `ChromeModel = {title:string,workspace:Workspace,dirty:boolean,menus:Menu[],tools:Tool[],panels:Panel[],status:string,capabilities:Capability[]}`. Menu/tool commands are supplied by the active assembly; absent functionality has no fake enabled command. `Tool={id,label,shortcut,icon,status,enabled}`; panel content is a supplied HTMLElement owned by a workspace.
- `DialogSpec = {title:string,fields:Field[],initial:Record<string,string|number|boolean>,validate:(values)=>Result<Json>,preview:(values)=>void,commit:(values)=>void,cancel:()=>void}`. Fields carry labels, number bounds/step or explicit choices; previews are transient.
- `FileRequest = {op:'open',accept:Record<string,string[]>} | {op:'save',name:string,mime:string,bytes:Uint8Array|readonly Uint8Array[],handle?:FileSystemFileHandle}`. `FileResult={name,bytes,handle?}` or a cancellation result; cancellation is not data loss.
- `NativeAsset={id:string,mime:string,bytes:Uint8Array}`; unique ID, no paths. `NativePackage={project:ProjectEnvelope,assets:readonly NativeAsset[]}`. Workspace codecs map in-memory tiles/bigint/STEP data into Json metadata plus named byte assets; they validate asset references and reconstruct domain types. S03 validates only common metadata; S15 validates the binary container, CRC and asset bounds.
- `RecoveryRecord={workspace:Workspace,generation:integer,payload:readonly Uint8Array[],title:string}`. `RecoveryPort` is async load/store/remove by workspace. Generations prevent partial overwrite; journal contains no user document payload.

## S01 history — CORE — GREEN

Purpose: Apply bounded immutable document history transactions.
IN: `HistoryRequest<T>`; valid immutable values (including readonly maps, typed-array tiles and bigint); callers retain ownership and never mutate reachable snapshots, nonempty commit labels, limit ≥100.
OUT: `History<T>` with deterministic undo/redo/jump, redo cleared by new commit, oldest past entries evicted only past limit; input unmodified. No cloning/JSON serialization of T is performed.
RAISES: `RangeError` for invalid limit/jump; `TypeError` for invalid operation/label.
DEPS: none.
TEST: 120 distinct commits with 100 retained, full undo/redo, branch after undo, boundary no-op, negative/invalid cases, explicit golden state and immutability property. Requirement group CommandHistory.

## S02 session — CORE — GREEN

Purpose: Reduce workspace-level document commands.
IN: `{state:Session<T>,event:SessionEvent<T>}`; snapshot content validity established by the owning workspace codec/factory; every event carries required workspace and explicit values.
OUT: `{state:Session<T>,effects:Effect[]}` preserving other workspace sessions, dirty state from saved revision identity, labeled history for document changes, actionable messages. Unknown event tags raise TypeError; no hidden I/O effects.
RAISES: `TypeError` for malformed events; `RangeError` for a document command on an unopened workspace.
DEPS: S01.
TEST: workspace independence, new/open/commit/undo/save failure sequences, late-save completion after document replacement, dirty restoration, golden event transcript. Requirement groups AppShell, CommandHistory.

## S03 project-format — CORE — GREEN

Purpose: Encode or decode a common versioned native project envelope.
IN: `{op:'encode',project:ProjectEnvelope} | {op:'decode',text:string}`; maximum encoded text 64 MiB for this JSON envelope transport.
OUT: `ProjectEnvelope | string`; encode/decode preserves all Json content, rejects unknown format/version and unsafe keys (`__proto__`, `prototype`, `constructor`) at any depth; canonical serialization is deterministic. Binary/tiled workspace containers use their later adapters rather than increasing this envelope transport without a contract change.
RAISES: `ProjectFormatError` for malformed JSON, invalid envelope, unsupported version/format, cyclic/nonfinite/non-Json content, input over limit. Titles may be empty strings; IDs must be nonempty. Envelope objects have exactly the five documented keys; unknown fields belong inside content.
DEPS: none.
TEST: literal golden envelope, all three tags, nested roundtrip, malformed/future/unsafe/oversize cases. Requirement group ProjectPersistence.

## S04 view-transform — CORE — GREEN

Purpose: Transform a two-dimensional viewport around its cursor.
IN: `{view:View2D,action:{type:'zoom',factor:number,cursor:Point}|{type:'pan',delta:Point}|{type:'toDocument',point:Point},range:{min:number,max:number}}`; positive finite zoom/factor/range with min≤max.
OUT: `View2D | Point`, clamped zoom with invariant document coordinate at cursor and reversible screen/document mapping.
RAISES: `RangeError` for invalid bounds/nonfinite coordinates.
DEPS: none.
TEST: cursor invariant, clamp 1%/6400%, pan, negative coordinates and golden transform. Requirement group AppShell; ImageViewport.

## S05 keymap — CORE — GREEN

Purpose: Translate a keyboard event into an active-workspace command.
IN: `CommandEvent` with normalized key; text fields retain ordinary text editing, dialog context maps Enter/Esc.
OUT: `{command:string|null,preventDefault:boolean}` for documented common controls and workspace overrides (Space playback only in the focused Video timeline vs Space pan in preview2d/canvas2d/sketch2d, S split, J/K/L, arrows, I/O, Home/End; Image X/D; CAD F fit, V select, L line, R rectangle, E extrude).
RAISES: `TypeError` for invalid workspace/context/key.
DEPS: none.
TEST: full shortcut table, Ctrl/Meta handling, text focus, conflict cases and unknown key. Requirement group AppShell.

## S06 capability-probe — SHELL — GREEN

Purpose: Inspect browser APIs available to this session.
IN: `{environment:WindowLike,codecRequests:CodecConfig[]}` from caller; may be empty in Phase 1.
OUT: `Promise<Capability[]>` distinguishing supported/unavailable/error for file access, workers, WebAssembly, WebGL2, cross-origin isolation, clipboard, pressure input and requested codecs; no capability inferred from user agent alone.
RAISES: none; per-probe failures become diagnostic results.
DEPS: none.
TEST: injected environments and one actual Chromium probe; codec entries stay untested until exact configuration probes. Requirement group AppShell.

## S07 file-access — SHELL — GREEN

Purpose: Transfer explicit user-selected bytes through browser file APIs.
IN: `FileRequest`, browser file/download ports; user activation originates at caller.
OUT: `Promise<Result<FileResult>|{cancelled:true}>`; uses native picker when available, file input/download fallback otherwise, closes writable on success, aborts on failure, never marks a save complete before resolution.
RAISES: none; permission/read/write failures yield stable file error codes.
DEPS: none.
TEST: fake cancellation/denial/write failure and one actual browser open/download roundtrip; native picker smoke is separate if automation cannot exercise it. Requirement group ProjectPersistence.

## S08 recovery-store — SHELL — GREEN

Purpose: Persist atomic workspace recovery generations locally.
IN: `{op:'write',record:RecoveryRecord}|{op:'read'|'remove',workspace:Workspace}`, injected IndexedDB/localStorage adapter ports.
OUT: `Promise<Result<RecoveryRecord|null>>`; latest completely committed generation, previous recoverable generation retained on failure; localStorage only stores small journal metadata.
RAISES: none; quota, corrupt data and unavailable storage yield stable diagnostic codes.
DEPS: none.
TEST: fake crash between writes, old generation, corruption/quota plus real browser close/reload recovery. Requirement group ProjectPersistence.

## S09 icons — SHELL — GREEN

Purpose: Render original interface glyphs.
IN: `{document:Document,name:string,label:string,size:number}`; name belongs to supplied original glyph catalog, size 12–64 CSS px.
OUT: `SVGElement` with correct viewbox, accessible labeling and local path data; no fetched imagery or Microsoft assets.
RAISES: `RangeError` for unknown glyph/size.
DEPS: none.
TEST: catalog coverage, unique paths/accessibility, inspected original SVG sheet in Chromium. Requirement group AppShell.

## S10 chrome — SHELL — GREEN

Purpose: Render the shared web application shell from a view model.
IN: `{root:HTMLElement,model:ChromeModel,onCommand:(id:string)=>void,onWorkspace:(workspace)=>void}`.
OUT: `{update(model):void,dispose():void,viewport:HTMLElement}`; blue application header/navigation, menu bar, lightly beveled toolbar/palette, docked panels/status and workspace switcher at 1280×720, without simulated OS furniture; all listeners removed on disposal.
RAISES: `TypeError` for missing root or invalid view model.
DEPS: S09.
TEST: fake DOM contracts and one real Chromium layout/menu/focus/tooltip/switch smoke with screenshot. Requirement group AppShell.

## S11 dialog — SHELL — GREEN

Purpose: Present a transactional live-preview modal.
IN: `{root:HTMLElement,spec:DialogSpec}` with all callbacks present.
OUT: `{close():void}`; changes invoke valid previews, OK/Enter invokes one commit, Cancel/Esc invokes one cancel, restores focus, prevents invalid commit and traps focus while open.
RAISES: `TypeError` for invalid fields/callbacks.
DEPS: none.
TEST: live preview/typed values, invalid range, Esc rollback/Enter commit, keyboard focus, one actual browser smoke. Requirement group AppShell.

## S12 input-adapter — SHELL — GREEN

Purpose: Forward browser input as normalized commands and gestures.
IN: `{root:HTMLElement,context:()=>CommandContext,onCommand:(id)=>void,onGesture:(Gesture)=>void}`; context supplies keymap workspace/target and active tool status.
OUT: disposer; pointer capture normalizes left/middle/right, modifiers and pressure, wheel gives cursor/factor, contextmenu includes target, Space-drag gives pan only in preview2d/canvas2d/sketch2d, Ctrl selection preserved; no document decisions here.
RAISES: `TypeError` for invalid ports.
DEPS: S05.
TEST: event normalization/focus exceptions, cancellation/pointer capture plus actual Chromium wheel/pan/context menu. Requirement group AppShell.

## S13 project-files — SHELL — GREEN

Purpose: Adapt project-envelope serialization to explicit file operations.
IN: `{operation:'open'|'save',package?:NativePackage,handle?:FileSystemFileHandle}` and file port.
OUT: `Promise<Result<NativePackage|FileResult>|{cancelled:true}>`; decode/check container before document replacement, stream encoded parts on native writes or use Blob(parts) for download, preserve cancellation and errors. Domain codec validation still precedes the assembly's Open event.
RAISES: none; codec errors become readable project errors.
DEPS: S15, S07.
TEST: actual encoded files through file adapter, malformed file leaves document untouched; browser download/open seam. Requirement group ProjectPersistence.

## S14 recovery-session — SHELL — GREEN

Purpose: Adapt committed project snapshots to recovery storage.
IN: `{operation:'save'|'recover'|'discard',workspace:Workspace,package?:NativePackage,generation:integer}` and recovery port.
OUT: `Promise<Result<NativePackage|null>>`; package encoded before atomic write, container validated before return, corrupt generation is a readable error. Large payload parts are persisted as browser-local Blobs/ArrayBuffers; domain codec validation precedes recovery commit.
RAISES: none; transport/codec diagnostics propagated with context.
DEPS: S15, S08.
TEST: real S03→S15→S08→S15→S03 seam, recovery after simulated interruption and browser reload. Requirement group ProjectPersistence.

## S15 native-container — CORE — GREEN

Purpose: Pack or unpack versioned project metadata and binary assets without converting pixels to JSON.
IN: `{op:'encode',package:NativePackage}|{op:'decode',parts:readonly Uint8Array[]}`; metadata follows S03, ≤20,000 unique assets, total ≤2 GiB, metadata ≤64 MiB, IDs and MIME strings nonempty.
OUT: encode `{parts:readonly Uint8Array[],byteLength:number}` or decode `NativePackage`, preserving exact bytes without lossy coercion. Wire format v1: eight ASCII bytes `GSNVPK1\n`, u32LE manifest-byte length, UTF-8 canonical JSON `{project,assets:[{id,mime,length,crc32}]}`, then asset bytes in manifest order. Asset offsets are cumulative safe integers; no filesystem paths. CRC32 is IEEE 802.3 (polynomial 0xEDB88320, initial/final XOR 0xFFFFFFFF); it detects accidental damage, not authenticity. S03 serializes/validates project metadata; this brick handles framing, canonical manifest and checksums. Decode rejects trailing bytes, truncated parts, duplicate IDs, bad checksums and unsupported magic/version before returning anything.
RAISES: `ContainerFormatError` for malformed framing/schema/checksum/length; `ContainerLimitError` for declared or actual limits; propagates S03 `ProjectFormatError`.
DEPS: S03.
TEST: literal independently computed header/checksum fixture, segmented boundary input, multi-asset byte roundtrip, 0 assets, limits, corruption/truncation/future magic/duplicate IDs, and S03 seam. Requirement group ProjectPersistence. [Implemented wire format](NATIVE-CONTAINER-V1.md).

## A-SHELL — assembly, not a brick — GREEN

Wire S02, S04, S06, S10–S14 and existing built workspace adapters. S01/S03/S05/S07/S08/S09 are reached through their declared consumers. Phase 1 provides the window, capability notice, project-envelope open/save and recovery plus test fixture documents; unbuilt domain tools are not advertised as working. Workspace-specific new-document factories, copy/edit operations and panels are added only with their own phase's GREEN modules. Composition code contains routing and lifecycle disposal only. There is no fake CAD mesh, placeholder media edit or invented blank domain schema.

Implemented in `src/app/app-shell.ts`, with a production entry and a separate marked development fixture. The [integration contract](APP-SHELL.md) documents adapter ownership, document epochs, native-handle capture, serialized recovery and modal/input lifecycle. The production CAD adapter supports the verified sketch/extrusion path and STEP output. Image and Video adapters remain unbuilt.

## Assembly ladder and acceptance

Rung 1: S01 history → S02 session; S03 metadata codec is verified independently before S15. Rung 2: S03 → S15 + S07 → S13 file seam. Rung 3: S03 → S15 + S08 → S14 recovery seam. Rung 4: S05 → S12 → A-SHELL and S09 → S10, with S11 preview transactions. Later phase sections define their cumulative seams.

Human ACCEPTED set: empty. Human acceptance ladder: 0. Provisional GREEN assembly rungs 1–4 pass cumulatively, including S05→S12→A-SHELL, S09→S10 and S11 preview transactions. S01–S15 and A-SHELL are GREEN with evidence in PHASE-1.md. Phase 1's shared-component scope is complete; full workspace requirements remain open. Its checkpoint halted before Phase 2 after repairing assembly lifecycle findings and build typing. Phase 2 has since reached C01–C04, independent C07–C08, C37, C50–C60, CAD-A1, CAD-APP and STEP-APP GREEN; the CAD provisional ladder is 3. C08 remains a geometry leaf awaiting integration. C05 is next on the feature-history path. BATCH is halted before C05 pending the explicit revision-exhaustion contract amendment in PHASE-2.md. Current evidence is in PHASE-2.md and MODULE_MAP-CAD.md. Contract changes or unexpected failed checks halt the authorized batch and identify affected downstream bricks.

## Shared conceptual bindings

| Design owner | Contracts |
|---|---|
| AppShell | S02, S04–S06, S09–S12, A-SHELL |
| CommandHistory | S01, S02 |
| ProjectPersistence | S03, S07, S08, S13–S15 plus per-workspace codecs |
| Architecture | 03-ARCHITECTURE.md and every CORE/SHELL boundary in the three map files |

Other conceptual owners are bound by the CAD and media maps. `requirements.json` keeps the stable design owner name; the table maps it to concrete files/bricks.
