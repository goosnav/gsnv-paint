# gsnv-paint

One creative suite with Image, Video and CAD workspaces. The same static browser build will run on the web and from a local launcher. Work stays on the device.

Development follows the [specification](dev/00-INDEX.md) and [module map](dev/MODULE_MAP.md). Two workspaces work today:

- **Image** — a paint-style editor: pencil, brush, eraser, fill, colour picker, line, rectangle, ellipse, text, rectangular selection with move/copy/paste/crop, resize, rotate/flip and PNG import/export ([details](dev/IMAGE-WORKFLOW.md)).
- **CAD** — line/rectangle/circle sketches, driving dimensions, horizontal/vertical constraints and a real OpenCascade blind extrusion, including holes; STEP and STL export ([workflow](dev/CAD-WORKFLOW.md), [holes and STL](dev/CAD-HOLES-STL.md)).

Both have save/open, undo/redo and local recovery. Video editing, the remaining CAD features (cuts, fillets, other planes, drawings) and the packaged release are unfinished.

The [decision record](dev/DECISIONS.md) documents dependency selection, distribution constraints and license obligations. Phase reports under `dev/` distinguish passed, failed and untested requirements. Only the owner accepts a release.

## Run it

No setup is needed. Start the launcher for your system from this folder:

| System | Start with |
|---|---|
| macOS | double-click `run.command` |
| Windows | double-click `run.cmd` (it runs `run.ps1`) |
| Linux | `./run.sh` in a terminal |

The launcher builds the application, serves it only to this computer at `http://127.0.0.1:24173/` and opens your browser. The first start needs a network connection. Keep the launcher window open while you work; press Ctrl+C in it to stop. [TUTORIAL.md](TUTORIAL.md) covers setup details, data locations and troubleshooting. The launchers are verified on macOS (Apple Silicon) only; Windows and Linux are untested. They run this source folder and are not the planned packaged release ([D14](dev/DECISIONS.md#d14--script-launchers-for-the-source-folder)).

## Develop

Run `npm ci` and `npm run dev` to open the current application shell with live reload. `npm start` is the launcher without the runtime check; `npm run test:launcher` starts it for real and checks the served page, isolation headers and second-launch reuse. The production CAD workspace is connected. The development-only `/dev/fixtures/app-shell.html` page exercises shared controls and persistence with explicit one-pixel test data.

`npm run build` creates the static output in `dist/`. `npm test` runs unit and assembly seams; `npm run test:browser` builds first, then runs the Chrome component and assembly checks. Browser tests require an installed Chrome channel. See the [shell integration contract](dev/APP-SHELL.md) and [Phase 1 evidence](dev/PHASE-1.md) for scope and limitations.

## Cloudflare deployment

For the Cloudflare Workers build pipeline, keep the build command **`npm run build`** and deploy command **`npx wrangler deploy`**, with the repository root as the project directory. The committed `wrangler.jsonc` publishes `dist/` as static assets. It does not add application server code or require the Cloudflare Vite plugin. Wrangler is pinned in the lockfile, so deployment does not install a changing CLI version or run automatic framework setup.

`npm run test:deploy` builds and validates the deployment locally without uploading. `npx wrangler dev` serves the built files through Cloudflare's local runtime. `public/_headers` is copied into `dist/` to set the same cross-origin isolation policy as the local launcher. The same static output can be published through Pages using `npm run build` and output directory `dist`; the Wrangler configuration targets the Workers pipeline shown above.

The [deployment repair report](dev/CLOUDFLARE-DEPLOYMENT.md) records the original failure and verification limits.

The [Phase 2 kernel spike](dev/PHASE-2.md) runs real OpenCascade WASM in a browser worker. Its development demo is `/dev/fixtures/kernel-runtime.html`; the production CAD workspace uses the same kernel runtime.

The pinned PlaneGCS package requires a declaration packaging repair, applied automatically by `npm ci`. If lifecycle scripts are disabled, run `npm run prepare:solver` explicitly. `npm run test:solver-types` checks the repaired upstream declarations with strict NodeNext resolution. See [D11](dev/DECISIONS.md#d11--planegcs-declaration-packaging).

The C02 development demo at `/dev/fixtures/solver-runtime.html` solves a real constrained rectangle, displays conflicting constraint IDs, and exercises worker disposal. Its browser test is recorded in [Phase 2](dev/PHASE-2.md). The combined engine fixture at `/dev/fixtures/engine-assembly.html` verifies both runtimes in one worker, retained geometry and solver state, clean disposal, cancellation and failure recovery. The production sketch editor now uses both engines. See the [assembly contract](dev/CAD-ENGINE-ASSEMBLY.md).

The C03 core evaluator supports typed dimension arithmetic and named-variable references. Run `node --import tsx src/cad/dimension-expressions.demo.ts` for its standalone example. C04 resolves named definitions in dependency order, reports direct consumers and rejects cycles; run `node --import tsx src/cad/named-variables.demo.ts` for that example. Both are GREEN component checkpoints in [Phase 2](dev/PHASE-2.md); the production increment connects editable dimensions to sketch and extrusion rebuilds. C05’s separate revision-exhaustion amendment remains pending.

C07 constructs points, lines, corner/center rectangles and regular polygons as pure sketch geometry, with exact connected endpoints and document-tolerance checks. Run `node --import tsx src/cad/sketch-linear-primitives.demo.ts` to inspect the plate and pocket outlines. Line and corner-rectangle generation are connected to the interactive sketch editor.

## First CAD part

1. Choose **New** (Ctrl+N), then **Rectangle dimensions…**. Enter width 100 and height 60.
2. Choose **Extrude…** (E), enter depth 10, inspect the live solid, then confirm.
3. Use the Width/Height controls to edit driving dimensions. The solid rebuilds with the sketch.
4. Use Ctrl+Z/Ctrl+Y for history and Ctrl+S/Ctrl+O for editable `.gsnv-cad` files. On reload, choose Restore recovery if needed.
5. Choose **Export STEP** to save the solid for other CAD software. Esc cancels an export that is still running.

V selects sketch edges, L draws lines, R draws a rectangle, C draws a circle, F fits the view. Rectangle drawing replaces the current outline and keeps circles; Undo restores it. Circles inside the outline become holes; Sketch → Circle dimensions… places an exact hole. Solid → Export STL saves a file for 3D printing. Sketch coordinates use millimetres internally. One XY sketch region (outline plus holes) and a blind boss are supported. Cuts, fillets, other planes, STEP import, 3MF/DXF export and drawing sheets remain unfinished. See [CAD workflow evidence](dev/CAD-WORKFLOW.md), [holes and STL](dev/CAD-HOLES-STL.md) and [STEP export evidence](dev/CAD-STEP-EXPORT.md) for exact tests and limits.

## First image

Switch to the Image tab and press Ctrl+N. Pick a tool from the palette (or press P, B, E, G, I, L, R, O, T, S), click a swatch for the primary colour or right-click for the secondary, and draw. Ctrl+Z undoes each stroke or shape. Image → Export PNG saves a picture; Ctrl+S saves an editable `.gsnv-image` project. See [Image workflow evidence](dev/IMAGE-WORKFLOW.md).
