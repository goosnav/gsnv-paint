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
  cannot paint, select pixels or write history. Before an image is open, the
  panel stays visible with disabled controls and an explanation.
- **NAV-04:** navigator reflects wheel zoom, fit, typed zoom, pan, image edits,
  resize and document replacement. Thumbnail drawing is coalesced per animation
  frame and refreshed on pixel changes, not every pointer hover. Disposal cancels
  callbacks. Controls do not consume workspace keyboard shortcuts unnecessarily.

## Visibility amendment (2026-11-14)

The owner could not find the requested zoom feature. A fresh production visit to
paint.goosnav.shop showed the existing lower-right control after New at 1280x720,
but its label was only “Navigator” and the entire control disappeared without a
document. No stale-deployment claim is made from that fresh-session evidence.

- **NAV-05:** The lower-right panel is visibly labelled **Zoom** before and after
  opening an image. Its map starts expanded, with “Drag map to move view” guidance.
  The map outline identifies the visible part of the canvas. Minus, plus, slider,
  typed percent and Fit remain available when the map is collapsed. Before an
  image is open, controls are disabled and the map explains “Open or create an
  image”. Empty controls never emit view requests or display a stale thumbnail.
- **NAV-06:** The panel and all controls remain inside the editor and reachable
  at desktop 1280x720 and Chromium touch-emulated 1024x768. New/Open and workspace
  switching retain a usable navigator; mouse/touch map movement followed by zoom
  keeps the chosen image point centered. Navigation changes no pixels/history.
  Physical iPad/Safari is untested unless separately exercised.

Implementation choice: clarify and retain the existing corner panel rather than
add a second toolbar or modal. This preserves the owner's request for a quiet,
complementary control without duplicating navigation state. I59 remains the only
changed brick; IMAGE-APP's existing callbacks and project formats are unchanged.

Plan: amend I59's contract; write a failing empty-state/visibility test; implement
that behavior and labels; run production browser journeys for desktop and touch,
including Open, workspace return, map/zoom, collapse, and unchanged pixels/history;
record evidence, build and push main, then verify the deployed controls.

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

Visibility amendment status: CONTRACTED under the existing BATCH authorization.
Previous increment: provisional GREEN. See [checkpoint evidence](PAINT-OPEN-NAVIGATION-EVIDENCE.md).
