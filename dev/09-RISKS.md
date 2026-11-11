# Risks and unresolved evidence

| Risk | Impact | Mitigation / gate |
|---|---|---|
| OpenCascade full WASM exceeds Pages asset size | Blocks distribution | Measure exact vendored assets; use a proven reduced binding build covering required operations, or reproducible trim. Phase-2 spike must prove retained operations. |
| Face/edge identity changes after a feature edit | Can silently change geometry | Semantic references plus validated signatures; fail on ambiguous/lost references. Tests include edits that split/merge topology. |
| Constraint solver wrapper has incomplete entities/status mapping | Blocks full sketcher | Real worker spike exercises all needed constraint families and over-constraint reporting; no homegrown solver fallback. |
| Native AAC/H.264 encode varies by OS/browser | Blocks MP4 on some hosts | Probe actual configuration, display limitation. Golden export remains untested if unavailable; no pass by skipping. |
| Memory use of 20×4000² layers and decoded video | Crashes or lag | Sparse tiles, delta history, bounded decoded queues and prompt disposal; profile actual fixtures. |
| Cross-origin isolation and offline WASM cache conflict with delivery | Broken workers or offline mode | Same-origin assets; test COOP/COEP, cache completeness, update rollback and disconnected reload of every workspace. |
| LGPL distributions require exact sources/notices/relinkability | Incomplete release | Record exact versions and source commits, preserve licenses, ship corresponding source/rebuild instructions and replaceable WASM artifacts. |
| Full M1a launcher matrix unavailable on this host | Prevents candidate status | Build all target images, but label untested targets UNTESTED; obtain actual target execution evidence before candidate claim. |
| Broad product scope tempts placeholder features | Misleading release | Every listed variant has a requirement/procedure; no disabled menu claimed as implemented. CAD first, Video gives first only by explicit scope decision. |

Open evidence is not user approval debt. Routine implementation choices are delegated. Actual contract contradictions, failed tests or unexpected external limitations trigger the retained BATCH halt rules. The agent must state the specific issue and proposed smallest resolution at that point.
