# Paint text entry and graphical sizing

Owner request (2026-11-14): choose a text color inside the dialog, type new lines
with Enter, and resize/transform the result graphically. Existing BATCH applies.

## Contract before implementation

- **TEXT-01 / S11 dialog (SHELL):** add `type: 'color'`, with a six-digit hex
  initial value, a labelled native color control, and the same validated
  preview/commit/cancel transaction as other fields. Reject malformed initial
  colors before rendering. Plain or Shift+Enter in a textarea stays native and
  cannot bubble into the application's confirm shortcut. Ctrl/Cmd+Enter confirms;
  Escape cancels. Preserve single-line dialog behavior and IME composition.
- **TEXT-02 / IMAGE-APP:** Text includes a Color field initialized from the
  drawing foreground/background used to invoke it. Color changes preview live;
  Cancel changes no document pixels/history. Enter adds a newline in the actual
  app. Confirmation adds its own raster layer and selection, as before. Text is
  still rasterized on placement, not an editable text object.
- **TEXT-03 / IMAGE-APP with existing I60/I61:** after text placement, start the
  existing graphical Free transform controls so even small text has visible
  resize/rotate handles and typed dimensions. Drag previews remain outside
  history, Apply/Enter commits a transform, Esc cancels the transform and retains
  the newly placed text. Existing Free transform still works for selections.

Order: S11 contract/tests/implementation, then IMAGE-APP wiring and actual-browser
test using real key presses, preview pixel checks, cancel, graphical corner drag,
typed scaling, apply/undo, and native round trip. Retain existing image golden
outputs; update the older text workflow test only to explicitly apply the new
automatic transform stage (and expect its history entry).

The live `paint.goosnav.shop` assets match the previously pushed 7056a11 build
(`index-FQzJEwL6.js`, `index-B0y_SQzP.css`). The older toolbar in the user's screenshot
suggests an existing cached tab. Mac Safari and its native chooser are untested.
