# Audio effects and quick processing — 2026-11-15

The subsequent [guided audio phase](AUDIO-GUIDANCE.md) adds contextual help,
flanger/phaser and 8–320 kbps export choices. It supersedes the original default
recipe and output-rate restrictions below; the original phase evidence is retained.

## ConOps and scope
The owner wants the soft, bandwidth-limited early computer music sound, editable effect order/amounts, and one-song or folder processing into a dated child folder. Everything runs locally in the existing browser/local shells. Originals are read-only. This phase adds processing, not music composition. BATCH is pre-authorized by the owner's standing instruction after this map is committed; GREEN is not owner acceptance.

The starting preset is **Retro computer**: a low-pass filter, gentle stereo-linked dynamics compression and reduced digital resolution. These are an adjustable approximation of early digital playback, not an assertion that every Frutiger Aero recording uses one effect. Reverb is separate and adjustable. Actual low-bitrate artifacts can also be obtained with MP3 export. Preview lets the owner choose by ear.

## Requirements and verification
| ID | Requirement | Automated evidence planned |
|---|---|---|
| AUD-FX-01 | Ordered, bypassable low-pass, high-pass, digital reduction, compressor, reverb and gain/normalize effects; Retro preset; no mutation of source PCM. | audio-effects.test.ts: spectral, order, channel, finite, exact bypass/gain and rejection cases |
| AUD-FX-02 | Reverb wet amount/decay; duration preserved with tail ending at recording boundary. Same engine in preview, apply and batch. | impulse-tail and dry tests; browser before/after and apply/export seam |
| AUD-FX-03 | Local worker processing/encoding, cancellation/teardown, bounded mono/stereo files. | audio-processing.browser.spec.ts; worker lifecycle checks |
| AUD-FX-04 | WAV 16/24-bit and MP3, selectable supported sample rates, channels and MP3 bitrate. Validate settings before work; no silent format substitution. | audio-encode.test.ts; real browser decode of exports |
| AUD-FX-05 | File or direct-child-folder selection; sequential batch into unique UTC timestamped child folder; safe names/collisions; never overwrite originals. | batch adapter tests and browser folder simulation with real decode/DSP/encode |
| AUD-FX-06 | Progress, cancel, per-file errors, completed-file preservation; ZIP fallback explicitly disclosed, downloadable with report. | audio-batch-run.test.ts and browser ZIP/cancel/error tests |
| AUD-FX-07 | Searchable help, keyboard/touch accessible controls, presets/settings remembered locally, explicit preview play, current recording application is one undo step. | processing browser tests; help catalog tests |
| AUD-FX-08 | Existing audio, Image batch, build/deploy and offline behavior remain green. | full unit suite, prior audio browser tests, offline/deploy checks |

## Mode A module map / build order
Boundary: PCM = {sampleRate: integer 8000..192000, channels: Float32Array[1..2]}, equal nonempty finite channels, <=128MiB for effects. Chain <=12 effects. Output WAV/MP3 at 22050/44100/48000Hz, original channels or mono. Input files <=128MiB; decoded PCM <=128MiB and <=30 minutes. No recursive folder traversal. ZIP <=128MiB. Reverb does not extend duration. These limits are visible in the UI.

| ID / module | Kind | Contract / errors / dependencies | Status |
|---|---|---|---|
| AX01 audio-effect-settings | CORE | Defaults/catalog + validate untrusted chain and output settings; finite bounded parameters, unknown fields/types reject. Presets are owned copies. No dependencies. | GREEN |
| AX02 audio-effects | CORE | PCM + validated chain -> owned same-length PCM in order. Bypass exact. Low/high-pass biquads, sample-hold/bit reduction, linked envelope compressor, deterministic damped reverb, gain/normalize. Invalid PCM/oversize reject. Dep AX01. | GREEN |
| AX03 audio-encode | CORE | Processed PCM + validated export settings -> bytes/mime/extension. Band-limited rate conversion, PCM WAV or pinned LAME MP3 encoder. Finite limits reject, no I/O. Deps AX01 + encoder. | GREEN |
| AX04 audio-processing-client + worker | SHELL | One worker job per run, PCM transferred; result/error/progress; abort terminates worker. Browser local decode is size/channel checked; main document not transferred. Deps AX02/03 in worker. | GREEN |
| AX05 existing image-batch paths/files | SHELL/CORE | Extend tested adapters with optional audio profile, preserving Image defaults. Audio leaf formats, new gsnv-audio-batch timestamp prefix. Existing snapshot/collision/abort guarantees retained. | GREEN |
| AX06 audio-batch-run | SHELL | Selected immutable inputs + process callback + destination + signal -> sequential written/error report. Read/decode failures skip; write failures stop. Cancellation keeps completed folder files, discards incomplete ZIP. | GREEN |
| AX07 audio-chain-controls | SHELL | Catalog to accessible ordered controls with add/remove/reorder/bypass, sliders + numeric fields, presets, export settings. Invalid values remain visible and block operations. Dep AX01. | GREEN |
| AX08 audio-processing-dialog | SHELL assembly | Before/after preview, file/folder selection, output target, apply/export/batch, progress, settings persistence and close/abort cleanup. Current recording captured with revision guard. Uses AX04..07 and existing dialog/file ports. | GREEN |
| AX09 audio-workspace integration | SHELL assembly | Toolbar/Effects/Automation menu, one undoable apply, existing Save WAV compatibility, help. No native project schema change. | GREEN |

Contracts and tests precede implementation per brick. Dependencies may be composed while GREEN under owner BATCH authorization; acceptance remains pending. Unit tests gate numerical behavior, browser tests gate the real worker/decoder/encoder and workflow, fake handles gate filesystem safety. Production smoke uses Linux Chromium; physical Apple devices/Windows and subjective sound acceptance remain untested until owner review.

## Decisions
- Preserve song length; reverb tail is truncated at song end and described in controls. No unrequested silence appended.
- Full-song offline processing in a worker instead of a real-time playback graph keeps preview, apply and batch consistent. One input at a time bounds batch memory.
- MP3 uses a pinned locally bundled LAME implementation, not network services or real-time MediaRecorder. Record license/source in DECISIONS and notices before release.
- Folders default to a timestamped child; file selection cannot reveal its parent so asks for an output folder or offers ZIP. No inferred filesystem authority.
- Preset is deliberately subtle; harder digital reduction and lower MP3 bitrate are explicit choices. No claim of an exact proprietary codec recreation.

## Owner refinement during this phase
Batch processing is a closable wizard-style pop-up. The first selected song is
prepared for preview automatically; Preview song selects another, Preview start
chooses a passage, and Original/Processed players require explicit Play. Close
and Esc stop playback and pending processing. Numeric entries accompany sliders.

## Verification notes
The production offline test caught a source-license archive with no HTTP MIME
matching the strict manifest. Repacked the unchanged corresponding source as ZIP,
an already supported static format; the complete first-use offline audio test
then passed. Do not relax cache integrity checks for new assets.

The initial MP3 browser assertion treated a lossy decoder's largest transient as
sample-exact PCM. Linux WebKit produced a 0.1982 transient with steady RMS 0.1010
for the -6dB test tone (expected RMS 0.1063). The corrected oracle checks steady
RMS against the requested gain, checks finite/unclipped peaks, channels and duration;
exact sample assertions remain on lossless WAV and the pure DSP tests. This is a
test-contract correction, not a change to the audio engine.


## Phase result — CANDIDATE_FOR_ACCEPTANCE

All AX01–AX09 bricks are GREEN under the owner's BATCH authorization, with no
owner acceptance inferred. No further implementation is planned for this audio
request. Tuning lives in `audio-effect-settings.ts` (preset/defaults/ranges),
`audio-effects.ts` (DSP), and the wizard CSS (layout). Pure DSP tests catch output
changes; production browser tests catch integration/export/undo/offline failures.

| Requirement | Result | Evidence |
|---|---|---|
| AUD-FX-01 | PASS | Exact bypass/gain/digital goldens, filter spectral rejection, stereo-linked dynamics, normalization/order and invalid-input tests |
| AUD-FX-02 | PASS | Impulse response/decay/dry tests; same engine in audible preview, apply, WAV/MP3 and batch |
| AUD-FX-03 | PASS | Worker abort/termination/error tests; native production worker execution; close during preview; no main-thread effect DSP |
| AUD-FX-04 | PASS | PCM16/24 byte goldens including odd-size padding; sample-rate/MP3 header checks; actual Chromium/WebKit decode, duration/channels/RMS; unchanged original after Undo |
| AUD-FX-05 | PASS | Snapshot/name/collision tests; real Chromium private-filesystem directory handles; original bytes unchanged; dated child and report produced |
| AUD-FX-06 | PASS | Cancel-before-write/output-failure unit cases; corrupt-input report; real ZIP download and capability fallback |
| AUD-FX-07 | PASS | Song dropdown/default preview, live audio playback exclusivity, persisted gain, keyboard close, number-field focus, phone-width layout; shared Help article |
| AUD-FX-08 | PASS for checks run | Full unit suite, existing Audio production regression, Image batch browser regression, build/typecheck, offline-first-use audio, launcher checks and Wrangler dry run |

No audio phase requirement failed or was left wholly untested. Physical iPad,
iPhone, macOS Safari and Windows are **UNTESTED**, as are native OS picker/permission
dialogs and subjective listening against the owner's music. Linux WebKit automation
is not a physical Safari-device claim. WebKit's real directory-writing test was not
selected because its supported product route is the ZIP fallback; Chromium ran the
real directory-handle test. Dev-mode's offline-only test intentionally skips outside
the production configuration; the six-test production run has zero skips.

Recorded commands (all exit 0):

- `npm test` → **1233 tests, 1233 pass, 0 fail, 0 skipped**.
- `node --import tsx --test src/audio/*.test.ts src/image/image-batch-*.test.ts` → **55 pass, 0 fail, 0 skipped**.
- `npx playwright test -c src/audio/audio-processing.playwright.config.ts` → **6 passed** (production Linux Chromium, including offline-first-use and real browser directory handles).
- `AUDIO_BROWSER=webkit npx playwright test -c src/audio/audio-processing.playwright.config.ts --grep-invert 'real browser directory handles'` → **5 passed** (production Linux WebKit, ZIP route).
- `AUDIO_PRODUCTION=1 npx playwright test -c src/audio/audio-playwright.config.ts` → **3 passed** (existing Audio import/playback/edit/native/recovery/export regression).
- `npx playwright test src/image/image-batch.browser.spec.ts` → **2 passed** (unchanged Image file/folder batch behavior).
- `npm run typecheck` → TypeScript exit 0.
- `npm run build` → built successfully; existing large-chunk advisory remains.
- `npm run test:offline-build` → **4 pass, 0 fail, 0 skipped**.
- `npm run test:launcher` → **launcher smoke: PASS**, freshness **1 pass**.
- `npm run test:spec` → **TRACE PASS; MAP PASS; LINK PASS**. Legacy 402-requirement ledger remains **47 PASS / 0 FAIL / 355 UNTESTED**; this phase does not claim those untested requirements.
- `npx wrangler deploy --dry-run --no-autoconfig` → **74 asset files; No bindings found; --dry-run: exiting now**. This is not a live deployment claim.
- Modular checker → **PASS** for all eight new module files.

The largest asset is 22,942,327 bytes, below the currently documented 25 MiB
Cloudflare Pages per-asset limit (26,214,400 bytes), verified against
https://developers.cloudflare.com/pages/platform/limits/ on this date.
New audio worker is approximately 172 kB. Source/license assets are local and
included in offline installation. No uploads, accounts or backend processing.

Selected actual command output is in [the verification log](evidence/audio-processing-verification.txt).
[Desktop wizard](evidence/audio-processing-desktop.png) and
[phone-width layout](evidence/audio-processing-phone.png) are automated viewport
captures; the phone capture is not physical-device testing.

Known limits: direct-child folder files only; 128 MiB source/decoded/resampled PCM
limit and 30-minute cap; ZIP output capped at 128 MiB; reverb tail stops at EOF;
MP3 has codec delay/padding and decoded transient overshoots; source tags/artwork
are not retained. WAV is the lossless path. Folder cancellation retains completed
copies; incomplete ZIP cancellation discards its buffered outputs.
