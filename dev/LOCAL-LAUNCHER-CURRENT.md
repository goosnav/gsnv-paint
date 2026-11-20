# Current source launchers — 2026-11-20

## Finding

The reported three-tab CAD placeholder matches the original `52926f3` assembly,
which passed an empty adapter map into the shell. Current `src/app/main.ts`
mounts all nine real workspaces and starts in Image. Every root run wrapper
already targeted that production entry after the preceding launcher repair.
The screenshot alone cannot identify the local folder, server or cache that
supplied the obsolete page.

The concrete remaining source-freshness gap was that normal launches never
checked GitHub. Rebuilding an old checkout cannot acquire the newer source
deployed by Cloudflare. A one-time pull or fresh complete download is required
to put this launcher onto a computer that still has the old one.

## Changes

- Ordinary launches check the official `main` branch before preparing a build.
  Only a clean official checkout can fast-forward. The inspected commit is
  merged with `--ff-only`, and the updated launcher restarts once before serving.
- Automatic network checks stop after ten seconds and can fall back to installed
  source. Local edits, other branches, foreign origins and divergent history are
  retained with an explicit notice. `--offline` skips checks; `--update` requires
  a successful check and allows 45 seconds. ZIP source folders explain the need
  for a fresh complete download instead of claiming they are current with GitHub.
- Running applications are never updated underneath open work. Verified current
  instances can reopen; stale/different instances still require save/stop/restart.
- Requests reaching the local server at `/`, `/index.html` or an older valid
  versioned entry redirect to the current versioned entry with `no-store`.
  Launchers open that entry directly, bypassing old workers that cache the root.
  No browser projects, caches or worker registrations are cleared.
- macOS `.command` wrappers invoke `run.sh` through `/bin/sh`, so a lost execute
  bit on the inner script cannot break startup. Node without working npm falls
  back to the pinned complete runtime. Windows wrappers preserve failure codes;
  native .NET OS architecture detection supports environments missing the
  `PROCESSOR_*` variables, and `GSNV_PAINT_NO_PAUSE=1` supports noninteractive invocation.
- Dependency installation explicitly includes development build tools even when
  the user's environment defaults to production-only npm installation.
- Cloudflare still builds the same `index.html` → `src/app/main.ts` production
  application. No editor implementation, project format or hosted UI changed.

## Verification

Local results: production build and real HTTP launcher smoke **passed**;
**21 launcher/update/wrapper tests passed**, with two native Windows wrapper
tests skipped on Linux; **15 local-runtime/offline-worker tests passed**;
application and new browser-test TypeScript checks passed. The original three
workspace fixture is not accepted as browser success by the new native gate.

The focused Node tests exercise real local HTTP serving and isolated Git
repositories, including ordinary-launch fast-forward/restart, strict update
failure, offline launch, failed-fetch fallback, source/output freshness,
existing-server guards, redirects and stored-build integrity. Wrapper integration
tests use source paths containing spaces, a different working directory,
missing/broken npm, argument forwarding and nonzero exit codes.

`npm run test:launcher:browser` starts the actual native wrapper, establishes a
legacy service worker that demonstrably serves the obsolete three-tab root,
then verifies the exact new launch URL: nine tabs, Image startup, actual drawing,
PNG export, local revision status and preservation of localStorage, IndexedDB,
the old cache and its worker registration.

The **Local launchers** GitHub Actions workflow runs the focused launcher and
browser gates on Ubuntu, macOS and Windows with the checkout path containing
spaces. CI logs/screenshots are the evidence for native-platform execution.
Local verification here is Linux process/HTTP and source checking: Chromium
startup is blocked by the execution environment, and the separate cloud browser
cannot reach that local server. Native Finder/Safari and Windows behavior must
not be reported as locally tested.
