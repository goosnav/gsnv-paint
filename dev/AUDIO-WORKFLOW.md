# Audio waveform workspace

Implements the approved A01–A04 map in `dev/MODULE_MAP-AUTHORING.md`. This is a single recording editor with mono/stereo channels; it is not a composition or multitrack workspace. Verification statuses below are evidence, not owner acceptance.

## Contracts and build order

1. **A01 audio-document (CORE, GREEN):** `audioDocument(request)` owns decoded finite float32 PCM. Sources expose read-only sample access; imported arrays are copied once. A document holds sample rate, channel count, retained sources and a sequence of source ranges with multiplicative gain/linear fade envelopes. Native assets are planar little-endian float32; metadata preserves edits. Sequence edits share source objects across history. Bounds: 8–192kHz, mono/stereo, 30-minute edited sequence, 256MiB retained PCM, 10,000 pieces, 64 envelopes per piece, gain ≤1,000,000. `new`, `import`, `sequence` and `decode` return a frozen `AudioDocument`; `encode` returns JSON content and PCM assets. Invalid inputs throw `AudioContentError`. Three public symbols.
2. **A03 audio-samples (CORE, GREEN):** `audioSamples(request)` streams the sequence for peak and waveform extrema, or returns rendered Float32 channels/PCM16 WAV. `start`/`end` default to the full document and use integer half-open frame ranges. Waveform has 1–16,384 buckets, capped by frame count; empty channels return empty buckets. Rendered PCM and WAV allocations each have a 256MiB bound. WAV clips to [-1,1], rounds negative samples against 32768 and positive against 32767, and interleaves channels. Invalid ranges, output limits or nonfinite rendered Float32 throw `AudioSampleError`. No I/O; two public symbols.
3. **A02 audio-edits (CORE, GREEN):** `audioEdits(request)` returns `{value, selection, clipboard?}` for cut/copy/delete/trim/paste, volume/fades/normalize. Every edit is one shared-history transaction. Clipboard retains pieces/sources; incompatible sample rate/channel layouts reject without mutation. ID collisions retain both recordings, while repeated pastes reuse the same source buffer. Trim retains the selected range; delete closes the gap; paste inserts at a cursor or replaces a selection. A fade needs at least two frames and reaches both endpoints exactly, including across piece boundaries. Gain is 0–64 per command; normalize targets a peak greater than zero and at most one while preserving stereo balance. Silence is unchanged. Invalid requests throw `AudioEditError`. Three public symbols.
4. **A04 audio-workspace (SHELL assembly, GREEN):** `createAudioWorkspace(files)` returns the shared `WorkspaceAdapter`. It wires local import, waveform and numeric selection, playback/stop, shared files/history, native reopen and WAV export. Browser decode uses an explicit 48kHz rate; native files retain their stored rate. Unsupported decode/playback produces visible errors and retains the current document. One public symbol.

The two A04 shells are independent bricks:

- **audio-playback (SHELL, GREEN):** `createAudioPlayback({context, requestFrame, cancelFrame, changed})` returns `decode`, `play`, `stop`, `state` and `dispose`. The context is lazy. Decode never starts playback. Playback renders only the requested range, reports sample-frame position, and stops the previous source. Stop invalidates a pending resume; disposal closes the context. Web Audio/render failures propagate to the assembly's live error notice. One public symbol.
- **audio-waveform (SHELL, GREEN):** `createAudioWaveform({root, selected, command})` returns `update`, `zoom`, `focus` and `dispose`. The live DOM host receives a focusable waveform with a labeled range and keyboard description. Pointer/keyboard gestures emit half-open selection intents and never change audio. Zoom modes are `in`, `out`, `selection`, `all`; extrema cache keys include content identity, visible range and width, so moving the playback cursor does not rescan PCM. It disconnects resize/pointer resources on disposal. One public symbol.

No new dependencies, remote audio requests, microphone capture or uploads. Native files retain the original **decoded** PCM and edits, not the compressed input bytes or undo stack. Import temporarily needs decoder memory as well as owned PCM; playback and WAV export allocate the rendered selection/output. The advertised PCM limit is not a promise that every low-memory browser can allocate it.

## Consumer workflow and integration

Choose the Audio tab and **Import audio…**. Import accepts local WAV, MP3, M4A/AAC, Ogg, FLAC and WebM files supported by the browser; empty files and files above 128MiB are rejected. The notice states that import resamples to 48kHz. Import never plays automatically. A failed import retains the current recording and history.

Drag the waveform or type the start/end sample-frame numbers. The end is excluded: `[120,360)` selects 240 frames. The waveform supports Home/End and Left/Right one-frame movement; Shift extends the range. Tab moves to the numeric controls. Invalid numeric input keeps the previous range and shows an alert. **Zoom selection**, **Fit**, **+** and **−** change only the view.

**Play** or Space plays the range, or from the cursor to the end when no range is selected. Space again, **Stop**, Escape, changing workspace or hiding the page stops playback. Cut/copy/paste/delete, trim, fade in/out, normalize and volume operate on the selection. Volume and normalize use typed, validated shared dialogs. Native Save/Open, shared undo/redo and browser recovery retain editable audio. WAV export renders the entire edited recording to PCM16 at its stored sample rate, with clipping rather than wraparound. A fallback download is reported as handed to the browser; it is not claimed to have reached a user-selected disk path.

The parent assembly registers `audio: createAudioWorkspace(files)` and routes Audio Space to `audio.togglePlayback`. The adapter reports `viewRole: 'timeline'` and `activeTool: 'audio.selection'`. Commands are:

| Commands | Behavior |
|---|---|
| `audio.import`, `audio.export` | Local decode / full-recording PCM16 WAV download |
| `audio.togglePlayback`, `audio.stop`, `tool.cancel` | Play/stop / stop / Escape stop |
| `edit.cut`, `edit.copy`, `edit.paste`, `edit.delete`, `edit.selectAll` | Shared shortcut/menu selection operations |
| `audio.trim`, `audio.fadeIn`, `audio.fadeOut`, `audio.normalize`, `audio.volume` | Selection effects; normalize/volume open typed dialogs |
| `audio.clearSelection`, `audio.zoomSelection`, `audio.fit`, `audio.zoomIn`, `audio.zoomOut` | View-only range/zoom controls |

`src/audio/audio-demo.html` is the standalone local demo at `http://127.0.0.1:4173/src/audio/audio-demo.html` under the normal development server. It mounts the real adapter, shared chrome, native files, history and IndexedDB recovery. The same six bricks are exercised there; no fixture-only production behavior is used.

To change numeric bounds or waveform spacing, use the named constants documented in each brick header. Preserve the native version-1 float32 asset format and half-open range convention. Changes to source ownership, envelopes or WAV rounding require new literal sample/byte test cases before implementation. The import rate is an explicit shell decision and must stay visible in the consumer notice.

## Verification

All six runtime bricks passed the modular contract/size checker. Each began with a failing focused testbench; playback and waveform are port-injected shell tests. The final focused command was:

```sh
node --import tsx --test src/audio/*.test.ts
```

Result: **16 tests, 16 pass, 0 fail, 0 skip**. Evidence: `/tmp/gsnv-consumer-qa/audio-unit-final.log` and `/tmp/gsnv-consumer-qa/audio-module-check-final.log`. Coverage includes a whole-file literal stereo WAV golden, original float32 asset bytes through the real native container, offset fades across cuts, clipping, malformed metadata/assets/ranges, output allocation limits, 120 history edits sharing original sources, repeated clipboard source reuse, pending playback cancellation, and keyboard/pointer selection without PCM edits.

Browser commands use installed real Chrome at 1280×720, one worker, a private preview port 4187, and no package installation:

```sh
./node_modules/.bin/playwright test -c src/audio/audio-playwright.config.ts
AUDIO_PRODUCTION=1 ./node_modules/.bin/playwright test -c src/audio/audio-playwright.config.ts
```

The browser suite checks real PCM16 import and playback/cursor/stop, exact pointer/numeric/keyboard ranges, edit/undo/redo, native save/reopen and recovery, a literal PCM16 output after effects, invalid import retention, missing Web Audio capability, 126px numeric fields and in-viewport controls. It records console/page errors, failed/external requests and cross-origin isolation. Production runs consume the parent's existing build; this command never rebuilds.

The final development run passed **3/3** (7.8s), including trim/fade-out/normalize exact output and pointer/cut/undo. Its diagnostics reported `crossOriginIsolated: true`, no external or failed requests, and no console/page errors in every case. Evidence: `/tmp/gsnv-consumer-qa/audio-dev-browser-final.log`, `/tmp/gsnv-consumer-qa/audio-browser-results/*/audio-browser-diagnostics.json`, `/tmp/gsnv-consumer-qa/audio-workspace-dev-final.png` and `/tmp/gsnv-consumer-qa/audio-import-error-dev-final.png`. The 1280×720 screenshots were inspected: selection fields show their complete values, waveform and footer fit, and invalid decode has an actionable alert without hiding controls. Whole-repository `./node_modules/.bin/tsc --noEmit` passed with exit 0 (`/tmp/gsnv-consumer-qa/audio-typecheck-final.log`).

The added Normalize browser regression exposed an initial `min=0.01, step=1` mismatch that rejected ordinary percentages, including the default 95%. The dialog now uses unrestricted numeric steps with the same range/domain validation, and the test requires both the default and 50% to enable OK before checking exact WAV samples. Browser test output uses a private OS-temporary directory, and the development harness disables HMR/file watching so simultaneous unrelated edits cannot reload a test midway.

The assembled production build passed the same **3/3 Chrome tests** (8.0s) after the parent's coordinated rebuild. Each case reported `crossOriginIsolated: true`, seven local HTTP resource URLs, no external or failed requests, and no console/page errors. Evidence: `/tmp/gsnv-consumer-qa/audio-production-browser.log` and the preserved `/tmp/gsnv-consumer-qa/audio-production-diagnostics.json`. Final screenshots were inspected at 1280×720 and preserved outside the repository: `/tmp/gsnv-consumer-qa/audio-workspace-production.png` and `/tmp/gsnv-consumer-qa/audio-import-error-production.png`. The output after trim/fade-out/50% normalize was exactly `[0, 16384, 16384, 0]` as signed PCM16; the original fade-in/200% volume case was exactly `[16384, 0, 10922, 21845, 32767, 16384, 16384, 16384]`.

Verdict for the tested mono/stereo WAV/native workflow: **usable**. AUD-001, AUD-002 and AUD-003 have focused core and real production browser evidence; the shared native/recovery portion of AUTH-001 is also exercised. This does not finish acceptance of other editors or the whole product.

Native operating-system picker dialogs, audible output on physical hardware, codecs other than the tested WAV files, browsers other than installed Chrome, and maximum-size real recordings remain untested. Offline/distribution and whole-application gates belong to integration. Owner acceptance is not claimed by these tests.
