# gsnv-paint

One creative suite with Image, Video and CAD workspaces. The same static browser build will run on the web and from a local launcher. Work stays on the device.

Development follows the [specification](dev/00-INDEX.md) and [module map](dev/MODULE_MAP.md). CAD is the first editor. Implementation and platform verification are incomplete; the repository does not yet contain a usable application or release.

The [decision record](dev/DECISIONS.md) documents dependency selection, distribution constraints and license obligations. Phase reports under `dev/` distinguish passed, failed and untested requirements. Only the owner accepts a release.

Run `npm ci` and `npm run dev` to open the current application shell. Production workspace editing remains unavailable. The development-only `/dev/fixtures/app-shell.html` page exercises shared controls and persistence with explicit one-pixel test data.

`npm run build` creates the static output in `dist/`. `npm test` runs unit and assembly seams; `npm run test:browser` builds first, then runs the Chrome component and assembly checks. Browser tests require an installed Chrome channel. See the [shell integration contract](dev/APP-SHELL.md) and [Phase 1 evidence](dev/PHASE-1.md) for scope and limitations.

The [Phase 2 kernel spike](dev/PHASE-2.md) runs real OpenCascade WASM in a browser worker. Its development demo is `/dev/fixtures/kernel-runtime.html`; the production CAD modeler is not connected yet.

The pinned PlaneGCS package requires a declaration packaging repair, applied automatically by `npm ci`. If lifecycle scripts are disabled, run `npm run prepare:solver` explicitly. `npm run test:solver-types` checks the repaired upstream declarations with strict NodeNext resolution. See [D11](dev/DECISIONS.md#d11--planegcs-declaration-packaging).

The C02 development demo at `/dev/fixtures/solver-runtime.html` solves a real constrained rectangle, displays conflicting constraint IDs, and exercises worker disposal. Its browser test is recorded in [Phase 2](dev/PHASE-2.md). The combined engine fixture at `/dev/fixtures/engine-assembly.html` verifies both runtimes in one worker, retained geometry and solver state, clean disposal, cancellation and failure recovery. The production sketch editor is still pending. See the [assembly contract](dev/CAD-ENGINE-ASSEMBLY.md).

The C03 core evaluator supports typed dimension arithmetic and named-variable references. Run `node --import tsx src/cad/dimension-expressions.demo.ts` for its standalone example. Named-variable resolution and editable dimension fields are subsequent CAD bricks; no editor is connected to this evaluator yet.
