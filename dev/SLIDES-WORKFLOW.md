# Slides authoring contract

P01–P03 implement the committed `dev/MODULE_MAP-AUTHORING.md` scope. They remain GREEN only after their listed checks; product acceptance belongs to the owner. The parent owns app registration and the production build.

## Document and edits

`slidesDocument(request)` is the pure P01 entry point, with `new`, `read`, `edit`, `encode` and `decode` operations. `new` receives a caller-issued slide ID. The document stores explicit canvas width/height, theme background/text/accent colors, ordered slides, ordered elements and local raster image assets. IDs remain stable and unique. Text is plain text with font, size, alignment and emphasis. Shapes are rectangles or ellipses with fill/stroke. Images refer to deck-owned PNG/JPEG/GIF/WebP bytes, never URLs. Numeric positions, sizes and rotation use the slide's logical pixel coordinates; geometry may extend beyond the slide and is clipped in output.

The default canvas is 960×540 (16:9), with a 960×720 (4:3) choice. A deck always has at least one slide. Typed actions add/duplicate/delete/reorder slides, add/update/delete/reorder elements, set slide names/backgrounds and change canvas/theme settings. Duplicate receives new IDs for the slide and its elements and shares immutable image content. Validation rejects unknown fields, unsafe image formats, malformed data, duplicate/missing references and nonfinite or out-of-bounds geometry. Every returned document is deeply frozen and independently owned. Failures preserve the previous document. Native encoding puts image bytes in the shared container assets, with only references and image metadata in JSON.

## View and workspace

`createSlidesWorkspace(files: FilePorts): WorkspaceAdapter` is the P03 factory. It owns scoped styles and mounts through the existing shared host. Registration in `src/app/main.ts` belongs to the parent. Menu command IDs are `slides.add`, `slides.duplicate`, `slides.delete`, `slides.up`, `slides.down`, `slides.text`, `slides.image`, `slides.rectangle`, `slides.ellipse`, `slides.deleteElement`, `slides.front`, `slides.back`, `slides.present`, and `slides.pdf`.

P02 renders a slide list, canvas, accessible selectable elements and selected-element properties. A reusable scene renderer supplies the same visual geometry to the editor, presentation and print. Pointer move/resize is preview-only until release, then one edit is committed. Pointer cancel and Escape restore the prior state. Arrow keys move selected elements; Shift increases the step. Numeric fields and plain-text editing preserve focus on refresh. Pending text/numeric edits flush synchronously before save, undo, slide selection and commands. Selection does not enter history.

P03 routes each edit through `host.commit` with the current identity, so native save, recovery and at least 100 undo steps use shared app policy. Image imports decode before committing, retain the invocation identity and reject late results if the document changed. Operational errors are visible and leave the current deck intact. Presentation opens an in-document modal, uses Left/Right/PageUp/PageDown/Home/End/Space and Escape, and restores focus. Printing creates one clipped page per slide with zero margins and `@page` dimensions derived from the actual canvas ratio; print success is browser handoff, not a disk-save claim.

## Evidence plan

- P01 literal deck fixture, frozen ownership, edits/order, malformed schema/assets, native roundtrip and transform boundaries.
- P02 real DOM fixture for safe rendering, selection, numeric/text input, focus preservation, pointer preview/cancel/commit and keyboard moves.
- P03 host/FilePorts integration for independent edits, pending-input flush, native reopen, stale imports and visible errors.
- One production browser workflow after coordination with the parent: slide list operations, text/shapes/image, drag/resize and typed coordinates, shared undo/redo/save/reopen, presentation keys and a real two-page PDF with parsed page size. Console/network inspection is part of that workflow.

## Verification record

The immutable document, reusable scene, editor view, presentation/print adapter and shared workspace factory are implemented. The testbenches preceded each implementation: P01 first failed five cases, P02 four cases and P03 five cases. Additional regressions cover a large local image payload, successful native image reopening and repeated rejection of an invalid pending property.

`node --import tsx --test src/slides/*.test.ts` passed 20/20 tests with no skips. Targeted strict TypeScript checking of `src/slides/*.ts` passed. The modular checker passed all five runtime modules; each has at most 150 physical lines. The deterministic `slides-document.demo.ts` also runs successfully. `slides-workspace.demo.html` supplies the standalone interactive development fixture.

The initial production browser run reproduced a drag cancellation bug: toolbar focus prevented Escape from reaching the canvas, so mouse release committed the drag. An unchanged snapshot refresh could also replace the scene during a pointer preview. Both focused regressions first failed, then passed after keeping pointer focus on the selected element and preserving unchanged scene DOM. Escape also releases pointer capture. These fixes await a refreshed production build from the parent. Run the browser suite without launching or rebuilding another app server:

```sh
node_modules/.bin/playwright test --config src/slides/playwright.slides.config.ts
```

A second production run passed the cancellation/error workflow but exposed collapsed editor layout when the error notice was hidden. Giving the editor an explicit grid row restores the usable canvas with or without a notice. The development walkthrough then found that New removed the focused property control; restoring its equivalent field, or the canvas, preserves the next shared keyboard shortcut. The additional focus regression failed before the repair.

The complete development browser suite passed 2/2 cases (`SLIDES_DEV=1` with the same command). It verified native container reopening with exact embedded image bytes, pointer and numeric transforms, independent Slides/Document undo and save, local image success/failure, presentation navigation, and real two-page PDFs. Parsed MediaBox sizes were 720×405 points for 16:9 and 720×540 points for 4:3. The suite attaches a screenshot and both PDF files.

The isolated suite uses port 4188 and `test-results/slides`; its default is production preview. Against the parent's final coordinated production build, both browser cases passed (2/2, 4.8 seconds), with no captured page/console errors or external HTTP requests in the happy path. The error case verified rejected image import, cancelled drag and repeated invalid pending saves without altering history.

P01–P03 are GREEN against the listed unit, type, module and production-browser checks. Product acceptance and the repository-wide verification gate remain with the parent; no commit, push or production build was performed by this module owner.
