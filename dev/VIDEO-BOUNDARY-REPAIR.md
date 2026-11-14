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
