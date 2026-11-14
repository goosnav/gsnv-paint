# Video endpoint and native identity repair

Mode A, 2026-11-13. Independent continuation review reproduced two candidate
blockers in the new bridge/bin workflow. This bounded repair is covered by the
owner's current-phase BATCH after this contract is committed. Human acceptance
remains pending.

The existing V-TIMELINE CORE owns sequence location and native validation. At
the exact end of the sequence it must retain the final clip, its exact timeline
offset and fade, but provide a source sampling time inside `[clip.in, clip.out)`.
Ordinary interior times and transitions to the next clip retain their current
meaning. Preview and D03 capture must consume the same sample policy, so a
trimmed-out frame cannot appear merely by choosing End. The sample margin is one
microsecond, enlarged only if required by floating-point representability, and
never before clip.in. Do not subtract an entire project frame: an out point can
fall between source frames. D03 still bounds reads by the real decoded duration
and retains its abort, stale-state and resource-release guarantees. This is a
correction of the existing half-open trim/last-frame promise, not a new frame
rate or demuxer feature.

The V-TIMELINE native decoder must reject ambiguous identities before returning a
document: each media, clip and title has a nonempty string ID unique in its own
collection, each clip names an existing media item, and each media item has one
unambiguous matching nonempty byte asset. Null/malformed records fail with
`VideoContentError`, not an incidental TypeError. Imported media dimensions must
be positive integers. No deduplication or repair may silently change the file.
Valid existing native projects and unplaced media retain their source bytes and
supported metadata. Reject duplicate/unreferenced native assets rather than
dropping them on the next Save. Existing edit validation must not create an
identity which the decoder rejects (including empty split IDs).

Required RED then GREEN checks:

- CORE exact end, just-before end, out-of-range, adjacent clip boundary, nonzero
  in-point, unchanged fade/offset and immutable source. Include split semantics.
- Real production Chrome: the red/green/blue local video fixture trimmed to
  `[0,0.5)` ends red; `[0.5,1)` ends green. Capture at End must match preview and
  the independently decoded native Image bytes, with the existing codec channel
  tolerance of 3. Interior color checks must remain unchanged.
- Decoder cases for duplicate media/clip/title/asset IDs, missing/extra assets,
  missing IDs, null records, empty bytes and invalid dimensions. Valid unplaced
  media can be removed and the result encoded/native-round-tripped without a
  dangling byte reference. Rejection leaves input bytes/source untouched.
- Existing timeline, bridge, persistence, build and combined browser checks stay
  cumulative. Record the original failures and final exact commands/results.

Alternative: clamp only the bridge decoder. Rejected because the preview would
still show a different excluded frame at End. Alternative: silently deduplicate
native records. Rejected because identity-based edits could target different
content than the file intended. Revisit source sampling when native WebCodecs
demux supplies exact source timestamps; revisit schema only with a documented
version migration.

## Repair evidence

The implementation is frozen for the parent’s cumulative candidate gate. The
focused repair gate passes; the whole application build/browser run and human
acceptance are separate gates. XWS-002 remains incomplete because the Video
correction stage is still absent.

The original testbench was run before implementation: 32 new core tests had
19 failures, and all three new real-Chrome endpoint cases failed. The source
sampling correction now returns `0.499999` for `[0,0.5)` and `0.999999` for
`[0.5,1)`, while retaining the exact timeline time/offset/fade. Preview and
captured native Image bytes match: `[254,0,0,255]` and `[0,255,2,255]`. The
existing maximum channel error of 3 was not increased. A trim beginning at the
actual finite decoded end is rejected. The native decoder rejects malformed
identities/assets atomically; valid unplaced bytes still survive native
round-trip and explicit removal.

A follow-up regression covers a real UI WebM export, local source reimport and
frame capture. Chrome reports `Infinity` at `loadeddata` for the multi-chunk
MediaRecorder export. An initial finite-only duration guard was reproduced RED
in a controlled decoder test and real Chrome, then removed. Positive unknown
duration now permits the requested finite, clip-bounded seek; NaN or known
duration at/before the in-point still fails. After seek, D03 rechecks duration,
current time, clip bounds and readiness; a newly revealed short source, a
backward clamp before the in-point, an excluded out-point or NaN cannot supply
pixels. These post-seek tests were also RED before their guard was added. The
real exported bytes are preserved exactly on import; captured native Image
is 160×120 with red sample `[254,0,0,255]`.

Commands from the repository root:

```sh
node --import tsx --test src/video/video-boundary.test.ts src/video/video-timeline.test.ts src/bridge/video-source-adapter.test.ts
# 38 tests; 38 pass; 0 fail
node node_modules/@playwright/test/cli.js test --config src/bridge/bridge.playwright.config.ts --grep 'trimmed|MediaRecorder WebM'
# 4 passed (8.1 s); real Chrome, isolated production assembly on port 4194
./node_modules/.bin/tsc --noEmit
# exit 0
```

The UI WebM test restricts `MediaRecorder.isTypeSupported` to supported WebM
types to exercise the real fallback exporter on Chrome versions which prefer
MP4. It does not substitute recording, media bytes, decoder events or pixels.
The recording is longer than the exporter's 500 ms chunk interval, avoiding a
single-chunk file whose duration Chrome can know immediately. The same workspace
tests run against the full application with `BRIDGE_WORKSPACE_APP=1`; parent
owns that combined build/run. These tests request only local origin resources.

Evidence: [core RED](evidence/video-boundary-unit-red.log),
[endpoint browser RED](evidence/video-boundary-browser-red.log),
[unknown-duration unit RED](evidence/video-duration-unit-red.log),
[unknown-duration browser RED](evidence/video-duration-browser-red.log),
[post-seek RED](evidence/video-postseek-unit-red.log),
[final unit GREEN](evidence/video-boundary-unit-green.log),
[final focused browser GREEN](evidence/video-boundary-browser-green.log), and
[TypeScript](evidence/video-boundary-tsc.log).

D03's method checker [passes](evidence/video-boundary-module-d03.log). The
existing V-TIMELINE module still produces its prior header/public-entry warnings:
PURPOSE wording, no named alternative, and seven counted exports (including
overload declarations). The same check on HEAD before this repair produced
the same findings; [baseline](evidence/video-boundary-module-baseline.log) and
[current](evidence/video-boundary-module.log) are retained. This bounded repair
does not claim to have brought the inherited module's interface into full
method compliance or rewritten the working Video assembly.
