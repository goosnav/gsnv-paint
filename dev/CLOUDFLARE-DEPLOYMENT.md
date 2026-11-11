# Cloudflare deployment repair — 2026-11-11

The owner's Cloudflare log shows a successful `npm run build`, followed by a failed `npx wrangler deploy`. With no committed Wrangler configuration or pinned CLI, Wrangler 4.160.1 entered framework auto-configuration, proposed installing the Cloudflare Vite plugin, and failed because the existing Vite configuration has no `plugins` array. Adding an empty plugin array would treat the symptom while introducing an unnecessary server-oriented integration.

The application already builds static files. The repair commits an assets-only `wrangler.jsonc` with `assets.directory = ./dist`, matching the configured Worker name `gsnv-paint`. It pins Wrangler 4.160.1 in development dependencies and the lockfile, disables Wrangler metrics, ignores local `.wrangler` state, and adds `npm run test:deploy` as a build plus non-uploading deployment check. There is no application Worker entry point, backend logic, Vite plugin, account ID or credential in the change.

The existing Vite server/preview headers apply only to local servers. `public/_headers` now supplies the same COOP/COEP/CORP policy in the emitted static output. This follows Cloudflare's [asset-directory configuration](https://developers.cloudflare.com/workers/static-assets/binding/) and [static response headers](https://developers.cloudflare.com/workers/static-assets/headers/). The current [Pages per-file limit](https://developers.cloudflare.com/pages/platform/limits/) remains 25 MiB; the four emitted files are all strictly below 26,214,400 bytes (largest 58,092 bytes).

## Verification

| Check | Result |
|---|---|
| Before configuration: `WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run --no-autoconfig` | Exit 1: `Missing entry-point to Worker script or to assets directory`. Auto-configuration was disabled to avoid modifying the working tree during reproduction. |
| `npm run test:deploy` | Exit 0: strict TypeScript/Vite build and Wrangler dry run complete. |
| Clean disposable copy, Node 24.22.1 / npm 10.9.2: `npm clean-install --progress=false --no-audit --no-fund`, `npm run build`, `npx wrangler deploy --dry-run` | All exit 0; 94 packages installed, PlaneGCS declaration preparation passed, no auto-setup or plugin injection. [Complete output](evidence/cloudflare-clean-build.txt). |
| `npm test` | Exit 0: 421 passed, 0 failed, 0 skipped. |
| `npx wrangler dev --local --ip 127.0.0.1 --port 4273` plus actual browser/HTTP checks | Local Cloudflare runtime parsed the header rule. Chrome 154.0.8037.97, headless Linux, 1280×720: app rendered, three workspace switches succeeded, no page errors, `crossOriginIsolated === true`. HTML, JS and CSS responses returned 200 and all three expected isolation headers. |

The first disposable-environment attempt installed and built successfully, but its nested `npx` inherited the outer npm execution's `npm_config_call`/`npm_config_package` options and failed with EUSAGE before invoking Wrangler. Clearing those two test-harness variables fixed the invocation; the fresh complete rerun above passed. No production change was needed for that harness issue.

Cloudflare dashboard settings can remain **build: `npm run build`**, **deploy: `npx wrangler deploy`**, repository root directory. The same static output remains suitable for Pages; this Wrangler file specifically fixes the Workers pipeline supplied by the owner. Authentication, upload and the hosted URL were not exercised locally, so this is not a claim of a completed live deployment or full product acceptance. The existing incomplete editor and release statuses remain unchanged.

## Subsequent CAD workflow build

The production CAD increment now emits the kernel and solver assets. `npx wrangler deploy --dry-run --no-autoconfig` succeeds against all 16 emitted files. The largest is the 22,942,327-byte OCCT WASM, below 25 MiB. See [CAD workflow evidence](CAD-WORKFLOW.md) for the updated build/browser/deployment checks. The hosted Cloudflare deployment is still unverified locally.
