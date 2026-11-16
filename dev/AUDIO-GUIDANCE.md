# Guided audio effects and small-file export — 2026-11-15

## ConOps
The owner wants understandable effects, much smaller MP3 files at several quality
levels, and flanger/phaser. References (LEASE and Serial Experiments Lain) express
a listening goal, not evidence of a particular production chain. The app must
distinguish lossy file compression, loudness compression, and bit reduction.
Before/after preview must encode with the selected settings. Keep the existing
closable wizard, local-only processing, source protection, dated folders and ZIP.
No recreation or attribution of those recordings' actual production is claimed.

## Requirements / verification plan
| ID | Requirement | Verification |
|---|---|---|
| AUD-GUIDE-01 | A question-mark helper beside every effect and parameter explains the sound, lower/higher values and useful starting settings. Keyboard/touch access, Close/Esc and focus return; closing help leaves wizard open. | guide coverage/unit tests; DOM popup tests; production browser keyboard/phone workflow |
| AUD-GUIDE-02 | Distinguish MP3 compression from dynamics/bitcrushing. Fresh wizard starts without destructive effects; offer a clear starting point for compressed music plus optional atmospheric effects. Preserve valid saved recipes. | settings/control tests; browser initial/remembered recipe tests; Help/tutorial |
| AUD-GUIDE-03 | MP3 8–320 kbps with intermediate rates, named export presets, mono/rate controls, approximate size per minute. Only verified rate/channel/bitrate combinations; no silent encoder substitutions. | export-policy golden/boundary tests; real encoder header matrix both mono/stereo and size comparisons |
| AUD-GUIDE-04 | Flanger (fractional modulated delay with feedback) and phaser (swept all-pass chain), ordered/bypassable with the existing chain in worker preview/apply/batch. Same length/rate, owned finite PCM, zero mix exact. | analytic comb notch/impulse, all-pass notch/energy, bypass/order/extreme-rate tests; worker/browser seam |
| AUD-GUIDE-05 | Preview includes actual export codec, rate/bitrate/channels; tiny MP3s decode with correct pitch/duration. Explain Apply only changes effects, while Process songs includes file compression. | Chromium/WebKit low-rate MP3 decode and playback; saved report/settings; existing undo/batch tests |
| AUD-GUIDE-06 | Existing audio, Image batch, offline/static deployment and local launcher remain working. | cumulative unit suite; audio/Image browser regressions; typecheck/build/offline/deploy dry-run/launcher |

## Mode A map (standing BATCH authorization)
Changes to AX01/02/03/07/08 below are the owner's requested contract extension.
Changed bricks started at CONTRACTED pending their new checks. GREEN is not
owner acceptance. No source implementation is changed by this map commit.

| Build order / ID | Module / kind | Contract / errors / dependencies | Final status |
|---|---|---|---|
| 1 AG01 | audio-export-profile / CORE | `audioExport` validates unknown output settings to owned AudioExport; returns owned named presets, compatible rates/bitrates, recommended repair and size description. WAV16/24 and MP3 8..320 at supported 8..48kHz; invalid/unknown fields or incompatible pairs raise RangeError. No deps. | GREEN |
| 2 AG02 | audio-effect-guide / CORE | Effect/parameter IDs -> owned structured help (title, what, lower/higher, start, note). Unknown IDs raise RangeError. Export concepts have matching help. No deps. | GREEN |
| 3 AX01 | audio-effect-settings / CORE | Existing exact validation extended for flanger/phaser; catalog includes AG02 help; output delegates to AG01, old valid presets preserved, clean startup separate from legacy retro recipe. Deps AG01/02. | GREEN |
| 4 AG03 | audio-modulation / CORE | Finite Float32 channel + integer 8..192kHz + validated flanger/phaser -> new same-length finite channel; no mutation, zero mix exact. Invalid kind/PCM/range raises RangeError. Deps AX01. | GREEN |
| 5 AX02/03 | audio-effects + audio-encode / CORE | Integrate AG03; encode validated AG01 pairs, retain actual advertised rate/bitrate/channels. Current duration/size/cancellation limits unchanged. Real frame validation guards encoder upgrades. Deps existing plus AG03. | GREEN |
| 6 AG04 | audio-help-popup / SHELL | Document + typed help -> trigger element; click/keyboard reveals scoped nonmodal helper, close/Esc returns focus. One per controls root; no global event listeners/persistence/playback. No domain calculation. | GREEN |
| 7 AG05 | audio-export-controls / SHELL | Document + change callback + optional output -> element/read/setDisabled. Presets alter output only; invalid manual pairs repaired visibly to a supported rate, legal quality/rate choices and size summary from AG01. Deps AG01/02/04 (assembly of known controls/data). | GREEN |
| 8 AX07/08 | chain controls + wizard / SHELL assembly | Help buttons, sound presets, AG05 export controls, compressed-preview label and apply explanation. Keep current/first-file preview, cleanup, batching, undo and settings. Deps existing + AG04/05. | GREEN |

Build each leaf with contract, failing test, implementation and passing test.
Then cumulative seams through worker, controls, actual MP3 encode/decode and batch.
The new default is clean effects plus a 64kbps early-web MP3 export; named lower
presets use mono. Saved valid settings take precedence. Low-rate old settings that
the encoder would silently resample are visibly normalized, preserving the chain.
Flanger: sinusoidal fractional delay, 0..5Hz speed, base/depth in milliseconds,
feedback bounded to ±90%, dry/wet. Phaser: four first-order all-pass sections,
0..5Hz speed, center frequency/depth in octaves, dry/wet, no feedback. Reverb and
modulation preserve source length; an excerpt restarts modulation state.

## Reconnaissance / decisions
- Pinned unchanged @breezystack/lamejs 1.2.7 supports MPEG-2/2.5 low rates.
  A real encoder spike showed automatic resampling depends on channel count as
  well as bitrate (e.g. 64kbps/44100 stereo becomes 24000). Policy uses conservative
  pairs for Keep mono/stereo, and mono-specific pairs for Convert to mono.
- Prefer explicit compatible rates over modifying the LGPL encoder or reporting
  requested rates that differ from the file. Runtime and full-frame tests protect
  the setting contract. Revisit when replacing the codec or exposing ABR/VBR.
- File-size estimates use constant bitrate; mono shares that total bitrate rather
  than halving it again. WAV estimates depend on channels, sample rate and bit depth.
- Helpers use explicit buttons/popups, not hover-only tooltips. No audio autoplay.
- Default effect chain becomes clean so the selected MP3 compression is audible
  on its own. Legacy Retro remains available as a clearly described bitcrush recipe.

Primary references (accessed 2026-11-15):
- [LAME usage and bitrate tables](https://github.com/lameproject/lame/blob/master/doc/html/usage.html).
- Julius O. Smith, [Flanging](https://www.dsprelated.com/freebooks/pasp/Flanging.html)
  and [Phasing with first-order allpass filters](https://www.dsprelated.com/freebooks/pasp/Phasing_First_Order_Allpass_Filters.html).

## Limits / acceptance
No guarantee of matching a named song from export settings alone, or playback on
physical Nokia hardware. 8kbps severely removes musical detail. Linux browser
automation cannot establish physical iOS/macOS Safari, subjective sound, or live
Cloudflare deployment. Existing 128MiB/30-minute/direct-child/ZIP limits remain.
Final state: CANDIDATE_FOR_ACCEPTANCE after evidence; acceptance is the owner's.


## Phase result — CANDIDATE_FOR_ACCEPTANCE

AG01–AG05 and the changed AX01/02/03/07/08 bricks are GREEN under the standing
BATCH authorization. Owner acceptance remains pending. Assembly ladder includes
pure validation/DSP, actual encoded frame streams, controls, the real worker,
browser decode/playback, undo, folder/ZIP output and first-use offline processing.

| Requirement | Result | Evidence |
|---|---|---|
| AUD-GUIDE-01 | PASS | Every catalog parameter has help; DOM text-safety/one-popup/focus/Escape checks; Chromium/WebKit keyboard and emulated-touch popup checks |
| AUD-GUIDE-02 | PASS | Clean startup and independent effect/export presets; saved-chain migration unit/browser checks; revised searchable Help and tutorial |
| AUD-GUIDE-03 | PASS | Preset golden; malformed/incompatible settings rejection; every supported bitrate/rate/channel combination checked through actual MP3 frame streams; successive presets shrink; mono size estimate stays tied to total bitrate |
| AUD-GUIDE-04 | PASS | Exact dry/impulse and analytic comb notch, analytic phaser notch and wet energy, extremes/determinism, ordered stereo seam, actual worker preview playback |
| AUD-GUIDE-05 | PASS | Real 32/16/8kbps preview decodes at expected rate/channels/pitch/duration, actual 8kbps files plus recipe report in ZIP; original/apply/undo regression |
| AUD-GUIDE-06 | PASS for checks run | 1248 unit tests, production Chromium/WebKit workflows including offline, existing Audio/Image browser tests, build/typecheck, offline-build/launcher/spec and Wrangler dry run |

No new requirement is failing or wholly untested. **Untested:** physical iPhone,
iPad, macOS Safari, Windows, old phone hardware, subjective matching to the named
recordings, and the live Cloudflare deployment. WebKit's native directory test
was deliberately not selected; its supported product route is ZIP. Chromium ran
real private-filesystem directory handles. Automated touch/phone viewports are
not physical-device claims. Existing 402-requirement suite remains 47 PASS / 0 FAIL /
355 UNTESTED; these results do not claim the whole creative suite is finished.

Commands and final results (working directory: repository root; all exit 0):

- `npm test` — 1248 tests, 1248 pass, 0 fail, 0 skipped.
- `node --import tsx --test src/audio/*.test.ts src/image/image-batch-*.test.ts` — 70 pass, 0 fail, 0 skipped.
- `npx playwright test -c src/audio/audio-processing.playwright.config.ts` — 10 passed (production Linux Chromium).
- `AUDIO_BROWSER=webkit npx playwright test -c src/audio/audio-processing.playwright.config.ts --grep-invert 'real browser directory handles'` — 9 passed (production Linux WebKit, 1 test intentionally not selected).
- `AUDIO_PRODUCTION=1 npx playwright test -c src/audio/audio-playwright.config.ts` — 3 passed.
- `npx playwright test src/image/image-batch.browser.spec.ts` — 2 passed.
- `npm run typecheck` and `npm run build` — success; existing large-JS-chunk advisory remains.
- `npm run test:offline-build` — 4 pass; `npm run test:launcher` — launcher smoke PASS and freshness 1 pass.
- `npm run test:spec` — TRACE PASS, MAP PASS, LINK PASS (legacy status as above).
- `npx wrangler deploy --dry-run --no-autoconfig` — 74 static assets; no bindings; dry run success.
- Modular checker — all nine leaf/changed module files PASS; wizard is a documented assembly.
- Export-profile demo prints the full size ladder; modulation demo prints owned 48000-sample results (flanger RMS 0.09629; phaser RMS 0.07689). Demos are not substitutes for tests.

Selected actual output: [verification log](evidence/audio-guidance-verification.txt).
Visual review: [export presets](evidence/audio-guidance-exports.png),
[contextual help](evidence/audio-guidance-help.png),
[touch helper](evidence/audio-guidance-touch-help.png).

Test-oracle notes: the size comparison originally used an incompatible 16kbps
stereo/16kHz fixture; it now compares the same bitrate at supported 8kHz, retaining
the exact size assertion. Browser locators now select exact field labels to avoid
matching adjacent help buttons. Preview byte length is captured before Web Audio
consumes/detaches its input buffer. Assertions on output size, pitch and duration
were retained. A test-only optional baseURL type was made explicit; production
behavior was unchanged by that correction.

Tuning: `audio-export-profile.ts` owns the preset ladder, compatibility matrix and
size descriptions; `audio-effect-guide.ts` owns the plain-language guidance;
`audio-effect-settings.ts` owns effect defaults/ranges; `audio-modulation.ts` owns
DSP. Encoding frame tests gate matrix changes; browser tests gate preview/export
agreement and usability. Existing limits in AUDIO-PROCESSING.md continue to apply.
