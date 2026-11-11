# Circular sketch geometry — C08 provisional GREEN

C08 is a pure geometry module for circles, three-point arcs, center-point arcs, tangent arcs and slots. It produces owned analytic entities with caller-supplied IDs and construction flags. It is not yet connected to the production canvas, solver program or saved CAD document. The current editable line/rectangle/extrude/STEP workflow remains the production path.

The anchor conventions were committed in the module map as `9a3fa8d` before implementation. The file header and public types preceded the testbench; all 19 original tests failed against the unimplemented entry point ([expected RED](evidence/C08-red.txt)). The first implementation passed those 19 tests. Independent review then found two numerical defects, reproduced by new tests before repair:

- Separate `atan2` subtraction could send a rotated antipodal center arc along the opposite semicircle. Normalized ray cross/dot products now preserve the declared counterclockwise tie. [RED output](evidence/C08-review-direction-red.txt), [repair output](evidence/C08-review-direction-green.txt).
- Shallow arcs could return finite coordinates while losing anchors or a supplied tangent beyond document tolerance. Reconstruction checks now use `max(linearMm, relative × local extent)`: anchor-pair span for three-point arcs, chord length for tangent arcs, radius for center arcs and width for slot caps. Neither world position nor a distant circumcenter enlarges the bound. Tangent starts come directly from the supplied direction and receive an angular check. Unrepresentable geometry raises the existing readable `DegenerateGeometryError`. [RED output](evidence/C08-review-accuracy-red.txt).

The final 23 cases retain all original assertions and add rotated ties, shallow-arc failures, valid shallow curves, explicit relative-tolerance behavior and translated small tangent arcs. [D18](DECISIONS.md#d18--circular-sketch-anchor-conventions) and the file header record the alternatives and revisit conditions. The follow-up independent review reran all 23 focused tests and typecheck and found no remaining Critical or Important issues in C08 ([review record](evidence/C08-review.txt)). This review does not cover future integration.

## Verification

Environment: Linux x64, Node 24.21.0; desktop Chrome 154.0.8037.97 headless at 1280×720 for the existing production/shared browser tests. No other browser, OS or native picker interaction was tested.

| Command | Result | Evidence |
|---|---|---|
| `node --import tsx --test src/cad/sketch-circular-primitives.test.ts` | Exit 0; 23 pass, 0 fail, 0 skipped | [focused log](evidence/C08-green.txt) |
| `npm test` | Exit 0; 493 pass, 0 fail, 0 skipped | [cumulative unit log](evidence/phase2-through-C08-unit.txt) |
| `npm run test:browser` | Exit 0; strict TypeScript/build plus 18 browser tests pass, 0 skipped | [browser log](evidence/phase2-through-C08-browser.txt) |
| `npx wrangler deploy --dry-run --no-autoconfig` | Exit 0; static assets read, no bindings, dry run completed | [deploy log](evidence/C08-deploy.txt) |
| `npm run test:spec` | Exit 0; requirement/contract/trace/link checks pass | [spec log](evidence/C08-spec.txt) |
| Goosnav module checker; exact command below | Exit 0; PASS | [checker log](evidence/C08-checker.txt) |

```sh
python3 /home/goosnav/.agents/skills/synced/00ab2cd7-2e1c-45ca-814e-5f657fe548ca_724affcc-3df3-47d2-bd47-95d03e739484/goosnav-modular-coding-method/scripts/check_module.py src/cad/sketch-circular-primitives.ts
```

`node --import tsx src/cad/sketch-circular-primitives.demo.ts` exited 0 and printed five readable examples: a radius-10 circle, a three-point semicircle, a tangent quarter-circle, a clockwise major center arc and a width-8 slot. [Demo output](evidence/C08-demo.txt) illustrates use; it is not acceptance evidence. The real C03→C08 unit seam uses inch-document expressions to create a 25.4 mm circle and an 8 mm slot. No fake solver or kernel is used by this pure module.

The build retains the existing Vite warnings about the solver's conditional `node:module` import and the main chunk size recommendation. Browser worker tests still pass. The largest static asset remains **22,942,327 bytes**, below the configured **26,214,400-byte** Cloudflare limit ([inventory](evidence/C08-assets.json)). The [explicit static deployment configuration](CLOUDFLARE-DEPLOYMENT.md) still avoids Wrangler's failing automatic Vite configuration. This run did not authenticate/upload to Cloudflare or inspect the hosted site.

## Status and limits

Requirements remain **16 PASS / 0 FAIL / 370 UNTESTED**. PASS IDs: SYS-005, CAD-001, CAD-002, CAD-003, CAD-006, CAD-043, CAD-044, CAD-059, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023, REL-028. Every other ID remains UNTESTED in [requirements.json](requirements.json). In particular CAD-026–029 and CAD-031 still need their interactive draw/save/reopen procedures; component geometry tests do not pass them.

C01–C04, C07–C08, C37 and C50–C60 are GREEN. Human ACCEPTED remains empty; shared provisional assembly height is 4 and CAD height is 3. C08 adds no production assembly rung. Under the retained modular method, the repaired review findings stop this batch before another brick. C05's separate revision-overflow amendment remains pending. The full CAD feature set, golden part/rebuild, Image, Video, performance and release gates remain required; this is not a release candidate.

## How to tune

All tolerance values are request inputs. `linearMm` governs collapsed radii, separations and collinearity; `angularRad` governs collapsed sweeps, distinct directions and tangent accuracy; `relative` permits reconstruction error against local dimensions only. The shallow/translated and relative-tolerance tests guard these choices. No hidden epsilon or solver setting is added. ID ordering, construction propagation, cardinal extents, owned arrays and explicit through-point direction each have dedicated regression cases. Valid tool tags, finite anchor tuples, positive finite tolerances and unique nonempty IDs remain caller preconditions. Changing the public anchor conventions, entity types or error families needs a contract amendment.
