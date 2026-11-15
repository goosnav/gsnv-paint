# Paint icon refinement — 2026-11-15

Owner-approved scope: Paint tools should have classic Paint-like slender proportions,
solid objects, restrained colour and native pixel edges. Preserve the existing top
workspace icons, all tool behaviour and comfortable button targets. This supersedes
PU-03's outline-only presentation, not its local-asset/licensing requirements.

## Contract and module map

- **PIR-01:** All 19 Paint tools have distinct, recognizable 16px artwork. Use
  unmodified Fugue 3.5.6 shadowless colour PNGs for physical objects and a few
  one-bit raster derivatives of already-vendored Tabler selection/shape symbols.
  Do not stretch icons to fill their buttons or change Microsoft assets.
- **PIR-02:** Paint's common command icons share the bitmap treatment. Other
  workspaces and the top workspace switcher retain their current SVG artwork.
- **PIR-03:** Existing labels, shortcuts, selected/disabled feedback, 32px desktop
  targets and 40px touch targets remain. Pixel art uses nearest-neighbour display.
- **PIR-04:** Icons remain bundled/offline, with pinned sources, hashes, a
  reproducible asset builder and visible attribution plus distributed notices.

Existing SHELL brick `shared/icons` gains an optional Paint theme while preserving
its SVG element return type/accessibility contract. Local PNGs are embedded inside
that element. `shared/chrome` selects the theme only for Image commands; its header
is unchanged. Asset generation is development-only; no new runtime dependency.
Help gains searchable icon credits. Pixel/image/geometry/timeline CORE is unchanged.

## Verification plan

- Unit/catalog/provenance tests: PIR-01/02/04, including safe local image references,
  byte-identical source PNGs, native dimensions and unchanged workspace SVG output.
- Existing chrome/browser tests and a focused live-app check: PIR-01/02/03/04,
  including Paint tool selection, context switching, decoded images and attribution.
- Inspect screenshots at actual size at DPR 1/2 and a touch viewport. Compare the
  top workspace switcher's pixels with the pre-change capture. Emulation does not
  establish physical iOS acceptance.
- Typecheck/build and the existing unit suite must pass before push. Record actual
  commands/results below; do not treat missing checks as passes.

Status: contract/map ready; implementation authorized by the owner's current request
and standing BATCH authorization. Final visual acceptance remains with the owner.
