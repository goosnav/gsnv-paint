# Audio effects and quick processing — 2026-11-15

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
| AX01 audio-effect-settings | CORE | Defaults/catalog + validate untrusted chain and output settings; finite bounded parameters, unknown fields/types reject. Presets are owned copies. No dependencies. | PLANNED |
| AX02 audio-effects | CORE | PCM + validated chain -> owned same-length PCM in order. Bypass exact. Low/high-pass biquads, sample-hold/bit reduction, linked envelope compressor, deterministic damped reverb, gain/normalize. Invalid PCM/oversize reject. Dep AX01. | PLANNED |
| AX03 audio-encode | CORE | Processed PCM + validated export settings -> bytes/mime/extension. Band-limited rate conversion, PCM WAV or pinned LAME MP3 encoder. Finite limits reject, no I/O. Deps AX01 + encoder. | PLANNED |
| AX04 audio-processing-client + worker | SHELL | One worker job per run, PCM transferred; result/error/progress; abort terminates worker. Browser local decode is size/channel checked; main document not transferred. Deps AX02/03 in worker. | PLANNED |
| AX05 existing image-batch paths/files | SHELL/CORE | Extend tested adapters with optional audio profile, preserving Image defaults. Audio leaf formats, new gsnv-audio-batch timestamp prefix. Existing snapshot/collision/abort guarantees retained. | PLANNED |
| AX06 audio-batch-run | SHELL | Selected immutable inputs + process callback + destination + signal -> sequential written/error report. Read/decode failures skip; write failures stop. Cancellation keeps completed folder files, discards incomplete ZIP. | PLANNED |
| AX07 audio-chain-controls | SHELL | Catalog to accessible ordered controls with add/remove/reorder/bypass, sliders + numeric fields, presets, export settings. Invalid values remain visible and block operations. Dep AX01. | PLANNED |
| AX08 audio-processing-dialog | SHELL assembly | Before/after preview, file/folder selection, output target, apply/export/batch, progress, settings persistence and close/abort cleanup. Current recording captured with revision guard. Uses AX04..07 and existing dialog/file ports. | PLANNED |
| AX09 audio-workspace integration | SHELL assembly | Toolbar/Effects/Automation menu, one undoable apply, existing Save WAV compatibility, help. No native project schema change. | PLANNED |

Contracts and tests precede implementation per brick. Dependencies may be composed while GREEN under owner BATCH authorization; acceptance remains pending. Unit tests gate numerical behavior, browser tests gate the real worker/decoder/encoder and workflow, fake handles gate filesystem safety. Production smoke uses Linux Chromium; physical Apple devices/Windows and subjective sound acceptance remain untested until owner review.

## Decisions
- Preserve song length; reverb tail is truncated at song end and described in controls. No unrequested silence appended.
- Full-song offline processing in a worker instead of a real-time playback graph keeps preview, apply and batch consistent. One input at a time bounds batch memory.
- MP3 uses a pinned locally bundled LAME implementation, not network services or real-time MediaRecorder. Record license/source in DECISIONS and notices before release.
- Folders default to a timestamped child; file selection cannot reveal its parent so asks for an output folder or offers ZIP. No inferred filesystem authority.
- Preset is deliberately subtle; harder digital reduction and lower MP3 bitrate are explicit choices. No claim of an exact proprietary codec recreation.
