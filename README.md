# gsnv-paint

One creative suite with Image, Video and CAD workspaces. The same static browser build will run on the web and from a local launcher. Work stays on the device.

Development follows the [specification](dev/00-INDEX.md) and [module map](dev/MODULE_MAP.md). CAD is the first editor. Implementation and platform verification are incomplete; the repository does not yet contain a usable application or release.

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

Run `npm ci` and `npm run dev` to open the current application shell with live reload. `npm start` is the launcher without the runtime check; `npm run test:launcher` starts it for real and checks the served page, isolation headers and second-launch reuse. Production workspace editing remains unavailable. The development-only `/dev/fixtures/app-shell.html` page exercises shared controls and persistence with explicit one-pixel test data.

`npm run build` creates the static output in `dist/`. `npm test` runs unit and assembly seams; `npm run test:browser` builds first, then runs the Chrome component and assembly checks. Browser tests require an installed Chrome channel. See the [shell integration contract](dev/APP-SHELL.md) and [Phase 1 evidence](dev/PHASE-1.md) for scope and limitations.

The [Phase 2 kernel spike](dev/PHASE-2.md) runs real OpenCascade WASM in a browser worker. Its development demo is `/dev/fixtures/kernel-runtime.html`; the production CAD modeler is not connected yet.

The pinned PlaneGCS package requires a declaration packaging repair, applied automatically by `npm ci`. If lifecycle scripts are disabled, run `npm run prepare:solver` explicitly. `npm run test:solver-types` checks the repaired upstream declarations with strict NodeNext resolution. See [D11](dev/DECISIONS.md#d11--planegcs-declaration-packaging).

The C02 development demo at `/dev/fixtures/solver-runtime.html` solves a real constrained rectangle, displays conflicting constraint IDs, and exercises worker disposal. Its browser test is recorded in [Phase 2](dev/PHASE-2.md). The combined engine fixture at `/dev/fixtures/engine-assembly.html` verifies both runtimes in one worker, retained geometry and solver state, clean disposal, cancellation and failure recovery. The production sketch editor is still pending. See the [assembly contract](dev/CAD-ENGINE-ASSEMBLY.md).

The C03 core evaluator supports typed dimension arithmetic and named-variable references. Run `node --import tsx src/cad/dimension-expressions.demo.ts` for its standalone example. C04 resolves named definitions in dependency order, reports direct consumers and rejects cycles; run `node --import tsx src/cad/named-variables.demo.ts` for that example. Both are GREEN component checkpoints in [Phase 2](dev/PHASE-2.md); editable dimension fields and downstream feature rebuilding are not connected yet. C05 is next, pending the revision-exhaustion contract amendment recorded in that report.

C07 constructs points, lines, corner/center rectangles and regular polygons as pure sketch geometry, with exact connected endpoints and document-tolerance checks. Run `node --import tsx src/cad/sketch-linear-primitives.demo.ts` to inspect the plate and pocket outlines. This GREEN component is not yet connected to an interactive sketch editor.
