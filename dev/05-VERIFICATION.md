# Verification and validation plan

The executable test suite is built with each contracted brick, never pre-populated with passing placeholders. `requirements.json` is the complete forward trace and specifies a concrete procedure per requirement. `06-TRACEABILITY.md` provides the readable spine. All runtime requirements start UNTESTED.

## Test layers

1. Spec inspection: IDs unique, needs and modules resolve, every requirement has an explicit test/procedure, no dependency cycles, no requirements omitted from the owner brief. This proves the spec structure, not the product.
2. Brick testbench: representative case, boundary, every declared error, explicit golden result and meaningful invariants. Run expected RED before implementation. CORE tests use pure values; SHELL contract tests use a fake plus an actual browser/resource smoke test.
3. Cumulative seam suite: real output of one brick is passed to its consumer. A fake must not replace the seam under test. Record provisional GREEN assembly separately from owner-accepted ladder.
4. Browser integration: current Chromium at 1280×720 and a larger desktop viewport. Menus, keyboard focus, dialogs, cancel/preview, pointer manipulation, file fallback and recovery run through actual browser APIs. Functional DOM assertions are supplemented with screenshots inspected for layout and original chrome.
5. Golden system tests and calibrated performance tests, below.
6. Release tests: inspect the exact static artifact; verify isolation headers, asset sizes, offline cold reload, absence of external requests and the M1a platform/architecture matrix.

## Required golden procedures

### V-CAD-PLATE

Create a 100×60 rectangle, extrude 10 mm, apply R5 to the four vertical corner edges, cut four Ø6 through-holes at (10,10), (90,10), (10,50), (90,50), and cut a centered 20×20 pocket 5 mm deep. Hole positions on the right derive from width−10. Assert a valid closed solid and kernel volume 56654.425 mm³ ±0.01%. Change named width to 120 and rebuild; expect 68654.425 mm³ ±0.01%. Export STEP, dispose the original body, re-import, and compare kernel volume within 0.01%. Compare to an independent analytic oracle: `w*60*10 - (4-pi)*25*10 - 4*pi*9*10 - 20*20*5`.

Over-constrain a sketch with contradictory dimensions: retain editable source, return conflicting IDs and a readable flag. Apply a fillet radius too large for its edges: retain last good geometry, flag the failed feature and dependent invalid features, never report a successful new model.

### V-IMG-GOLDEN

Use a checked-in small RGBA input and a literal expected RGBA array produced from independently calculated operations. Sequence: create two layers, hard-pencil stroke, rectangular selection, partial-alpha paint, multiply blend, invert adjustment on selected pixels, layer reorder and masked composite. Assert exact RGBA bytes. Save/reopen native project and assert full structured state, layers/text/masks plus composite equality. Separate family cases cover every requested tool and adjustment; this one sequence alone cannot pass them all.

### V-VID-GOLDEN

Use three generated deterministic video clips with an audio impulse and matching visible frame marker at known times. Use project 1920×1080 at 30 fps; compose a cross dissolve, a title and a volume keyframe. Export MP4 with H.264/AAC. Independently demux and inspect dimensions, frame count, duration (within 1/30 s), audio impulse vs visual marker (within 1/30 s), rendered title pixels and measured gain around the keyframe. Also cover WebM and other required exports with format-specific assertions. If required native encoding is unavailable, record UNTESTED/blocked with actual capability results; do not silently replace codecs or mark the golden pass.

## Performance protocol

Record hardware and software before calibration. Run one warmup, then at least ten trials on a fixed fixture. CAD: 50 dependent realistic features, 2-second rebuild upper bound, 60 fps interaction target (frame budget 16.67 ms). Image: 4000×4000, 20 populated layers, a reproducible 120 Hz pointer trace; report input-to-painted-frame latency (proposed interpretation of “no visible lag”: p95 ≤33 ms) and any dropped input. Video: three 1080p30 tracks with audio; report frame deadlines, render scale changes and measured sync. The owner's “no visible lag” judgment remains a validation check alongside timing. Hardware-specific results never imply universal speed.

## Phase gates and reporting

Each phase report lists exact commands, exit code and output, passed IDs, failed IDs and all remaining UNTESTED IDs. A command that verifies doc structure is labeled as such. Product requirement PASS requires matching behavior evidence. No skipped check passes. Push only a green phase; unexpected failures halt BATCH for diagnosis and owner direction. Failed push/deploy credentials halt immediately, with local commits preserved.

The owner validates N-001…N-007 against the completed artifact. Release cannot be CANDIDATE_FOR_ACCEPTANCE until golden tests, complete supported launcher matrix and stated requirements have evidence; outstanding scope is not disguised as “best effort.”

## Phase evidence boundary

The requirements `phase` is introduction ownership; `verificationPhase` is the planned full-procedure closure phase. A phase gate requires every contracted brick and cumulative seam implemented in that phase to pass its complete testbench, checker and smoke procedure. A shared requirement whose full test spans later workspaces stays UNTESTED until that entire procedure runs; a passing foundation test is recorded as component evidence, never a partial requirement PASS. This permits the ordered Phase 1 shell to be verified without inventing unbuilt CAD/Image/Video behavior. All tests actually run must be green before a phase push; unexpected failures still halt BATCH.
