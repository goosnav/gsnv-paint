# Independent continuation checkpoint review

Reviewed 2026-11-13 by an agent that did not implement this increment. Baseline:
`450d58b`; reviewed the current working-tree increment and contracts through
`d1ba0be`. HEAD when recording the report is
`aa071551333f85f0b1a9b8bf0d10646dc0d627ab`, which adds the repair contract for the
two findings below. This is a bounded checkpoint, not a full-suite completion
verdict or human acceptance. The findings describe the state before those
repairs. This reviewer changed no runtime code, tests, requirements, build
output, or Git history.

The review attempted to falsify the default-plane/profile CAD increment, Image
persisted selections and exact golden sequence, and raster cross-workspace
transfers. It read the contracts in `CAD-NEXT-INCREMENT.md`,
`IMAGE-ACCEPTANCE.md`, and `CROSS-WORKSPACE.md`, their actual source and tests,
relevant requirement mappings, native kernel/worker lifecycle, and shell
transaction/recovery boundaries. The final stable `shared/chrome.ts`
reconciliation repair was also reviewed, including its new tests.

## Ranked findings

### 1. P2 — End selects an excluded source frame in preview and transfer

Locations at review: `src/video/video-timeline.ts:60–65`,
`src/video/video-workspace.ts:84–87`, and
`src/bridge/video-source-adapter.ts:38`.

The last timeline endpoint intentionally resolves to the final clip, but the
returned source time is exactly `clip.out`. Preview seeks to that value. D03
only clamps it to the *whole media's* duration. With a trimmed final clip, the
decoder can therefore show the first frame that was trimmed out. The private
capture reproduces the same wrong frame in the saved native Image document.
This violates D03's stated exact-clip-end promise. It is an ordinary valid
project operation, not a malformed-input case.

**Confirmed in real Chrome, not just inferred from code.** The production build
already present in `dist` was served on `127.0.0.1:4201`, with an isolated fresh
browser context for each case. This reviewer did not rebuild it. Environment:
Chrome `154.0.8037.97`, Linux x64, headless, viewport 1280×720. No page errors.
The temporary preview server was stopped after the reproduction.

Fixture: `src/bridge/fixtures/frame-colors.webm`, the existing 128×96 lossless
VP9 fixture at 2 fps, with red `[0,0.5)`, green `[0.5,1)`, and blue `[1,1.5)`.
Create a 160×120 Video project; import the fixture to the bin, place it, and trim
the single clip. The exact native fixture construction is:

```js
import { readFile } from 'node:fs/promises';
import { videoTimeline } from './src/video/video-timeline.ts';
import { nativeContainer } from './src/shared/native-container.ts';

async function trimmedFixture(cIn, cOut) {
  const bytes = new Uint8Array(await readFile('./src/bridge/fixtures/frame-colors.webm'));
  let value = videoTimeline({ operation: 'new', width: 160, height: 120 });
  value = videoTimeline({ operation: 'edit', value, op: {
    kind: 'import-media', media: { id: 'source', name: 'frame-colors.webm',
      mime: 'video/webm', kind: 'video', duration: 1.5, width: 128, height: 96 }, bytes,
  } });
  value = videoTimeline({ operation: 'edit', value, op: {
    kind: 'place-media', mediaId: 'source', clipId: 'clip',
  } });
  value = videoTimeline({ operation: 'edit', value, op: {
    kind: 'trim', id: 'clip', in: cIn, out: cOut,
  } });
  const encoded = videoTimeline({ operation: 'encode', value });
  return Buffer.concat(nativeContainer({ op: 'encode', package: {
    project: { format: 'gsnv-video', version: 1, id: 'trimmed-review',
      title: 'Trimmed review', content: encoded.content }, assets: encoded.assets,
  } }).parts);
}
```

Reproduction steps used with Node/tsx and Playwright's installed Chrome:

1. In a fresh context, disable the native file picker methods so the app uses
   the file-input/download fallback. Open the native fixture through File Open.
2. Open the Video menu and click `[data-command="video.end"]:visible`.
3. Read preview pixel `(10,10)`. Send the current frame to Image, save the native
   Image, decode its container, and inspect the first layer's first RGBA pixel.
4. Repeat with `[0,0.5)` and `[0.5,1)` in separate contexts. Both timelines are
   0.5 seconds long. There are no fades or titles in these fixtures.
5. Independently load the same media in a private video element, seek to
   `clip.out - 0.000001`, draw to a canvas and read its first interior pixel.

Exact successful reproduction output (exit 0):

```json
{"browser":"154.0.8037.97","clip":[0,0.5],"timelineEnd":0.5,"previewAtEnd":[0,255,2,255],"transferAtEnd":[0,255,2,255],"clamped":{"requested":0.499999,"pixel":[254,0,0,255]},"errors":[]}
{"browser":"154.0.8037.97","clip":[0.5,1],"timelineEnd":0.5,"previewAtEnd":[0,0,253,255],"transferAtEnd":[0,0,253,255],"clamped":{"requested":0.999999,"pixel":[0,255,2,255]},"errors":[]}
```

An earlier independent run also sampled the first fixture at timeline 0.49:
preview was `[254,0,0,255]` (correct red), then End → Image was
`[0,255,2,255]` (excluded green). A screenshot from that run is
`/tmp/gsnv-review-trimmed-end.png`; the pixel/container evidence above is the
primary oracle. The fixture's documented codec tolerance is 3 channels, so
these are different frames, not tolerated color conversion noise.

**Minimal repair:** use one source-sampling policy for preview and D03. Keep the
displayed timeline position, clip offset, fade and transfer metadata exact.
Only the decoder sample should be inside
`[clip.in, min(clip.out, decodedMedia.duration))`. At the exclusive endpoint,
sample just before it using a decoder-effective/representable margin; the
existing one-microsecond convention works for both reproduced cases. Never
clamp below a nonzero `clip.in`. If the actual decoded duration leaves no valid
interval at or after `clip.in`, report a readable frame error instead of
seeking into an earlier excluded part of the source. Do not subtract a whole
project frame: source frame rates and arbitrary trim points can differ.

Required regression: the two real-decoder cases above, preview and independently
decoded native Image pixels, plus interior and adjacent-clip boundaries,
nonzero in, actual media end, immutable input, unchanged fade/offset, and
existing cancellation/stale-state cleanup. The owner has committed the bounded
repair contract in `VIDEO-BOUNDARY-REPAIR.md`; this report does not claim the
repair is already verified.

### 2. P2 — Duplicate native media identities can become an unsaveable document

Locations at review: `src/video/video-timeline.ts:74–83` (decode), `:99–102`
(remove), and `:70–72` (encode).

The native decoder accepts two media records with the same ID. Both use a
single entry in the byte map. Removing that unplaced bin item deletes one
record and its bytes, leaving the second record with no bytes. The next native
save fails. This is a pre-existing decoder-validation weakness exposed by the
new bin-removal action. App-generated unique IDs do not by themselves trigger
it; a corrupted or manually modified native file can.

Confirmed with a valid generated PNG and a full native-container
encode/decode round-trip. It does not depend on invalid media bytes. Exact
command from the repository root:

```sh
node --import tsx --input-type=module <<'JS'
import {videoTimeline} from './src/video/video-timeline.ts';
import {nativeContainer} from './src/shared/native-container.ts';
import {encodePng} from './src/bridge/png-encode.ts';
const rgba=new Uint8ClampedArray(16*16*4);
for(let i=0;i<rgba.length;i+=4)rgba.set([255,0,0,255],i);
const bytes=await encodePng({width:16,height:16,rgba,colorSpace:'srgb',alpha:'straight'});
const media={id:'same',name:'one.png',mime:'image/png',kind:'image',duration:3,width:16,height:16};
const input={project:{format:'gsnv-video',version:1,id:'duplicate-review',title:'Duplicate media review',
content:{width:16,height:16,fps:30,media:[media,{...media,name:'two.png'}],clips:[],titles:[]}},
assets:[{id:'media-same',mime:'image/png',bytes}]};
const reopened=nativeContainer({op:'decode',parts:nativeContainer({op:'encode',package:input}).parts});
const value=videoTimeline({operation:'decode',content:reopened.project.content,assets:reopened.assets});
const next=videoTimeline({operation:'edit',value,op:{kind:'remove-media',mediaId:'same'}});
const encoded=videoTimeline({operation:'encode',value:next});
let save;
try {nativeContainer({op:'encode',package:{project:{...reopened.project,content:encoded.content},assets:encoded.assets}});save='unexpected success';}
catch(e){save=String(e);}
console.log(JSON.stringify({validPngBytes:bytes.length,nativeDecodeAccepted:true,
decodeMedia:value.media.map(m=>m.id),remaining:next.media.map(m=>m.name),
remainingMediaHasBytes:next.bytes.has('same'),save}));
JS
```

Output, exit 0:

```json
{"validPngBytes":95,"nativeDecodeAccepted":true,"decodeMedia":["same","same"],"remaining":["two.png"],"remainingMediaHasBytes":false,"save":"ContainerFormatError: Container parts and assets must be Uint8Array bytes."}
```

**Minimal repair:** reject ambiguous identities at native decode before a
document is returned, with `VideoContentError`; preserve the active workspace
when Open fails. Do not silently merge/remap the two records. Check clip/title
identity and matching asset invariants at the same boundary so later
identity-based edits have a consistent precondition. Regression should include
this valid-PNG fixture and a valid unplaced-media remove → encode → reopen
sequence, keeping existing undo/redo and source-byte preservation checks.

## Checks independently executed

All commands below were run against source from this increment. They are
focused tests, not the complete product suite, and passed despite missing the
two adversarial cases above.

```sh
node --import tsx --test \
  src/cad/default-plane-frame.test.ts src/cad/kernel-plane-transform.test.ts \
  src/cad/sketch-profile-source.test.ts src/cad/sketch-profile-edit.test.ts \
  src/cad/cad-expression-policy.test.ts src/cad/cad-legacy-sketch-edit.test.ts \
  src/cad/cad-model-edit.test.ts src/cad/profile-content.test.ts \
  src/cad/cad-profiles.test.ts src/cad/part-planes.test.ts \
  src/cad/acceptance-plate-planes.test.ts src/cad/part-builder.test.ts \
  src/image/image-selection-state.test.ts src/image/image-content.test.ts \
  src/image/image-acceptance.test.ts > /tmp/gsnv-review-cad-image.log 2>&1

node --import tsx --test src/bridge/*.test.ts \
  src/app/app-shell-bridge.test.ts src/video/video-field-edit.test.ts \
  src/video/video-media-bin.test.ts src/video/video-timeline.test.ts \
  > /tmp/gsnv-review-bridge.log 2>&1

node --import tsx --test src/shared/chrome.test.ts \
  > /tmp/gsnv-review-chrome.log 2>&1
```

| Command group | Exit | Tests | Pass | Fail | Skipped | Cancelled | Todo | Duration ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CAD / Image | 0 | 34 | 34 | 0 | 0 | 0 | 0 | 8574.118348 |
| Bridge / Video | 0 | 25 | 25 | 0 | 0 | 0 | 0 | 4309.600364 |
| Shared chrome | 0 | 19 | 19 | 0 | 0 | 0 | 0 | 1559.847493 |

The S10 source review found no new blocker in the stable control reconciliation:
same-workspace controls retain their nodes, unchanged glyphs remain attached,
removed/disabled controls cannot dispatch, and old-workspace controls are
discarded. Its focused 19-test suite was independently run. The new real-browser
Save-on-blur test source was inspected, but its successful browser execution
was reported by the parent, not independently repeated by this reviewer.

## Scope and requirement-credit limits

- No confirmed additional blocker was found in the reviewed CAD default-plane,
  native-solid transform, editable-profile, worker-cleanup, or Image persisted
  selection paths. That is a review result, not proof of all CAD/Image behavior.
- `IMG-103` and `IMG-104` have bounded exact-pixel and native-round-trip evidence
  for the documented 32×24 scripted fixture. That fixture does not demonstrate
  editable text or layer masks. It must not be used to credit those functions.
- The reviewed bounded test mappings for `CAD-020`, `CAD-025`, `CAD-030`, and
  `CAD-033` need the parent's final combined candidate gates before any ledger
  promotion. This reviewer did not change their status.
- `CAD-071` remains untested as a product requirement. A native revolve proof
  alone does not implement the production revolve workspace.
- `XWS-002` remains untested for its full requirement: the current compositor
  lacks the correction stage, and the endpoint failure above is now confirmed.
  `XWS-001` and `XWS-003` also await the parent's full candidate gate; this
  report does not promote them.
- Broader CAD features, other editors, performance targets, native packaging,
  deployment, and the overall consumer-usability objective are outside this
  bounded checkpoint and remain governed by the existing requirement ledger.
  No other browser or operating system was smoke-tested here.

Both candidate blockers and the exact reproductions were sent to the parent
and the assigned repair owner. No claim of human acceptance is made.
