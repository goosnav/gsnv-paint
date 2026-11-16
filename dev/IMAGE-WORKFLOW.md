# Image workspace — workflows and native format

[D20](DECISIONS.md#d20--deliver-a-working-paint-style-image-workspace-before-the-full-layer-roster) introduced a paint-style editor. The 2026-11-12 plan (item 2) extends it with the Photoshop/GIMP functionality people use most. The full I01–I37 roster stays planned; this working increment is I50–I58 plus IMAGE-APP. Nothing is human-ACCEPTED.

The current upgrade contract is [PAINT-UPGRADE-2026-11.md](PAINT-UPGRADE-2026-11.md).
The historical verification below applies to its dated checkpoint, not to every
feature now described here. Remaining consumer gaps are tracked separately in
[CONSUMER-GAPS-2026-11.md](CONSUMER-GAPS-2026-11.md).

## Start, open and find tools

On a fresh start Image supplies an 800 × 600 white canvas in Pixel art mode with
full colour. Recovery takes priority: an unresolved recoverable document is not
replaced by a starter. **New / Ctrl+N** opens a previewed dialog, defaulting to
**US Letter at 300 ppi (2550 × 3300 pixels)** with a white background, hard edges
and full colour. Choose a named preset or edit width, height, background (white,
transparent or foreground colour), rendering, colour limit and dithering.
**Swap width and height** switches portrait/landscape without changing the other
settings. Cancel keeps the current document; changing presets only updates the
miniature until Create is pressed.

### New image presets

| Preset | Pixels (width × height) | Starting style / print sizing |
|---|---|---|
| US Letter (default) | 2550 × 3300 | 8.5 × 11 in at 300 ppi; white, hard edges, full colour |
| Comic page · 64 colours | 3300 × 2550 | 11 × 8.5 in at 300 ppi; transparent, hard edges, 64 colours, no dithering |
| Half Letter | 1650 × 2550 | 5.5 × 8.5 in at 300 ppi; white, hard edges, full colour |
| A4 | 2480 × 3508 | Approximately 210 × 297 mm at 300 ppi; white, hard edges, full colour |
| Maximum square | 4096 × 4096 | Transparent, hard edges, full colour; existing 16,777,216-pixel limit |
| Square post | 1080 × 1080 | 1:1; white, smooth edges, full colour |
| Portrait post | 1080 × 1350 | 4:5; white, smooth edges, full colour |
| Reels / Stories | 1080 × 1920 | 9:16; white, smooth edges, full colour |
| YouTube thumbnail · HD | 1280 × 720 | 16:9; white, smooth edges, full colour |
| YouTube thumbnail · 4K | 3840 × 2160 | 16:9; white, smooth edges, full colour |
| Poster · 11 × 17 in | 2640 × 4080 | 240 ppi; white, hard edges, full colour |
| Poster · 18 × 24 in | 2700 × 3600 | 150 ppi; white, hard edges, full colour |
| Small canvas | 800 × 600 | White, hard edges, full colour |

All presets start with no dithering. Selecting one applies its dimensions and
drawing style together. Manual edits select **Custom settings** unless they match
a named preset, including its opposite orientation. Selecting Custom preserves
the current values. Selecting a different named preset applies its original
orientation and settings. The preset selector uses a full-width row; controls
stack on narrow screens, and the dialog scrolls when needed.

Print sizes and ppi describe the intended pixel density. They do not add print
resolution metadata to PNG exports or change the printer's scaling settings.
Poster densities keep both sizes within the existing raster limit. No large
canvas is allocated simply by browsing presets.

The HD thumbnail is a compact working size; the 4K option follows
[YouTube's current thumbnail resolution guidance](https://support.google.com/youtube/answer/72431)
(checked 2026-11-16). These presets set canvas dimensions, not upload file sizes.

**Open / Ctrl+O** accepts `.gsnv-image`, PNG, JPEG, WebP, GIF and BMP. Ordinary
images open as a document; **Image → Import as layer…** adds an image instead.
Animated files are opened as a still image through the browser decoder.
**Copy canvas** places the flattened result on the system clipboard where browser
permission permits. Paste into the untouched starter adopts the image dimensions;
paste into existing work adds a layer with free-transform handles. Clipboard
failure is reported; an internal copy is not claimed as a system copy.

**Help** searches the available commands and local tutorials/FAQ. Searching
“font” describes **Text → Import font…**. Help shows a command's menu path and
availability; its navigation action locates the command rather than silently
running a destructive edit.

## Tools (shortcut)

| Group | Tools |
|---|---|
| Move and select | Move (V), Rectangle select (S), Ellipse select (M), Lasso (Q), Magic wand (W). Shift adds to the selection, Ctrl subtracts. Selections are pixel masks shown with marching ants; dragging inside one moves its pixels. |
| Paint | Pencil (P, hard pixels), Brush (B: hard pixels by default, pixel size, opacity; optional Smooth with hardness/flow), Airbrush (A: sprays while held), Eraser (E: to transparency; to the secondary colour on the bottom layer), Clone stamp (C: Ctrl-click sets the source), Blur brush (U), Smudge (K: the brush carries picked-up colour; Strength), Fill (G: tolerance, contiguous), Gradient (N: linear/radial, to the secondary colour or transparent) |
| Draw | Text (T), Line (L), Rectangle (R), Ellipse (O): outline, fill or both; Shift for squares, circles and 45° |
| Colour | Pick colour (I), 28-colour XP palette, exact colour inputs, X swap, D defaults |

Numeric tool options pair an XP trackbar with a typed number box (applied on Enter
or blur). `[` and `]` change brush size; a ring shows the brush footprint. Painting,
fills, gradients and adjustments respect the selection. Text creates a separate
raster layer with transform handles; it is not an editable text object or a
selection-clipped text operation. Its dialog supports multiline text, colour,
font, size, bold, italic, alignment and line spacing. **Import font…** accepts
TTF/OTF up to 32 MiB; fonts stay on this device. Placed text is stored as pixels,
including in recorded actions, so reopening does not need that font installed.

## Layers, adjustments, filters

- **Layers:** new, duplicate, delete, move up/down, visibility, rename (double-click), opacity, blend mode (normal, multiply, screen, overlay, darken, lighten, difference), merge down, flatten. Paste and Import as layer create new layers.
- **Adjustments** (live preview, OK/Cancel): Brightness/Contrast, Hue/Saturation, Levels, Curves (outputs at 64/128/192 through a monotone curve), Colour balance, Desaturate, Invert, Sepia, Posterize, Threshold.
- **Filters:** Gaussian blur, Unsharp mask, Add noise, Down-pixel, Pixelate (averaged), Find edges, Emboss.
- **Image:** Open image as a new document, Export PNG (flattened), Resize, Canvas size, Crop to selection, rotate, flip.
- **Files:** `.gsnv-image` projects store each layer and the current selection as separate assets, plus document pixel policy. Earlier project layouts still open. Selection and policy changes have their own undo steps and survive recovery.
- **View:** View → View settings shows the effective pixel zoom after Fit or wheel zoom. Type 1–6400% and optional horizontal/vertical offsets in screen pixels; preview stays centered, and Cancel restores the prior view. Canvas rendering defaults to Sharp pixels (nearest); Smooth blends the display without editing image pixels. Pixel size 1–32 controls coarse drawing blocks for Pencil and hard Brush/Eraser. Free transform offers Pixels (nearest, default) or Smooth (bilinear) sampling.

## Pixel art, smooth edges and limited palettes

These are separate choices. A raster always consists of pixels. **Nearest-neighbour
display** enlarges each pixel into a distinct block; **antialiasing** puts partially
covered pixels into a generated edge; **palette quantization** reduces colours to
chosen swatches. Bicubic is a smoothing resampler, not the name for hard pixels.
Gaussian blur is an explicit filter, not the underlying image format.

**Image → Pixel settings…** controls the document:

- **Pixel art — hard edges** makes newly rendered text use binary coverage
  (coverage below 128 becomes transparent, otherwise opaque), draws hard shape
  edges, and uses nearest-neighbour image resizing. The browser still determines
  the font outline before coverage is hardened. Thin glyph details can disappear
  at tiny sizes; there is no recovery of detail that the canvas never contained.
- **Smooth artwork — antialiased edges** retains fractional text coverage, samples
  shape edges and uses bilinear image resizing. Free transform has its own explicit
  nearest/bilinear choice. Brush edges, intentional opacity and blur filters remain
  independent controls; Pixel art/full colour does not prohibit soft artwork.
- **Full colour** preserves the composite's RGBA values. A **colour limit** stores
  a fixed palette and maps the final composite to it, after layers, opacity and
  blend modes. Standard counts are 2, 4, 8, 16, 32, 64, 128 and 256. Choose preset
  colours, generate from the current image, or enter exact custom hex swatches.
  Generation is deterministic and sampled once per selected count in the dialog;
  later drawing does not silently change the palette.
- With a limit, each output pixel is either an opaque palette colour or fully
  transparent black. There are no partially transparent output pixels. **None**
  thresholds alpha at 128. **Ordered (Bayer 4×4)** and **Floyd–Steinberg** distribute
  colour and opacity across neighbouring pixels. Transparency does not count as
  an extra opaque swatch. The image can use fewer colours than the selected limit.

Policy changes are nondestructive metadata: the original full-colour layer bytes,
including intentional transparency, remain in the project. Switching to Full
colour removes quantization; it does not reverse already-applied edits, text
rasterization or resampling. Opening an older or ordinary image does not remove
its existing soft pixels. Use a limited palette or an explicit filter to alter
that appearance. The hard-edged default cannot reconstruct a blurred source.

The visible composite, PNG export, canvas copy and Image-to-Video transfer use
the output policy. Native project save retains editable source layers and policy.
PNG is lossless and preserves the final pixel colours at native resolution; this
is not a promise of an indexed PNG encoding. Other viewers can smooth a PNG when
zooming. No exact-colour promise applies to later JPEG conversion or video encoding.

**Filters → Down-pixel…** samples a smaller logical grid with nearest neighbours.
Keep the original canvas dimensions for larger crisp blocks, or choose to resize
the image to the grid. Preview/cancel do not edit the document; confirmation applies
to all layers, clears the selection and forms one undo step. It does not average
colours. **Pixelate (averaged)** is a different, destructive filter that averages
each cell on the active layer and can introduce new colours before output policy.

## Actions and batches

**Automation** records semantic edits and provides an editable list, preview on a
copy, explicit Apply once, `.gsnv-actions` save/open, JavaScript-generated recipes
and folder/file batch processing. Opening an action file never executes it.
Batch output is PNG or an editable Paint project. Originals remain inputs;
outputs go to a timestamped child folder or an explicit ZIP download fallback.
See [IMAGE-ACTIONS-V1.md](IMAGE-ACTIONS-V1.md) for exact schemas, scaling,
cancellation behavior, resource caps and examples. Action files are saved
separately from the image project; an unsaved recording is session state.

## Verification — 2026-11-12

| Check | Result |
|---|---|
| `image-composite.test.ts` | Golden pixels for all seven blend modes, opacity, transparency, hidden layers; masked merge with soft edges |
| `image-adjust.test.ts` | Identity settings, known values for brightness/contrast/levels/curves/threshold/posterize/hue/desaturate, monotone curves, premultiplied blur, unsharp edges, pixelate averages, seeded noise, region limits |
| `image-brush.test.ts` | Smudge carry and fade, soft falloff, flow accumulation, gap-free strokes, deterministic spray, paint/erase/clone/filter coverage, gradients, rectangle/ellipse/lasso masks, contiguous/global wand, mask algebra |
| `image-content.test.ts` | Tile sharing per layer, stack edits reusing tiles, byte-exact layered round trip, legacy single-layer decode, rejection cases |
| IMAGE-APP browser tests (production build, Chrome 154) | Pencil/rectangle/fill/pick/move pixels, undo/redo, two-layer project round trip with exact bytes per layer, PNG export, Open image, reopen, recovery. Second test: brush clipped to an ellipse selection, layer opacity 50 % (exact grey), screen blend, invert, Brightness/Contrast preview and cancel, Levels, Gaussian blur, merge down, text, resize, canvas size, crop, with the exact history labels |
| `npm test` / `npm run test:browser` | 562 / 22 pass |

## Limits

No layer masks, groups, layer/alpha locking or editable text layers. Selections
have no feather/grow/shrink controls. There is no skew handle, rounded-rectangle
or polygon drawing tool, bicubic resize, anchored canvas resize, or Image JPEG/
WebP exporter. Pen pressure is not used. Images allow at most 16,777,216 pixels
total (4096 × 4096 is one possible size) and 100 layers; UI fields can impose
smaller per-axis limits. These limits are not performance guarantees for maximum
size documents. Automation has additional memory and time caps.

Linux Chromium/WebKit checks and touch emulation do not establish physical
iPhone/iPad, Apple Pencil, Safari/macOS or Windows acceptance. Refer to each dated
evidence file for the browser/OS actually tested.


## Exact acceptance and selection persistence — 2026-11-13

IMG-103 and IMG-104 PASS in the production Chrome workflow and the independent
pixel golden. All 3,072 composite bytes, every native layer byte and parameter,
and all 768 selection bytes are checked; the reopened background remains
editable. The fixture has no text or layer masks, so this is no evidence for
those separate missing features. [Commands and evidence](IMAGE-ACCEPTANCE.md).

## Current native format — `rgba8-layers-v3`

The native container envelope remains `gsnv-image`, version **1**. The domain
layout advances independently to `rgba8-layers-v3`. Exact content fields:

```json
{
  "width": 32,
  "height": 32,
  "encoding": "rgba8-layers-v3",
  "policy": { "mode": "pixel-art", "palette": null },
  "activeLayerId": "background",
  "layers": [
    { "id": "background", "name": "Background", "visible": true,
      "opacity": 1, "blend": "normal", "asset": "pixels-0" }
  ],
  "selection": null
}
```

Layers are ordered bottom-to-top. Each `pixels-N` asset contains exactly
`width × height × 4` straight-alpha RGBA bytes in row-major order, including RGB
under zero alpha. `opacity` is 0–1; blend is `normal`, `multiply`, `screen`,
`overlay`, `darken`, `lighten` or `difference`. IDs are unique and the active ID
must name an existing layer.

`selection` is null or `{"encoding":"gray8","asset":"selection"}`. Its asset
has exactly one coverage byte per pixel (0 excluded, 255 included); bounds are
derived from the mask. `policy` has exactly `mode` and `palette`. Mode is
`pixel-art` or `smooth`; palette is null or
`{"colours":[[0,0,0],[255,255,255]],"dither":"none"}`. There must be 1–256 unique
integer RGB triples in 0–255. Dither is `none`, `bayer` or `floyd-steinberg`.
There is no embedded font or action-recording state in this format.

Old `rgba8` and `rgba8-layers` layouts migrate with no selection;
`rgba8-layers-v2` retains its selection. All three receive Pixel art/full-colour
policy without changing any stored pixels. Saving writes v3. Unknown future
layouts and malformed/missing/duplicate asset records fail visibly. The exact
reader/writer is [image-content.ts](../src/image/image-content.ts); policy
validation is [image-pixel-policy.ts](../src/image/image-pixel-policy.ts).
