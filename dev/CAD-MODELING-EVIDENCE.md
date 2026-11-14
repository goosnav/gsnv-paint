# CAD default planes and profile evidence — 2026-11-13

This records gates 1–3 of [CAD-NEXT-INCREMENT.md](CAD-NEXT-INCREMENT.md), approved in `df945ee` and `1fc368f`. Gates 1–2 are connected to the editor. Gate 3 is a test-only native API proof. The scoped results below are retained independently of the [modeling and offline checkpoint](MODELING-OFFLINE-CHECKPOINT.md), which owns final combined results. Candidate `9980ea171176a67ab825a15083838fed0849060cd52c8d6857652d75cf6efaa2` passes 908/908 full units and the canonical 89-case combined browser gate; [browser output](evidence/modeling-offline-browser-green.log) records 4.0 minutes and exit 0. No shared `dist` build was performed by the original CAD task or this documentation pass.

The earlier Save → New → Open timeouts are retained in the [chooser diagnosis](CAD-REOPEN-DIAGNOSIS.md). A captured repeated failure proved asynchronous test interception. The consumer and imported-CAD goldens now subscribe through the public `page.on` API during initial setup, retaining their original per-action waiters, shortcuts, timeouts, native-byte checks and kernel assertions. This changed no application bytes. Attribution of the earlier uninstrumented failures remains inferred; their RED evidence is not erased by the final GREEN run.

## Executed results

| Check | Actual result | Evidence |
|---|---|---|
| Cumulative CAD/source/solver/kernel/STEP tests | **76 passed, 0 failed, 0 skipped**, 9.90 s | [cad-modeling-unit.log](evidence/cad-modeling-unit.log) |
| Production Chrome modeling workflow | **4 passed**, 22.4 s, 1280×720 | [cad-modeling-browser.log](evidence/cad-modeling-browser.log) |
| Bounded module checker | **13 PASS**, exit 0 | [cad-modeling-bricks.log](evidence/cad-modeling-bricks.log) |
| Strict targeted TypeScript | **Exit 0**, no diagnostics | Exact command below |
| Seven new leaf demos | **All exit 0** | Exact command below; real C72 demo measures volume 1200, area 760 and XZ center `(10,-3,5)` |
| Existing C50/C51/C52/C57 demos | **All exit 0** | Exact command below |
| Isolated production Vite build | **Exit 0** | `/tmp/gsnv-cad-modeling-dist`; shared `dist` unchanged |
| CAD diff whitespace check | **Exit 0**, no diagnostics | `git diff --check -- src/cad` |

The production test first ran against the old build and failed at the absent centered-rectangle tool, before the connected implementation. New leaves passed expected missing-module RED before implementation. Test fixture corrections did not change runtime policy: unit binding is asserted by physical evaluation rather than a particular equivalent source spelling, and New → Open waits for visible New completion rather than racing its asynchronous replacement. Keyboard coverage uses no manual focus workaround. One test-only wait was corrected to ignore hidden SVG geometry retained while the viewport is in solid mode.

The screenshot [CAD-modeling-production.png](evidence/CAD-modeling-production.png) shows the actual XZ solid, plane controls, source profile and inspection at 1280×720. The parent independently inspected it and reported clear usable app chrome with no OS task/exit bars. After the isolated build, a help-text-only correction changed the empty legacy-dimension hint to direct profile users to the profile buttons. That copy is included in the parent's current candidate; it does not alter the tested model paths. The checkpoint report owns the final combined results, rather than extending the focused counts above by implication.

## Bounded bricks and integration

| ID | File | Physical lines | Direct boundary |
|---|---|---:|---|
| C70 | `default-plane-frame.ts` | 20 | Owned literal right-handed XY/XZ/YZ frames; no brick dependencies |
| C71 | `sketch-profile-source.ts` | 54 | C03 expressions + C07 geometry; immutable descriptor → current mm segments |
| C72 | `kernel-plane-transform.ts` | 40 | C01 session type + C70 frame; one final native rigid transform with explicit token ownership |
| C73 | `sketch-profile-edit.ts` | 66 | C71 + C03 context type; exact membership, controlled-reference rejection and atomic group edits |
| C74 | `cad-expression-policy.ts` | 28 | C03 + C04; shared variable evaluation, ordered parameter checks and physical unit binding |
| C75 | `cad-legacy-sketch-edit.ts` | 114 | C50 + C74 + C07; legacy source semantics, target isolation and unchanged revision |
| C76 | `cad-model-edit.ts` | 103 | C50 + C74; model actions, complete expression inventory and unchanged revision |

Changed bounded bricks C50, C51, C52, C56, C57 and C58 also pass the checker. C51 is now a 42-line declared assembly/router; it owns the single revision increment and final validation, not geometry or expression policy. The production part-builder and workspace remain declared assemblies. `kernel-test-fixture.ts` and `revolve-proof-fixture.ts` are test support, not production modules.

C50 preserves exact legacy files with absent optional `profiles`; new profiles preserve expression strings and stable member IDs. Numeric legacy centers/origins remain canonical mm. C52 materializes controlled profiles before endpoint sharing and fixes their generated points; all free geometry still uses real PlaneGCS. C76 binds profile center/size/radius/angle sources with the existing dimension/position/feature inventory on unit changes. Invalid source, references, dimensions, variable changes and IDs reject atomically.

The local-frame build executes extrusion, cuts and edge treatment before C72 transforms the final B-rep once. Display and STEP use the same result. Imported STEP stays in its original world coordinates. The C35 owner's capture port, readiness stamps and facade bridge delegation were preserved; the approved `bridge.cadToImage` command is used by both CAD assemblies. This document does not claim the separate cross-workspace transfer acceptance.

## Independent oracles and remaining limits

- C70/C72: literal frame handedness and coordinate mapping, actual asymmetric B-rep corner, volume/area/COM, positive and negative depth, repeated mm/inch STEP import and zero retained tokens. Ordinary failures preserve the input token; native/cleanup faults permit no further native calls.
- Connected profiles: rectangle center stays fixed when width changes; regular polygon radius/rotation/area are independently checked. Real solver/native integration covers an edited hexagon with a circle hole and construction rectangle, every default plane and mm→inch→mm. The source descriptor remains unchanged while current evaluated geometry changes. Detach writes the current geometry and is undoable.
- Existing plate: the original `part-builder.test.ts` is unchanged and passes its 100/120-width expressions, dependent placement and mm→inch→mm checks. Volumes remain `56654.424808105` and `68654.424808105 mm³`. The additional 120-mm all-plane fixture independently checks native volume/COM/full bounds/actual pocket corners and source hole centers, including STEP import. The separate asymmetric cut fixture detects incorrect plane orientation/placement. Existing legacy-native migration and every-body STEP tests remain passing.
- Gate 3: real native full and signed quarter tubes with inner radius 10, outer radius 20→25 and height 12 preserve formulas and give `3600π`/`6300π mm³` for full turns. Quarter-sector centroid, signed end-cap vertices, bounds and face counts are checked, then mm/inch STEP roundtrip and token release. An axis-touching rectangle gives a cylinder with volume `1200π`, area `440π`; an offset circle gives a torus with volume `360π²`, area `240π²`. Cylinder/torus have direct native validity, volume/area/COM/bounds checks; the tube fixtures provide the STEP proof.
- The revolve proof supports only one simple local-XY polygon/circle in the nonnegative-U half-plane, exact +V axis through the origin, and `1e-9 < abs(angle) <= 2π`. Polygons may touch the axis; circles must clear it. It does **not** establish holes, negative-half-plane profiles, U/arbitrary axes, revolve cut, downstream features, persistent revolve history or a connected production command. Native numeric/RuntimeError/cleanup fault injections stop later calls. Existing C55 worker failure/watchdog/replace/stale tests pass separately; no production revolve worker route is claimed.

Production revolve remains unavailable. The [reviewed gate-4 contract](CAD-REVOLVE-INCREMENT.md), committed as `a1aaeb8`, now defines the production source/executor increment; implementation follows the current checkpoint repairs. The native proof above is not that production route. General history, planar-face sketches, arcs/slots in the editor, trims/offsets/patterns, topology selection and broader inspection/export remain open.

## Parent-reviewed requirement disposition

The parent reviewed the full procedures and recorded the four bounded CAD
credits below after the final combined gate. No requirement ledger was edited
by this CAD task or this documentation pass.

| Requirement | Procedure evidence | Reviewed result |
|---|---|---|
| CAD-020 / V-CAD-020 | XY/XZ/YZ schema and connected plane selection; literal and real asymmetric native coordinates in every plane, plus STEP; production XZ/YZ workflows | **PASS** for the stated procedure |
| CAD-025 / V-CAD-025 | Empty sketch pointer center `(10,10)`, corner `(25,20)`; exact closed corners `(-5,0),(25,0),(25,20),(-5,20)`; native save/reopen source comparison | **PASS** for the stated procedure |
| CAD-030 / V-CAD-030 | Empty sketch, typed 6 sides, center `(0,0)`, radius 10; closed six-edge shape with every edge/radius 10; exact native reopen source comparison | **PASS** for the stated procedure |
| CAD-033 / V-CAD-033 | Empty sketch free line `(0,0)→(20,10)` marked construction; exact native reopen flags/coordinates; subsequent 40×20×2 profile produces 1600 mm³, excluding the open construction line | **PASS** for the stated procedure |
| CAD-071 / V-CAD-071 | Native API/source-materialization proof only; no production feature/persistence/dependent history workflow | **UNTESTED**; production revolve remains unavailable |

Unit/expression and existing plate/STEP requirements gain cumulative regression evidence, not an automatic broader status promotion. CAD-022's angled-face procedure and CAD-019's arbitrary-field scope remain incomplete. These checks do not establish full CAD completion or human acceptance.

## Exact commands

Run from the repository root. These are the focused verification commands used
for this increment; build-owning commands must run sequentially with other
build/browser work. Counts above belong to their saved logs. The parent owns
the final candidate's cumulative run.

```sh
node --import tsx --test \
  src/cad/default-plane-frame.test.ts src/cad/kernel-plane-transform.test.ts \
  src/cad/sketch-profile-source.test.ts src/cad/sketch-profile-edit.test.ts \
  src/cad/cad-expression-policy.test.ts src/cad/cad-legacy-sketch-edit.test.ts \
  src/cad/cad-model-edit.test.ts src/cad/profile-content.test.ts \
  src/cad/cad-profiles.test.ts src/cad/editable-cad-content.test.ts \
  src/cad/edit-cad-content.test.ts src/cad/linear-sketch-program.test.ts \
  src/cad/part-planes.test.ts src/cad/acceptance-plate-planes.test.ts \
  src/cad/part-builder.test.ts src/cad/cad-project-source.test.ts \
  src/cad/step-preview.test.ts src/cad/solid-preview-group.test.ts \
  src/cad/revolve-proof.test.ts src/cad/cad-worker-client.test.ts \
  src/cad/cad-tool-input.test.ts src/cad/cad-properties.test.ts \
  src/cad/cad-viewport.test.ts

node_modules/.bin/vite build --outDir /tmp/gsnv-cad-modeling-dist
CAD_MODELING_DIST=/tmp/gsnv-cad-modeling-dist node_modules/.bin/playwright test --config src/cad/cad-modeling.playwright.config.ts

python3 /home/goosnav/.agents/skills/synced/00ab2cd7-2e1c-45ca-814e-5f657fe548ca_724affcc-3df3-47d2-bd47-95d03e739484/goosnav-modular-coding-method/scripts/check_module.py \
  src/cad/default-plane-frame.ts src/cad/kernel-plane-transform.ts \
  src/cad/sketch-profile-source.ts src/cad/sketch-profile-edit.ts \
  src/cad/cad-expression-policy.ts src/cad/cad-legacy-sketch-edit.ts \
  src/cad/cad-model-edit.ts src/cad/editable-cad-content.ts \
  src/cad/edit-cad-content.ts src/cad/linear-sketch-program.ts \
  src/cad/cad-tool-input.ts src/cad/cad-properties.ts src/cad/cad-viewport.ts

node_modules/.bin/tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2023 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --lib ES2023,DOM,DOM.Iterable --types node,vite/client \
  src/cad/default-plane-frame.test.ts src/cad/default-plane-frame.demo.ts \
  src/cad/kernel-plane-transform.test.ts src/cad/kernel-plane-transform.demo.ts \
  src/cad/sketch-profile-source.test.ts src/cad/sketch-profile-source.demo.ts \
  src/cad/sketch-profile-edit.test.ts src/cad/sketch-profile-edit.demo.ts \
  src/cad/cad-expression-policy.test.ts src/cad/cad-expression-policy.demo.ts \
  src/cad/cad-legacy-sketch-edit.test.ts src/cad/cad-legacy-sketch-edit.demo.ts \
  src/cad/cad-model-edit.test.ts src/cad/cad-model-edit.demo.ts \
  src/cad/editable-cad-content.test.ts src/cad/edit-cad-content.test.ts \
  src/cad/linear-sketch-program.test.ts src/cad/linear-sketch-program.demo.ts \
  src/cad/cad-profiles.test.ts src/cad/profile-content.test.ts \
  src/cad/part-planes.test.ts src/cad/acceptance-plate-planes.test.ts \
  src/cad/revolve-proof.test.ts src/cad/cad-modeling.browser.spec.ts \
  src/cad/cad-modeling.playwright.config.ts src/cad/cad-properties.test.ts \
  src/cad/cad-tool-input.test.ts src/cad/cad-viewport.test.ts \
  src/cad/cad-parametric-workspace.ts src/cad/cad-imported-view.ts src/cad/cad-workspace.ts

for cad_demo in src/cad/default-plane-frame.demo.ts src/cad/kernel-plane-transform.demo.ts src/cad/sketch-profile-source.demo.ts src/cad/sketch-profile-edit.demo.ts src/cad/cad-expression-policy.demo.ts src/cad/cad-legacy-sketch-edit.demo.ts src/cad/cad-model-edit.demo.ts; do node --import tsx "$cad_demo" || exit 1; done
for cad_demo in src/cad/editable-cad-content.demo.ts src/cad/edit-cad-content.demo.ts src/cad/linear-sketch-program.demo.ts src/cad/cad-tool-input.demo.ts; do node --import tsx "$cad_demo" || exit 1; done

git diff --check -- src/cad
```
