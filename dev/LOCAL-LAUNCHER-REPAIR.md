# Current local application — 2026-11-16

## Problem and scope

The reported Mac screenshot contains the older three-workspace shell and the CAD
adapter placeholder. Current `src/app/main.ts` mounts nine real workspaces. The
screenshot establishes an obsolete application assembly, but cannot identify
which local folder, running process or cached page supplied it.

The old launcher accepted source/output modification timestamps as freshness
evidence and any page carrying the application-name marker as a reusable server.
Its build could run before detecting an existing server. Independently, the
offline worker intentionally serves its cached root/index navigation until old
tabs close; a root query parameter does not bypass that cache.

This increment repairs the source launcher. It does not replace the browser
runtime, introduce a native packaged app or change project formats.

## Local launch contract

- The same Vite production build and bundled engines serve Cloudflare and local
  use. Content fingerprints cover input paths/bytes, dependency preparation,
  vendor packages and the runtime platform. Successful build stamps include the
  manifest identity, offline worker digest and verified asset inventory.
- A live server is checked before installation/build/update. Reuse requires the
  current checkout, source fingerprint and verified build. A legacy, stale or
  different-folder process produces save/stop/restart instructions. The launcher
  never kills another server or silently chooses a different port.
- Preparation is serialized within the checkout so repeated launches cannot run
  competing installs/builds. Interrupted owners can be recovered without deleting
  another process's newer lock.
- The launcher opens `/__gsnv-local__/start/<build-id>` on the existing loopback
  origin. Its preview-only HTML includes a root base URL and local/revision
  metadata. The old offline worker does not inventory or intercept this route.
  The status and entry responses have no-store and the existing isolation headers.
- S23 accepts local mode only when the marker, loopback host, build identity and
  exact path agree. It shows **Local · revision** and avoids a redundant complete
  application-cache installation. Hosted offline installation/update behavior is
  unchanged. No cache deletion, project storage clearing, worker unregistration,
  forced activation or automatic tab reload occurs.
- `--update` is explicit, bounded and limited to clean official `main` checkouts
  that can fast-forward. It refuses running servers, local edits, divergent
  commits, other branches and other origins. It reexecutes the updated launcher.
  `update.command` / `update.cmd` provide one-click entry points. Source archives
  report how to obtain the current complete download; normal archive launches do
  not require Git.
- The Mac SSH bridge reads the local server's build identity and opens the same
  dedicated entry. Its original loopback binding and SSH cleanup remain.

## Compute and storage

Cloudflare hosts static application files. Editing already executes on the user's
computer: WebGL for the CAD view and local workers/WASM for the implemented CAD,
RAW, Python and image-effect engines. Serving the optimized bundle locally avoids
network asset delivery and the second complete browser offline installation.
This does not establish faster processing benchmarks or turn single-threaded
algorithms into all-core/GPU operations.

The fixed origin preserves local recovery and recent-project storage. Browser
projects remain separate from the source folder and `.gsnv-local/` build stamps.
The terminal must remain open while the local application is in use.

## Verification

- Application suite: **1,279 tests passed**, no failures/skips.
- Production build and TypeScript: passed.
- Specification/module/link audit and whitespace check: passed.
- Local entry HTTP checks cover exact build routing, unchanged production HTML,
  root-relative links, status identity, isolation/no-store headers, foreign-host
  rejection, read-only endpoints and changed/missing output.
- Offline-worker regressions prove the old root remains cached while the local
  entry/status/new hashed assets bypass it; existing caches and tabs remain intact.
- `npm run test:launcher`: real production-server HTTP smoke passed, plus **15
  launcher/entry/SSH/update regressions**, no failures/skips. Coverage includes
  misleading timestamps, deleted inputs, missing engines, dependency consistency,
  same-instance reuse, stale/legacy servers, simultaneous starts, interrupted
  preparation, archive launch without Git, and a real temporary-repository
  fast-forward followed by restart. Dirty, diverged, foreign-origin and wrong-
  branch update cases are rejected without overwriting work.
- POSIX syntax checks passed for the launch/update/Mac bridge wrappers.

Native macOS Finder/Safari and Windows execution are not established by Linux
tests. Browser automation is unavailable in this environment because Chromium
cannot create its process-singleton socket. The component/HTTP checks do not claim
live-browser or native package acceptance.
