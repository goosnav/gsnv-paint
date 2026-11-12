# gsnv-paint tutorial

## What you get today

The launcher opens gsnv-paint in your browser: menus, the CAD / Image / Video workspace tabs, and the History and Recovery panels. The Image tab is a paint-style editor. The CAD tab supports line/rectangle/circle sketches, dimensions, horizontal/vertical constraints and blind extrusion with holes. Video still displays its unavailable state. Nothing leaves your computer. There are no accounts and no API keys.

## Make a first CAD part

1. Choose New (Ctrl+N), then Rectangle dimensions. Width 100 and height 60 create a fully constrained sketch.
2. Choose Extrude (E). Depth 10 previews a real solid. OK commits; Cancel restores the prior part.
3. Click Width or Height in the Part panel to edit it. The extrusion rebuilds automatically.
4. Save with Ctrl+S. Open the `.gsnv-cad` file with Ctrl+O to continue editing. Restore recovery on reload if offered.
5. Choose Export STEP to download the solid or write it through the browser’s file picker. Export does not save the editable project; keep the `.gsnv-cad` file for dimensions and feature history. Esc cancels an export that is still running.

Use V to select, L for a two-click line, R for a two-click rectangle, F to fit. The rectangle tool replaces the sketch and can be undone. Select an edge to add or remove H/V constraints. Scroll to zoom, hold Space while dragging to pan the sketch, and middle-drag to orbit the solid (Shift+middle-drag pans). Failed sketches and extrusions display a reason in the Part panel.

This is not the complete suite. In CAD, one XY sketch region (outline plus holes), one blind boss and STEP/STL output are supported. The Image editor has one layer. The remaining CAD tools and exports, layers, Video and the packaged release are still under development.

## Paint a first image

1. Choose the Image tab, then New (Ctrl+N). An 800 × 600 white canvas opens.
2. Pick a tool in the left palette: Select (S), Pencil (P), Brush (B), Eraser (E), Fill (G), Pick colour (I), Line (L), Rectangle (R), Ellipse (O), Text (T).
3. In the Colours panel, click a swatch for the primary colour (left button) or right-click one for the secondary colour (right button and eraser). Set the size and the shape style there. X swaps the colours; D resets them.
4. Hold Shift for squares, circles and 45° lines. Scroll to zoom, hold Space and drag (or middle-drag) to pan, F to fit.
5. Drag with Select, then drag inside the selection to move it; Enter places it, Esc cancels. Ctrl+C / Ctrl+X / Ctrl+V, Delete and Crop to selection work on it.
6. Image → Export PNG saves a picture. Ctrl+S saves an editable `.gsnv-image` project. Image → Import image opens a PNG, JPEG, GIF, WebP or BMP.

## Add holes to a CAD part

After creating the rectangle in the steps above, choose Sketch → Circle dimensions… and enter a diameter and center, or press C and click a center and then a point on the circle. Circles inside the outline become holes when you extrude. Solid → Export STL (3D printing) saves the part for a slicer.

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
| Serves `dist/` to this computer only and opens the browser. | no | — |

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

macOS on Apple Silicon is verified. The Windows and Linux launchers have not been run on those systems yet.
