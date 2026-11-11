# Run summary — 2026-11-11

Task: audit the repository for running as a local application and add top-level launchers for every OS.

## What changed

| File | Change |
|---|---|
| `run.sh`, `run.command`, `run.ps1`, `run.cmd` | New launchers. Each finds Node.js 22.12+ or downloads pinned, checksum-verified Node.js 24.22.3 into the user's application-data folder, then runs `launcher/start.mjs`. |
| `launcher/start.mjs` | New. Installs locked dependencies when needed, builds when sources changed, serves `dist/` on `127.0.0.1:24173`, opens the browser, reopens a running copy on a second launch. |
| `launcher/start.test.mjs` | New smoke test of the real launcher process. |
| `launcher/node-runtime.sha256` | New. Pinned Node.js archives and SHA-256 values for six OS/processor targets. |
| `vite.config.ts` | The production preview server now sends the isolation headers, binds loopback only, uses a strict port and disables cross-origin access. Previously only the development server sent the headers. |
| `package.json`, `package-lock.json` | Added `start`, `test:launcher` and `engines.node >=22.12.0`. Quoted the unit-test glob so Node expands it identically on every OS. |
| `src/shared/input-adapter.browser.spec.ts` | The native text-editing step used Ctrl+A/C/V and End, which do nothing on macOS. Now `ControlOrMeta` and ArrowRight. |
| `.gitattributes` | Shell launchers and the checksum list keep LF endings on Windows checkouts. |
| `README.md`, `TUTORIAL.md`, `dev/DECISIONS.md` (D14) | Run instructions, tutorial with troubleshooting, and the recorded decision. |

## Commands run and results (macOS 26.5.2, arm64, Node 22.23.1)

| Command | Result |
|---|---|
| `npm ci` | 60 packages, 0 vulnerabilities |
| `npm run typecheck` | exit 0 |
| `npm test` | 407 passed, 0 failed |
| `npm run test:spec` | TRACE, MAP, LINK PASS |
| `npm run test:browser` before changes | 12 passed, 1 failed (S12 input adapter, macOS shortcut keys) |
| `npm run test:browser` after changes | 13 passed |
| `npm run test:launcher` | `launcher smoke: PASS` |
| `./run.command` (installed Node) | served HTTP 200; a real page reported `crossOriginIsolated: true`, no console errors |
| `env -i HOME=<temp> PATH=/usr/bin:/bin dash ./run.sh` (no Node on PATH) | downloaded Node.js 24.22.3, verified, served HTTP 200 |
| Same with a corrupted pinned checksum | `BOOT-INTEGRITY`, exit 1, archive deleted |
| Same with an unreachable proxy | `BOOT-NETWORK`, exit 1 |
| `GSNV_PAINT_PORT=80 ./run.sh` | `APP-START`, exit 1 |
| `run.sh` copied alone to an empty folder | `LAUNCH-ROOT`, exit 1 |
| Copy in a folder named with spaces and non-ASCII characters, started from `/` | HTTP 200; second launch `already running`, exit 0 |
| `./run.sh` while running | reopened the running copy in the default browser, exit 0 |

## Known limitations

- `run.ps1`, `run.cmd` and the Linux path of `run.sh` have not been executed. No Windows or Linux system, PowerShell or container runtime was available here.
- The launchers run this source folder. They are not the M1a universal ZIP with native launcher images; that remains Phase 5 (REL-019).
- The first start needs a network connection for dependencies, and for Node.js when none is installed.
- The application itself is still a shell: no workspace editing exists yet.

## Found, not changed

- There is no `LICENSE` file at the root. Choosing one is the owner's decision.
- `npm run test:browser` overwrites nine tracked screenshots under `dev/evidence/`. Running it on any machine dirties the tree; this run's overwrites were restored with `git checkout -- dev/evidence`.
- `npm run test:spec` calls `python3`, a name Windows usually lacks.
- Menu shortcut labels read `Ctrl+…` on macOS. Cmd works as well.

## Next task

Run `run.cmd` on Windows (x64, ARM64) and `./run.sh` on Linux (x86_64, ARM64), on machines without Node.js, and record the results in D14.
