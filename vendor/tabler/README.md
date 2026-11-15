# Tabler interface icons

This is a deliberately small, unmodified SVG subset from **Tabler Icons 3.52.0**,
MIT, copyright 2020–2026 Paweł Kuna. It comes from the official repository at
`4581ad20d8d13e24f6c3be75caaea1c4ad6c4b35` (tag `v3.52.0`). `provenance.json`
records each original path, SHA-256 and application-name mapping. `LICENSE` is the
complete upstream license; an identical copy ships under `public/licenses/`.

Other workspaces' common toolbar actions retain this 24-unit outline family,
with the original two-unit round strokes. Paint now uses the native bitmap theme
in `../paint-icons/` (D36), including five thin raster derivatives from these
sources. Its old aliases remain in this catalog for provenance/history, but the
renderer overrides their presentation. Workspace-specific original glyphs remain
unchanged. Tooltips retain the exact operation names.

`generate.mjs` validates the local hashes and allows only SVG path data with the
shared stroke attributes. It joins those paths in source order into the generated
`src/shared/tabler-paths.ts` catalog. Runtime code creates SVG nodes directly;
there are no fetched icons, external references, SVG markup parsing, or packages.

```sh
node vendor/tabler/generate.mjs
node vendor/tabler/generate.mjs --check
node --import tsx --test src/shared/icons.test.ts src/shared/icons.vendor.test.ts
```

To deliberately change the subset, obtain sources from an explicit reviewed
upstream release/commit, update the provenance and license, regenerate, and check
the glyph sheet at toolbar sizes and both DPR 1 and 2. Never replace sources from
an unpinned branch. The archived Pixelarticons subset remains for earlier history;
the current renderer does not use it.
