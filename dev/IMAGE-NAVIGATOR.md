# Paint cursor and compact navigator

Owner request: classic arrow cursor, visible +/- zoom buttons, a slider and a
small canvas map for positioning the view without a mouse wheel. This extends
the ongoing Open increment under the existing BATCH authorization.

## Contract before code

- **NAV-01:** Paint uses the app's original black-outline white arrow asset,
  including drawing/selection tools. Text entry and active panning retain their
  useful text/grabbing feedback. No Microsoft assets.
- **NAV-02 / IMAGE-NAV (SHELL brick):** compact bottom-right navigator with a
  collapsible canvas thumbnail, viewport outline, Zoom out/in, Fit, percentage
  input and logarithmic slider spanning 1–6400%. Native controls have readable
  accessible names, focus and keyboard support; no external dependencies.
- **NAV-03:** click/drag the thumbnail to center that part of the image; touch
  and pen use pointer capture. Arrow keys pan from the map. Zoom keeps the current
  viewport center fixed; Fit restores the entire image. Thumbnail drag/cancel
  cannot paint, select pixels or write history. Empty documents hide controls.
- **NAV-04:** navigator reflects wheel zoom, fit, typed zoom, pan, image edits,
  resize and document replacement. Thumbnail drawing is coalesced per animation
  frame and refreshed on pixel changes, not every pointer hover. Disposal cancels
  callbacks. Controls do not consume workspace keyboard shortcuts unnecessarily.

## Wiring

`src/image/image-navigator.ts` owns DOM, thumbnail drawing, screen layout and input.
Its ports provide the root, onZoom, onCenter and onFit callbacks. `update` receives
image canvas, image revision, effective view and viewport size; `dispose` removes
owned listeners/animation work. Image assembly uses existing S05 viewTransform
for cursor-centered zoom math and translates the result into its fit/offset view.
No document, pixel, history or export format changes.

## Verification

Unit tests cover zoom bounds, percentage input, viewport rectangle, pan signals,
empty/collapsed state and disposal. Production Chromium tests cover buttons,
slider, typed percent, map mouse/touch drag, wheel synchronization, no accidental
paint/history mutation and containment at 1280x720. A touch-enabled Chromium test
is evidence for pointer input only; physical iPad/Safari remains untested.

Status: specified. Evidence pending.
