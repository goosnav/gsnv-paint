# gsnv-paint

One local creative suite with CAD, Image, Photo, Video, Document, Slides, Audio, Spreadsheet and Code workspaces. The web site and local launcher serve the same static browser build. Work stays on the device.

Development follows the [specification](dev/00-INDEX.md) and [module map](dev/MODULE_MAP.md). The interface uses Windows XP-inspired Luna colours, pixel-crisp Tahoma text and original cursors within a web application ([design](dev/DESIGN-XP.md)). The current workflows are:

- **Image:** a layered Paint/Photoshop-style editor with brushes, persistent selections (rectangle, ellipse, lasso, magic wand), clone and blur brushes, gradients, layers with blend modes, adjustments and filters ([details](dev/IMAGE-WORKFLOW.md)).
- **Photo:** a Lightroom-style editor that develops camera RAW files (via LibRaw) or JPEGs: Auto, presets, light/colour/presence, tone curve, colour mixer, detail, effects, crop and full-size export ([details](dev/PHOTO-WORKFLOW.md)).
- **Video:** a basic editor: media bin, clips and stills in sequence, trim, split, reorder, fades, volume, titles and export to MP4 or WebM ([details](dev/VIDEO-WORKFLOW.md)).
- **CAD:** sketches on XY/XZ/YZ, lines, rectangles, centered rectangles, circles, regular polygons and construction geometry; driving dimensions, named variables and formula-driven placement, relationship constraints, OpenCascade extrusions with holes, cuts, fillets and chamfers, metric or imperial units; STEP import with all-body inspection, STEP and STL export ([modeling evidence](dev/CAD-MODELING-EVIDENCE.md), [STEP import](dev/CAD-STEP-IMPORT.md)).
- **Document:** styled text, headings, lists, tables, local images, page setup, editable projects, HTML/text export and print/PDF output.
- **Slides:** editable text, images and shapes, slide order, typed or dragged geometry, themes, presentation controls and PDF output ([details](dev/SLIDES-WORKFLOW.md)).
- **Audio:** waveform selection and playback, cut/copy/paste/delete/trim, fades, normalize, volume and sample-verified WAV export ([details](dev/AUDIO-WORKFLOW.md)).
- **Spreadsheet:** multiple sheets, formulas, copy/paste/fill, formats, row/column edits, sort/filter and CSV/XLSX interchange ([supported formulas and limits](dev/SPREADSHEET-WORKFLOW.md)).
- **Code:** file tree, syntax-aware editor tabs and search, JavaScript/Python Run and Stop with bounded console output, and HTML/CSS preview ([details](dev/CODE-WORKFLOW.md)). JavaScript runs the entry file in a worker; Python supports local modules and its bundled standard library. HTML/CSS preview does not run scripts.

All use shared save/open, undo/redo, stored projects and local recovery. Failed browser backups keep unsaved work open with a Save instruction. Send Image composites to the Video bin, current Video frames to Image, or transparent CAD views to Image through each workspace's menus. These are working subsets; the full original CAD/Image/Video scope and packaged release remain unfinished. [Readiness ledger](dev/CONSUMER-READINESS.md).

The [modeling and offline checkpoint](dev/MODELING-OFFLINE-CHECKPOINT.md) records the current candidate's results: 908 unit tests, 89 combined browser checks, nine offline checks and the local Cloudflare hosting check passed. These cover the bounded CAD plane/profile, snapshot-transfer, offline and recovery/focus work. Earlier CAD Open timeouts and the test chooser-interception correction remain in the [diagnosis](dev/CAD-REOPEN-DIAGNOSIS.md); the correction changed test setup, not application behavior. This checkpoint does not establish full consumer or packaged-release acceptance.

The production app prepares a complete offline copy, including its CAD, RAW and Python engines. Wait for **Ready offline** in the status bar before disconnecting. The status panel provides retry and update checks. Updates wait until all app tabs close; they do not reload your document. Project files and recovery are separate from the application cache. Browser storage can be cleared or evicted, in which case reconnect and use **Retry offline setup**.

## Run it

No setup is needed. Start the launcher for your system from this folder:

| System | Start with |
|---|---|
| macOS | double-click `run.command` |
| Windows | double-click `run.cmd` (it runs `run.ps1`) |
| Linux | `./run.sh` in a terminal |

The launcher builds the application, serves it only to this computer at `http://127.0.0.1:24173/` and opens your browser. The first start needs a network connection. Keep the launcher window open while you work; press Ctrl+C in it to stop. [TUTORIAL.md](TUTORIAL.md) covers setup details, data locations and troubleshooting. Current verification covers the launcher process, build freshness and HTTP serving on Linux x64 with automatic browser opening disabled. Windows/macOS operation, OS double-click integration and the planned M1a package remain separate gates. These launchers run the source folder.

## Develop

Run `npm ci` and `npm run dev` to open the current application shell with live reload. `npm start` is the launcher without the runtime check; `npm run test:launcher` starts it for real and checks the served page, isolation headers and second-launch reuse. The production CAD workspace is connected. The development-only `/dev/fixtures/app-shell.html` page exercises shared controls and persistence with explicit one-pixel test data.

`npm run build` creates the static output in `dist/`, an integrity manifest and the offline worker. It rejects any individual asset at or above the configured 25 MiB limit. `npm test` runs unit and assembly seams; `npm run test:browser` builds first, then runs the default Chrome component and assembly checks. The default suite uses installed system Chrome, currently 154.0.8037.97 on the verification host. `npm run test:offline-build` checks manifest generation; `npm run test:offline` builds fresh disposable candidates and checks complete-browser restarts, all nine offline workflows and update recovery. `npm run test:static-host` builds and checks local Wrangler hosting, including exact cached bytes and an offline reload. Run build-owning commands sequentially.

After `npm run build`, the recorded combined gate selects the production Audio, Spreadsheet, Code and transfer workspaces explicitly:

```sh
AUDIO_PRODUCTION=1 SHEET_PRODUCTION=1 CODE_WORKSPACE_APP=1 BRIDGE_WORKSPACE_APP=1 node_modules/.bin/playwright test
```

Its 89 checks combine production workflows with component fixtures; they are not 89 separate end-to-end journeys.

The dedicated offline gate needs an explicit Chrome for Testing 158 override on this host. System Chrome 154 independently crashes on a download after persistent-profile restarts, even in a reproducer with no app or service worker. It is not recorded as passing that gate, and the harness does not silently switch browsers. With Playwright's browser executable already installed, inspect its version and select it explicitly:

```sh
offline_chrome_path="$(node -e "process.stdout.write(require('playwright').chromium.executablePath())")"
"$offline_chrome_path" --version
GSNV_OFFLINE_CHROME_PATH="$offline_chrome_path" npm run test:offline
```

The verified executable here is `/home/goosnav/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`, version **158.0.8127.18**. The override applies to both persistent production profiles and small offline fixtures; it does not change `npm run test:browser`. The [offline evidence](dev/OFFLINE-WORKFLOW.md) retains the separate Chrome 154 failure, Chrome 158 browser-only success and application recovery regression. See the [current checkpoint](dev/MODELING-OFFLINE-CHECKPOINT.md) for the final candidate result, and the [shell contract](dev/APP-SHELL.md) for persistence scope.

## Cloudflare deployment

For the Cloudflare Workers build pipeline, keep the build command **`npm run build`** and deploy command **`npx wrangler deploy`**, with the repository root as the project directory. The committed `wrangler.jsonc` publishes `dist/` as static assets. It does not add application server code or require the Cloudflare Vite plugin. Wrangler is pinned in the lockfile, so deployment does not install a changing CLI version or run automatic framework setup.

`npm run test:deploy` builds and validates the deployment locally without uploading. `npx wrangler dev` serves the built files through Cloudflare's local runtime. `public/_headers` is copied into `dist/` to set the same cross-origin isolation policy as the local launcher. The same static output can be published through Pages using `npm run build` and output directory `dist`; the Wrangler configuration targets the Workers pipeline shown above.

The [deployment repair report](dev/CLOUDFLARE-DEPLOYMENT.md) records the original failure and verification limits. Local Wrangler tests and a dry run do not establish a live hosted deployment; that remains a separate gate in the [current checkpoint](dev/MODELING-OFFLINE-CHECKPOINT.md).

The [Phase 2 kernel spike](dev/PHASE-2.md) runs real OpenCascade WASM in a browser worker. Its development demo is `/dev/fixtures/kernel-runtime.html`; the production CAD workspace uses the same kernel runtime.

The pinned PlaneGCS package requires a declaration packaging repair, applied automatically by `npm ci`. If lifecycle scripts are disabled, run `npm run prepare:solver` explicitly. `npm run test:solver-types` checks the repaired upstream declarations with strict NodeNext resolution. See [D11](dev/DECISIONS.md#d11--planegcs-declaration-packaging).

The C02 development demo at `/dev/fixtures/solver-runtime.html` solves a real constrained rectangle, displays conflicting constraint IDs, and exercises worker disposal. Its browser test is recorded in [Phase 2](dev/PHASE-2.md). The combined engine fixture at `/dev/fixtures/engine-assembly.html` verifies both runtimes in one worker, retained geometry and solver state, clean disposal, cancellation and failure recovery. The production sketch editor now uses both engines. See the [assembly contract](dev/CAD-ENGINE-ASSEMBLY.md).

The C03 core evaluator supports typed dimension arithmetic and named-variable references. Run `node --import tsx src/cad/dimension-expressions.demo.ts` for its standalone example. C04 resolves named definitions in dependency order, reports direct consumers and rejects cycles; run `node --import tsx src/cad/named-variables.demo.ts` for that example. Both are GREEN component checkpoints in [Phase 2](dev/PHASE-2.md); the production increment connects editable dimensions to sketch and extrusion rebuilds. C05’s separate revision-exhaustion amendment remains pending.

C07 constructs points, lines, corner/center rectangles and regular polygons as pure sketch geometry, with exact connected endpoints and document-tolerance checks. Run `node --import tsx src/cad/sketch-linear-primitives.demo.ts` to inspect the plate and pocket outlines. Lines, both rectangle tools and regular polygons are connected to the interactive sketch editor.

## First CAD part

1. Choose **New** (Ctrl+N), then **Rectangle dimensions…**. Enter width 100 and height 60.
2. Choose **Extrude…** (E), enter depth 10, inspect the live solid, then confirm.
3. Use the Width/Height controls to edit driving dimensions. The solid rebuilds with the sketch.
4. Use Ctrl+Z/Ctrl+Y for history and Ctrl+S/Ctrl+O for editable `.gsnv-cad` files. On reload, choose Restore recovery if needed.
5. Choose **Export STEP** to save the solid for other CAD software. Esc cancels an export that is still running.

V selects sketch edges, L draws lines, R draws a rectangle, C draws a circle, F fits the view. Rectangle drawing replaces the current outline and keeps circles; Undo restores it. Centered rectangles and regular polygons retain editable dimensions and append to the sketch. Choose the default plane in the Part panel. Circles inside the outline become holes; Sketch → Circle dimensions… places an exact hole. Add a variable such as `width = 100`, then use `width - 10` for a hole center or `width / 2 - 10` for a centered 20 mm pocket's corner. Changing units preserves physical dimensions. Solid → Export STL saves a file for 3D printing. Import STEP opens existing models as explicitly non-parametric solids; all bodies and original STEP bytes are retained in the native project. The current parametric model supports a default-plane sketch, a blind boss, separate through/blind cuts and fillet/chamfer edge groups. Planar-face sketches, general face/edge selection, production revolve, 3MF/DXF export and drawing sheets remain unfinished. See [consumer repair evidence](dev/CONSUMER-REPAIR-CHECKPOINT.md) for the real acceptance-plate checks.

## First image

Switch to the Image tab and press Ctrl+N. Pick a tool from the toolbox (B brush, P pencil, E eraser, G fill, N gradient, S/M/Q/W selections, V move, C clone), set size and opacity with the trackbars or by typing in the boxes, click a swatch for the primary colour or right-click for the secondary, and paint. Use the Layer, Adjustments and Filters menus for Photoshop-style work. Ctrl+Z undoes each step. Image → Export PNG saves a picture; Ctrl+S saves an editable `.gsnv-image` project. See [Image workflow evidence](dev/IMAGE-WORKFLOW.md).

## First photo

Switch to the Photo tab, choose Import photo… (or drop a RAW/JPEG file), press Auto or pick a preset, then refine with the sliders (type exact values in the boxes; double-click a label to reset). `\` compares before/after and R crops. Photo → Export… saves a full-size JPEG or PNG. See [Photo workflow](dev/PHOTO-WORKFLOW.md).
