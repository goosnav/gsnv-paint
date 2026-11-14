# gsnv-paint tutorial

## What you get today

gsnv-paint is a browser application with XP-inspired menus and toolbars. The workspace buttons open CAD, Image, Photo, Video, Document, Slides, Audio, Spreadsheet and Code. Each workspace shares project files, History and Recovery. Editing stays on your computer; there are no accounts or API keys. Wait for “Ready offline” before relying on a network-free browser restart.

## Make a first CAD part

1. Choose New (Ctrl+N), then Rectangle dimensions. Width 100 and height 60 create a fully constrained sketch.
2. Choose Extrude (E). Depth 10 previews a real solid. OK commits; Cancel restores the prior part.
3. Click Width or Height in the Part panel to edit it. The extrusion rebuilds automatically.
4. Save with Ctrl+S. Open the `.gsnv-cad` file with Ctrl+O to continue editing. Restore recovery on reload if offered.
5. Choose Export STEP to download the solid or write it through the browser’s file picker. Export does not save the editable project; keep the `.gsnv-cad` file for dimensions and feature history. Esc cancels an export that is still running.

Use V to select, L for a two-click line, R for a two-click rectangle, F to fit. The rectangle tool replaces the sketch and can be undone. Select an edge to add or remove H/V constraints. Scroll to zoom, hold Space while dragging to pan the sketch, and middle-drag to orbit the solid (Shift+middle-drag pans). Failed sketches and extrusions display a reason in the Part panel.

Choose XY, XZ or YZ in the Part panel. Add named variables there and use expressions such as `width / 2` in dimension fields. Extruded parts support separate through/blind cuts and grouped fillets/chamfers. Import STEP opens existing solids without inventing parametric history. The [readiness ledger](dev/CONSUMER-READINESS.md) records the supported scope and remaining release work.

## Revolve a tube

1. Start a new CAD part. In Rectangle dimensions, enter width 10, height 12, Corner X 10 and Corner Y 0.
2. Choose Revolve… (Shift+E). The axis is Sketch vertical axis (+V). At `360 deg`, the rectangle produces a tube with inner radius 10 and outer radius 20 mm.
3. Type `90 deg` or `-90 deg` to preview a partial turn. Enter confirms; Esc restores the previous part.
4. Edit the Width dimension or click Revolve 1 in the feature tree to change the angle. Named angle variables work too. Save an editable project with Ctrl+S, or export the rebuilt solid as STEP.

Use one closed polygon on the nonnegative side of the sketch's U axis, or one circle clear of the axis. Polygon edges may touch the axis. Holes in the section, other axes, revolve cuts and features after a revolve are not supported yet. Replacing a lone extrusion is explicitly labeled; Undo restores it. An extrusion with downstream features cannot be replaced.

## Paint a first image

1. Choose the Image tab, then New (Ctrl+N). An 800 × 600 white canvas opens.
2. Pick a tool in the toolbox on the left. Hover a tool to see its name and shortcut: V move, S/M/Q/W selections, P pencil, B brush, A airbrush, E eraser, C clone, U blur, G fill, N gradient, I pick colour, T text, L/R/O shapes.
3. In "Colours and tool options", click a swatch for the primary colour, or right-click one for the secondary. Set size, hardness, opacity and the other options with the trackbars, or type an exact value in the box beside each one and press Enter. `[` and `]` also change brush size.
4. Hold Shift for squares, circles and 45° lines. With a selection tool, Shift adds to the selection and Ctrl subtracts. Painting stays inside the selection. Esc deselects.
5. Layers: use the Layers panel or the Layer menu to add, duplicate, reorder, hide, rename, set opacity and blend mode, merge or flatten.
6. Adjustments and Filters (menus) preview live; OK applies, Cancel restores.
7. Image → Export PNG saves a flattened picture. Ctrl+S saves an editable `.gsnv-image` project with its layers.

## Develop a photo

1. Choose the Photo tab and Import photo… (or drop a file). Camera RAW support comes from the bundled decoder; ordinary image formats depend on browser decoding. An unsupported file shows an error.
2. Press Auto, or click a preset (Natural, Vivid, Portrait, Landscape, Black & White, Film Warm, Matte, High Key).
3. Refine with the sliders in Light, Colour, Presence, Tone curve, Colour mixer, Detail and Effects. Type exact values in the boxes; double-click a label to reset it.
4. `\` shows before/after. R (or Crop) shows the crop frame: choose an aspect, drag the frame or its handles, then press Enter.
5. Photo → Export… saves a JPEG or PNG at full size or a chosen long edge. Ctrl+S saves a `.gsnv-photo` project that keeps the original file and your settings.

## Add holes to a CAD part

After creating the rectangle in the steps above, choose Sketch → Circle dimensions… and enter a diameter and center, or press C and click a center and then a point on the circle. Circles inside the outline become holes when you extrude. Solid → Export STL (3D printing) saves the part for a slicer.

## Edit audio

Choose Audio → Import audio… and select a recording. Drag across the waveform, or type exact selection start/end frames. Cut, copy, paste, delete and Trim operate on that selection. Effects provides fades, volume and normalization; Ctrl+Z restores an edit. Space plays/stops when the waveform has focus. Save the editable project with Ctrl+S, or choose Export WAV… for a PCM16 audio file. This workspace edits recordings; it does not compose with instruments or a piano roll.

## Work with a spreadsheet

Choose Spreadsheet and New. Type values or formulas beginning with `=` into cells. Select a range for Fill down/right, cell formatting, sorting or filtering. Workbook imports/exports XLSX and CSV and manages sheets. Ctrl+S keeps the supported editable workbook in the native project format. Unsupported workbook features are reported; full Excel compatibility is not claimed.

## Write and run code

Choose Code and New. Add source files through Code → New source file…, choose JavaScript or Python and edit in the source pane. Run entry executes the selected entry; Stop terminates a running job. HTML/CSS files have a script-free preview. Save the whole editable project with Ctrl+S, or import/export individual sources through the Code menu. Execution uses browser runtimes, without a system terminal or external package installation; opened source never runs automatically.

## Video, documents and slides

Video → Add video or image… places media in a sequence. Select clips to trim, split, reorder, adjust volume or add fades; Add title… places text. Export video… records the sequence in real time using a browser-supported format. Keep the tab visible. This is a basic sequence editor; the original multitrack, transition and frame-accurate export requirements remain unfinished.

Document supports styled text, lists, pictures and tables, with editable project saving and PDF/HTML output. Slides supports text boxes, pictures and shapes, slide order, presentation and PDF export. Use Ctrl+S for an editable native project in either workspace.

## Start

1. Download or clone this folder and keep it complete.
2. Start the launcher for your system:
   - **macOS:** double-click `run.command`.
   - **Windows:** double-click `run.cmd`. Running `run.ps1` in PowerShell does the same.
   - **Linux:** open a terminal in this folder and run `./run.sh`.
3. Your browser opens `http://127.0.0.1:24173/`. If it does not, open that address yourself.
4. Keep the launcher window open while you work. Press Ctrl+C in it, or close it, to stop.

Starting the launcher again while it is running reopens the same copy.

## What the first start does

| Step | Needs network | Where it goes |
|---|---|---|
| Finds Node.js 22.12 or newer. If none is installed, downloads Node.js 24.22.3 from nodejs.org and checks it against a pinned SHA-256. | only when downloading | the data folder below |
| Installs the locked dependencies with `npm ci`. | yes | `node_modules/` in this folder |
| Builds the application. | no | `dist/` in this folder |
| Serves `dist/` to this computer only and opens the browser. | no | - |

Later starts skip every step whose inputs did not change, and work offline.

## Where things are stored

| What | Location |
|---|---|
| Downloaded Node.js (only if needed) | macOS `~/Library/Application Support/gsnv-paint/runtime`; Windows `%LOCALAPPDATA%\gsnv-paint\runtime`; Linux `~/.local/share/gsnv-paint/runtime` |
| Recovery data | your browser's storage for `http://127.0.0.1:24173` |
| Project files | wherever you save them |

Recovery data belongs to that exact address in that browser. A different browser, a different port, or `localhost` instead of `127.0.0.1` will not show it. Clearing site data for that address deletes it. Save project files for a durable copy.

To remove everything, delete this folder and the data folder above.

## Troubleshooting

The launcher prints `gsnv-paint [CODE]: message` when it stops.

| Code | Meaning | What to do |
|---|---|---|
| `LAUNCH-ROOT` | The launcher was moved out of its folder, or files are missing. | Keep the launcher inside the complete gsnv-paint folder. |
| `LAUNCH-PLATFORM` | The system or processor has no supported Node.js download, or the installed Node.js is too old for `npm start`. | Install Node.js 22.12 or newer, or start with the launcher for your system. |
| `LAUNCH-BROWSER` | No browser could be opened. The application is still running. | Open `http://127.0.0.1:24173/` yourself. |
| `BOOT-NETWORK` | A download or `npm ci` failed. | Check the connection or proxy, then start again. |
| `BOOT-INTEGRITY` | The downloaded Node.js did not match its pinned checksum and was deleted. | Start again. If it repeats, stop and report it. |
| `BOOT-PERMISSION` / `BOOT-DISK` | The data folder could not be written or unpacked. | Check permissions and free disk space. |
| `APP-START` | The build failed, the port is used by another program, or something unexpected happened. | Read the message. For a busy port, close the other program, or set `GSNV_PAINT_PORT` to another port; recovery data is kept per port. |

Other notes:

- **macOS says the file cannot be opened.** This happens to downloaded, unsigned files. Right-click `run.command`, choose Open, then confirm. Nothing is signed or notarized.
- **Windows shows a SmartScreen or security prompt.** The scripts are unsigned. `run.cmd` starts PowerShell with a policy exception for that one process; it changes no system setting.
- **Linux opens `run.sh` in an editor.** Run it from a terminal instead. Alpine and other musl systems need their own Node.js 22.12 or newer.
- **Dependencies look damaged.** Delete `node_modules/` and start again.

## Checks

```bash
npm run test:launcher
```

starts the real launcher on a test port and checks the served page, the isolation headers, loopback-only access and second-launch reuse. `npm test`, `npm run typecheck` and `npm run test:browser` are described in the [README](README.md).

## Verified platforms

Current checks cover Linux x64 source launching and desktop Chrome. The browser suite uses Chrome 154; the persistent offline/restart suite uses Chrome for Testing 158 because of a separately recorded Chrome 154 restart/download crash. Windows/macOS launchers, OS double-click behavior, native OS file pickers and the M1a packaged release remain unverified. See the [README](README.md) for exact commands and evidence.
