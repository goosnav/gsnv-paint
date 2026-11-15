# Image actions v1 — portable edits and batch processing

An action is validated edit data, saved as UTF-8 JSON with extension
`.gsnv-actions`. It contains no executable code, filesystem path, font dependency
or file handle. **Open actions…** only loads it. **Preview on copy**, **Apply
once**, **Build recipe** and **Run batch** are separate explicit actions.
The native image format is documented in [IMAGE-WORKFLOW.md](IMAGE-WORKFLOW.md).

## User workflow

1. Choose **Automation → Start recording**, then edit the image. Committed brush
   strokes, shapes, selections, layer edits, transfers, adjustments, transforms
   and policy changes become semantic steps. Copy is recorded even though it
   does not change pixels. Canceled dialogs contribute no step.
2. **Stop recording**, then **Actions…** to name the action, enable/disable,
   reorder or remove steps, edit their parameters and select PNG/project output.
   **Preview on copy** leaves the canvas unchanged. **Apply once** applies the
   whole result as one image undo step; a failed or stopped run applies nothing.
   Canceling the Actions dialog retains action-list edits, not preview pixels.
3. **Save actions…** writes a portable file. This is separate from saving the
   image. Recording state and unsaved actions are not part of image recovery.

Undo/Redo while recording follows the actual image-history identities. A new
edit after Undo truncates the recorded redo branch; a copy-only step after Undo
also branches. Navigating before the recording boundary or to an unknown history
state pauses with a reason. An unsupported committed edit pauses instead of being
silently omitted. Stop and start a new recording to establish a new boundary.
Reordering steps can change their meaning; missing layers/assets and invalid
operations produce a readable step number and label.

External pasted images and rasterized text are embedded as exact RGBA assets.
Text can be transformed as pixels but cannot be edited as text on replay. An
internal copy samples the current input; a recorded embedded image always uses
that captured image. The OS clipboard is never read during a batch.
Undo changes document history but does not rewind the actual clipboard. If the
copy that produced the clipboard has been undone, a subsequent paste embeds
those actual pixels as an asset. A fresh recorded copy restores input-relative
replay. This avoids substituting an older surviving copy from the recipe.

## Exact file envelope

All listed fields are required unless explicitly marked optional. Unknown fields,
versions or discriminators fail validation; numbers are not coerced from strings.

```json
{
  "format": "gsnv-actions",
  "version": 1,
  "name": "Small monochrome image",
  "steps": [
    {
      "id": "resize-1",
      "label": "Resize to 32 pixels",
      "enabled": true,
      "reference": { "width": 800, "height": 600 },
      "operation": {
        "kind": "transform",
        "transform": { "kind": "resize", "width": 32, "height": 32 }
      }
    },
    {
      "id": "palette-1",
      "label": "Black and white with ordered dithering",
      "enabled": true,
      "reference": { "width": 32, "height": 32 },
      "operation": {
        "kind": "policy",
        "policy": {
          "mode": "pixel-art",
          "palette": { "colours": [[0,0,0],[255,255,255]], "dither": "bayer" }
        }
      }
    }
  ],
  "assets": [],
  "output": "png"
}
```

`output` is `png` or `project` (a `.gsnv-image` file). It controls batch encoding,
not whether applying a recipe silently saves a file. `steps` may be empty, but the
UI requires an enabled step to run. `enabled:false` skips execution, not schema
or resource validation.

Each asset record has exactly these keys:

```json
{ "id": "red-pixel", "width": 1, "height": 1,
  "encoding": "rgba8-base64", "data": "/wAA/w==" }
```

This example is opaque red. The base64 decodes to exactly `width × height × 4`
bytes in row-major straight-alpha RGBA order. Hidden RGB under zero alpha is
preserved. Runtime code uses an owned `Uint8ClampedArray`; the file uses base64,
not a JSON numeric array. Asset references are IDs, never URLs or paths.

Names/step labels are nonblank strings up to 256 UTF-16 code units with no
U+0000–U+001F controls. IDs match `[A-Za-z0-9_-]{1,128}` and cannot be
`__proto__`, `constructor` or `prototype`. Step IDs are unique within steps;
asset IDs are unique within assets. References to assets must resolve, including
inside disabled steps. Dimensions are positive integers with at most 16,777,216
pixels total. Reference dimensions describe the document **before that step**.

## Operation schema

The tables describe fields in addition to `kind`. Exact discriminated types are
in [image-operation-types.ts](../src/image/image-operation-types.ts); runtime
checks are in [image-operations-validate.ts](../src/image/image-operations-validate.ts).

Common values:

- `point` = `[x,y]`, finite document coordinates in −1,000,000…1,000,000.
- `RGBA` = four integer bytes `[red,green,blue,alpha]`; `RGB` = three. Opacity,
  hardness, flow and strength are finite numbers in 0…1.
- `index`/`to` = integer layer index 0…99, bottom-to-top. The referenced layer
  must exist at execution time. Layer names use the same rules as action names.
- `box` = `{x,y,width,height}`. Width/height are at least 1, may be fractional,
  and their product cannot exceed the pixel limit. `sampling` = `nearest` or
  `bilinear`. `background` supplies the bottom-layer replacement colour when
  pixels are lifted/deleted; upper layers erase to transparency.

| `kind` | Required fields and variants |
|---|---|
| `stroke` | `tool`, `segments`, `options`, `color:RGBA`, `background:RGBA`, `cloneOffset:point\|null`. Tools: `pencil`, `brush`, `eraser`, `airbrush`, `clone`, `blur`, `smudge`. Segments are nonempty `{points:[point,…],seed}` records; each has at least one point and a uint32 seed. Options are exactly `{size,pixelSize,edge,hardness,opacity,flow,strength,density}`: size integer 1…500, pixelSize integer 1…32, edge `pixel`/`smooth`, density integer 1…200. Clone requires a non-null offset. Segment boundaries/seeds preserve delivered spray/stroke behavior. |
| `shape` | `shape:'line'\|'rectangle'\|'ellipse'`, `a:point`, `b:point`, integer `size` 1…500, `stroke:RGBA\|null`, `fill:RGBA\|null`. A line requires a stroke. Document policy chooses shape edge rasterization. |
| `selection` | `action:'all'\|'none'\|'invert'` alone; or `action:'shape'`, `shape`, `mode`; or `action:'wand'`, `point`, `tolerance` 0…255, `contiguous:boolean`, `sample:'active'\|'merged'`, `mode`. Mode is `replace`, `add`, `subtract`, `intersect`. A selection shape is `{kind:'rectangle'\|'ellipse',a,b}` or `{kind:'polygon',points:[point,point,point,…]}`. |
| `layer` | `action:'select'\|'duplicate'\|'delete'\|'mergeDown'` with `index`; `action:'new'` with `name`; `action:'rename'` with `index,name`; `action:'visibility'` with `index,visible:boolean`; `action:'opacity'` with `index,opacity`; `action:'blend'` with `index,blend`; `action:'reorder'` with `index,to`; or `action:'flatten'` alone. Blend is `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `difference`. |
| `fill` | `point`, `color:RGBA`, `opacity`, `tolerance` 0…255, `contiguous:boolean`, `sample:'active'\|'merged'`. |
| `gradient` | `shape:'linear'\|'radial'`, `a:point`, `b:point`, `start:RGBA`, `end:RGBA`. |
| `clipboard` | `action:'copy'\|'cut'`, `source:'selection'\|'canvas'`, `background:RGBA`. Cut from canvas is invalid. Selection copy/cut with no selection is a no-op. Canvas copy samples the output-policy composite; selection copy samples the active layer selection with output policy. |
| `delete` | `background:RGBA`; deletes selected pixels, no-op without a selection. |
| `paste` | `source:{kind:'clipboard'}` or `{kind:'asset',id}`, `name`, `box`, `sampling`, `select:boolean`. Creates a layer above the active layer. No clipboard value or missing asset is an error. |
| `move` | `dx`, `dy` (coordinate bounds), `background:RGBA`; moves the current selection or whole active layer. |
| `affine` | `box:{x,y,width,height,angle}`, `sampling`, `background:RGBA`, optional `asset` ID. Angle is −36,000…36,000 degrees; rotated output bounds must fit the pixel limit. Without asset, samples the selected/current-layer pixels. With asset, samples the original embedded image, avoiding clipping a large pasted source before transformation. |
| `adjust` | `adjustment`, as below; applies to active-layer pixels within the current selection. |
| `transform` | `transform`, as below; document transform across all layers. |
| `policy` | `policy:{mode,palette}`. Mode `pixel-art`/`smooth`; palette null or `{colours:[RGB,…],dither:'none'\|'bayer'\|'floyd-steinberg'}` with 1…256 distinct swatches. This changes metadata, not stored layer colours. |
| `downpixel` | Positive integer `width,height`, `resize:boolean`. Grid cannot exceed current image dimensions. Nearest sampling applies to all layers; false expands blocks back to original dimensions, true changes document dimensions. Selection clears. |

Transform variants, each with `kind` and only the fields listed:

| Transform `kind` | Fields |
|---|---|
| `flip` | `axis:'horizontal'\|'vertical'` |
| `rotate` | `turns:1\|2\|3` clockwise quarter turns |
| `invert` | None |
| `crop` | `rect:{x,y,width,height}`, all integer, positive width/height; clipped to document, empty result fails |
| `resize` | Positive integer `width,height`; nearest in Pixel art, edge-clamped bilinear in Smooth |
| `canvas` | Positive integer `width,height`, `fill:RGBA`; content anchored at top-left |

Adjustment variants, each with `kind` and only the fields listed. Numeric bounds
are inclusive; values may be fractional unless marked integer. No implicit defaults.

| Adjustment `kind` | Fields/ranges |
|---|---|
| `brightnessContrast` | `brightness`, `contrast`: −100…100 |
| `hueSaturation` | `hue`: −180…180; `saturation`, `lightness`: −100…100 |
| `levels` | `inBlack`: 0…254; `inWhite`: inBlack+1…255; `gamma`: 0.1…10; `outBlack`, `outWhite`: 0…255 |
| `curves` | `shadows`, `midtones`, `highlights`: 0…255 |
| `colorBalance` | `cyanRed`, `magentaGreen`, `yellowBlue`: −100…100 |
| `desaturate`, `invert`, `sepia`, `findEdges`, `emboss` | None |
| `posterize` | `levels`: 2…64 (levels per channel, not a fixed total palette count) |
| `threshold` | `level`: 0…255 |
| `gaussianBlur` | `radius`: 0.5…100 |
| `unsharpMask` | `amount`: 0…500; `radius`: 0.5…50; `threshold`: 0…255 |
| `addNoise` | `amount`: 0…100; `monochrome:boolean`; `seed`: uint32 integer |
| `pixelate` | `size`: 2…256, rounded to whole cells; averages cell colours |

## Scaling onto a different image

Before each enabled step, replay computes `sx = currentWidth/reference.width`,
`sy = currentHeight/reference.height`, and `s = min(sx,sy)`. X coordinates and
distances use sx; Y uses sy. Brush/shape size and brush pixelSize use
`max(1,round(original*s))`. Blur/unsharp radius uses s; averaged-pixelate cell size
uses `max(2,round(original*s))`. Paste/affine box positions and dimensions scale
per axis; crop coordinates and dimensions then round to integers. Rotation,
colours, layer indices, opacity, tolerances and other dimensionless values stay
unchanged. Scaled operations are validated again; an out-of-range brush or blur
size fails explicitly instead of silently clamping.

Explicit **resize, canvas-size and down-pixel target dimensions remain absolute**.
Each following step scales from its own recorded reference against the dimensions
then current. Thus a 20-pixel X move recorded on width 100 becomes 40 pixels on
width 200, but an explicit resize to 32 × 32 remains 32 × 32. Nonuniform input
aspect ratios can stretch shapes. Changing step order or disabling a resize does
not rewrite the stored references. Layer-index operations assume a compatible
stack; preview representative inputs before running a batch.

## JavaScript-generated recipes

**Automation → JavaScript actions…** runs source only after **Build recipe**.
It uses the Code workspace's opaque-origin iframe and a fresh terminable worker.
The script receives frozen `image = {width,height,layerCount}`, `add(operation)`
and these helpers:

```js
// Choose either add(...) calls or return an array, never both.
add(ops.selectionAll());
add(ops.adjust({ kind: 'desaturate' }));
add(ops.downpixel(32, 32, false)); // crisp blocks, original dimensions
// Other helpers: ops.resize(width, height), ops.layerNew(name).
```

This example requires an input at least 32 × 32. `add(...)` also accepts any
validated operation above. A script may return an operation array instead. It
cannot supply external asset references; the generated recipe has no assets.
Clipboard operations refer only to copies made inside that recipe run. The
metadata is not a raw pixel buffer; scripts have no app DOM, file handles, host
storage, arbitrary network access or font-loading authority. This is a local,
offline JavaScript recipe builder, not a system terminal or Python batch runner.
Wait for the app's **Ready offline** status before disconnecting.

**Use recipe** opens Actions for review; it does not immediately edit the image.
Changing source invalidates the previous generated recipe. Do not write console
messages: the runner expects one internal JSON result envelope. Errors, Stop and
timeout leave the original image unchanged. Browser worker isolation and the
deadline do not provide a hard heap quota for arbitrary JavaScript allocations.

## Batch files, output and cancellation

**Automation → Batch process…** takes the current recipe. Choose images or a
folder containing PNG/JPEG/WebP/GIF/BMP or `.gsnv-image` files. Only direct children
are processed; nested folders and unsupported extensions are counted as ignored.
GIFs are still images. File selection captures metadata; a changed source is
reported when reread. Source images are decoded one at a time, not all retained.

**Preview samples** decodes every input and replays one representative for each
distinct width/height. Successful previews enable **Run batch**. Unreadable
inputs are listed and may be skipped; a representative replay failure blocks
running until resolved. Same dimensions do not imply the same layer structure,
so per-file failures can still occur during the run. Processing is sequential;
decode/replay/encode failures are reported per file and later inputs continue.
A destination write failure stops the run.

With directory-write support, folder inputs default to a new child of that
folder. Individual files require an explicitly chosen destination directory.
Names follow `gsnv-paint-batch-YYYY-MM-DD_HH-mm-ssZ-<run-id>` using UTC. Existing
names get collision suffixes; sanitization prevents traversal/reserved names.
Originals are never output targets. The browser API cannot guarantee atomic
exclusive creation against another process simultaneously changing that folder.

Without directory writing, select the clearly labelled timestamped ZIP output.
The ZIP stores uncompressed output files and is retained in memory until finish.
**Download ZIP** hands it to the browser; a download request is not proof that a
file reached the user's disk or a particular folder. Browser decode/encode can
delay Stop until that API returns. The replay worker itself is terminated.
Stopping a directory run retains completed files and attempts to abort/remove
the incomplete write. OS cleanup failure may leave a visible incomplete file.
Stopping/failing a ZIP run discards the incomplete archive, including its completed
entries. The final report distinguishes written, errored and unprocessed inputs.

## Resource limits

| Resource | Current cap |
|---|---|
| Recipe steps / embedded assets | 1,000 each |
| Combined stroke samples and polygon-selection vertices | 1,000,000, including disabled steps |
| Decoded embedded RGBA assets | 128 MiB total |
| Encoded `.gsnv-actions` file | 192 MiB |
| Image/asset/reference dimensions | Positive whole pixels, at most 16,777,216 pixels total |
| Layer stack | 100 layers |
| Recipe document layer data | 256 MiB at input, intermediate enabled steps and returned output; scratch allocations are not a hard heap quota |
| Recipe execution | 60 seconds per worker job |
| JavaScript source / result | 64 KiB / 128 KiB UTF-8 |
| JavaScript runtime | Existing Code runner's 30-second deadline, plus Stop |
| Batch source selection | 10,000 supported images |
| Batch input file | 256 MiB before decode |
| Batch preview | 25 distinct width/height pairs; split larger sets into separate batches |
| ZIP fallback | 128 MiB encoded total including headers; ZIP32, no ZIP64; memory can temporarily exceed encoded size |

These are rejection boundaries, not latency or maximum-memory guarantees. A
single 4096 × 4096 RGBA layer is already 64 MiB. Prefer writable-folder output
and smaller batches for large work.

## Verification entry points

This document describes implemented contracts, not a new full-suite or device
acceptance claim. The source tests cover schema/codec failures, scaling, golden
pixel replay, recorder history, script isolation/cancel, destination conflicts,
ZIP integrity and batch cancellation. Relevant focused checks include:

```sh
node --import tsx --test src/image/image-recipe.test.ts src/image/image-recorder.test.ts src/image/image-operations.test.ts
node --import tsx --test src/image/image-batch-files.test.ts src/image/image-batch-zip.test.ts src/image/image-batch-run.test.ts
```

Browser workflow checks are `image-automation.browser.spec.ts`,
`image-batch.browser.spec.ts` and `image-recipe-script.browser.spec.ts`. Their
execution/environment evidence belongs in the upgrade checkpoint; listing them
here is not a claim that every browser/OS has passed them.
